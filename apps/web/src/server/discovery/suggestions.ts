import "server-only";
import { db } from "@/server/db";
import { relationsFor } from "@/server/visibility";

/**
 * Vorschläge für Creator & Communities (§8.2 Nr. 6, §18.3). Bevorzugt passende Interessen
 * und mischt bewusst kleinere, aktive Creator bei (kein reines Follower-Ranking, §9.5).
 */
export async function suggestedCreators(viewerId: string | null, interests: string[], take = 5) {
  const rel = await relationsFor(viewerId);
  const exclude = [...rel.following, ...rel.blocked, ...(viewerId ? [viewerId] : [])];
  const rows = await db.userProfile.findMany({
    where: {
      user: { status: "ACTIVE" },
      userId: exclude.length ? { notIn: exclude } : undefined,
      ...(interests.length ? { categories: { hasSome: interests } } : {}),
      projectCount: { gt: 0 },
    },
    orderBy: [{ projectCount: "desc" }, { followerCount: "desc" }],
    take: take * 3,
    select: { userId: true, handle: true, displayName: true, avatarUrl: true, bio: true, categories: true, followerCount: true, projectCount: true },
  });
  // Mischung: Hälfte etabliert, Hälfte kleinere Creator
  const big = rows.slice(0, Math.ceil(take / 2));
  const small = rows.slice(Math.ceil(take / 2)).sort((a, b) => a.followerCount - b.followerCount).slice(0, take - big.length);
  return [...big, ...small];
}

export async function suggestedCommunities(viewerId: string | null, interests: string[], take = 4) {
  const joined = viewerId ? (await db.communityMember.findMany({ where: { userId: viewerId }, select: { communityId: true } })).map((m) => m.communityId) : [];
  return db.community.findMany({
    where: {
      state: "PUBLISHED",
      visibility: { not: "PRIVATE" },
      id: joined.length ? { notIn: joined } : undefined,
      ...(interests.length ? { category: { in: interests } } : {}),
    },
    orderBy: [{ isFeatured: "desc" }, { memberCount: "desc" }],
    take,
    select: { id: true, slug: true, name: true, category: true, memberCount: true, coverUrl: true },
  });
}

export async function activeProjectsOf(userId: string, take = 3) {
  return db.project.findMany({
    where: { ownerId: userId, state: { not: "REMOVED" }, status: { in: ["IN_PROGRESS", "PLANNING", "PAUSED", "IDEA"] } },
    orderBy: { updatedAt: "desc" },
    take,
    select: { id: true, slug: true, title: true, status: true, category: true, coverUrl: true, updatedAt: true, _count: { select: { updates: true } } },
  });
}

/** Gefragte Projekte der letzten zwei Wochen – ohne blockierte Personen und gesperrte Konten. */
export async function trendingProjects(take = 4, viewerId: string | null = null) {
  const since = new Date(Date.now() - 14 * 86400_000);
  const rel = await relationsFor(viewerId);
  return db.project.findMany({
    where: {
      state: "PUBLISHED",
      visibility: "PUBLIC",
      updatedAt: { gte: since },
      owner: { status: { in: ["ACTIVE", "SUSPENDED"] } },
      ...(rel.blocked.length ? { ownerId: { notIn: rel.blocked } } : {}),
    },
    orderBy: [{ saveCount: "desc" }, { likeCount: "desc" }, { updatedAt: "desc" }],
    take,
    select: { id: true, slug: true, title: true, category: true, coverUrl: true, difficulty: true, status: true, owner: { select: { profile: { select: { handle: true, displayName: true } } } } },
  });
}
