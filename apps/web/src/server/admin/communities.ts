import "server-only";
import { z } from "zod";
import { COMMUNITY_VISIBILITY, categorySchema, communityRuleSchema } from "@werkraum/shared";
import { db, type CommunityRoleKind, type MembershipState, type PlatformRole, type Prisma, type Tx } from "@/server/db";
import { fail } from "@/server/errors";
import { audit } from "@/server/audit";
import { notify } from "@/server/notifications";
import { hasRole } from "@/server/authz";
import { moderationLog } from "@/server/communities/service";
import type { SessionUser } from "@/server/auth/session";

/**
 * Community-Verwaltung durch die Plattform (Admin). Plattform-Moderation und
 * -Administration handeln hier mit Plattformbefugnis – unabhängig von der
 * Community-Rolle. Jeder Eingriff braucht eine Begründung, landet im
 * Audit-Protokoll und zusätzlich im Moderationsprotokoll der Community,
 * damit die Community-Leitung nachvollziehen kann, was passiert ist.
 *
 * Rechte:
 * - PLATFORM_MODERATOR: Angaben bearbeiten (ohne Zugangsänderung), Hervorheben,
 *   Ausblenden, Mitglieder entfernen/sperren/entsperren.
 * - ADMIN: Zugang ändern, Archivieren/Wiederherstellen, Leitung übertragen,
 *   Community-Rollen vergeben.
 */

type Actor = Pick<SessionUser, "id" | "role">;
const MEMBERS_PER_PAGE = 25;
const RANK: Record<PlatformRole, number> = { MEMBER: 0, PLATFORM_MODERATOR: 1, ADMIN: 2, SUPERADMIN: 3 };
const MEMBER_STATES = ["ACTIVE", "PENDING", "INVITED", "BANNED"] as const;
const OPEN_CASE = ["OPEN", "IN_REVIEW", "APPEALED"] as const;

function mod(actor: Actor) {
  if (!hasRole(actor, "PLATFORM_MODERATOR")) throw fail.forbidden();
}
function admin(actor: Actor, m = "Das darf nur die Administration.") {
  if (!hasRole(actor, "ADMIN")) throw fail.forbidden(m);
}

const reasonSchema = z.string().trim().min(5, "Bitte begründe den Eingriff (mind. 5 Zeichen)").max(1000);
const publicNoteSchema = z.string().trim().max(1000).optional().default("");

async function loadCommunity(id: string, c: Tx | typeof db = db) {
  const community = await c.community.findUnique({
    where: { id },
    select: { id: true, slug: true, name: true, state: true, visibility: true, ownerId: true, isFeatured: true },
  });
  if (!community) throw fail.notFound("Community nicht gefunden.");
  return community;
}

/** Eintrag im Moderationsprotokoll der Community (sichtbar für deren Leitung). */
async function communityLog(tx: Tx, a: { communityId: string; moderatorId: string; targetType: "USER" | "COMMUNITY"; targetId: string; action: string; reason?: string }) {
  await tx.communityModerationAction.create({ data: { ...a, reason: (a.reason ?? "").slice(0, 500) } });
}

async function notifyOwner(ownerId: string, message: string, publicNote = "", href = "/einstellungen/hilfe-support", title?: string) {
  await notify({ recipientId: ownerId, type: "MODERATION", bundle: false, data: { kind: "ACCOUNT", title, message, publicNote, href } });
}

/* ───────────────────────────── Lesen ───────────────────────────── */

export type MemberFilter = { q?: string | null; state?: string | null; page?: number };

export async function getCommunityAdminDetail(actor: Actor, id: string, filter: MemberFilter = {}) {
  mod(actor);
  const community = await db.community.findUnique({
    where: { id },
    include: {
      rules: { orderBy: { position: "asc" }, select: { id: true, title: true, body: true } },
      owner: { select: { id: true, status: true, profile: { select: { handle: true, displayName: true, avatarUrl: true } } } },
    },
  });
  if (!community) throw fail.notFound("Community nicht gefunden.");

  const memberState = z.enum(MEMBER_STATES).nullable().catch(null).parse(filter.state ?? null);
  const q = filter.q?.trim().replace(/^@/, "").slice(0, 80) || null;
  const memberWhere: Prisma.CommunityMemberWhereInput = {
    communityId: id,
    ...(memberState ? { state: memberState } : {}),
    ...(q
      ? {
          OR: [
            { user: { profile: { handle: { contains: q.toLowerCase() } } } },
            { user: { profile: { displayName: { contains: q, mode: "insensitive" } } } },
            { userId: q },
          ],
        }
      : {}),
  };
  const page = Math.max(1, filter.page ?? 1);

  // Fälle zur Community selbst, zu ihren Beiträgen und zu Kommentaren unter diesen Beiträgen
  const caseIds = await db.$queryRaw<{ id: string }[]>`
    SELECT mc.id FROM "ModerationCase" mc
    WHERE (mc."targetType" = 'COMMUNITY' AND mc."targetId" = ${id})
       OR (mc."targetType" = 'POST' AND mc."targetId" IN (SELECT p.id FROM "Post" p WHERE p."communityId" = ${id}))
       OR (mc."targetType" = 'COMMENT' AND mc."targetId" IN (SELECT c.id FROM "Comment" c JOIN "Post" p ON p.id = c."postId" WHERE p."communityId" = ${id}))
    ORDER BY mc."createdAt" DESC
    LIMIT 200`;
  const ids = caseIds.map((r) => r.id);

  const [byState, postsByState, projects, challenges, reportsAboutCommunity, cases, openCases, members, memberTotal, recentPosts, recentAudit, log, transferCandidates] = await Promise.all([
    db.communityMember.groupBy({ by: ["state"], where: { communityId: id }, _count: { _all: true } }),
    db.post.groupBy({ by: ["state"], where: { communityId: id }, _count: { _all: true } }),
    db.communityProject.count({ where: { communityId: id } }),
    db.communityChallenge.count({ where: { communityId: id } }),
    db.report.count({ where: { targetType: "COMMUNITY", targetId: id } }),
    ids.length
      ? db.moderationCase.findMany({
          where: { id: { in: ids } },
          orderBy: { createdAt: "desc" },
          take: 30,
          select: { id: true, number: true, targetType: true, targetId: true, primaryReason: true, status: true, riskScore: true, reportCount: true, createdAt: true },
        })
      : Promise.resolve([]),
    ids.length ? db.moderationCase.count({ where: { id: { in: ids }, status: { in: [...OPEN_CASE] } } }) : Promise.resolve(0),
    db.communityMember.findMany({
      where: memberWhere,
      orderBy: [{ state: "asc" }, { role: "asc" }, { joinedAt: "asc" }, { userId: "asc" }],
      skip: (page - 1) * MEMBERS_PER_PAGE,
      take: MEMBERS_PER_PAGE,
      select: {
        userId: true,
        role: true,
        state: true,
        mutedUntil: true,
        joinedAt: true,
        user: { select: { role: true, status: true, profile: { select: { handle: true, displayName: true, avatarUrl: true } } } },
      },
    }),
    db.communityMember.count({ where: memberWhere }),
    db.post.findMany({
      where: { communityId: id },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: {
        id: true,
        body: true,
        kind: true,
        state: true,
        isPinned: true,
        isAnnouncement: true,
        likeCount: true,
        commentCount: true,
        createdAt: true,
        authorId: true,
        author: { select: { profile: { select: { handle: true, displayName: true } } } },
        _count: { select: { media: true } },
      },
    }),
    db.auditEvent.findMany({
      where: { targetType: "COMMUNITY", targetId: id },
      orderBy: { seq: "desc" },
      take: 20,
      select: { seq: true, action: true, meta: true, createdAt: true, actor: { select: { id: true, profile: { select: { handle: true } } } } },
    }),
    moderationLog(id, 15),
    db.communityMember.findMany({
      where: { communityId: id, state: "ACTIVE", role: { not: "OWNER" }, user: { status: "ACTIVE" } },
      orderBy: [{ role: "asc" }, { joinedAt: "asc" }],
      take: 200,
      select: { userId: true, role: true, user: { select: { profile: { select: { handle: true, displayName: true } } } } },
    }),
  ]);

  const memberCounts = Object.fromEntries(MEMBER_STATES.map((s) => [s, 0])) as Record<MembershipState, number>;
  for (const b of byState) memberCounts[b.state] = b._count._all;
  const postCounts = { PUBLISHED: 0, HIDDEN: 0, REMOVED: 0, DRAFT: 0 } as Record<string, number>;
  for (const b of postsByState) postCounts[b.state] = b._count._all;

  return {
    community,
    counts: {
      members: memberCounts,
      posts: Object.values(postCounts).reduce((a, b) => a + b, 0),
      postsHidden: postCounts.HIDDEN ?? 0,
      postsRemoved: postCounts.REMOVED ?? 0,
      projects,
      challenges,
      cases: ids.length,
      openCases,
      reports: reportsAboutCommunity,
    },
    cases,
    members: { rows: members, total: memberTotal, page, pages: Math.max(1, Math.ceil(memberTotal / MEMBERS_PER_PAGE)) },
    recentPosts,
    recentAudit,
    log,
    transferCandidates: transferCandidates.map((m) => ({ userId: m.userId, role: m.role, handle: m.user.profile?.handle ?? null, displayName: m.user.profile?.displayName ?? "Unbekannt" })),
  };
}
export type CommunityAdminDetail = Awaited<ReturnType<typeof getCommunityAdminDetail>>;

/* ───────────────────────────── Stammdaten ───────────────────────────── */

const metaSchema = z.object({
  name: z.string().trim().min(3, "Name ist zu kurz").max(80),
  description: z.string().trim().max(4000).default(""),
  category: categorySchema,
  visibility: z.enum(COMMUNITY_VISIBILITY),
  region: z.string().trim().max(80).optional().default(""),
  rules: z.array(communityRuleSchema).max(20, "Höchstens 20 Regeln").default([]),
  reason: reasonSchema,
  publicNote: publicNoteSchema,
});
export type CommunityMetaInput = z.input<typeof metaSchema>;

export async function updateCommunityMeta(actor: Actor, id: string, input: unknown) {
  mod(actor);
  const data = metaSchema.parse(input);
  const c = await db.community.findUnique({ where: { id }, include: { rules: { orderBy: { position: "asc" } } } });
  if (!c) throw fail.notFound("Community nicht gefunden.");
  if (c.state === "REMOVED") throw fail.conflict("Archivierte Communities bitte zuerst wiederherstellen.");
  if (data.visibility !== c.visibility && !hasRole(actor, "ADMIN")) throw fail.forbidden("Den Zugang einer Community ändert nur die Administration.");

  const region = data.region || null;
  const changed: string[] = [];
  if (data.name !== c.name) changed.push("name");
  if (data.description !== c.description) changed.push("description");
  if (data.category !== c.category) changed.push("category");
  if (data.visibility !== c.visibility) changed.push("visibility");
  if (region !== c.region) changed.push("region");
  const rulesBefore = JSON.stringify(c.rules.map((r) => ({ title: r.title, body: r.body })));
  const rulesChanged = rulesBefore !== JSON.stringify(data.rules.map((r) => ({ title: r.title, body: r.body })));
  if (rulesChanged) changed.push("rules");
  if (!changed.length) return { changed: [] as string[] };

  await db.$transaction(async (tx) => {
    await tx.community.update({
      where: { id },
      data: {
        name: data.name,
        description: data.description,
        category: data.category,
        visibility: data.visibility,
        region,
        // Private Communities können nicht hervorgehoben sein
        ...(data.visibility === "PRIVATE" ? { isFeatured: false } : {}),
      },
    });
    if (rulesChanged) {
      await tx.communityRule.deleteMany({ where: { communityId: id } });
      if (data.rules.length) await tx.communityRule.createMany({ data: data.rules.map((r, i) => ({ communityId: id, position: i, title: r.title, body: r.body })) });
      await communityLog(tx, { communityId: id, moderatorId: actor.id, targetType: "COMMUNITY", targetId: id, action: "UPDATE_RULES", reason: "Plattform-Moderation" });
    }
    if (changed.some((f) => f !== "rules")) {
      await communityLog(tx, {
        communityId: id,
        moderatorId: actor.id,
        targetType: "COMMUNITY",
        targetId: id,
        action: data.visibility !== c.visibility ? `UPDATE_SETTINGS:${data.visibility}` : "UPDATE_SETTINGS",
        reason: "Plattform-Moderation",
      });
    }
    await audit(
      {
        actorId: actor.id,
        action: "admin.community_updated",
        targetType: "COMMUNITY",
        targetId: id,
        meta: { changed, ...(changed.includes("visibility") ? { from: c.visibility, to: data.visibility } : {}), reason: data.reason },
      },
      tx,
    );
  });
  await notifyOwner(c.ownerId, `Die Angaben deiner Community „${data.name}“ wurden von der Plattform-Moderation angepasst.`, data.publicNote, `/c/${c.slug}`, data.name);
  return { changed };
}

/* ───────────────────────────── Zustand ───────────────────────────── */

/** Archivieren (Zustand REMOVED): Community ist danach nicht mehr erreichbar. */
export async function removeCommunity(actor: Actor, id: string, input: { reason: string; publicNote?: string }) {
  admin(actor, "Communities archiviert nur die Administration.");
  const reason = reasonSchema.parse(input.reason);
  const publicNote = publicNoteSchema.parse(input.publicNote);
  const c = await db.$transaction(async (tx) => {
    const c = await loadCommunity(id, tx);
    if (c.state === "REMOVED") throw fail.conflict("Die Community ist bereits archiviert.");
    await tx.community.update({ where: { id }, data: { state: "REMOVED", isFeatured: false } });
    await audit({ actorId: actor.id, action: "admin.community_removed", targetType: "COMMUNITY", targetId: id, meta: { from: c.state, reason } }, tx);
    return c;
  });
  await notifyOwner(c.ownerId, `Deine Community „${c.name}“ wurde von der Plattform archiviert und ist nicht mehr erreichbar.`, publicNote, undefined, c.name);
}

export async function restoreCommunity(actor: Actor, id: string, input: { reason: string; choice?: string }) {
  admin(actor, "Archivierte Communities stellt nur die Administration wieder her.");
  const reason = reasonSchema.parse(input.reason);
  const target = z.enum(["PUBLISHED", "HIDDEN"]).catch("PUBLISHED").parse(input.choice);
  const c = await db.$transaction(async (tx) => {
    const c = await loadCommunity(id, tx);
    if (c.state !== "REMOVED") throw fail.conflict("Die Community ist nicht archiviert.");
    await tx.community.update({ where: { id }, data: { state: target } });
    await audit({ actorId: actor.id, action: "admin.community_restored", targetType: "COMMUNITY", targetId: id, meta: { to: target, reason } }, tx);
    return c;
  });
  await notifyOwner(
    c.ownerId,
    target === "PUBLISHED" ? `Deine Community „${c.name}“ wurde wiederhergestellt und ist wieder sichtbar.` : `Deine Community „${c.name}“ wurde wiederhergestellt, bleibt aber vorerst ausgeblendet.`,
    "",
    `/c/${c.slug}`,
    c.name,
  );
}

/* ───────────────────────────── Leitung ───────────────────────────── */

export async function transferCommunityOwnership(actor: Actor, id: string, userId: string, reason: string) {
  admin(actor, "Die Leitung überträgt nur die Administration.");
  const r = reasonSchema.parse(reason);
  if (!userId) throw fail.invalid("Bitte wähle ein Mitglied.", { choice: "Bitte wähle ein Mitglied." });
  const result = await db.$transaction(async (tx) => {
    const c = await loadCommunity(id, tx);
    if (c.state === "REMOVED") throw fail.conflict("Archivierte Communities bitte zuerst wiederherstellen.");
    if (c.ownerId === userId) throw fail.conflict("Diese Person leitet die Community bereits.");
    const m = await tx.communityMember.findUnique({
      where: { communityId_userId: { communityId: id, userId } },
      select: { state: true, user: { select: { status: true, profile: { select: { handle: true } } } } },
    });
    if (!m || m.state !== "ACTIVE") throw fail.invalid("Die Leitung kann nur an aktive Mitglieder übertragen werden.", { choice: "Kein aktives Mitglied." });
    if (m.user.status !== "ACTIVE") throw fail.conflict("Das Konto dieser Person ist nicht aktiv.");
    await tx.communityMember.updateMany({ where: { communityId: id, role: "OWNER" }, data: { role: "ADMIN" } });
    await tx.communityMember.update({ where: { communityId_userId: { communityId: id, userId } }, data: { role: "OWNER", mutedUntil: null } });
    await tx.community.update({ where: { id }, data: { ownerId: userId } });
    await communityLog(tx, { communityId: id, moderatorId: actor.id, targetType: "USER", targetId: userId, action: "TRANSFER_OWNER", reason: "Plattform-Administration" });
    await audit({ actorId: actor.id, action: "admin.community_owner_transferred", targetType: "COMMUNITY", targetId: id, meta: { from: c.ownerId, to: userId, reason: r } }, tx);
    return { c, handle: m.user.profile?.handle ?? null };
  });
  const { c } = result;
  await notify({
    recipientId: userId,
    type: "MODERATION",
    bundle: false,
    data: { kind: "ACCOUNT", title: c.name, message: `Du leitest jetzt die Community „${c.name}“.`, href: `/c/${c.slug}/verwalten` },
  });
  await notifyOwner(
    c.ownerId,
    `Die Leitung der Community „${c.name}“ wurde von der Plattform${result.handle ? ` an @${result.handle}` : ""} übertragen. Du bist weiterhin Admin.`,
    "",
    `/c/${c.slug}`,
    c.name,
  );
}

/* ───────────────────────────── Mitglieder ───────────────────────────── */

async function loadMember(tx: Tx, communityId: string, userId: string) {
  const m = await tx.communityMember.findUnique({
    where: { communityId_userId: { communityId, userId } },
    select: { role: true, state: true, user: { select: { role: true } } },
  });
  if (!m) throw fail.notFound("Mitglied nicht gefunden.");
  return m;
}

function assertCanSanctionMember(actor: Actor, userId: string, m: { role: CommunityRoleKind; user: { role: PlatformRole } }) {
  if (m.role === "OWNER") throw fail.forbidden("Die Leitung kann nicht entfernt werden. Übertrage sie zuerst an ein anderes Mitglied.");
  if (actor.id !== userId && RANK[m.user.role] >= RANK[actor.role] && actor.role !== "SUPERADMIN") throw fail.forbidden("Dafür ist eine höhere Rolle nötig.");
}

export async function setCommunityMemberRole(actor: Actor, id: string, userId: string, role: string, reason: string) {
  admin(actor, "Community-Rollen vergibt nur die Administration.");
  const r = reasonSchema.parse(reason);
  const next = z.enum(["ADMIN", "MODERATOR", "MEMBER"], { message: "Unbekannte Rolle." }).parse(role);
  await db.$transaction(async (tx) => {
    const c = await loadCommunity(id, tx);
    if (c.state === "REMOVED") throw fail.conflict("Archivierte Communities bitte zuerst wiederherstellen.");
    const m = await loadMember(tx, id, userId);
    if (m.state !== "ACTIVE") throw fail.invalid("Nur aktive Mitglieder können eine Rolle erhalten.");
    if (m.role === "OWNER") throw fail.forbidden("Nutze „Leitung übertragen“, um die Leitung zu ändern.");
    if (m.role === next) return;
    await tx.communityMember.update({ where: { communityId_userId: { communityId: id, userId } }, data: { role: next } });
    await communityLog(tx, { communityId: id, moderatorId: actor.id, targetType: "USER", targetId: userId, action: `SET_ROLE:${next}`, reason: "Plattform-Administration" });
    await audit({ actorId: actor.id, action: "admin.community_member_role", targetType: "COMMUNITY", targetId: id, meta: { userId, from: m.role, to: next, reason: r } }, tx);
  });
}

/** Entfernen (bei Anfrage: ablehnen, bei Einladung: zurückziehen) oder sperren. */
export async function removeCommunityMember(actor: Actor, id: string, userId: string, input: { reason: string; publicNote?: string; ban?: boolean }) {
  mod(actor);
  const reason = reasonSchema.parse(input.reason);
  const publicNote = input.ban
    ? z.string().trim().min(10, "Bitte formuliere eine Nachricht an die Person").max(1000).parse(input.publicNote ?? "")
    : "";
  const c = await db.$transaction(async (tx) => {
    const c = await loadCommunity(id, tx);
    const m = await loadMember(tx, id, userId);
    assertCanSanctionMember(actor, userId, m);
    if (input.ban && m.state === "BANNED") throw fail.conflict("Diese Person ist bereits gesperrt.");
    if (!input.ban && m.state === "BANNED") throw fail.conflict("Gesperrte Personen bitte über „Entsperren“ freigeben.");
    if (input.ban) {
      await tx.communityMember.update({ where: { communityId_userId: { communityId: id, userId } }, data: { state: "BANNED", role: "MEMBER", mutedUntil: null } });
    } else {
      await tx.communityMember.delete({ where: { communityId_userId: { communityId: id, userId } } });
    }
    if (m.state === "ACTIVE") await tx.community.update({ where: { id }, data: { memberCount: { decrement: 1 } } });
    const code = input.ban ? "BAN_MEMBER" : m.state === "PENDING" ? "DECLINE_MEMBER" : "REMOVE_MEMBER";
    await communityLog(tx, { communityId: id, moderatorId: actor.id, targetType: "USER", targetId: userId, action: code, reason: "Plattform-Moderation" });
    await audit(
      { actorId: actor.id, action: input.ban ? "admin.community_member_banned" : "admin.community_member_removed", targetType: "COMMUNITY", targetId: id, meta: { userId, from: m.state, role: m.role, reason } },
      tx,
    );
    return c;
  });
  if (input.ban) {
    await notify({
      recipientId: userId,
      type: "MODERATION",
      bundle: false,
      data: { kind: "ACCOUNT", title: c.name, message: `Du wurdest von der Plattform-Moderation aus der Community „${c.name}“ ausgeschlossen.`, publicNote, href: "/einstellungen/hilfe-support" },
    });
  }
}

export async function unbanCommunityMember(actor: Actor, id: string, userId: string, reason: string) {
  mod(actor);
  const r = reasonSchema.parse(reason);
  await db.$transaction(async (tx) => {
    await loadCommunity(id, tx);
    const res = await tx.communityMember.deleteMany({ where: { communityId: id, userId, state: "BANNED" } });
    if (!res.count) throw fail.conflict("Diese Person ist nicht gesperrt.");
    await communityLog(tx, { communityId: id, moderatorId: actor.id, targetType: "USER", targetId: userId, action: "UNBAN_MEMBER", reason: "Plattform-Moderation" });
    await audit({ actorId: actor.id, action: "admin.community_member_unbanned", targetType: "COMMUNITY", targetId: id, meta: { userId, reason: r } }, tx);
  });
}
