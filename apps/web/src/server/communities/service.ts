import "server-only";
import { categoryBySlug, communityChallengeSchema, communityPostSchema, communityRuleSchema, communityUpsertSchema } from "@werkraum/shared";
import { z } from "zod";
import { db, Prisma, type CommunityRoleKind, type Tx } from "@/server/db";
import { fail } from "@/server/errors";
import { hasRole, communityRole, requireCommunityModerator } from "@/server/authz";
import { requireUser, type SessionUser } from "@/server/auth/session";
import { notify } from "@/server/notifications";
import { rateLimit } from "@/server/ratelimit";
import { relationsFor, isBlockedBetween } from "@/server/visibility";
import { attachMedia } from "@/server/media/service";
import { createPost, listPosts } from "@/server/social/posts";
import { slugify } from "@/lib/utils";
import { assertCategoryAllowed } from "@/server/categories/settings";
import { audit } from "@/server/audit";
import { requireFlag } from "@/server/flags";
import { dropFutureAttendance } from "./events";

/**
 * Communities (PRD §15): Sichtbarkeit PUBLIC / REQUEST / PRIVATE, Rollen, Beitritt,
 * Anfragen, Einladungen, Beiträge (Post.communityId), Moderation mit Protokoll,
 * geteilte Projekte und Challenges.
 *
 * Sichtbarkeit der Inhalte:
 * - PUBLIC: alle lesen, Beitritt sofort.
 * - REQUEST: alle lesen, Beitritt nach Freigabe durch die Moderation.
 * - PRIVATE: nur Mitglieder lesen; Beitritt per Anfrage oder Einladung.
 */

export const ROLE_RANK: Record<CommunityRoleKind, number> = { OWNER: 3, ADMIN: 2, MODERATOR: 1, MEMBER: 0 };
const RESERVED_SLUGS = new Set(["neu", "verwalten", "admin", "api", "suche", "werkraum", "moderation", "hilfe", "support"]);
const MAX_PINNED = 3;

type Membership = { role: CommunityRoleKind; state: string; mutedUntil: Date | null } | null;

export function isModRole(m: Membership) {
  return !!m && m.state === "ACTIVE" && ROLE_RANK[m.role] >= ROLE_RANK.MODERATOR;
}
export function isManagerRole(m: Membership) {
  return !!m && m.state === "ACTIVE" && ROLE_RANK[m.role] >= ROLE_RANK.ADMIN;
}
export function isMuted(m: Membership) {
  return !!m?.mutedUntil && m.mutedUntil > new Date();
}

async function recordAction(c: Tx | typeof db, a: { communityId: string; moderatorId: string; targetType: "USER" | "POST" | "PROJECT" | "COMMUNITY"; targetId: string; action: string; reason?: string }) {
  await c.communityModerationAction.create({ data: { ...a, reason: a.reason?.slice(0, 500) ?? "" } });
}

async function getCommunityOrThrow(id: string) {
  const c = await db.community.findUnique({ where: { id } });
  if (!c || c.state === "REMOVED") throw fail.notFound("Community nicht gefunden.");
  return c;
}

/** Moderation (inkl. Plattform-Moderation). Liefert Nutzer, Rolle und Community. */
async function requireMod(communityId: string) {
  const community = await getCommunityOrThrow(communityId);
  const user = await requireCommunityModerator(communityId);
  const platform = hasRole(user, "PLATFORM_MODERATOR");
  const m = platform ? null : await communityRole(communityId, user.id);
  return { user, community, rank: platform ? 99 : ROLE_RANK[m!.role], platform };
}

/** Leitung (OWNER/ADMIN bzw. Plattform-Admin): Einstellungen, Regeln, Rollen. */
async function requireManager(communityId: string) {
  const user = await requireUser();
  const community = await getCommunityOrThrow(communityId);
  const m = await communityRole(communityId, user.id);
  const platform = hasRole(user, "ADMIN");
  if (!platform && !isManagerRole(m)) throw fail.forbidden("Nur Gründer:in und Admins können das ändern.");
  return { user, community, rank: platform ? 99 : ROLE_RANK[m!.role], platform };
}

async function coverFromMedia(tx: Tx, userId: string, mediaId: string) {
  await attachMedia(tx, userId, [mediaId]);
  const m = await tx.media.findUnique({ where: { id: mediaId }, select: { kind: true, variants: true } });
  if (m?.kind !== "IMAGE") throw fail.invalid("Das Titelbild muss ein Bild sein.");
  const v = (m.variants ?? {}) as Record<string, string>;
  return v.lg ?? v.md ?? null;
}

// ───────────────────────── Lesen ─────────────────────────

const cardSelect = {
  id: true,
  slug: true,
  name: true,
  description: true,
  category: true,
  coverUrl: true,
  visibility: true,
  memberCount: true,
  isFeatured: true,
  region: true,
  createdAt: true,
} satisfies Prisma.CommunitySelect;

export type CommunityCardData = Prisma.CommunityGetPayload<{ select: typeof cardSelect }> & { viewerState: "ACTIVE" | "PENDING" | "INVITED" | null };

export type CommunityFilters = { q?: string; category?: string; featured?: boolean; memberOf?: string; excludeIds?: string[]; viewerId?: string | null; take?: number };

async function searchCommunityIds(q: string) {
  const term = q.trim().slice(0, 120);
  if (!term) return null;
  const rows = await db.$queryRaw<{ id: string }[]>`
    SELECT id FROM "Community"
    WHERE state = 'PUBLISHED' AND (
      search @@ websearch_to_tsquery('german', wr_unaccent(${term}))
      OR name ILIKE ${"%" + term.replace(/[%_\\]/g, "\\$&") + "%"}
    )
    ORDER BY ts_rank(search, websearch_to_tsquery('german', wr_unaccent(${term}))) DESC, "memberCount" DESC
    LIMIT 300`;
  return rows.map((r) => r.id);
}

/** Verzeichnis: hervorgehobene zuerst, dann nach Mitgliederzahl. Cursor = Community-ID. */
export async function listCommunities(filters: CommunityFilters = {}, cursor?: string | null) {
  const take = Math.min(filters.take ?? 24, 60);
  const ids = filters.q ? await searchCommunityIds(filters.q) : null;
  const where: Prisma.CommunityWhereInput = {
    state: "PUBLISHED",
    ...(filters.category ? { category: filters.category } : {}),
    ...(filters.featured ? { isFeatured: true } : {}),
    ...(filters.memberOf ? { members: { some: { userId: filters.memberOf, state: "ACTIVE" } } } : {}),
    AND: [...(ids ? [{ id: { in: ids } }] : []), ...(filters.excludeIds?.length ? [{ id: { notIn: filters.excludeIds } }] : [])],
  };
  const rows = await db.community.findMany({
    where,
    select: cardSelect,
    orderBy: [{ isFeatured: "desc" }, { memberCount: "desc" }, { id: "asc" }],
    take: take + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });
  const hasMore = rows.length > take;
  const page = rows.slice(0, take);
  const states = filters.viewerId && page.length
    ? await db.communityMember.findMany({ where: { userId: filters.viewerId, communityId: { in: page.map((c) => c.id) } }, select: { communityId: true, state: true } })
    : [];
  const smap = new Map(states.map((s) => [s.communityId, s.state]));
  const items: CommunityCardData[] = page.map((c) => {
    const st = smap.get(c.id);
    return { ...c, viewerState: st === "ACTIVE" || st === "PENDING" || st === "INVITED" ? st : null };
  });
  return { items, nextCursor: hasMore ? page[page.length - 1]!.id : null };
}

/** Kategorien mit Anzahl – für Filterchips im Verzeichnis. */
export async function communityCategoryCounts() {
  const rows = await db.community.groupBy({ by: ["category"], where: { state: "PUBLISHED" }, _count: { _all: true } });
  return new Map(rows.map((r) => [r.category, r._count._all]));
}

export async function viewerInvitations(userId: string) {
  const rows = await db.communityMember.findMany({
    where: { userId, state: "INVITED", community: { state: "PUBLISHED" } },
    select: { community: { select: cardSelect } },
    orderBy: { joinedAt: "desc" },
    take: 10,
  });
  return rows.map((r) => ({ ...r.community, viewerState: "INVITED" as const }));
}

export function canViewCommunityContent(c: { visibility: string }, m: Membership, viewer?: Pick<SessionUser, "role"> | null) {
  if (c.visibility !== "PRIVATE") return true;
  if (viewer && hasRole(viewer, "PLATFORM_MODERATOR")) return true;
  return m?.state === "ACTIVE";
}

/** Prüft für andere Module (z.B. Beitragsseite), ob ein Community-Beitrag sichtbar ist. */
export async function canViewCommunityPost(communityId: string, viewer: Pick<SessionUser, "id" | "role"> | null) {
  const c = await db.community.findUnique({ where: { id: communityId }, select: { visibility: true, state: true } });
  if (!c || c.state === "REMOVED") return false;
  const m = viewer ? await communityRole(communityId, viewer.id) : null;
  // Von der Plattform ausgeblendete Communities: nur noch für Mitglieder und Moderation
  if (c.state === "HIDDEN" && m?.state !== "ACTIVE" && !hasRole(viewer, "PLATFORM_MODERATOR")) return false;
  return canViewCommunityContent(c, m, viewer);
}

export async function getCommunityPage(slug: string, viewer: SessionUser | null) {
  const c = await db.community.findUnique({
    where: { slug: slug.toLowerCase() },
    include: {
      rules: { orderBy: { position: "asc" } },
      owner: { select: { id: true, profile: { select: { handle: true, displayName: true, avatarUrl: true } } } },
    },
  });
  if (!c || c.state === "REMOVED") return null;
  const platformMod = !!viewer && hasRole(viewer, "PLATFORM_MODERATOR");
  if (c.state === "HIDDEN" && !platformMod) return null;
  const m = viewer ? await communityRole(c.id, viewer.id) : null;
  const now = new Date();
  const [challenge, pending, projectCount] = await Promise.all([
    db.communityChallenge.findFirst({
      // Laufend (Einreichung/Abstimmung/Jury), bald startend oder vor kurzem entschieden
      where: { communityId: c.id, startsAt: { lte: new Date(now.getTime() + 14 * 86400_000) }, OR: [{ endsAt: { gte: now } }, { resultsAt: null }, { resultsAt: { gte: new Date(now.getTime() - 7 * 86400_000) } }] },
      orderBy: { endsAt: "asc" },
    }),
    isModRole(m) || platformMod ? db.communityMember.count({ where: { communityId: c.id, state: "PENDING" } }) : Promise.resolve(0),
    db.communityProject.count({ where: { communityId: c.id, project: { visibility: "PUBLIC", state: "PUBLISHED" } } }),
  ]);
  return {
    community: c,
    membership: m,
    canView: canViewCommunityContent(c, m, viewer),
    isMember: m?.state === "ACTIVE",
    isMod: isModRole(m) || platformMod,
    isManager: isManagerRole(m) || (!!viewer && hasRole(viewer, "ADMIN")),
    muted: isMuted(m),
    challenge,
    pendingCount: pending,
    projectCount,
  };
}
export type CommunityPageData = NonNullable<Awaited<ReturnType<typeof getCommunityPage>>>;

export async function listCommunityPosts(communityId: string, viewerId: string | null, cursor?: string | null) {
  const rel = await relationsFor(viewerId);
  const hidden = rel.hidden.filter((h) => h.targetType === "POST").map((h) => h.targetId);
  return listPosts(
    {
      communityId,
      state: "PUBLISHED",
      isPinned: false,
      author: { status: { in: ["ACTIVE", "SUSPENDED"] } },
      ...(rel.blocked.length ? { authorId: { notIn: rel.blocked } } : {}),
      ...(hidden.length ? { id: { notIn: hidden } } : {}),
    },
    viewerId,
    { cursor, take: 15 },
  );
}

export async function listPinnedPosts(communityId: string, viewerId: string | null) {
  const rel = await relationsFor(viewerId);
  const r = await listPosts(
    { communityId, state: "PUBLISHED", isPinned: true, ...(rel.blocked.length ? { authorId: { notIn: rel.blocked } } : {}) },
    viewerId,
    { take: MAX_PINNED },
  );
  return r.items;
}

export async function listHiddenPosts(communityId: string, viewerId: string) {
  return (await listPosts({ communityId, state: "HIDDEN" }, viewerId, { take: 30 })).items;
}

export async function listMembers(communityId: string, opts: { q?: string; take?: number; cursor?: string | null; viewerId?: string | null } = {}) {
  const take = Math.min(opts.take ?? 40, 100);
  const rel = await relationsFor(opts.viewerId);
  const rows = await db.communityMember.findMany({
    where: {
      communityId,
      state: "ACTIVE",
      ...(rel.blocked.length ? { userId: { notIn: rel.blocked } } : {}),
      ...(opts.q ? { user: { profile: { OR: [{ displayName: { contains: opts.q, mode: "insensitive" } }, { handle: { contains: opts.q.toLowerCase() } }] } } } : {}),
    },
    orderBy: [{ role: "asc" }, { joinedAt: "asc" }, { userId: "asc" }],
    take: take + 1,
    ...(opts.cursor ? { cursor: { communityId_userId: { communityId, userId: opts.cursor } }, skip: 1 } : {}),
    select: { userId: true, role: true, mutedUntil: true, joinedAt: true, user: { select: { profile: { select: { handle: true, displayName: true, avatarUrl: true, bio: true } } } } },
  });
  const hasMore = rows.length > take;
  const page = rows.slice(0, take);
  return {
    items: page.map((r) => ({ userId: r.userId, role: r.role, mutedUntil: r.mutedUntil?.toISOString() ?? null, joinedAt: r.joinedAt.toISOString(), handle: r.user.profile?.handle ?? "", displayName: r.user.profile?.displayName ?? "Unbekannt", avatarUrl: r.user.profile?.avatarUrl ?? null, bio: r.user.profile?.bio ?? "" })),
    nextCursor: hasMore ? page[page.length - 1]!.userId : null,
  };
}
export type CommunityMemberView = Awaited<ReturnType<typeof listMembers>>["items"][number];

export async function listByState(communityId: string, state: "PENDING" | "INVITED" | "BANNED") {
  const rows = await db.communityMember.findMany({
    where: { communityId, state },
    orderBy: { joinedAt: "desc" },
    take: 200,
    select: { userId: true, joinedAt: true, user: { select: { profile: { select: { handle: true, displayName: true, avatarUrl: true, bio: true } } } } },
  });
  return rows.map((r) => ({ userId: r.userId, since: r.joinedAt.toISOString(), handle: r.user.profile?.handle ?? "", displayName: r.user.profile?.displayName ?? "Unbekannt", avatarUrl: r.user.profile?.avatarUrl ?? null, bio: r.user.profile?.bio ?? "" }));
}

const ACTION_LABEL: Record<string, string> = {
  APPROVE_MEMBER: "Beitritt freigegeben",
  DECLINE_MEMBER: "Beitrittsanfrage abgelehnt",
  INVITE_MEMBER: "Eingeladen",
  REMOVE_MEMBER: "Mitglied entfernt",
  BAN_MEMBER: "Mitglied gesperrt",
  UNBAN_MEMBER: "Sperre aufgehoben",
  MUTE_MEMBER: "Stummgeschaltet",
  UNMUTE_MEMBER: "Stummschaltung aufgehoben",
  SET_ROLE: "Rolle geändert",
  TRANSFER_OWNER: "Leitung übertragen",
  HIDE_POST: "Beitrag ausgeblendet",
  RESTORE_POST: "Beitrag wiederhergestellt",
  PIN_POST: "Beitrag angeheftet",
  UNPIN_POST: "Beitrag gelöst",
  ANNOUNCE_POST: "Als Ankündigung markiert",
  UNANNOUNCE_POST: "Ankündigung aufgehoben",
  REMOVE_PROJECT: "Projekt entfernt",
  UPDATE_SETTINGS: "Einstellungen geändert",
  UPDATE_RULES: "Regeln geändert",
  CREATE_CHALLENGE: "Challenge angelegt",
  DELETE_CHALLENGE: "Challenge gelöscht",
};

export async function moderationLog(communityId: string, take = 100) {
  const rows = await db.communityModerationAction.findMany({ where: { communityId }, orderBy: { createdAt: "desc" }, take });
  const userIds = [...new Set(rows.flatMap((r) => [r.moderatorId, ...(r.targetType === "USER" ? [r.targetId] : [])]))];
  const postIds = rows.filter((r) => r.targetType === "POST").map((r) => r.targetId);
  const [profiles, posts] = await Promise.all([
    userIds.length ? db.userProfile.findMany({ where: { userId: { in: userIds } }, select: { userId: true, handle: true, displayName: true } }) : [],
    postIds.length ? db.post.findMany({ where: { id: { in: postIds } }, select: { id: true, body: true, author: { select: { profile: { select: { displayName: true } } } } } }) : [],
  ]);
  const pmap = new Map(profiles.map((p) => [p.userId, p]));
  const postMap = new Map(posts.map((p) => [p.id, p]));
  return rows.map((r) => {
    const [code, detail] = r.action.split(":");
    const target =
      r.targetType === "USER"
        ? pmap.get(r.targetId)?.displayName ?? "Unbekannt"
        : r.targetType === "POST"
          ? (() => {
              const p = postMap.get(r.targetId);
              return p ? `„${(p.body || "Medienbeitrag").slice(0, 60)}${p.body.length > 60 ? "…" : ""}“ von ${p.author.profile?.displayName ?? "?"}` : "Beitrag";
            })()
          : r.targetType === "PROJECT"
            ? "Projekt"
            : "Community";
    return {
      id: r.id,
      at: r.createdAt.toISOString(),
      action: code!,
      label: ACTION_LABEL[code!] ?? code!,
      detail: detail ?? null,
      reason: r.reason,
      moderator: pmap.get(r.moderatorId) ?? null,
      target,
      targetType: r.targetType,
      targetId: r.targetId,
    };
  });
}

export async function listCommunityProjects(communityId: string, viewerId: string | null) {
  const rel = await relationsFor(viewerId);
  const rows = await db.communityProject.findMany({
    where: { communityId, project: { visibility: "PUBLIC", state: "PUBLISHED", ...(rel.blocked.length ? { ownerId: { notIn: rel.blocked } } : {}) } },
    orderBy: { addedAt: "desc" },
    take: 60,
    select: {
      addedAt: true,
      project: {
        select: { id: true, slug: true, title: true, status: true, category: true, coverUrl: true, difficulty: true, likeCount: true, ownerId: true, owner: { select: { profile: { select: { handle: true, displayName: true, avatarUrl: true } } } } },
      },
    },
  });
  return rows.map((r) => ({ ...r.project, addedAt: r.addedAt.toISOString(), href: `/u/${r.project.owner.profile?.handle}/${r.project.slug}` }));
}

export async function shareableProjects(userId: string, communityId: string) {
  return db.project.findMany({
    where: { ownerId: userId, visibility: "PUBLIC", state: "PUBLISHED", communityProjects: { none: { communityId } } },
    orderBy: { updatedAt: "desc" },
    take: 50,
    select: { id: true, title: true },
  });
}

export async function listChallenges(communityId: string) {
  return db.communityChallenge.findMany({ where: { communityId }, orderBy: { startsAt: "desc" }, take: 50 });
}

// ───────────────────────── Schreiben: Community ─────────────────────────

export async function createCommunity(user: SessionUser, input: unknown) {
  const data = communityUpsertSchema.parse(input);
  await requireFlag("communities.create", user.id);
  await assertCategoryAllowed(data.category);
  await rateLimit(`community-create:${user.id}`, 5, 86400);
  const slug = data.slug ?? slugify(data.name, 48);
  if (slug.length < 3 || RESERVED_SLUGS.has(slug)) throw fail.invalid("Diese Adresse ist nicht verfügbar.", { slug: "Diese Adresse ist nicht verfügbar." });
  const clash = await db.community.findUnique({ where: { slug }, select: { id: true } });
  if (clash) throw fail.conflict("Diese Adresse ist bereits vergeben.");
  return db.$transaction(async (tx) => {
    const coverUrl = data.coverMediaId ? await coverFromMedia(tx, user.id, data.coverMediaId) : null;
    const c = await tx.community.create({
      data: {
        slug,
        name: data.name,
        description: data.description,
        category: data.category,
        visibility: data.visibility,
        region: data.region || null,
        coverUrl,
        ownerId: user.id,
        memberCount: 1,
      },
    });
    await tx.communityMember.create({ data: { communityId: c.id, userId: user.id, role: "OWNER", state: "ACTIVE" } });
    if (data.rules.length) await tx.communityRule.createMany({ data: data.rules.map((r, i) => ({ communityId: c.id, position: i, title: r.title, body: r.body })) });
    return { id: c.id, slug: c.slug };
  });
}

const settingsSchema = communityUpsertSchema.omit({ slug: true, rules: true });

export async function updateCommunity(communityId: string, input: unknown) {
  const { user, community } = await requireManager(communityId);
  const data = settingsSchema.parse(input);
  await assertCategoryAllowed(data.category, (await db.community.findUnique({ where: { id: communityId }, select: { category: true } }))?.category);
  await db.$transaction(async (tx) => {
    const coverUrl = data.coverMediaId ? await coverFromMedia(tx, user.id, data.coverMediaId) : data.coverMediaId === null ? null : undefined;
    await tx.community.update({
      where: { id: communityId },
      data: { name: data.name, description: data.description, category: data.category, visibility: data.visibility, region: data.region || null, ...(coverUrl !== undefined ? { coverUrl } : {}) },
    });
    await recordAction(tx, { communityId, moderatorId: user.id, targetType: "COMMUNITY", targetId: communityId, action: community.visibility !== data.visibility ? `UPDATE_SETTINGS:${data.visibility}` : "UPDATE_SETTINGS" });
  });
  return { slug: community.slug };
}

export async function setRules(communityId: string, input: unknown) {
  const { user } = await requireManager(communityId);
  const rules = z.array(communityRuleSchema).max(20, "Höchstens 20 Regeln").parse(input);
  await db.$transaction(async (tx) => {
    await tx.communityRule.deleteMany({ where: { communityId } });
    if (rules.length) await tx.communityRule.createMany({ data: rules.map((r, i) => ({ communityId, position: i, title: r.title, body: r.body })) });
    await recordAction(tx, { communityId, moderatorId: user.id, targetType: "COMMUNITY", targetId: communityId, action: "UPDATE_RULES" });
  });
}

// ───────────────────────── Mitgliedschaft ─────────────────────────

export async function joinCommunity(user: SessionUser, communityId: string) {
  await rateLimit(`community-join:${user.id}`, 60, 3600);
  const c = await getCommunityOrThrow(communityId);
  if (c.state !== "PUBLISHED") throw fail.notFound();
  const m = await db.communityMember.findUnique({ where: { communityId_userId: { communityId, userId: user.id } } });
  if (m?.state === "BANNED") throw fail.forbidden("Du kannst dieser Community nicht beitreten.");
  if (m?.state === "ACTIVE" || m?.state === "PENDING") return { state: m.state };
  if (await isBlockedBetween(user.id, c.ownerId)) throw fail.forbidden("Du kannst dieser Community nicht beitreten.");
  if (m?.state === "INVITED" || c.visibility === "PUBLIC") {
    await db.$transaction(async (tx) => {
      // Bedingt umstellen: ein Doppelklick zählt nicht zweimal
      if (m) {
        const r = await tx.communityMember.updateMany({ where: { communityId, userId: user.id, state: "INVITED" }, data: { state: "ACTIVE", joinedAt: new Date() } });
        if (!r.count) return;
      } else {
        const r = await tx.communityMember.createMany({ data: [{ communityId, userId: user.id, state: "ACTIVE" }], skipDuplicates: true });
        if (!r.count) return;
      }
      await tx.community.update({ where: { id: communityId }, data: { memberCount: { increment: 1 } } });
    });
    return { state: "ACTIVE" as const };
  }
  await db.communityMember.create({ data: { communityId, userId: user.id, state: "PENDING" } });
  // Leitung informieren – gebündelt pro Community, damit viele Anfragen nur einen Eintrag ergeben
  const leads = await db.communityMember.findMany({ where: { communityId, state: "ACTIVE", role: { in: ["OWNER", "ADMIN", "MODERATOR"] } }, select: { userId: true }, take: 20 });
  for (const l of leads) {
    await notify({
      recipientId: l.userId,
      type: "COMMUNITY_INVITE",
      actorId: user.id,
      targetType: "COMMUNITY",
      targetId: communityId,
      data: { kind: "join_request", title: c.name, href: `/c/${c.slug}/verwalten` },
    }).catch(() => {});
  }
  return { state: "PENDING" as const };
}

/** Austreten, Anfrage zurückziehen oder Einladung ablehnen. */
export async function leaveCommunity(user: SessionUser, communityId: string) {
  const m = await db.communityMember.findUnique({ where: { communityId_userId: { communityId, userId: user.id } } });
  if (!m || m.state === "BANNED") return { state: null };
  if (m.role === "OWNER") throw fail.invalid("Übertrage zuerst die Leitung an ein anderes Mitglied, bevor du austrittst.");
  await db.$transaction(async (tx) => {
    await tx.communityMember.delete({ where: { communityId_userId: { communityId, userId: user.id } } });
    if (m.state === "ACTIVE") await tx.community.update({ where: { id: communityId }, data: { memberCount: { decrement: 1 } } });
    await dropFutureAttendance(tx, communityId, user.id);
  });
  return { state: null };
}

/**
 * Community auflösen (nur Gründer:in): wird archiviert statt hart gelöscht, damit Beiträge,
 * Moderationsverlauf und Meldungen nachvollziehbar bleiben (PRD §24.3). Zur Bestätigung
 * muss der Name exakt eingegeben werden. Mitglieder werden benachrichtigt.
 */
export async function deleteCommunity(user: SessionUser, communityId: string, confirmName: string) {
  const c = await db.community.findUnique({ where: { id: communityId }, select: { id: true, name: true, ownerId: true, state: true } });
  if (!c || c.state === "REMOVED") throw fail.notFound("Community nicht gefunden.");
  if (c.ownerId !== user.id) throw fail.forbidden("Nur die Gründerin bzw. der Gründer kann die Community auflösen.");
  if (confirmName.trim() !== c.name.trim()) throw fail.invalid("Bitte gib den Namen der Community exakt ein.", { confirm: "Name stimmt nicht überein" });
  const members = await db.communityMember.findMany({ where: { communityId, state: "ACTIVE", userId: { not: user.id } }, select: { userId: true }, take: 2000 });
  await db.$transaction(async (tx) => {
    await tx.community.update({ where: { id: communityId }, data: { state: "REMOVED", isFeatured: false } });
    await audit({ actorId: user.id, action: "community.dissolved_by_owner", targetType: "COMMUNITY", targetId: communityId, meta: { name: c.name, members: members.length } }, tx);
  });
  for (const m of members) {
    await notify({ recipientId: m.userId, type: "COMMUNITY_INVITE", actorId: user.id, targetType: "COMMUNITY", targetId: communityId, bundle: false, data: { title: c.name, href: "/communities", kind: "dissolved" } }).catch(() => {});
  }
  return { ok: true };
}

export async function decideRequest(communityId: string, userId: string, approve: boolean) {
  const { user, community } = await requireMod(communityId);
  const m = await db.communityMember.findUnique({ where: { communityId_userId: { communityId, userId } } });
  if (!m || m.state !== "PENDING") throw fail.notFound("Anfrage nicht gefunden.");
  await db.$transaction(async (tx) => {
    if (approve) {
      const r = await tx.communityMember.updateMany({ where: { communityId, userId, state: "PENDING" }, data: { state: "ACTIVE", joinedAt: new Date() } });
      if (!r.count) throw fail.notFound("Anfrage nicht gefunden.");
      await tx.community.update({ where: { id: communityId }, data: { memberCount: { increment: 1 } } });
    } else {
      await tx.communityMember.deleteMany({ where: { communityId, userId, state: "PENDING" } });
    }
    await recordAction(tx, { communityId, moderatorId: user.id, targetType: "USER", targetId: userId, action: approve ? "APPROVE_MEMBER" : "DECLINE_MEMBER" });
  });
  if (approve) {
    await notify({ recipientId: userId, type: "COMMUNITY_INVITE", actorId: user.id, targetType: "COMMUNITY", targetId: communityId, bundle: false, data: { title: community.name, href: `/c/${community.slug}`, kind: "approved" } });
  }
}

export async function inviteMember(communityId: string, handle: string) {
  const { user, community } = await requireMod(communityId);
  await rateLimit(`community-invite:${user.id}`, 50, 86400);
  const profile = await db.userProfile.findUnique({ where: { handle: handle.trim().replace(/^@/, "").toLowerCase() }, select: { userId: true, displayName: true, user: { select: { status: true } } } });
  if (!profile || profile.user.status !== "ACTIVE") throw fail.notFound("Kein Profil mit diesem Namen gefunden.");
  if (await isBlockedBetween(user.id, profile.userId)) throw fail.forbidden("Diese Person kann nicht eingeladen werden.");
  const m = await db.communityMember.findUnique({ where: { communityId_userId: { communityId, userId: profile.userId } } });
  if (m?.state === "ACTIVE") throw fail.conflict(`${profile.displayName} ist bereits Mitglied.`);
  if (m?.state === "BANNED") throw fail.conflict(`${profile.displayName} ist gesperrt. Hebe zuerst die Sperre auf.`);
  if (m?.state === "INVITED") throw fail.conflict(`${profile.displayName} ist bereits eingeladen.`);
  if (m?.state === "PENDING") {
    await decideRequest(communityId, profile.userId, true);
    return { state: "ACTIVE" as const, name: profile.displayName };
  }
  await db.$transaction(async (tx) => {
    await tx.communityMember.create({ data: { communityId, userId: profile.userId, state: "INVITED" } });
    await recordAction(tx, { communityId, moderatorId: user.id, targetType: "USER", targetId: profile.userId, action: "INVITE_MEMBER" });
  });
  await notify({ recipientId: profile.userId, type: "COMMUNITY_INVITE", actorId: user.id, targetType: "COMMUNITY", targetId: communityId, bundle: false, data: { title: community.name, href: `/c/${community.slug}` } });
  return { state: "INVITED" as const, name: profile.displayName };
}

export async function revokeInvite(communityId: string, userId: string) {
  await requireMod(communityId);
  await db.communityMember.deleteMany({ where: { communityId, userId, state: "INVITED" } });
}

async function targetMember(communityId: string, userId: string) {
  const m = await db.communityMember.findUnique({ where: { communityId_userId: { communityId, userId } } });
  if (!m) throw fail.notFound("Mitglied nicht gefunden.");
  return m;
}

export async function setMemberRole(communityId: string, userId: string, role: CommunityRoleKind) {
  const { user, rank } = await requireManager(communityId);
  if (role === "OWNER") throw fail.invalid("Nutze „Leitung übertragen“, um die Gründerrolle zu vergeben.");
  if (userId === user.id) throw fail.invalid("Deine eigene Rolle kannst du nicht ändern.");
  const m = await targetMember(communityId, userId);
  if (m.state !== "ACTIVE") throw fail.invalid("Nur aktive Mitglieder können eine Rolle erhalten.");
  if (m.role === "OWNER") throw fail.forbidden("Die Rolle der Gründerin / des Gründers kann nicht geändert werden.");
  if (rank < 99 && (ROLE_RANK[m.role] >= rank || ROLE_RANK[role] >= rank)) throw fail.forbidden("Du kannst nur Rollen unterhalb deiner eigenen vergeben.");
  await db.$transaction(async (tx) => {
    await tx.communityMember.update({ where: { communityId_userId: { communityId, userId } }, data: { role } });
    await recordAction(tx, { communityId, moderatorId: user.id, targetType: "USER", targetId: userId, action: `SET_ROLE:${role}` });
  });
}

export async function transferOwnership(communityId: string, userId: string) {
  const user = await requireUser();
  const c = await getCommunityOrThrow(communityId);
  const own = await communityRole(communityId, user.id);
  if (own?.role !== "OWNER" && !hasRole(user, "ADMIN")) throw fail.forbidden("Nur die Gründerin / der Gründer kann die Leitung übertragen.");
  const m = await targetMember(communityId, userId);
  if (m.state !== "ACTIVE") throw fail.invalid("Die Leitung kann nur an aktive Mitglieder übertragen werden.");
  await db.$transaction(async (tx) => {
    await tx.communityMember.updateMany({ where: { communityId, role: "OWNER" }, data: { role: "ADMIN" } });
    await tx.communityMember.update({ where: { communityId_userId: { communityId, userId } }, data: { role: "OWNER", mutedUntil: null } });
    await tx.community.update({ where: { id: communityId }, data: { ownerId: userId } });
    await recordAction(tx, { communityId, moderatorId: user.id, targetType: "USER", targetId: userId, action: "TRANSFER_OWNER" });
  });
  return { slug: c.slug };
}

async function assertOutranks(rank: number, m: { role: CommunityRoleKind }) {
  if (m.role === "OWNER") throw fail.forbidden("Die Gründerin / der Gründer kann nicht moderiert werden.");
  if (rank < 99 && ROLE_RANK[m.role] >= rank) throw fail.forbidden("Du kannst nur Mitglieder mit geringerer Rolle moderieren.");
}

export async function removeMember(communityId: string, userId: string, opts: { ban?: boolean; reason?: string } = {}) {
  const { user, rank } = await requireMod(communityId);
  if (userId === user.id) throw fail.invalid("Du kannst dich nicht selbst entfernen.");
  const m = await targetMember(communityId, userId);
  await assertOutranks(rank, m);
  await db.$transaction(async (tx) => {
    if (opts.ban) await tx.communityMember.update({ where: { communityId_userId: { communityId, userId } }, data: { state: "BANNED", role: "MEMBER", mutedUntil: null } });
    else await tx.communityMember.delete({ where: { communityId_userId: { communityId, userId } } });
    if (m.state === "ACTIVE") await tx.community.update({ where: { id: communityId }, data: { memberCount: { decrement: 1 } } });
    await dropFutureAttendance(tx, communityId, userId);
    await recordAction(tx, { communityId, moderatorId: user.id, targetType: "USER", targetId: userId, action: opts.ban ? "BAN_MEMBER" : "REMOVE_MEMBER", reason: opts.reason });
  });
}

export async function unbanMember(communityId: string, userId: string) {
  const { user } = await requireMod(communityId);
  const r = await db.communityMember.deleteMany({ where: { communityId, userId, state: "BANNED" } });
  if (r.count) await recordAction(db, { communityId, moderatorId: user.id, targetType: "USER", targetId: userId, action: "UNBAN_MEMBER" });
}

export async function muteMember(communityId: string, userId: string, until: Date | null, reason?: string) {
  const { user, rank } = await requireMod(communityId);
  const m = await targetMember(communityId, userId);
  if (m.state !== "ACTIVE") throw fail.invalid("Nur aktive Mitglieder können stummgeschaltet werden.");
  await assertOutranks(rank, m);
  if (until && (until <= new Date() || until.getTime() > Date.now() + 366 * 86400_000)) throw fail.invalid("Wähle ein Datum innerhalb der nächsten 12 Monate.");
  await db.$transaction(async (tx) => {
    await tx.communityMember.update({ where: { communityId_userId: { communityId, userId } }, data: { mutedUntil: until } });
    await recordAction(tx, { communityId, moderatorId: user.id, targetType: "USER", targetId: userId, action: until ? `MUTE_MEMBER:${until.toISOString()}` : "UNMUTE_MEMBER", reason });
  });
}

// ───────────────────────── Beiträge ─────────────────────────

export async function createCommunityPost(user: SessionUser, communityId: string, input: unknown) {
  const data = communityPostSchema.parse(input);
  const c = await getCommunityOrThrow(communityId);
  if (c.state !== "PUBLISHED") throw fail.forbidden("In dieser Community kann gerade nicht gepostet werden.");
  const m = await communityRole(communityId, user.id);
  if (m?.state !== "ACTIVE") throw fail.forbidden("Tritt der Community bei, um mitzuschreiben.");
  if (isMuted(m)) throw fail.forbidden(`Du bist in dieser Community bis ${m.mutedUntil!.toLocaleDateString("de-CH", { day: "numeric", month: "long", timeZone: "Europe/Zurich" })} stummgeschaltet.`);
  if (data.isAnnouncement && !isModRole(m)) throw fail.forbidden("Nur die Moderation kann Ankündigungen veröffentlichen.");
  const post = await createPost(user, { body: data.body, media: data.media, poll: data.poll, category: categoryBySlug(c.category) ? c.category : undefined }, { communityId });
  if (data.isAnnouncement) await db.post.update({ where: { id: post.id }, data: { isAnnouncement: true } });
  return { id: post.id };
}

async function modPost(communityId: string, postId: string) {
  const ctx = await requireMod(communityId);
  const p = await db.post.findUnique({ where: { id: postId }, select: { communityId: true, state: true, isPinned: true, authorId: true } });
  if (!p || p.communityId !== communityId || p.state === "REMOVED") throw fail.notFound("Beitrag nicht gefunden.");
  return { ...ctx, post: p };
}

export async function setPostHidden(communityId: string, postId: string, hidden: boolean, reason?: string) {
  const { user, post } = await modPost(communityId, postId);
  if (hidden === (post.state === "HIDDEN")) return;
  await db.$transaction(async (tx) => {
    await tx.post.update({ where: { id: postId }, data: { state: hidden ? "HIDDEN" : "PUBLISHED", ...(hidden ? { isPinned: false } : {}) } });
    await recordAction(tx, { communityId, moderatorId: user.id, targetType: "POST", targetId: postId, action: hidden ? "HIDE_POST" : "RESTORE_POST", reason });
  });
}

export async function setPostPinned(communityId: string, postId: string, pinned: boolean) {
  const { user, post } = await modPost(communityId, postId);
  if (post.state !== "PUBLISHED") throw fail.invalid("Nur sichtbare Beiträge können angeheftet werden.");
  if (pinned && !post.isPinned) {
    const n = await db.post.count({ where: { communityId, isPinned: true, state: "PUBLISHED" } });
    if (n >= MAX_PINNED) throw fail.invalid(`Höchstens ${MAX_PINNED} Beiträge können angeheftet sein. Löse zuerst einen anderen.`);
  }
  await db.$transaction(async (tx) => {
    await tx.post.update({ where: { id: postId }, data: { isPinned: pinned } });
    await recordAction(tx, { communityId, moderatorId: user.id, targetType: "POST", targetId: postId, action: pinned ? "PIN_POST" : "UNPIN_POST" });
  });
}

export async function setPostAnnouncement(communityId: string, postId: string, on: boolean) {
  const { user } = await modPost(communityId, postId);
  await db.$transaction(async (tx) => {
    await tx.post.update({ where: { id: postId }, data: { isAnnouncement: on } });
    await recordAction(tx, { communityId, moderatorId: user.id, targetType: "POST", targetId: postId, action: on ? "ANNOUNCE_POST" : "UNANNOUNCE_POST" });
  });
}

// ───────────────────────── Projekte & Challenges ─────────────────────────

export async function addCommunityProject(user: SessionUser, communityId: string, projectId: string) {
  const m = await communityRole(communityId, user.id);
  if (m?.state !== "ACTIVE") throw fail.forbidden("Nur Mitglieder können Projekte teilen.");
  if (isMuted(m)) throw fail.forbidden("Du bist in dieser Community derzeit stummgeschaltet.");
  const p = await db.project.findUnique({ where: { id: projectId }, select: { ownerId: true, visibility: true, state: true } });
  if (!p || p.ownerId !== user.id) throw fail.forbidden("Du kannst nur eigene Projekte teilen.");
  if (p.visibility !== "PUBLIC" || p.state !== "PUBLISHED") throw fail.invalid("Nur öffentliche Projekte können geteilt werden.");
  await db.communityProject.createMany({ data: [{ communityId, projectId }], skipDuplicates: true });
}

export async function removeCommunityProject(user: SessionUser, communityId: string, projectId: string) {
  const p = await db.project.findUnique({ where: { id: projectId }, select: { ownerId: true } });
  if (!p) throw fail.notFound();
  if (p.ownerId !== user.id) {
    const { user: mod } = await requireMod(communityId);
    await db.$transaction(async (tx) => {
      await tx.communityProject.deleteMany({ where: { communityId, projectId } });
      await recordAction(tx, { communityId, moderatorId: mod.id, targetType: "PROJECT", targetId: projectId, action: "REMOVE_PROJECT" });
    });
    return;
  }
  await db.communityProject.deleteMany({ where: { communityId, projectId } });
}

export async function createChallenge(communityId: string, input: unknown) {
  const { user } = await requireMod(communityId);
  const data = communityChallengeSchema.parse(input);
  if (data.endsAt < new Date()) throw fail.invalid("Das Ende liegt in der Vergangenheit.", { endsAt: "Das Ende liegt in der Vergangenheit." });
  return db.$transaction(async (tx) => {
    const votingEndsAt = data.judging === "VOTES" ? (data.votingEndsAt ?? new Date(data.endsAt.getTime() + 7 * 86400_000)) : null;
    const ch = await tx.communityChallenge.create({ data: { communityId, ...data, votingEndsAt, createdById: user.id } });
    await recordAction(tx, { communityId, moderatorId: user.id, targetType: "COMMUNITY", targetId: communityId, action: "CREATE_CHALLENGE", reason: data.title });
    return { id: ch.id };
  });
}

export async function deleteChallenge(communityId: string, challengeId: string) {
  const { user } = await requireMod(communityId);
  const ch = await db.communityChallenge.findUnique({ where: { id: challengeId } });
  if (!ch || ch.communityId !== communityId) throw fail.notFound();
  await db.$transaction(async (tx) => {
    await tx.communityChallenge.delete({ where: { id: challengeId } });
    await recordAction(tx, { communityId, moderatorId: user.id, targetType: "COMMUNITY", targetId: communityId, action: "DELETE_CHALLENGE", reason: ch.title });
  });
}
