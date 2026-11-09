import "server-only";
import { z } from "zod";
import { db } from "@/server/db";
import { fail } from "@/server/errors";
import { notify } from "@/server/notifications";
import { rateLimit } from "@/server/ratelimit";
import { isBlockedBetween } from "@/server/visibility";
import type { SessionUser } from "@/server/auth/session";

/**
 * Koautorenschaft für Beiträge (PRD §9.3).
 * - Die Autorin/der Autor lädt bis zu 3 Personen ein; sie erscheinen erst nach Bestätigung.
 * - Wer einlädt, braucht dieselbe Erlaubnis wie für eine Direktnachricht: „Niemand“ verhindert
 *   Einladungen, „Nur Personen, denen ich folge“ setzt voraus, dass die Person einem folgt.
 * - Koautor:innen können nicht bearbeiten, aber jederzeit austreten. Bearbeiten und Löschen
 *   bleiben bei der Autorin/beim Autor.
 */

export const COAUTHOR_MAX = 3;

const handlesSchema = z.array(z.string().trim().min(1)).min(1, "Wähle mindestens eine Person.").max(COAUTHOR_MAX);

async function ownPost(user: Pick<SessionUser, "id">, postId: string) {
  const post = await db.post.findUnique({ where: { id: postId }, select: { id: true, authorId: true, state: true, body: true, repostOfId: true, communityId: true } });
  if (!post || post.state === "REMOVED") throw fail.notFound("Beitrag nicht gefunden.");
  if (post.authorId !== user.id) throw fail.forbidden("Nur die Autorin bzw. der Autor kann Koautor:innen einladen.");
  if (post.repostOfId) throw fail.invalid("Zu geteilten Beiträgen kann man keine Koautor:innen einladen.");
  // Wie beim Erstellen: in Communities keine Koautor:innen (Nichtmitglieder sähen sonst Auszüge privater Beiträge)
  if (post.communityId) throw fail.invalid("Bei Beiträgen in Communities sind keine Koautor:innen möglich.");
  return post;
}

const excerpt = (body: string) => body.replace(/\s+/g, " ").trim().slice(0, 100) || null;

export async function listCoauthors(user: Pick<SessionUser, "id">, postId: string) {
  await ownPost(user, postId);
  const rows = await db.postCoauthor.findMany({
    where: { postId },
    orderBy: { createdAt: "asc" },
    select: { status: true, user: { select: { id: true, profile: { select: { handle: true, displayName: true, avatarUrl: true } } } } },
  });
  return rows.map((r) => ({ id: r.user.id, handle: r.user.profile?.handle ?? "", displayName: r.user.profile?.displayName ?? "Unbekannt", avatarUrl: r.user.profile?.avatarUrl ?? null, status: r.status as "QUEUED" | "PENDING" | "ACCEPTED" }));
}

type Invitee = { userId: string; handle: string; displayName: string };

/** Profilnamen prüfen: vorhanden, nicht man selbst, nicht blockiert, Einladungen erlaubt. */
export async function validateCoauthorHandles(user: Pick<SessionUser, "id">, input: unknown, existingUserIds: string[] = []): Promise<Invitee[]> {
  const handles = [...new Set(handlesSchema.parse(input).map((h) => h.replace(/^@/, "").toLowerCase()))];
  const profiles = await db.userProfile.findMany({ where: { handle: { in: handles } }, select: { userId: true, handle: true, displayName: true, dmPolicy: true, user: { select: { status: true } } } });
  const missing = handles.filter((h) => !profiles.some((p) => p.handle === h));
  if (missing.length) throw fail.invalid(`Nicht gefunden: ${missing.map((h) => `@${h}`).join(", ")}`);
  const fresh = profiles.filter((p) => !existingUserIds.includes(p.userId));
  if (fresh.some((p) => p.userId === user.id)) throw fail.invalid("Du bist bereits Autor:in dieses Beitrags.");
  if (existingUserIds.length + fresh.length > COAUTHOR_MAX) throw fail.invalid(`Höchstens ${COAUTHOR_MAX} Koautor:innen pro Beitrag.`);
  for (const p of fresh) {
    if (p.user.status !== "ACTIVE" || (await isBlockedBetween(user.id, p.userId))) throw fail.forbidden(`${p.displayName} kann nicht eingeladen werden.`);
    if (p.dmPolicy === "NOBODY") throw fail.forbidden(`${p.displayName} nimmt keine Einladungen an.`);
    if (p.dmPolicy !== "EVERYONE") {
      const follows = await db.follow.findUnique({ where: { followerId_followeeId: { followerId: p.userId, followeeId: user.id } }, select: { followerId: true } });
      if (!follows) throw fail.forbidden(`${p.displayName} nimmt Einladungen nur von Personen an, denen sie bzw. er folgt.`);
    }
  }
  return fresh.map((p) => ({ userId: p.userId, handle: p.handle, displayName: p.displayName }));
}

async function sendInvite(authorId: string, postId: string, recipientId: string, body: string) {
  await notify({ recipientId, type: "MENTION", actorId: authorId, targetType: "POST", targetId: postId, bundle: false, data: { kind: "coauthor_invite", href: `/beitrag/${postId}`, excerpt: excerpt(body) } }).catch(() => {});
}

/**
 * Einladen. Bei veröffentlichten Beiträgen sofort (PENDING + Benachrichtigung), bei Entwürfen und
 * geplanten Beiträgen vorgemerkt (QUEUED) – verschickt wird beim Veröffentlichen.
 */
export async function inviteCoauthors(user: SessionUser, postId: string, input: unknown) {
  const post = await ownPost(user, postId);
  await rateLimit(`coauthor-invite:${user.id}`, 30, 3600);
  const existing = await db.postCoauthor.findMany({ where: { postId }, select: { userId: true } });
  const fresh = await validateCoauthorHandles(user, input, existing.map((e) => e.userId));
  if (!fresh.length) return { invited: [] as string[], queued: false };
  const queued = post.state === "DRAFT";
  await db.postCoauthor.createMany({ data: fresh.map((p) => ({ postId, userId: p.userId, invitedById: user.id, status: queued ? "QUEUED" : "PENDING" })), skipDuplicates: true });
  if (!queued) for (const p of fresh) await sendInvite(user.id, postId, p.userId, post.body);
  return { invited: fresh.map((p) => p.displayName), queued };
}

/** Beim Veröffentlichen eines Entwurfs: vorgemerkte Einladungen verschicken. */
export async function releaseQueuedCoauthorInvites(postId: string) {
  const rows = await db.postCoauthor.findMany({ where: { postId, status: "QUEUED" }, select: { userId: true, post: { select: { authorId: true, body: true } } } });
  if (!rows.length) return 0;
  await db.postCoauthor.updateMany({ where: { postId, status: "QUEUED" }, data: { status: "PENDING", createdAt: new Date() } });
  for (const r of rows) await sendInvite(r.post.authorId, postId, r.userId, r.post.body);
  return rows.length;
}

export async function removeCoauthor(user: Pick<SessionUser, "id">, postId: string, userId: string) {
  await ownPost(user, postId);
  await db.postCoauthor.deleteMany({ where: { postId, userId } });
  return { removed: true };
}

/** Einladung beantworten. Ablehnen löscht die Einladung; Annehmen meldet es der Autorin/dem Autor. */
export async function respondCoauthor(user: SessionUser, postId: string, accept: boolean) {
  const inv = await db.postCoauthor.findUnique({ where: { postId_userId: { postId, userId: user.id } }, include: { post: { select: { authorId: true, body: true, state: true } } } });
  if (!inv || inv.post.state === "REMOVED") throw fail.notFound("Diese Einladung gibt es nicht mehr.");
  // Inzwischen blockiert (in eine Richtung) → Einladung verfällt
  if (await isBlockedBetween(user.id, inv.post.authorId)) {
    await db.postCoauthor.delete({ where: { postId_userId: { postId, userId: user.id } } });
    throw fail.notFound("Diese Einladung gibt es nicht mehr.");
  }
  if (!accept) {
    await db.postCoauthor.delete({ where: { postId_userId: { postId, userId: user.id } } });
    return { status: "DECLINED" as const };
  }
  if (inv.status === "ACCEPTED") return { status: "ACCEPTED" as const };
  await db.postCoauthor.update({ where: { postId_userId: { postId, userId: user.id } }, data: { status: "ACCEPTED", respondedAt: new Date() } });
  await notify({
    recipientId: inv.post.authorId,
    type: "MENTION",
    actorId: user.id,
    targetType: "POST",
    targetId: postId,
    bundle: false,
    data: { kind: "coauthor_accepted", href: `/beitrag/${postId}`, excerpt: excerpt(inv.post.body) },
  }).catch(() => {});
  return { status: "ACCEPTED" as const };
}

/** Als Koautor:in austreten. */
export async function leaveCoauthor(user: Pick<SessionUser, "id">, postId: string) {
  const r = await db.postCoauthor.deleteMany({ where: { postId, userId: user.id } });
  if (!r.count) throw fail.notFound();
  return { left: true };
}

/** Offene Einladung der betrachtenden Person zu einem Beitrag (Hinweis auf der Beitragsseite). */
export async function pendingInvite(postId: string, viewerId: string | null | undefined) {
  if (!viewerId) return null;
  const inv = await db.postCoauthor.findUnique({ where: { postId_userId: { postId, userId: viewerId } }, select: { status: true, invitedById: true } });
  if (!inv || inv.status !== "PENDING") return null;
  const by = await db.userProfile.findUnique({ where: { userId: inv.invitedById }, select: { displayName: true } });
  return { invitedBy: by?.displayName ?? "Jemand" };
}

/** Offene Einladungen einer Person (Studio-Übersicht / App). */
export async function myCoauthorInvites(userId: string) {
  const rows = await db.postCoauthor.findMany({
    where: { userId, status: "PENDING", post: { state: "PUBLISHED" } },
    orderBy: { createdAt: "desc" },
    take: 20,
    select: { postId: true, createdAt: true, post: { select: { body: true, author: { select: { profile: { select: { handle: true, displayName: true, avatarUrl: true } } } } } } },
  });
  return rows.map((r) => ({ postId: r.postId, createdAt: r.createdAt, excerpt: excerpt(r.post.body), author: r.post.author.profile }));
}

/** Vorschläge: Personen, denen du folgst, und Personen, die dir folgen (alphabetisch). */
export async function coauthorCandidates(userId: string, take = 300) {
  const profile = { select: { id: true, status: true, profile: { select: { handle: true, displayName: true, avatarUrl: true } } } } as const;
  const [following, followers] = await Promise.all([
    db.follow.findMany({ where: { followerId: userId }, take, select: { followee: profile } }),
    db.follow.findMany({ where: { followeeId: userId }, take, select: { follower: profile } }),
  ]);
  const map = new Map<string, { id: string; handle: string; displayName: string; avatarUrl: string | null }>();
  for (const u of [...following.map((f) => f.followee), ...followers.map((f) => f.follower)]) {
    if (u.status !== "ACTIVE" || !u.profile || u.id === userId) continue;
    map.set(u.id, { id: u.id, handle: u.profile.handle, displayName: u.profile.displayName, avatarUrl: u.profile.avatarUrl });
  }
  return [...map.values()].sort((a, b) => a.displayName.localeCompare(b.displayName, "de"));
}
