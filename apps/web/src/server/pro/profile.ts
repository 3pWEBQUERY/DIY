import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { env } from "@/server/env";
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

/**
 * Vorschau-Link für das eigene, noch private Medienkit. Die App öffnet das Medienkit in einem
 * Browser-Fenster ohne Anmeldung – mit diesem kurzlebigen, signierten Zusatz sieht die Inhaberin
 * es trotzdem. Gilt nur für dieses Konto und läuft nach 2 Stunden ab.
 */
const PREVIEW_TTL_MS = 2 * 60 * 60_000;
function previewSig(userId: string, exp: number) {
  return createHmac("sha256", env().SESSION_SECRET).update(`mediakit-preview:${userId}:${exp}`).digest("base64url").slice(0, 32);
}
export function mediaKitPreviewToken(userId: string, now = Date.now()) {
  const exp = Math.floor((now + PREVIEW_TTL_MS) / 1000);
  return `${exp.toString(36)}.${previewSig(userId, exp)}`;
}
export function isValidMediaKitPreview(token: string | null | undefined, userId: string, now = Date.now()) {
  if (!token || typeof token !== "string" || token.length > 80) return false;
  const [e, sig] = token.split(".");
  const exp = parseInt(e ?? "", 36);
  if (!sig || !Number.isFinite(exp) || exp * 1000 < now) return false;
  const want = Buffer.from(previewSig(userId, exp));
  const got = Buffer.from(sig);
  return want.length === got.length && timingSafeEqual(want, got);
}

/** Medienkit: echte, erklärte Zahlen für Kooperationen (öffentlich nur mit Pro + Freigabe). */
export async function getMediaKit(handle: string, viewerId: string | null | undefined, opts: { preview?: string | null } = {}) {
  const profile = await db.userProfile.findUnique({
    where: { handle: handle.toLowerCase() },
    include: { user: { select: { id: true, status: true, createdAt: true, shop: { select: { slug: true, name: true, status: true, ratingAvg: true, ratingCount: true } } } } },
  });
  if (!profile || profile.user.status !== "ACTIVE") return null;
  const preview = viewerId !== profile.userId && isValidMediaKitPreview(opts.preview, profile.userId);
  const isOwner = viewerId === profile.userId || preview;
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
    /** Über den Vorschau-Link der App geöffnet (ohne Anmeldung im Browser) */
    preview,
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
