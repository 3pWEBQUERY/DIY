import "server-only";
import { commentCreateSchema, reportSchema } from "@werkraum/shared";
import { db, Prisma, type TargetType } from "@/server/db";
import { fail } from "@/server/errors";
import { limit } from "@/server/ratelimit";
import { notify } from "@/server/notifications";
import { emit } from "@/server/events";
import { canViewContent, isBlockedBetween } from "@/server/visibility";
import { assertOwnerOrMod } from "@/server/authz";
import type { SessionUser } from "@/server/auth/session";
import { bumpCounter, targetMeta } from "./targets";
import { openOrAttachCase } from "@/server/moderation/cases";

/**
 * Erlaubte Ziele je Interaktion – zentral, damit Web (Server Actions) und API (iOS) gleich prüfen.
 * Sonst liesse sich z. B. ein unsichtbarer „Kommentar“ an ein Profil hängen, dessen Text per
 * Benachrichtigung und Push zugestellt wird (umgeht die Nachrichten-Einstellungen).
 */
export const LIKE_TARGETS = ["POST", "PROJECT", "TUTORIAL", "COMMENT", "ARTICLE"] as const satisfies readonly TargetType[];
export const BOOKMARK_TARGETS = ["POST", "PROJECT", "TUTORIAL", "PRODUCT", "ARTICLE"] as const satisfies readonly TargetType[];
export const COMMENT_TARGETS = ["POST", "PROJECT", "TUTORIAL", "ARTICLE"] as const satisfies readonly TargetType[];

export function isAllowedTarget(allowed: readonly TargetType[], type: TargetType) {
  return allowed.includes(type);
}

function assertTarget(allowed: readonly TargetType[], type: TargetType) {
  if (!isAllowedTarget(allowed, type)) throw fail.invalid("Das ist bei diesem Inhalt nicht möglich.");
}

async function assertViewable(user: SessionUser, type: TargetType, id: string) {
  const meta = await targetMeta(type, id);
  if (!meta || !(await canViewContent(user.id, meta))) throw fail.notFound();
  // Kommentare: nur, wenn auch der kommentierte Inhalt sichtbar ist (z. B. private Community)
  if (type === "COMMENT") {
    const c = await db.comment.findUnique({ where: { id }, select: { targetType: true, targetId: true } });
    if (!c || c.targetType === "COMMENT") throw fail.notFound();
    await assertViewable(user, c.targetType, c.targetId);
  }
  // Entwürfe: Reaktionen und Kommentare erst nach der Veröffentlichung
  if (meta.state === "DRAFT") throw fail.conflict("Dieser Beitrag ist noch nicht veröffentlicht.");
  if (type === "POST") {
    const post = await db.post.findUnique({ where: { id }, select: { communityId: true } });
    const { canViewCommunityContentOf } = await import("./posts");
    if (post?.communityId && !(await canViewCommunityContentOf(post.communityId, user.id))) throw fail.notFound();
  }
  return meta;
}

const isUnique = (e: unknown) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";

/**
 * Gefällt-mir umschalten. Idempotent durch zusammengesetzten Primärschlüssel –
 * Doppelklicks oder parallele Requests erzeugen keine doppelten Zählungen (§9.7).
 */
export async function setLike(user: SessionUser, type: TargetType, id: string, liked: boolean) {
  assertTarget(LIKE_TARGETS, type);
  await limit("like", user.id);
  const meta = await assertViewable(user, type, id);
  const key = { userId_targetType_targetId_kind: { userId: user.id, targetType: type, targetId: id, kind: "LIKE" as const } };
  if (liked) {
    try {
      await db.$transaction(async (tx) => {
        await tx.reaction.create({ data: { userId: user.id, targetType: type, targetId: id } });
        await bumpCounter(tx, type, id, "like", 1);
      });
    } catch (e) {
      if (!isUnique(e)) throw e;
      return { liked: true };
    }
    await notify({ recipientId: meta.ownerId, type: type === "PROJECT" ? "PROJECT_ACTIVITY" : "LIKE", actorId: user.id, targetType: type, targetId: id, data: { title: meta.title, href: meta.href } });
  } else {
    await db.$transaction(async (tx) => {
      const del = await tx.reaction.deleteMany({ where: key.userId_targetType_targetId_kind });
      if (del.count) await bumpCounter(tx, type, id, "like", -1);
    });
  }
  return { liked };
}

export async function setBookmark(user: SessionUser, type: TargetType, id: string, saved: boolean, collectionId?: string | null) {
  assertTarget(BOOKMARK_TARGETS, type);
  await assertViewable(user, type, id);
  if (collectionId) {
    const c = await db.collection.findUnique({ where: { id: collectionId }, select: { ownerId: true } });
    if (!c || c.ownerId !== user.id) throw fail.forbidden();
  }
  const where = { userId_targetType_targetId: { userId: user.id, targetType: type, targetId: id } };
  if (saved) {
    const existing = await db.bookmark.findUnique({ where });
    if (existing) {
      if (collectionId !== undefined) await db.bookmark.update({ where, data: { collectionId } });
      return { saved: true };
    }
    try {
      await db.$transaction(async (tx) => {
        await tx.bookmark.create({ data: { userId: user.id, targetType: type, targetId: id, collectionId: collectionId ?? null } });
        await bumpCounter(tx, type, id, "save", 1);
      });
    } catch (e) {
      if (!isUnique(e)) throw e;
    }
  } else {
    await db.$transaction(async (tx) => {
      const del = await tx.bookmark.deleteMany({ where: where.userId_targetType_targetId });
      if (del.count) await bumpCounter(tx, type, id, "save", -1);
    });
  }
  return { saved };
}

export async function createComment(user: SessionUser, type: TargetType, id: string, input: unknown) {
  assertTarget(COMMENT_TARGETS, type);
  const data = commentCreateSchema.parse(input);
  await limit("comment", user.id);
  const meta = await assertViewable(user, type, id);
  // Serverseitige Durchsetzung von Kommentar-Einstellungen und Community-Stummschaltungen
  if (type === "ARTICLE") {
    const a = await db.blogArticle.findUnique({ where: { id }, select: { commentsEnabled: true } });
    if (!a?.commentsEnabled) throw fail.forbidden("Kommentare sind für diesen Artikel deaktiviert.");
  }
  if (type === "POST") {
    const post = await db.post.findUnique({ where: { id }, select: { communityId: true } });
    if (post?.communityId) {
      const { assertNotSilencedInCommunity } = await import("./posts");
      await assertNotSilencedInCommunity(post.communityId, user.id);
    }
  }
  let parentAuthor: string | null = null;
  if (data.parentId) {
    const parent = await db.comment.findUnique({ where: { id: data.parentId }, select: { targetId: true, targetType: true, authorId: true, parentId: true } });
    if (!parent || parent.targetId !== id || parent.targetType !== type) throw fail.invalid("Antwort passt nicht zum Inhalt.");
    if (parent.parentId) data.parentId = parent.parentId; // nur eine Antwortebene
    parentAuthor = parent.authorId;
  }
  const comment = await db.$transaction(async (tx) => {
    const c = await tx.comment.create({
      data: {
        authorId: user.id,
        targetType: type,
        targetId: id,
        postId: type === "POST" ? id : null,
        parentId: data.parentId,
        body: data.body,
        isQuestion: /\?\s*$/.test(data.body) && type !== "POST",
      },
    });
    await bumpCounter(tx, type, id, "comment", 1);
    await emit({ type: "CommentCreated", commentId: c.id, authorId: user.id }, tx);
    return c;
  });
  const href = meta.href;
  if (parentAuthor && parentAuthor !== user.id) {
    await notify({ recipientId: parentAuthor, type: "REPLY", actorId: user.id, targetType: "COMMENT", targetId: comment.id, data: { title: meta.title, href, excerpt: data.body.slice(0, 120) }, bundle: false });
  }
  if (meta.ownerId !== parentAuthor) {
    await notify({ recipientId: meta.ownerId, type: type === "PROJECT" ? "PROJECT_ACTIVITY" : "COMMENT", actorId: user.id, targetType: type, targetId: id, data: { title: meta.title, href, excerpt: data.body.slice(0, 120) } });
  }
  return comment;
}

export async function deleteComment(user: SessionUser, commentId: string) {
  const c = await db.comment.findUnique({ where: { id: commentId }, select: { authorId: true, targetType: true, targetId: true, state: true, parentId: true } });
  if (!c || c.state === "REMOVED") throw fail.notFound();
  const meta = await targetMeta(c.targetType, c.targetId);
  // Autor, Inhaltseigentümer oder Moderation dürfen entfernen
  if (meta?.ownerId !== user.id) assertOwnerOrMod(user, c.authorId);
  await db.$transaction(async (tx) => {
    // Nur ein sichtbarer Kommentar zählt – ein von der Moderation ausgeblendeter wurde schon abgezogen,
    // und ein gleichzeitiger zweiter Aufruf darf nicht nochmals abziehen
    const visible = await tx.comment.updateMany({ where: { id: commentId, state: "PUBLISHED" }, data: { state: "REMOVED" } });
    if (!visible.count) {
      const other = await tx.comment.updateMany({ where: { id: commentId, state: { not: "REMOVED" } }, data: { state: "REMOVED" } });
      if (!other.count) return;
    }
    // Antworten verschwinden mit dem Kommentar aus der Liste – also auch aus dem Zähler
    const replies = c.parentId ? 0 : await tx.comment.count({ where: { parentId: commentId, state: "PUBLISHED" } });
    const by = (visible.count ? 1 : 0) + replies;
    if (by) await bumpCounter(tx, c.targetType, c.targetId, "comment", -by);
  });
}

/** Hauptkommentare je Seite (Antworten kommen immer vollständig dazu). */
export const COMMENT_PAGE = 100;

const commentAuthor = { select: { id: true, profile: { select: { handle: true, displayName: true, avatarUrl: true } } } } as const;

/** Cursor = Zeitpunkt + ID des ältesten Kommentars der Seite (übersteht auch dessen Löschung). */
export function encodeCommentCursor(c: { createdAt: Date; id: string }) {
  return `${c.createdAt.toISOString()}_${c.id}`;
}
export function decodeCommentCursor(cursor: string | null | undefined): { createdAt: Date; id: string } | null {
  if (!cursor) return null;
  const i = cursor.indexOf("_");
  if (i < 1) return null;
  const createdAt = new Date(cursor.slice(0, i));
  const id = cursor.slice(i + 1);
  if (Number.isNaN(createdAt.getTime()) || !id) return null;
  return { createdAt, id };
}

export type CommentView = {
  id: string;
  body: string;
  createdAt: string;
  editedAt: string | null;
  likeCount: number;
  liked: boolean;
  isQuestion: boolean;
  isAnswer: boolean;
  author: { id: string; handle: string; displayName: string; avatarUrl: string | null };
  replies: Omit<CommentView, "replies">[];
};
export type CommentPage = { items: CommentView[]; nextCursor: string | null };

/**
 * Kommentare zu einem Inhalt, seitenweise: Die erste Seite enthält die als Lösung markierten und die
 * neuesten Kommentare, `nextCursor` führt zu den älteren. Innerhalb einer Seite chronologisch aufsteigend.
 * Ohne Kommentare gesperrter/gelöschter Konten und blockierter Personen.
 */
export async function listCommentPage(type: TargetType, id: string, viewerId: string | null, cursor?: string | null): Promise<CommentPage> {
  const empty: CommentPage = { items: [], nextCursor: null };
  if (!isAllowedTarget(COMMENT_TARGETS, type)) return empty;
  const after = decodeCommentCursor(cursor);
  if (cursor && !after) return empty;
  const meta = await targetMeta(type, id);
  if (!meta || !(await canViewContent(viewerId, meta))) return empty;
  if (type === "POST") {
    const post = await db.post.findUnique({ where: { id }, select: { communityId: true } });
    const { canViewCommunityContentOf } = await import("./posts");
    if (post?.communityId && !(await canViewCommunityContentOf(post.communityId, viewerId))) return empty;
  }
  const blocked = viewerId
    ? (await db.userBlock.findMany({ where: { OR: [{ blockerId: viewerId }, { blockedId: viewerId }] }, select: { blockerId: true, blockedId: true } })).flatMap((b) => [b.blockerId, b.blockedId]).filter((x) => x !== viewerId)
    : [];
  // Wie Feed, Suche und Profil: keine Kommentare gesperrter (BANNED) oder gelöschter Konten
  const visibleAuthor = { author: { status: { in: ["ACTIVE", "SUSPENDED"] } }, ...(blocked.length ? { authorId: { notIn: blocked } } : {}) } satisfies Prisma.CommentWhereInput;
  const include = {
    author: commentAuthor,
    replies: { where: { state: "PUBLISHED", ...visibleAuthor }, orderBy: { createdAt: "asc" }, include: { author: commentAuthor } },
  } satisfies Prisma.CommentInclude;
  const base = { targetType: type, targetId: id, parentId: null, state: "PUBLISHED", ...visibleAuthor } satisfies Prisma.CommentWhereInput;
  const [answers, latest] = await Promise.all([
    after ? Promise.resolve([]) : db.comment.findMany({ where: { ...base, isAnswer: true }, orderBy: { createdAt: "asc" }, take: 50, include }),
    db.comment.findMany({
      where: {
        ...base,
        isAnswer: false,
        ...(after ? { OR: [{ createdAt: { lt: after.createdAt } }, { createdAt: after.createdAt, id: { lt: after.id } }] } : {}),
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: COMMENT_PAGE + 1,
      include,
    }),
  ]);
  const hasMore = latest.length > COMMENT_PAGE;
  const page = latest.slice(0, COMMENT_PAGE);
  const nextCursor = hasMore ? encodeCommentCursor(page[page.length - 1]!) : null;
  const rows = [...answers, ...page.reverse()];
  const ids = rows.flatMap((r) => [r.id, ...r.replies.map((x) => x.id)]);
  const liked = viewerId && ids.length ? new Set((await db.reaction.findMany({ where: { userId: viewerId, targetType: "COMMENT", targetId: { in: ids } }, select: { targetId: true } })).map((r) => r.targetId)) : new Set<string>();
  const map = (c: (typeof rows)[number] | (typeof rows)[number]["replies"][number]): Omit<CommentView, "replies"> => ({
    id: c.id,
    body: c.body,
    createdAt: c.createdAt.toISOString(),
    editedAt: c.editedAt?.toISOString() ?? null,
    likeCount: c.likeCount,
    liked: liked.has(c.id),
    isQuestion: c.isQuestion,
    isAnswer: c.isAnswer,
    author: { id: c.author.id, handle: c.author.profile?.handle ?? "", displayName: c.author.profile?.displayName ?? "", avatarUrl: c.author.profile?.avatarUrl ?? null },
  });
  return { items: rows.map((r) => ({ ...map(r), replies: r.replies.map(map) })), nextCursor };
}

// ───────────── Beziehungen ─────────────

export async function setFollow(user: SessionUser, targetUserId: string, follow: boolean) {
  if (targetUserId === user.id) throw fail.invalid("Du kannst dir nicht selbst folgen.");
  await limit("follow", user.id);
  if (follow) {
    if (await isBlockedBetween(user.id, targetUserId)) throw fail.forbidden("Folgen ist nicht möglich.");
    try {
      await db.$transaction([
        db.follow.create({ data: { followerId: user.id, followeeId: targetUserId } }),
        db.userProfile.update({ where: { userId: user.id }, data: { followingCount: { increment: 1 } } }),
        db.userProfile.update({ where: { userId: targetUserId }, data: { followerCount: { increment: 1 } } }),
      ]);
    } catch (e) {
      if (isUnique(e)) return { following: true };
      throw e;
    }
    await emit({ type: "UserFollowed", followerId: user.id, followeeId: targetUserId });
    await notify({ recipientId: targetUserId, type: "FOLLOW", actorId: user.id, targetType: "USER", targetId: targetUserId, data: { href: `/u/${user.profile?.handle}` } });
  } else {
    await db.$transaction(async (tx) => {
      const del = await tx.follow.deleteMany({ where: { followerId: user.id, followeeId: targetUserId } });
      if (del.count) {
        await tx.userProfile.update({ where: { userId: user.id }, data: { followingCount: { decrement: 1 } } });
        await tx.userProfile.update({ where: { userId: targetUserId }, data: { followerCount: { decrement: 1 } } });
      }
    });
  }
  return { following: follow };
}

export async function setProjectFollow(user: SessionUser, projectId: string, follow: boolean) {
  await assertViewable(user, "PROJECT", projectId);
  if (follow) await db.projectFollow.upsert({ where: { userId_projectId: { userId: user.id, projectId } }, create: { userId: user.id, projectId }, update: {} });
  else await db.projectFollow.deleteMany({ where: { userId: user.id, projectId } });
  return { following: follow };
}

/** Blockieren wirkt wechselseitig und entfernt bestehende Follow-Beziehungen (§9.7). */
export async function setBlock(user: SessionUser, targetUserId: string, block: boolean) {
  if (targetUserId === user.id) throw fail.invalid("Das geht nicht.");
  if (block) {
    await db.$transaction(async (tx) => {
      await tx.userBlock.upsert({ where: { blockerId_blockedId: { blockerId: user.id, blockedId: targetUserId } }, create: { blockerId: user.id, blockedId: targetUserId }, update: {} });
      const a = await tx.follow.deleteMany({ where: { followerId: user.id, followeeId: targetUserId } });
      const b = await tx.follow.deleteMany({ where: { followerId: targetUserId, followeeId: user.id } });
      // Koautorenschaften zwischen beiden auflösen (Einladungen und bestätigte Nennungen, in beide Richtungen)
      await tx.postCoauthor.deleteMany({
        where: {
          OR: [
            { userId: targetUserId, post: { authorId: user.id } },
            { userId: user.id, post: { authorId: targetUserId } },
          ],
        },
      });
      if (a.count) {
        await tx.userProfile.update({ where: { userId: user.id }, data: { followingCount: { decrement: 1 } } });
        await tx.userProfile.update({ where: { userId: targetUserId }, data: { followerCount: { decrement: 1 } } });
      }
      if (b.count) {
        await tx.userProfile.update({ where: { userId: targetUserId }, data: { followingCount: { decrement: 1 } } });
        await tx.userProfile.update({ where: { userId: user.id }, data: { followerCount: { decrement: 1 } } });
      }
    });
  } else {
    await db.userBlock.deleteMany({ where: { blockerId: user.id, blockedId: targetUserId } });
  }
  return { blocked: block };
}

export async function setMute(user: SessionUser, targetUserId: string, mute: boolean) {
  if (mute) await db.userMute.upsert({ where: { muterId_mutedId: { muterId: user.id, mutedId: targetUserId } }, create: { muterId: user.id, mutedId: targetUserId }, update: {} });
  else await db.userMute.deleteMany({ where: { muterId: user.id, mutedId: targetUserId } });
  return { muted: mute };
}

export async function hideContent(user: SessionUser, type: TargetType, id: string) {
  await db.hiddenContent.upsert({ where: { userId_targetType_targetId: { userId: user.id, targetType: type, targetId: id } }, create: { userId: user.id, targetType: type, targetId: id }, update: {} });
}

/** Meldung → Moderationsfall mit Fallnummer (§24.1). Eine Meldung je Person & Ziel. */
export async function report(user: SessionUser, input: unknown) {
  const data = reportSchema.parse(input);
  await limit("report", user.id);
  const meta = await targetMeta(data.targetType, data.targetId);
  if (!meta) throw fail.notFound();
  if (meta.ownerId === user.id && data.targetType !== "USER") throw fail.invalid("Eigene Inhalte kannst du direkt bearbeiten oder löschen.");
  const existing = await db.report.findUnique({ where: { reporterId_targetType_targetId: { reporterId: user.id, targetType: data.targetType, targetId: data.targetId } }, include: { case: { select: { number: true } } } });
  if (existing) return { caseNumber: existing.case?.number ?? null, duplicate: true };
  const c = await openOrAttachCase({ reporterId: user.id, targetType: data.targetType, targetId: data.targetId, reason: data.reason, details: data.details, subjectUserId: meta.ownerId, snapshot: { title: meta.title, href: meta.href } });
  return { caseNumber: c.number, duplicate: false };
}
