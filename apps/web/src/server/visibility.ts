import "server-only";
import { cache } from "react";
import { db } from "@/server/db";

/**
 * Zentrale Sichtbarkeitsregeln (§9.7, §31.4 Nr. 3 & 7).
 * - Blockierungen gelten wechselseitig.
 * - Stummgeschaltete Profile verschwinden aus Feeds, bleiben aber direkt erreichbar.
 * - Gesperrte/gelöschte Inhalte erscheinen nirgends öffentlich.
 */
export const relationsFor = cache(async (viewerId: string | null | undefined) => {
  if (!viewerId) return { blocked: [] as string[], muted: [] as string[], following: [] as string[], hidden: [] as { targetType: string; targetId: string }[] };
  const [blocks, mutes, follows, hidden] = await Promise.all([
    db.userBlock.findMany({ where: { OR: [{ blockerId: viewerId }, { blockedId: viewerId }] }, select: { blockerId: true, blockedId: true } }),
    db.userMute.findMany({ where: { muterId: viewerId }, select: { mutedId: true } }),
    db.follow.findMany({ where: { followerId: viewerId }, select: { followeeId: true } }),
    db.hiddenContent.findMany({ where: { userId: viewerId }, select: { targetType: true, targetId: true } }),
  ]);
  const blocked = [...new Set(blocks.map((b) => (b.blockerId === viewerId ? b.blockedId : b.blockerId)))];
  return {
    blocked,
    muted: mutes.map((m) => m.mutedId),
    following: follows.map((f) => f.followeeId),
    hidden,
  };
});

export async function isBlockedBetween(a: string, b: string) {
  const r = await db.userBlock.findFirst({
    where: { OR: [{ blockerId: a, blockedId: b }, { blockerId: b, blockedId: a }] },
    select: { blockerId: true },
  });
  return !!r;
}

/** Prisma-Where-Fragment: Inhalte, die ein Betrachter sehen darf. */
export function visibleContentWhere(viewerId: string | null | undefined, following: string[], authorField = "authorId") {
  const or: Record<string, unknown>[] = [{ visibility: "PUBLIC" }];
  if (viewerId) {
    or.push({ [authorField]: viewerId });
    if (following.length) or.push({ visibility: "FOLLOWERS", [authorField]: { in: following } });
  }
  return { OR: or };
}

export async function canViewContent(
  viewerId: string | null | undefined,
  item: { ownerId: string; visibility: string; state: string },
) {
  if (item.state === "REMOVED") return false;
  if (viewerId === item.ownerId) return true;
  if (item.state !== "PUBLISHED") return false;
  if (viewerId && (await isBlockedBetween(viewerId, item.ownerId))) return false;
  if (item.visibility === "PUBLIC") return true;
  if (!viewerId) return false;
  if (item.visibility === "FOLLOWERS") {
    const f = await db.follow.findUnique({ where: { followerId_followeeId: { followerId: viewerId, followeeId: item.ownerId } } });
    return !!f;
  }
  return false;
}
