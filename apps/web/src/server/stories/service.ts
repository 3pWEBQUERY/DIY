import "server-only";
import {
  STORY_BACKGROUNDS,
  STORY_LIFETIME_HOURS,
  STORY_MAX_ACTIVE,
  STORY_VIDEO_MAX_SECONDS,
  storyCreateSchema,
  storyDurationSeconds,
  storyReplySchema,
  type StoryBackground,
} from "@werkraum/shared";
import { db, type Prisma } from "@/server/db";
import { fail } from "@/server/errors";
import { limit } from "@/server/ratelimit";
import { notify } from "@/server/notifications";
import { isBlockedBetween, relationsFor } from "@/server/visibility";
import { hasRole } from "@/server/authz";
import { audit } from "@/server/audit";
import { attachMedia } from "@/server/media/service";
import { flagEnabled, requireFlag } from "@/server/flags";
import type { SessionUser } from "@/server/auth/session";
import { requireAdult } from "@/server/auth/adult";

/**
 * Stories (Foto, Video, Text) – 24 Stunden im Story-Kreis der Follower, danach nur noch im
 * eigenen Archiv und in Highlights. Es gelten dieselben Regeln wie für Beiträge:
 * Blockieren wirkt wechselseitig, „Nur Follower“ nur für Follower, moderierte Stories
 * (HIDDEN/REMOVED) sieht niemand ausser der Moderation.
 */

/** Konten, deren Inhalte öffentlich erscheinen (wie im Feed). */
const VISIBLE_STATUS = ["ACTIVE", "SUSPENDED"] as const;

export const storySelect = {
  id: true,
  authorId: true,
  kind: true,
  text: true,
  background: true,
  alt: true,
  visibility: true,
  state: true,
  viewCount: true,
  likeCount: true,
  expiresAt: true,
  createdAt: true,
  media: { select: { id: true, kind: true, state: true, variants: true, width: true, height: true, durationMs: true, dominant: true, processingError: true } },
  project: { select: { id: true, slug: true, title: true, coverUrl: true, state: true, visibility: true, owner: { select: { profile: { select: { handle: true } } } } } },
} satisfies Prisma.StorySelect;
type StoryRow = Prisma.StoryGetPayload<{ select: typeof storySelect }>;

const authorSelect = { id: true, status: true, profile: { select: { handle: true, displayName: true, avatarUrl: true } } } satisfies Prisma.UserSelect;
type AuthorRow = Prisma.UserGetPayload<{ select: typeof authorSelect }>;

export type StoryAuthor = { id: string; handle: string; displayName: string; avatarUrl: string | null };
function authorView(u: AuthorRow): StoryAuthor {
  return { id: u.id, handle: u.profile?.handle ?? "unbekannt", displayName: u.profile?.displayName ?? "Unbekannt", avatarUrl: u.profile?.avatarUrl ?? null };
}

type ViewerState = { id: string | null; seen: Set<string>; liked: Set<string> };

function isBackground(v: string | null): v is StoryBackground {
  return !!v && v in STORY_BACKGROUNDS;
}

function toView(s: StoryRow, v: ViewerState) {
  const own = !!v.id && v.id === s.authorId;
  const variants = (s.media?.variants ?? {}) as Record<string, string>;
  const isVideo = s.media?.kind === "VIDEO";
  return {
    id: s.id,
    kind: s.kind,
    text: s.text,
    background: isBackground(s.background) ? s.background : null,
    alt: s.alt,
    visibility: s.visibility as "PUBLIC" | "FOLLOWERS",
    state: s.state,
    createdAt: s.createdAt.toISOString(),
    expiresAt: s.expiresAt.toISOString(),
    expired: s.expiresAt.getTime() <= Date.now(),
    durationSec: storyDurationSeconds({ kind: s.kind, isVideo, durationMs: s.media?.durationMs, text: s.text }),
    media: s.media
      ? {
          kind: s.media.kind as "IMAGE" | "VIDEO",
          state: s.media.state,
          image: isVideo ? null : (variants.lg ?? variants.md ?? variants.sm ?? null),
          video: isVideo ? (variants.video ?? null) : null,
          poster: isVideo ? (variants.poster ?? variants.sm ?? null) : (variants.sm ?? variants.thumb ?? null),
          thumb: variants.sm ?? variants.thumb ?? variants.poster ?? null,
          width: s.media.width,
          height: s.media.height,
          durationMs: s.media.durationMs,
          dominant: s.media.dominant,
          error: own ? s.media.processingError : null,
        }
      : null,
    // Projektfaden nur, solange das Projekt öffentlich ist
    project:
      s.project && s.project.state === "PUBLISHED" && s.project.visibility === "PUBLIC"
        ? { id: s.project.id, slug: s.project.slug, title: s.project.title, coverUrl: s.project.coverUrl, handle: s.project.owner.profile?.handle ?? "" }
        : null,
    viewer: { own, seen: own || v.seen.has(s.id), liked: v.liked.has(s.id) },
    /** Nur für die Autorin / den Autor */
    stats: own ? { views: s.viewCount, likes: s.likeCount } : null,
  };
}
export type StoryItem = ReturnType<typeof toView>;

async function viewerState(viewerId: string | null, ids: string[]): Promise<ViewerState> {
  if (!viewerId || !ids.length) return { id: viewerId, seen: new Set(), liked: new Set() };
  const rows = await db.storyView.findMany({ where: { viewerId, storyId: { in: ids } }, select: { storyId: true, likedAt: true } });
  return { id: viewerId, seen: new Set(rows.map((r) => r.storyId)), liked: new Set(rows.filter((r) => r.likedAt).map((r) => r.storyId)) };
}

export async function hydrateStories(rows: StoryRow[], viewerId: string | null) {
  const v = await viewerState(viewerId, rows.map((r) => r.id));
  return rows.map((r) => toView(r, v));
}

async function follows(followerId: string, followeeId: string) {
  return !!(await db.follow.findUnique({ where: { followerId_followeeId: { followerId, followeeId } }, select: { followerId: true } }));
}

/** Bedingungen für Stories, die eine andere Person sehen darf (Medien fertig verarbeitet). */
function publicStoryWhere(followsAuthor: boolean): Prisma.StoryWhereInput {
  return {
    state: "PUBLISHED",
    OR: [{ kind: "TEXT" }, { media: { state: "READY" } }],
    visibility: followsAuthor ? { in: ["PUBLIC", "FOLLOWERS"] } : "PUBLIC",
  };
}

const activeWhere = (): Prisma.StoryWhereInput => ({ expiresAt: { gt: new Date() } });

// ───────────────────────── Erstellen ─────────────────────────

export async function createStory(user: SessionUser, input: unknown) {
  await requireFlag("stories", user.id);
  // 18+ im Dienst selbst – Web-Server-Actions laufen nicht durch die zentrale Prüfung der Mobile-API
  await requireAdult(user);
  const data = storyCreateSchema.parse(input);
  await limit("story", user.id);
  const recent = await db.story.count({ where: { authorId: user.id, createdAt: { gte: new Date(Date.now() - 24 * 3600_000) }, state: { not: "REMOVED" } } });
  if (recent >= STORY_MAX_ACTIVE) throw fail.invalid(`Du hast in den letzten 24 Stunden bereits ${STORY_MAX_ACTIVE} Stories geteilt. Später geht es weiter.`);

  if (data.projectId) {
    const p = await db.project.findUnique({ where: { id: data.projectId }, select: { ownerId: true, state: true } });
    if (!p || p.ownerId !== user.id || p.state === "REMOVED") throw fail.forbidden("Du kannst nur eigene Projekte verknüpfen.");
  }
  if (data.kind === "MEDIA") {
    const m = await db.media.findUnique({ where: { id: data.media!.id }, select: { ownerId: true, kind: true, isPrivate: true, durationMs: true } });
    if (!m || m.ownerId !== user.id || m.isPrivate) throw fail.forbidden("Ungültiges Medium.");
    if (m.kind === "FILE") throw fail.invalid("Stories zeigen Fotos oder Videos.");
    if (m.kind === "VIDEO") {
      await requireFlag("uploads.video", user.id);
      if (m.durationMs && m.durationMs > (STORY_VIDEO_MAX_SECONDS + 1) * 1000) {
        throw fail.invalid(`Story-Videos dürfen höchstens ${STORY_VIDEO_MAX_SECONDS} Sekunden lang sein. Längere Videos teilst du als Beitrag.`);
      }
    }
  }

  const story = await db.$transaction(async (tx) => {
    if (data.kind === "MEDIA") await attachMedia(tx, user.id, [data.media!.id]);
    return tx.story.create({
      data: {
        authorId: user.id,
        kind: data.kind,
        mediaId: data.kind === "MEDIA" ? data.media!.id : null,
        text: data.text,
        background: data.kind === "TEXT" ? data.background : null,
        alt: data.kind === "MEDIA" ? (data.media?.alt ?? "") : "",
        visibility: data.visibility,
        projectId: data.projectId ?? null,
        expiresAt: new Date(Date.now() + STORY_LIFETIME_HOURS * 3600_000),
      },
      select: { id: true },
    });
  });
  return story;
}

// ───────────────────────── Story-Kreis ─────────────────────────

export type TrayEntry = { author: StoryAuthor; count: number; unseen: number; latestAt: string; coverThumb: string | null };

/**
 * Story-Kreis oben im Feed: eigene Stories und die aktiven Stories der Profile, denen man folgt –
 * zuerst die mit Neuem (jüngste zuerst), dann die bereits gesehenen.
 */
export async function storyTray(viewer: SessionUser | null) {
  if (!viewer?.profile || !(await flagEnabled("stories", viewer.id))) return { enabled: false, own: null, items: [] as TrayEntry[] };
  const [rel, storyMutes] = await Promise.all([relationsFor(viewer.id), db.storyMute.findMany({ where: { muterId: viewer.id }, select: { mutedId: true } })]);
  const exclude = new Set([...rel.blocked, ...rel.muted, ...storyMutes.map((m) => m.mutedId)]);
  const authorIds = rel.following.filter((id) => !exclude.has(id));

  const [ownRows, rows] = await Promise.all([
    db.story.findMany({ where: { authorId: viewer.id, state: "PUBLISHED", ...activeWhere() }, select: { id: true, createdAt: true, media: { select: { state: true, variants: true } } }, orderBy: { createdAt: "asc" } }),
    authorIds.length
      ? db.story.findMany({
          where: { authorId: { in: authorIds }, ...activeWhere(), ...publicStoryWhere(true), author: { status: { in: [...VISIBLE_STATUS] } } },
          select: { id: true, authorId: true, createdAt: true, media: { select: { variants: true } } },
          orderBy: { createdAt: "asc" },
          take: 3000,
        })
      : Promise.resolve([]),
  ]);

  const seen = rows.length ? new Set((await db.storyView.findMany({ where: { viewerId: viewer.id, storyId: { in: rows.map((r) => r.id) } }, select: { storyId: true } })).map((r) => r.storyId)) : new Set<string>();
  const groups = new Map<string, { count: number; unseen: number; latest: Date; thumb: string | null }>();
  for (const r of rows) {
    const g = groups.get(r.authorId) ?? { count: 0, unseen: 0, latest: r.createdAt, thumb: null };
    g.count++;
    if (!seen.has(r.id)) g.unseen++;
    if (r.createdAt > g.latest) g.latest = r.createdAt;
    const v = (r.media?.variants ?? {}) as Record<string, string>;
    g.thumb = v.thumb ?? v.sm ?? v.poster ?? g.thumb;
    groups.set(r.authorId, g);
  }
  const authors = groups.size ? await db.user.findMany({ where: { id: { in: [...groups.keys()] } }, select: authorSelect }) : [];
  const items: TrayEntry[] = authors
    .map((a) => {
      const g = groups.get(a.id)!;
      return { author: authorView(a), count: g.count, unseen: g.unseen, latestAt: g.latest.toISOString(), coverThumb: g.thumb };
    })
    .sort((a, b) => Number(b.unseen > 0) - Number(a.unseen > 0) || b.latestAt.localeCompare(a.latestAt));

  const ownLast = ownRows.at(-1);
  const ownVariants = (ownLast?.media?.variants ?? {}) as Record<string, string>;
  return {
    enabled: true,
    own: {
      author: { id: viewer.id, handle: viewer.profile.handle, displayName: viewer.profile.displayName, avatarUrl: viewer.profile.avatarUrl ?? null },
      count: ownRows.length,
      processing: ownRows.filter((r) => r.media && r.media.state !== "READY").length,
      latestAt: ownLast?.createdAt.toISOString() ?? null,
      coverThumb: ownVariants.thumb ?? ownVariants.sm ?? null,
    },
    items,
  };
}
export type StoryTray = Awaited<ReturnType<typeof storyTray>>;

/** Ring am Profilbild: hat die Person gerade Stories, die ich sehen darf – und sind neue dabei? */
export async function storyRing(viewerId: string | null, authorId: string) {
  if (!(await flagEnabled("stories", viewerId))) return { active: false, unseen: false };
  const own = viewerId === authorId;
  if (!own && viewerId && (await isBlockedBetween(viewerId, authorId))) return { active: false, unseen: false };
  const f = !own && !!viewerId && (await follows(viewerId, authorId));
  const rows = await db.story.findMany({
    where: { authorId, ...activeWhere(), ...(own ? { state: "PUBLISHED" } : publicStoryWhere(f)) },
    select: { id: true },
    take: 100,
  });
  if (!rows.length) return { active: false, unseen: false };
  if (own || !viewerId) return { active: true, unseen: !own };
  const seen = await db.storyView.count({ where: { viewerId, storyId: { in: rows.map((r) => r.id) } } });
  return { active: true, unseen: seen < rows.length };
}

// ───────────────────────── Ansehen ─────────────────────────

export type StoryGroup = {
  key: string;
  mode: "stories" | "highlight";
  title: string | null;
  author: StoryAuthor;
  items: StoryItem[];
  startIndex: number;
};

async function profileByHandle(handle: string) {
  const h = handle.trim().replace(/^@/, "").toLowerCase();
  const p = await db.userProfile.findUnique({ where: { handle: h }, select: { user: { select: authorSelect } } });
  if (p) return p.user;
  const r = await db.handleRedirect.findUnique({ where: { oldHandle: h }, select: { profile: { select: { user: { select: authorSelect } } } } });
  return r?.profile.user ?? null;
}

/**
 * Aktive Stories einer Person für den Betrachter. Die Autorin / der Autor sieht zusätzlich Stories in
 * Verarbeitung und – über `focusId` – eine einzelne abgelaufene Story aus dem eigenen Archiv.
 */
export async function storyGroup(viewerId: string | null, handle: string, opts: { focusId?: string | null } = {}): Promise<StoryGroup | null> {
  if (!(await flagEnabled("stories", viewerId))) return null;
  const author = await profileByHandle(handle);
  if (!author || !(VISIBLE_STATUS as readonly string[]).includes(author.status)) return null;
  const own = viewerId === author.id;
  if (!own && viewerId && (await isBlockedBetween(viewerId, author.id))) return null;
  const f = !own && !!viewerId && (await follows(viewerId, author.id));

  let rows = await db.story.findMany({
    where: { authorId: author.id, ...activeWhere(), ...(own ? { state: "PUBLISHED" } : publicStoryWhere(f)) },
    select: storySelect,
    orderBy: { createdAt: "asc" },
    take: 100,
  });
  if (own && opts.focusId && !rows.some((r) => r.id === opts.focusId)) {
    const archived = await db.story.findUnique({ where: { id: opts.focusId }, select: storySelect });
    if (archived && archived.authorId === author.id && archived.state !== "REMOVED") rows = [archived];
  }
  if (!rows.length) return null;
  const items = await hydrateStories(rows, viewerId);
  let start = opts.focusId ? items.findIndex((i) => i.id === opts.focusId) : -1;
  if (start < 0) start = own ? 0 : Math.max(0, items.findIndex((i) => !i.viewer.seen));
  return { key: `u:${author.id}`, mode: "stories", title: null, author: authorView(author), items, startIndex: start };
}

/**
 * Reihenfolge im Betrachter: ab der angetippten Person weiter durch den Story-Kreis (wie gewohnt);
 * ausserhalb des Kreises (z. B. vom Profil aus) nur diese eine Person.
 */
export async function storySequence(viewer: SessionUser | null, handle: string) {
  const h = handle.trim().replace(/^@/, "").toLowerCase();
  if (!viewer?.profile || viewer.profile.handle === h) return [h];
  const tray = await storyTray(viewer);
  const handles = tray.items.map((i) => i.author.handle);
  const i = handles.indexOf(h);
  return i >= 0 ? handles.slice(i, i + 40) : [h];
}

/** Lädt eine Story samt Prüfung, ob der Betrachter sie sehen darf (für Ansicht, Herz, Antwort). */
async function viewableStory(viewerId: string, storyId: string) {
  const s = await db.story.findUnique({
    where: { id: storyId },
    select: {
      id: true,
      authorId: true,
      kind: true,
      visibility: true,
      state: true,
      expiresAt: true,
      media: { select: { state: true } },
      author: { select: { status: true, profile: { select: { handle: true } } } },
      _count: { select: { highlightItems: true } },
    },
  });
  if (!s || s.state !== "PUBLISHED" || !(VISIBLE_STATUS as readonly string[]).includes(s.author.status)) throw fail.notFound("Diese Story ist nicht mehr verfügbar.");
  if (s.authorId === viewerId) return s;
  // Abgelaufen: nur noch in Highlights sichtbar
  if (s.expiresAt <= new Date() && s._count.highlightItems === 0) throw fail.notFound("Diese Story ist abgelaufen.");
  if (s.kind === "MEDIA" && s.media?.state !== "READY") throw fail.notFound("Diese Story ist nicht mehr verfügbar.");
  if (await isBlockedBetween(viewerId, s.authorId)) throw fail.notFound("Diese Story ist nicht mehr verfügbar.");
  if (s.visibility !== "PUBLIC" && !(s.visibility === "FOLLOWERS" && (await follows(viewerId, s.authorId)))) throw fail.notFound("Diese Story ist nicht mehr verfügbar.");
  return s;
}

/** Als gesehen markieren (zählt jede Person einmal; eigene Stories zählen nicht). */
export async function markStorySeen(user: SessionUser, storyId: string) {
  const s = await viewableStory(user.id, storyId);
  if (s.authorId === user.id) return { seen: true };
  const created = await db.storyView.createMany({ data: [{ storyId, viewerId: user.id }], skipDuplicates: true });
  if (created.count) await db.story.update({ where: { id: storyId }, data: { viewCount: { increment: 1 } } });
  return { seen: true };
}

export async function setStoryLike(user: SessionUser, storyId: string, liked: boolean) {
  const s = await viewableStory(user.id, storyId);
  if (s.authorId === user.id) throw fail.invalid("Eigene Stories kannst du nicht mit einem Herz markieren.");
  await limit("like", user.id);
  const changed = await db.$transaction(async (tx) => {
    const created = await tx.storyView.createMany({ data: [{ storyId, viewerId: user.id }], skipDuplicates: true });
    if (created.count) await tx.story.update({ where: { id: storyId }, data: { viewCount: { increment: 1 } } });
    // Nur beim tatsächlichen Wechsel zählen (Doppelklick, zwei Geräte)
    const r = await tx.storyView.updateMany({ where: { storyId, viewerId: user.id, likedAt: liked ? null : { not: null } }, data: { likedAt: liked ? new Date() : null } });
    if (r.count) await tx.story.update({ where: { id: storyId }, data: { likeCount: { increment: liked ? 1 : -1 } } });
    return r.count > 0;
  });
  if (changed && liked) {
    await notify({
      recipientId: s.authorId,
      type: "LIKE",
      actorId: user.id,
      targetType: "STORY",
      targetId: storyId,
      data: { targetLabel: "deine Story", href: `/stories/${s.author.profile?.handle ?? ""}?story=${storyId}` },
    }).catch(() => {});
  }
  return { liked };
}

/** Antwort auf eine Story → Direktnachricht an die Autorin / den Autor (mit Story-Vorschau im Verlauf). */
export async function replyToStory(user: SessionUser, storyId: string, input: unknown) {
  const { body } = storyReplySchema.parse(input);
  const s = await viewableStory(user.id, storyId);
  if (s.authorId === user.id) throw fail.invalid("Auf eigene Stories kannst du nicht antworten.");
  const handle = s.author.profile?.handle;
  if (!handle) throw fail.notFound();
  const { startConversation } = await import("@/server/messaging/service");
  return startConversation(user, { recipientHandle: handle, body }, { storyId });
}

/** „Gesehen von“ – nur für die Autorin / den Autor. Personen mit Herz zuerst. */
export async function storyViewers(user: SessionUser, storyId: string) {
  const s = await db.story.findUnique({ where: { id: storyId }, select: { authorId: true, viewCount: true, likeCount: true, state: true } });
  if (!s || s.state === "REMOVED" || s.authorId !== user.id) throw fail.notFound();
  const rel = await relationsFor(user.id);
  const rows = await db.storyView.findMany({
    where: { storyId, ...(rel.blocked.length ? { viewerId: { notIn: rel.blocked } } : {}), viewer: { status: { in: [...VISIBLE_STATUS] } } },
    orderBy: [{ likedAt: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
    take: 500,
    select: { createdAt: true, likedAt: true, viewer: { select: authorSelect } },
  });
  const following = new Set(rel.following);
  return {
    views: s.viewCount,
    likes: s.likeCount,
    viewers: rows.map((r) => ({ ...authorView(r.viewer), viewedAt: r.createdAt.toISOString(), liked: !!r.likedAt, following: following.has(r.viewer.id) })),
  };
}

// ───────────────────────── Verwalten ─────────────────────────

export async function deleteStory(user: SessionUser, storyId: string) {
  const s = await db.story.findUnique({ where: { id: storyId }, select: { authorId: true, state: true } });
  if (!s || s.state === "REMOVED") throw fail.notFound();
  const asMod = s.authorId !== user.id;
  if (asMod && !hasRole(user, "PLATFORM_MODERATOR")) throw fail.forbidden();
  await db.$transaction(async (tx) => {
    await tx.story.update({ where: { id: storyId }, data: { state: "REMOVED" } });
    await tx.storyHighlightItem.deleteMany({ where: { storyId } });
    // Highlights ohne Stories verschwinden; ein entferntes Titelbild fällt auf die erste Story zurück
    await tx.storyHighlight.updateMany({ where: { coverStoryId: storyId }, data: { coverStoryId: null } });
    await tx.storyHighlight.deleteMany({ where: { ownerId: s.authorId, items: { none: {} } } });
    if (asMod) await audit({ actorId: user.id, action: "moderation.story_removed", targetType: "STORY", targetId: storyId }, tx);
  });
}

/** Story-Archiv: alle eigenen Stories (auch abgelaufene), neueste zuerst. */
export async function storyArchive(user: SessionUser, cursor?: string | null) {
  const take = 36;
  const rows = await db.story.findMany({
    where: { authorId: user.id, state: { not: "REMOVED" } },
    select: { ...storySelect, highlightItems: { select: { highlightId: true } } },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: take + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });
  const page = rows.slice(0, take);
  const items = await hydrateStories(page, user.id);
  return {
    items: items.map((it, i) => ({ ...it, highlightIds: page[i]!.highlightItems.map((h) => h.highlightId) })),
    nextCursor: rows.length > take ? page.at(-1)!.id : null,
  };
}
export type ArchiveItem = Awaited<ReturnType<typeof storyArchive>>["items"][number];

export async function setStoryMute(user: SessionUser, targetUserId: string, muted: boolean) {
  if (targetUserId === user.id) throw fail.invalid("Deine eigenen Stories kannst du nicht ausblenden.");
  if (muted) await db.storyMute.upsert({ where: { muterId_mutedId: { muterId: user.id, mutedId: targetUserId } }, create: { muterId: user.id, mutedId: targetUserId }, update: {} });
  else await db.storyMute.deleteMany({ where: { muterId: user.id, mutedId: targetUserId } });
  return { muted };
}

export async function isStoryMuted(viewerId: string, authorId: string) {
  return !!(await db.storyMute.findUnique({ where: { muterId_mutedId: { muterId: viewerId, mutedId: authorId } }, select: { muterId: true } }));
}

export async function listStoryMutes(userId: string) {
  const rows = await db.storyMute.findMany({ where: { muterId: userId }, orderBy: { createdAt: "desc" }, select: { muted: { select: authorSelect } } });
  return rows.map((r) => authorView(r.muted));
}
