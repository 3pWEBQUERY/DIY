import "server-only";
import { commentFilterWordsSchema, matchCommentFilter, normalizeFilterText } from "@werkraum/shared";
import { z } from "zod";
import { db, type TargetType } from "@/server/db";
import { fail } from "@/server/errors";
import type { SessionUser } from "@/server/auth/session";
import { bumpCounter, targetMeta } from "@/server/social/targets";
import { isPro } from "./service";

/**
 * Creator Pro: Werkzeuge für Kommentare unter eigenen Inhalten.
 * - Anheften: ein Hauptkommentar je Inhalt steht oben („Angeheftet von …“). Einer statt mehrerer, damit
 *   das Angeheftete wirklich auffällt und die Unterhaltung darunter nicht verdrängt wird.
 * - Wortfilter: neue Kommentare mit einem Wort der Liste werden ausgeblendet (`filteredAt`) – nur für
 *   Autor:in und Creatorin sichtbar, nicht gezählt, nicht benachrichtigt; die Creatorin kann einblenden.
 * - Kommentare schliessen (`commentsLockedAt`): keine neuen Kommentare mehr.
 * Lösen, Einblenden und Wieder-Öffnen bleiben auch ohne Pro möglich (nichts bleibt hängen, wenn Pro endet).
 */
export const PINNABLE_TARGETS = ["POST", "PROJECT", "TUTORIAL", "ARTICLE"] as const satisfies readonly TargetType[];
export const LOCKABLE_TARGETS = ["POST", "PROJECT", "TUTORIAL"] as const satisfies readonly TargetType[];
type Lockable = (typeof LOCKABLE_TARGETS)[number];

const PRO_HINT = "Das gehört zu Creator Pro.";

/** Geschlossen? Artikel: von der Autorin ausgeschaltet oder von der Moderation gesperrt */
export async function commentsLocked(type: TargetType, id: string) {
  switch (type) {
    case "POST":
      return !!(await db.post.findUnique({ where: { id }, select: { commentsLockedAt: true } }))?.commentsLockedAt;
    case "PROJECT":
      return !!(await db.project.findUnique({ where: { id }, select: { commentsLockedAt: true } }))?.commentsLockedAt;
    case "TUTORIAL":
      return !!(await db.tutorial.findUnique({ where: { id }, select: { commentsLockedAt: true } }))?.commentsLockedAt;
    case "ARTICLE": {
      const a = await db.blogArticle.findUnique({ where: { id }, select: { commentsEnabled: true, commentsLockedAt: true } });
      return !a?.commentsEnabled || !!a.commentsLockedAt;
    }
    default:
      return false;
  }
}

/** Wortfilter der Inhaber:in – nur wirksam, solange Pro aktiv ist */
export async function activeFilterWords(ownerId: string) {
  const [p, pro] = await Promise.all([db.userProfile.findUnique({ where: { userId: ownerId }, select: { commentFilterWords: true } }), isPro(ownerId)]);
  return pro ? (p?.commentFilterWords ?? []) : [];
}

/** Trifft der Kommentar den Wortfilter der Inhaber:in? (eigene Kommentare nie) */
export async function shouldFilterComment(ownerId: string, authorId: string, body: string) {
  if (ownerId === authorId) return false;
  return !!matchCommentFilter(body, await activeFilterWords(ownerId));
}

/** Einstellungen für die Kommentar-Ansicht: geschlossen, Inhaber:in, Pro */
export async function commentMeta(type: TargetType, id: string, viewerId: string | null) {
  const meta = await targetMeta(type, id);
  if (!meta) return null;
  const isOwner = !!viewerId && meta.ownerId === viewerId;
  const [locked, ownerPro, owner] = await Promise.all([
    commentsLocked(type, id),
    isOwner ? isPro(viewerId) : Promise.resolve(false),
    db.userProfile.findUnique({ where: { userId: meta.ownerId }, select: { displayName: true } }),
  ]);
  return {
    locked,
    /** Artikel öffnen/schliessen die Autor:innen in den Artikel-Einstellungen */
    lockable: (LOCKABLE_TARGETS as readonly string[]).includes(type),
    isOwner,
    /** Nur für Inhaber:innen sinnvoll: darf anheften, filtern und schliessen */
    ownerPro,
    ownerName: owner?.displayName ?? "",
  };
}
export type CommentMeta = NonNullable<Awaited<ReturnType<typeof commentMeta>>>;

async function ownComment(user: Pick<SessionUser, "id">, commentId: string) {
  const c = await db.comment.findUnique({ where: { id: commentId }, select: { id: true, targetType: true, targetId: true, parentId: true, state: true, pinnedAt: true, filteredAt: true } });
  if (!c || c.state === "REMOVED") throw fail.notFound("Kommentar nicht gefunden.");
  const meta = await targetMeta(c.targetType, c.targetId);
  if (!meta || meta.ownerId !== user.id) throw fail.forbidden("Das geht nur unter deinen eigenen Inhalten.");
  return c;
}

/** Hauptkommentar anheften (ersetzt einen bisher angehefteten) bzw. lösen */
export async function setCommentPinned(user: Pick<SessionUser, "id">, commentId: string, pinned: boolean) {
  const c = await ownComment(user, commentId);
  if (!pinned) {
    await db.comment.update({ where: { id: c.id }, data: { pinnedAt: null } });
    return { pinned: false };
  }
  if (!(await isPro(user.id))) throw fail.forbidden(`Kommentare anheften: ${PRO_HINT}`);
  if (!(PINNABLE_TARGETS as readonly string[]).includes(c.targetType)) throw fail.invalid("Hier lassen sich keine Kommentare anheften.");
  if (c.parentId) throw fail.invalid("Nur Hauptkommentare lassen sich anheften.");
  if (c.state !== "PUBLISHED" || c.filteredAt) throw fail.invalid("Blende den Kommentar zuerst ein.");
  await db.$transaction([
    db.comment.updateMany({ where: { targetType: c.targetType, targetId: c.targetId, pinnedAt: { not: null }, id: { not: c.id } }, data: { pinnedAt: null } }),
    db.comment.update({ where: { id: c.id }, data: { pinnedAt: new Date() } }),
  ]);
  return { pinned: true };
}

/**
 * Vom Wortfilter ausgeblendeten Kommentar einblenden: ab jetzt für alle sichtbar und gezählt
 * (ein Hauptkommentar samt seiner sichtbaren Antworten – gleiche Zählregel wie beim Löschen).
 */
export async function unfilterComment(user: Pick<SessionUser, "id">, commentId: string) {
  const c = await ownComment(user, commentId);
  if (!c.filteredAt) return { filtered: false };
  await db.$transaction(async (tx) => {
    const done = await tx.comment.updateMany({ where: { id: c.id, filteredAt: { not: null } }, data: { filteredAt: null } });
    if (!done.count || c.state !== "PUBLISHED") return;
    let by = 0;
    if (c.parentId) {
      const parent = await tx.comment.findUnique({ where: { id: c.parentId }, select: { state: true, filteredAt: true } });
      by = parent?.state === "PUBLISHED" && !parent.filteredAt ? 1 : 0;
    } else {
      by = 1 + (await tx.comment.count({ where: { parentId: c.id, state: "PUBLISHED", filteredAt: null } }));
    }
    if (by) await bumpCounter(tx, c.targetType, c.targetId, "comment", by);
  });
  const { indexHashtags } = await import("@/server/hashtags/sync");
  await indexHashtags("COMMENT", c.id).catch(() => {});
  return { filtered: false };
}

/** Kommentare unter einem eigenen Inhalt schliessen bzw. wieder öffnen */
export async function setCommentsLocked(user: Pick<SessionUser, "id">, type: TargetType, id: string, locked: boolean) {
  if (!(LOCKABLE_TARGETS as readonly string[]).includes(type)) throw fail.invalid("Hier lassen sich Kommentare nicht schliessen.");
  const meta = await targetMeta(type, id);
  if (!meta || meta.ownerId !== user.id) throw fail.forbidden("Das geht nur bei deinen eigenen Inhalten.");
  if (locked && !(await isPro(user.id))) throw fail.forbidden(`Kommentare schliessen: ${PRO_HINT}`);
  const data = { commentsLockedAt: locked ? new Date() : null };
  const t = type as Lockable;
  if (t === "POST") await db.post.update({ where: { id }, data });
  else if (t === "PROJECT") await db.project.update({ where: { id }, data });
  else await db.tutorial.update({ where: { id }, data });
  return { locked };
}

// ───────────────────────── Wortfilter verwalten ─────────────────────────

export async function getCommentFilter(userId: string) {
  const [p, pro, hidden] = await Promise.all([db.userProfile.findUnique({ where: { userId }, select: { commentFilterWords: true } }), isPro(userId), listFilteredComments(userId)]);
  return { words: p?.commentFilterWords ?? [], pro, hidden };
}

/** Vom Wortfilter ausgeblendete Kommentare unter eigenen Inhalten (neueste zuerst) – zum Prüfen */
export async function listFilteredComments(userId: string, take = 50) {
  const rows = await db.$queryRaw<{ id: string }[]>`
    SELECT c.id FROM "Comment" c
      LEFT JOIN "Post" p ON c."targetType" = 'POST' AND p.id = c."targetId"
      LEFT JOIN "Project" pr ON c."targetType" = 'PROJECT' AND pr.id = c."targetId"
      LEFT JOIN "Tutorial" t ON c."targetType" = 'TUTORIAL' AND t.id = c."targetId"
      LEFT JOIN "BlogArticle" a ON c."targetType" = 'ARTICLE' AND a.id = c."targetId"
     WHERE c."filteredAt" IS NOT NULL AND c.state = 'PUBLISHED'
       AND COALESCE(p."authorId", pr."ownerId", t."authorId", a."authorId") = ${userId}
     ORDER BY c."filteredAt" DESC
     LIMIT ${take}`;
  if (!rows.length) return [];
  const comments = await db.comment.findMany({
    where: { id: { in: rows.map((r) => r.id) } },
    orderBy: { filteredAt: "desc" },
    select: { id: true, body: true, createdAt: true, targetType: true, targetId: true, author: { select: { profile: { select: { handle: true, displayName: true, avatarUrl: true } } } } },
  });
  const metas = new Map<string, { title: string; href: string } | null>();
  for (const c of comments) {
    const key = `${c.targetType}:${c.targetId}`;
    if (!metas.has(key)) metas.set(key, await targetMeta(c.targetType, c.targetId));
  }
  return comments.map((c) => {
    const m = metas.get(`${c.targetType}:${c.targetId}`);
    return {
      id: c.id,
      body: c.body,
      createdAt: c.createdAt.toISOString(),
      author: { handle: c.author.profile?.handle ?? "", displayName: c.author.profile?.displayName ?? "Unbekannt", avatarUrl: c.author.profile?.avatarUrl ?? null },
      target: { type: c.targetType, title: m?.title ?? "", href: m?.href ?? "/" },
    };
  });
}

const filterInput = z.object({ words: commentFilterWordsSchema });

export async function setCommentFilter(user: Pick<SessionUser, "id">, input: unknown) {
  if (!(await isPro(user.id))) throw fail.forbidden(`Wortfilter: ${PRO_HINT}`);
  const parsed = filterInput.safeParse(input);
  if (!parsed.success) throw fail.invalid(parsed.error.issues[0]?.message ?? "Ungültige Wortliste.", { words: parsed.error.issues[0]?.message ?? "Ungültig" });
  await db.userProfile.update({ where: { userId: user.id }, data: { commentFilterWords: parsed.data.words } });
  return { words: parsed.data.words };
}

export { normalizeFilterText };
