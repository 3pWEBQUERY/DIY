import "server-only";
import { z } from "zod";
import { db } from "@/server/db";
import { fail } from "@/server/errors";
import type { SessionUser } from "@/server/auth/session";
import { getProjectCards } from "@/server/projects/service";
import { isPro, PRO_NAME } from "./service";
import { profileAwards } from "@/server/communities/competitions";

/** Creator Pro: Profilgestaltung (hervorgehobene Projekte) und Medienkit. */

export const FEATURED_MAX = 3;

async function requirePro(userId: string) {
  if (!(await isPro(userId))) throw fail.forbidden(`Diese Funktion ist Teil von ${PRO_NAME}.`);
}

export async function setFeaturedProjects(user: Pick<SessionUser, "id">, input: unknown) {
  await requirePro(user.id);
  const ids = z.array(z.string().min(1)).max(FEATURED_MAX, `Höchstens ${FEATURED_MAX} Projekte`).parse(input);
  const unique = [...new Set(ids)];
  const own = await db.project.findMany({ where: { id: { in: unique }, ownerId: user.id, state: "PUBLISHED", visibility: "PUBLIC" }, select: { id: true } });
  if (own.length !== unique.length) throw fail.invalid("Hervorheben kannst du nur deine eigenen, öffentlichen Projekte.");
  await db.userProfile.update({ where: { userId: user.id }, data: { featuredProjectIds: unique } });
  return { featured: unique };
}

export async function setMediaKitPublic(user: Pick<SessionUser, "id">, value: boolean) {
  await requirePro(user.id);
  await db.userProfile.update({ where: { userId: user.id }, data: { mediaKitPublic: !!value } });
  return { mediaKitPublic: !!value };
}

/** Hervorgehobene Projekte für die Profilseite – nur solange Pro aktiv ist. */
export async function featuredProjects(userId: string, ids: string[], viewerId: string | null | undefined) {
  if (!ids.length || !(await isPro(userId))) return [];
  return getProjectCards(ids.slice(0, FEATURED_MAX), viewerId);
}

/** Medienkit: echte, erklärte Zahlen für Kooperationen (öffentlich nur mit Pro + Freigabe). */
export async function getMediaKit(handle: string, viewerId: string | null | undefined) {
  const profile = await db.userProfile.findUnique({
    where: { handle: handle.toLowerCase() },
    include: { user: { select: { id: true, status: true, createdAt: true, shop: { select: { slug: true, name: true, status: true, ratingAvg: true, ratingCount: true } } } } },
  });
  if (!profile || profile.user.status !== "ACTIVE") return null;
  const isOwner = viewerId === profile.userId;
  const pro = await isPro(profile.userId);
  if (!pro || (!profile.mediaKitPublic && !isOwner)) return null;
  const userId = profile.userId;
  const since = new Date(Date.now() - 90 * 86400_000);
  const [projects, tutorials, views90, top] = await Promise.all([
    db.project.aggregate({ where: { ownerId: userId, state: "PUBLISHED", visibility: "PUBLIC" }, _count: { _all: true }, _sum: { saveCount: true, remixCount: true, likeCount: true, viewCount: true } }),
    db.tutorial.aggregate({ where: { authorId: userId, state: "PUBLISHED" }, _count: { _all: true }, _sum: { completionCount: true, saveCount: true } }),
    db.analyticsEvent.count({ where: { ownerId: userId, name: "view", createdAt: { gte: since } } }),
    db.project.findMany({ where: { ownerId: userId, state: "PUBLISHED", visibility: "PUBLIC" }, orderBy: [{ viewCount: "desc" }, { saveCount: "desc" }], take: 6, select: { id: true } }),
  ]);
  const shop = profile.user.shop && ["ACTIVE", "PAUSED"].includes(profile.user.shop.status) ? profile.user.shop : null;
  return {
    isOwner,
    public: profile.mediaKitPublic,
    profile: {
      handle: profile.handle,
      displayName: profile.displayName,
      avatarUrl: profile.avatarUrl,
      coverUrl: profile.coverUrl,
      bio: profile.bio,
      region: profile.region,
      categories: profile.categories,
      website: profile.website,
      links: (Array.isArray(profile.links) ? profile.links : []) as { label?: string; url: string }[],
      memberSince: profile.user.createdAt,
      dmOpen: profile.dmPolicy !== "NOBODY",
    },
    stats: {
      followers: profile.followerCount,
      projects: projects._count._all,
      tutorials: tutorials._count._all,
      views90,
      viewsTotal: projects._sum.viewCount ?? 0,
      saves: (projects._sum.saveCount ?? 0) + (tutorials._sum.saveCount ?? 0),
      remixes: projects._sum.remixCount ?? 0,
      likes: projects._sum.likeCount ?? 0,
      completions: tutorials._sum.completionCount ?? 0,
    },
    shop,
    topProjects: await getProjectCards(top.map((t) => t.id), viewerId),
    awards: (await profileAwards(userId, viewerId ? { id: viewerId, role: "MEMBER" } : null)).slice(0, 6),
    generatedAt: new Date(),
  };
}
