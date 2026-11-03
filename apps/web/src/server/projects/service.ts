import "server-only";
import { cache } from "react";
import { projectUpsertSchema, projectUpdateEntrySchema, projectStatusChangeSchema, type ProjectStatus } from "@werkraum/shared";
import { db, type Prisma, type Tx } from "@/server/db";
import { fail } from "@/server/errors";
import { emit } from "@/server/events";
import { limit } from "@/server/ratelimit";
import { notify } from "@/server/notifications";
import { audit } from "@/server/audit";
import { relationsFor, visibleContentWhere, canViewContent } from "@/server/visibility";
import { hasRole } from "@/server/authz";
import type { SessionUser } from "@/server/auth/session";
import { attachMedia, mediaCoverUrl } from "@/server/media/service";
import { createPost } from "@/server/social/posts";
import { listComments } from "@/server/social/interactions";
import { slugify } from "@/lib/utils";

/**
 * Projekte – der Produktkern (PRD §10). Ein Projekt bündelt Journal, Anleitung,
 * Produkte, Artikel und Nachbauten zum „Projektfaden“.
 */

// ───────────────────────── Hilfen ─────────────────────────

/** Slugs, die unter /u/[handle]/… bereits von festen Routen belegt sind. */
const RESERVED_SLUGS = new Set([
  "blog", "bearbeiten", "projekte", "anleitungen", "beitraege", "produkte", "sammlungen", "gespeichert",
  "follower", "folgt", "info", "neu", "shop", "medien", "artikel",
]);

async function uniqueProjectSlug(client: Tx | typeof db, ownerId: string, title: string) {
  const base = slugify(title, 60);
  const root = RESERVED_SLUGS.has(base) ? `${base}-projekt` : base;
  const rows = await client.project.findMany({ where: { ownerId, slug: { startsWith: root } }, select: { slug: true } });
  const taken = new Set(rows.map((r) => r.slug));
  if (!taken.has(root)) return root;
  for (let i = 2; i < 500; i++) {
    const s = `${root}-${i}`;
    if (!taken.has(s)) return s;
  }
  return `${root}-${Date.now().toString(36)}`;
}

type Variants = Record<string, string>;

/** URLs (lg → md → sm) für mehrere Medien in einem Zug. */
async function mediaUrls(ids: string[]) {
  if (!ids.length) return new Map<string, string | null>();
  const rows = await db.media.findMany({ where: { id: { in: ids } }, select: { id: true, variants: true } });
  return new Map(rows.map((r) => {
    const v = (r.variants ?? {}) as Variants;
    return [r.id, v.lg ?? v.md ?? v.sm ?? null] as const;
  }));
}

/** Profilzähler: zählt öffentlich sichtbare, veröffentlichte Projekte. */
async function syncProjectCount(tx: Tx, ownerId: string) {
  const n = await tx.project.count({ where: { ownerId, state: "PUBLISHED", visibility: "PUBLIC" } });
  await tx.userProfile.updateMany({ where: { userId: ownerId }, data: { projectCount: n } });
}

function completedAtFor(status: ProjectStatus, prev: Date | null) {
  if (status === "COMPLETED") return prev ?? new Date();
  if (status === "ARCHIVED") return prev;
  return null;
}

async function resolveCatalog(lines: { name: string; materialId?: string }[], kind: "material" | "tool") {
  const slugs = lines.map((l) => slugify(l.name, 80));
  if (kind === "material") {
    const ids = lines.map((l) => l.materialId).filter((x): x is string => !!x);
    const rows = await db.material.findMany({ where: { OR: [{ id: { in: ids } }, { slug: { in: slugs } }] }, select: { id: true, slug: true } });
    const byId = new Set(rows.map((r) => r.id));
    const bySlug = new Map(rows.map((r) => [r.slug, r.id]));
    return lines.map((l, i) => (l.materialId && byId.has(l.materialId) ? l.materialId : (bySlug.get(slugs[i]!) ?? null)));
  }
  const rows = await db.tool.findMany({ where: { slug: { in: slugs } }, select: { id: true, slug: true } });
  const bySlug = new Map(rows.map((r) => [r.slug, r.id]));
  return slugs.map((s) => bySlug.get(s) ?? null);
}

type UpsertData = ReturnType<typeof projectUpsertSchema.parse>;

async function writeChildren(tx: Tx, projectId: string, data: UpsertData, catalog: { materials: (string | null)[]; tools: (string | null)[] }) {
  await tx.projectMedia.deleteMany({ where: { projectId } });
  await tx.projectMaterial.deleteMany({ where: { projectId } });
  await tx.projectTool.deleteMany({ where: { projectId } });
  const seen = new Set<string>();
  const media = data.media.filter((m) => (seen.has(m.id) ? false : (seen.add(m.id), true)));
  if (media.length) await tx.projectMedia.createMany({ data: media.map((m, i) => ({ projectId, mediaId: m.id, position: i, alt: m.alt })) });
  if (data.materials.length) {
    await tx.projectMaterial.createMany({
      data: data.materials.map((m, i) => ({ projectId, name: m.name, quantity: m.quantity, note: m.note, materialId: catalog.materials[i] ?? null, position: i })),
    });
  }
  if (data.tools.length) {
    await tx.projectTool.createMany({
      data: data.tools.map((t, i) => ({ projectId, name: t.name, note: [t.quantity, t.note].filter(Boolean).join(" · "), toolId: catalog.tools[i] ?? null, position: i })),
    });
  }
}

function ownerHref(handle: string | null | undefined, slug: string) {
  return `/u/${handle ?? "unbekannt"}/${slug}`;
}

async function notifyFollowers(projectId: string, actorId: string, data: Record<string, unknown>) {
  const followers = await db.projectFollow.findMany({ where: { projectId, userId: { not: actorId } }, select: { userId: true }, take: 500 });
  for (const f of followers) {
    await notify({ recipientId: f.userId, type: "PROJECT_ACTIVITY", actorId, targetType: "PROJECT", targetId: projectId, data });
  }
}

// ───────────────────────── Schreiben ─────────────────────────

export async function createProject(user: SessionUser, input: unknown) {
  const data = projectUpsertSchema.parse(input);
  await limit("post", user.id);

  let original: { id: string; ownerId: string; title: string } | null = null;
  if (data.remixOfId) {
    const o = await db.project.findUnique({ where: { id: data.remixOfId }, select: { id: true, ownerId: true, visibility: true, state: true, title: true } });
    if (!o || !(await canViewContent(user.id, { ownerId: o.ownerId, visibility: o.visibility, state: o.state }))) {
      throw fail.notFound("Das Originalprojekt ist nicht verfügbar.");
    }
    original = o;
  }

  const galleryIds = data.media.map((m) => m.id);
  const coverId = data.coverMediaId ?? galleryIds[0] ?? null;
  const [coverUrl, catMaterials, catTools] = await Promise.all([
    mediaCoverUrl(coverId),
    resolveCatalog(data.materials, "material"),
    resolveCatalog(data.tools, "tool"),
  ]);

  const project = await db.$transaction(async (tx) => {
    await attachMedia(tx, user.id, [...new Set([...galleryIds, ...(coverId ? [coverId] : [])])]);
    const slug = await uniqueProjectSlug(tx, user.id, data.title);
    const now = new Date();
    const p = await tx.project.create({
      data: {
        ownerId: user.id,
        slug,
        title: data.title,
        description: data.description,
        category: data.category,
        tags: [...new Set(data.tags)],
        status: data.status,
        visibility: data.visibility,
        difficulty: data.difficulty,
        estimatedMinutes: data.estimatedMinutes ?? null,
        actualMinutes: data.actualMinutes ?? null,
        budgetMinor: data.budgetMinor ?? null,
        coverMediaId: coverId,
        coverUrl,
        remixNote: original ? (data.remixNote ?? null) : null,
        publishedAt: now,
        completedAt: completedAtFor(data.status, null),
        qualityScore: 0.4 + (galleryIds.length ? 0.2 : 0) + (data.materials.length ? 0.1 : 0) + Math.min(0.2, data.description.length / 3000),
      },
    });
    await writeChildren(tx, p.id, data, { materials: catMaterials, tools: catTools });
    if (original) {
      await tx.projectRelation.create({ data: { fromId: p.id, toId: original.id, kind: "REMIX", deviations: data.remixNote ?? "" } });
      await tx.project.update({ where: { id: original.id }, data: { remixCount: { increment: 1 } } });
      await emit({ type: "ProjectRemixed", projectId: p.id, originalId: original.id, ownerId: user.id }, tx);
    }
    await emit({ type: "ProjectUpdated", projectId: p.id, ownerId: user.id }, tx);
    await syncProjectCount(tx, user.id);
    return p;
  });

  const href = ownerHref(user.profile?.handle, project.slug);
  if (original) {
    await notify({
      recipientId: original.ownerId,
      type: "REMIX",
      actorId: user.id,
      targetType: "PROJECT",
      targetId: original.id,
      data: { title: original.title, remixTitle: project.title, href },
    });
  }
  return { id: project.id, slug: project.slug, href };
}

async function ownedProject(user: SessionUser, projectId: string) {
  const p = await db.project.findUnique({
    where: { id: projectId },
    select: { id: true, ownerId: true, slug: true, title: true, status: true, completedAt: true, visibility: true, state: true },
  });
  if (!p || p.state === "REMOVED") throw fail.notFound();
  if (p.ownerId !== user.id) throw fail.forbidden("Nur die Projektinhaberin bzw. der Projektinhaber kann das Projekt bearbeiten.");
  return p;
}

export async function updateProject(user: SessionUser, projectId: string, input: unknown) {
  const data = projectUpsertSchema.parse(input);
  const prev = await ownedProject(user, projectId);
  const galleryIds = data.media.map((m) => m.id);
  const coverId = data.coverMediaId ?? galleryIds[0] ?? null;
  const [coverUrl, catMaterials, catTools] = await Promise.all([
    mediaCoverUrl(coverId),
    resolveCatalog(data.materials, "material"),
    resolveCatalog(data.tools, "tool"),
  ]);
  await db.$transaction(async (tx) => {
    await attachMedia(tx, user.id, [...new Set([...galleryIds, ...(coverId ? [coverId] : [])])]);
    await tx.project.update({
      where: { id: projectId },
      data: {
        title: data.title,
        description: data.description,
        category: data.category,
        tags: [...new Set(data.tags)],
        status: data.status,
        visibility: data.visibility,
        difficulty: data.difficulty,
        estimatedMinutes: data.estimatedMinutes ?? null,
        actualMinutes: data.actualMinutes ?? null,
        budgetMinor: data.budgetMinor ?? null,
        coverMediaId: coverId,
        coverUrl,
        completedAt: completedAtFor(data.status, prev.completedAt),
      },
    });
    await writeChildren(tx, projectId, data, { materials: catMaterials, tools: catTools });
    const rel = await tx.projectRelation.findFirst({ where: { fromId: projectId, kind: "REMIX" }, select: { id: true } });
    if (rel) {
      await tx.projectRelation.update({ where: { id: rel.id }, data: { deviations: data.remixNote ?? "" } });
      await tx.project.update({ where: { id: projectId }, data: { remixNote: data.remixNote ?? null } });
    }
    await emit({ type: "ProjectUpdated", projectId, ownerId: user.id }, tx);
    await syncProjectCount(tx, user.id);
  });
  if (data.status === "COMPLETED" && prev.status !== "COMPLETED" && data.visibility === "PUBLIC") {
    await notifyFollowers(projectId, user.id, { title: data.title, href: ownerHref(user.profile?.handle, prev.slug), event: "completed" });
  }
  return { id: projectId, slug: prev.slug, href: ownerHref(user.profile?.handle, prev.slug) };
}

export async function setProjectStatus(user: SessionUser, projectId: string, input: unknown) {
  const { status } = projectStatusChangeSchema.parse(input);
  const prev = await ownedProject(user, projectId);
  if (prev.status === status) return { status };
  await db.$transaction(async (tx) => {
    await tx.project.update({ where: { id: projectId }, data: { status, completedAt: completedAtFor(status, prev.completedAt) } });
    await emit({ type: "ProjectUpdated", projectId, ownerId: user.id }, tx);
  });
  if (status === "COMPLETED" && prev.visibility === "PUBLIC") {
    await notifyFollowers(projectId, user.id, { title: prev.title, href: ownerHref(user.profile?.handle, prev.slug), event: "completed" });
  }
  return { status };
}

/**
 * Löschen: Eigentümer:innen löschen endgültig (inkl. Journal; verknüpfte Beiträge,
 * Anleitungen und Produkte bleiben bestehen, verlieren aber die Verknüpfung).
 * Moderation entfernt nur (state REMOVED) und protokolliert.
 */
export async function deleteProject(user: SessionUser, projectId: string) {
  const p = await db.project.findUnique({ where: { id: projectId }, select: { ownerId: true, state: true } });
  if (!p || p.state === "REMOVED") throw fail.notFound();
  if (p.ownerId !== user.id) {
    if (!hasRole(user, "PLATFORM_MODERATOR")) throw fail.forbidden();
    await db.$transaction(async (tx) => {
      await tx.project.update({ where: { id: projectId }, data: { state: "REMOVED" } });
      await syncProjectCount(tx, p.ownerId);
      await audit({ actorId: user.id, action: "project.remove", targetType: "PROJECT", targetId: projectId }, tx);
    });
    return;
  }
  await db.$transaction(async (tx) => {
    const originals = await tx.projectRelation.findMany({ where: { fromId: projectId, kind: "REMIX" }, select: { toId: true } });
    for (const o of originals) await tx.project.updateMany({ where: { id: o.toId, remixCount: { gt: 0 } }, data: { remixCount: { decrement: 1 } } });
    await tx.bookmark.deleteMany({ where: { targetType: "PROJECT", targetId: projectId } });
    await tx.reaction.deleteMany({ where: { targetType: "PROJECT", targetId: projectId } });
    await tx.comment.deleteMany({ where: { targetType: "PROJECT", targetId: projectId } });
    await tx.project.delete({ where: { id: projectId } });
    await syncProjectCount(tx, user.id);
  });
}

// ───────────────────────── Journal ─────────────────────────

export async function addProjectUpdate(user: SessionUser, projectId: string, input: unknown) {
  const data = projectUpdateEntrySchema.parse(input);
  await limit("post", user.id);
  const project = await db.project.findUnique({
    where: { id: projectId },
    select: { id: true, ownerId: true, slug: true, title: true, visibility: true, state: true, category: true, contributors: { where: { userId: user.id }, select: { userId: true } } },
  });
  if (!project || project.state === "REMOVED") throw fail.notFound();
  if (project.ownerId !== user.id && project.contributors.length === 0) throw fail.forbidden("Nur Projektbeteiligte können Fortschritte eintragen.");

  const urls = await mediaUrls(data.media.map((m) => m.id));
  const entry = await db.$transaction(async (tx) => {
    await attachMedia(tx, user.id, data.media.map((m) => m.id));
    const u = await tx.projectUpdate.create({
      data: {
        projectId,
        authorId: user.id,
        body: data.body,
        milestone: data.milestone || null,
        problem: data.problem || null,
        solution: data.solution || null,
        minutes: data.minutes ?? null,
        media: data.media.map((m) => ({ mediaId: m.id, url: urls.get(m.id) ?? null, alt: m.alt })),
      },
    });
    await tx.project.update({ where: { id: projectId }, data: { updatedAt: new Date() } });
    await emit({ type: "ProjectUpdated", projectId, ownerId: project.ownerId, updateId: u.id }, tx);
    return u;
  });

  const owner = await db.userProfile.findUnique({ where: { userId: project.ownerId }, select: { handle: true } });
  const href = ownerHref(owner?.handle, project.slug);
  let postId: string | null = null;
  if (data.shareToFeed) {
    const body = [data.milestone ? `Meilenstein: ${data.milestone}` : null, data.body].filter(Boolean).join("\n\n").slice(0, 5000);
    const post = await createPost(
      user,
      { body, media: data.media, projectId: project.ownerId === user.id ? projectId : undefined, category: project.category, visibility: project.visibility },
      { projectUpdateId: entry.id },
    );
    postId = post.id;
  }
  if (project.visibility === "PUBLIC") {
    await notifyFollowers(projectId, user.id, { title: project.title, href: `${href}#journal`, excerpt: data.body.slice(0, 120), event: "update" });
  }
  return { id: entry.id, postId, href };
}

export async function deleteProjectUpdate(user: SessionUser, updateId: string) {
  const u = await db.projectUpdate.findUnique({ where: { id: updateId }, select: { authorId: true, project: { select: { ownerId: true } } } });
  if (!u) throw fail.notFound();
  if (u.authorId !== user.id && u.project.ownerId !== user.id && !hasRole(user, "PLATFORM_MODERATOR")) throw fail.forbidden();
  await db.projectUpdate.delete({ where: { id: updateId } });
}

export async function recordProjectView(projectId: string) {
  await db.project.update({ where: { id: projectId }, data: { viewCount: { increment: 1 } } }).catch(() => {});
}

// ───────────────────────── Karten & Listen ─────────────────────────

export const projectCardSelect = {
  id: true,
  slug: true,
  title: true,
  category: true,
  difficulty: true,
  status: true,
  visibility: true,
  coverUrl: true,
  likeCount: true,
  saveCount: true,
  remixCount: true,
  commentCount: true,
  publishedAt: true,
  updatedAt: true,
  completedAt: true,
  owner: { select: { id: true, profile: { select: { handle: true, displayName: true, avatarUrl: true } } } },
  _count: { select: { updates: true, tutorials: { where: { state: "PUBLISHED" } } } },
} satisfies Prisma.ProjectSelect;

type ProjectCardRow = Prisma.ProjectGetPayload<{ select: typeof projectCardSelect }>;

export type ProjectCardData = {
  id: string;
  slug: string;
  href: string;
  title: string;
  category: string;
  difficulty: number;
  status: ProjectStatus;
  visibility: "PUBLIC" | "FOLLOWERS" | "PRIVATE";
  coverUrl: string | null;
  owner: { id: string; handle: string; displayName: string; avatarUrl: string | null };
  counts: { likes: number; saves: number; remixes: number; comments: number; updates: number; tutorials: number };
  publishedAt: string | null;
  updatedAt: string;
  completedAt: string | null;
};

export function toProjectCard(p: ProjectCardRow): ProjectCardData {
  const handle = p.owner.profile?.handle ?? "unbekannt";
  return {
    id: p.id,
    slug: p.slug,
    href: ownerHref(handle, p.slug),
    title: p.title,
    category: p.category,
    difficulty: p.difficulty,
    status: p.status,
    visibility: p.visibility,
    coverUrl: p.coverUrl,
    owner: { id: p.owner.id, handle, displayName: p.owner.profile?.displayName ?? "Unbekannt", avatarUrl: p.owner.profile?.avatarUrl ?? null },
    counts: { likes: p.likeCount, saves: p.saveCount, remixes: p.remixCount, comments: p.commentCount, updates: p._count.updates, tutorials: p._count.tutorials },
    publishedAt: p.publishedAt?.toISOString() ?? null,
    updatedAt: p.updatedAt.toISOString(),
    completedAt: p.completedAt?.toISOString() ?? null,
  };
}

/** Sichtbarkeitsfilter für Projektlisten fremder Betrachter:innen. */
export async function visibleProjectsWhere(viewerId: string | null | undefined): Promise<Prisma.ProjectWhereInput> {
  const rel = await relationsFor(viewerId);
  const hidden = rel.hidden.filter((h) => h.targetType === "PROJECT").map((h) => h.targetId);
  return {
    state: "PUBLISHED",
    owner: { status: { in: ["ACTIVE", "SUSPENDED"] } },
    ...(rel.blocked.length ? { ownerId: { notIn: rel.blocked } } : {}),
    ...(hidden.length ? { id: { notIn: hidden } } : {}),
    AND: [visibleContentWhere(viewerId, rel.following, "ownerId") as Prisma.ProjectWhereInput],
  };
}

export type ProjectSort = "new" | "popular" | "completed" | "updated";
export type ProjectFilters = {
  ownerId?: string;
  category?: string;
  difficulty?: number;
  status?: ProjectStatus;
  hasTutorial?: boolean;
  q?: string;
  sort?: ProjectSort;
};

/**
 * Projektliste mit Filtern und Cursor-Pagination – kartenfertig.
 * Eigene Projekte (ownerId === viewerId) enthalten auch private.
 */
export async function listProjects(filters: ProjectFilters, viewerId: string | null | undefined, opts: { cursor?: string | null; take?: number } = {}) {
  const take = Math.min(opts.take ?? 24, 60);
  const own = !!filters.ownerId && filters.ownerId === viewerId;
  const and: Prisma.ProjectWhereInput[] = [own ? { ownerId: filters.ownerId, state: { not: "REMOVED" } } : await visibleProjectsWhere(viewerId)];
  if (filters.ownerId && !own) and.push({ ownerId: filters.ownerId });
  if (filters.category) and.push({ category: filters.category });
  if (filters.difficulty) and.push({ difficulty: filters.difficulty });
  if (filters.sort === "completed") and.push({ status: "COMPLETED" });
  else if (filters.status) and.push({ status: filters.status });
  else if (!own) and.push({ status: { not: "ARCHIVED" } });
  if (filters.hasTutorial) and.push({ tutorials: { some: { state: "PUBLISHED" } } });
  if (filters.q?.trim()) {
    const q = filters.q.trim().slice(0, 80);
    and.push({ OR: [{ title: { contains: q, mode: "insensitive" } }, { description: { contains: q, mode: "insensitive" } }, { tags: { has: q.toLowerCase() } }] });
  }
  const orderBy: Prisma.ProjectOrderByWithRelationInput[] =
    filters.sort === "popular"
      ? [{ saveCount: "desc" }, { likeCount: "desc" }, { remixCount: "desc" }, { id: "desc" }]
      : filters.sort === "completed"
        ? [{ completedAt: "desc" }, { id: "desc" }]
        : filters.sort === "updated"
          ? [{ updatedAt: "desc" }, { id: "desc" }]
          : [{ publishedAt: "desc" }, { id: "desc" }];
  const rows = await db.project.findMany({
    where: { AND: and },
    select: projectCardSelect,
    orderBy,
    take: take + 1,
    ...(opts.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
  });
  const page = rows.slice(0, take);
  return { items: page.map(toProjectCard), nextCursor: rows.length > take ? page[page.length - 1]!.id : null };
}

/** Karten für eine gegebene ID-Liste (Reihenfolge bleibt erhalten, unsichtbare fallen heraus). */
export async function getProjectCards(ids: string[], viewerId: string | null | undefined) {
  if (!ids.length) return [];
  const rows = await db.project.findMany({ where: { AND: [{ id: { in: ids } }, await visibleProjectsWhere(viewerId)] }, select: projectCardSelect });
  const byId = new Map(rows.map((r) => [r.id, r]));
  return ids.map((id) => byId.get(id)).filter((r): r is ProjectCardRow => !!r).map(toProjectCard);
}

export async function listOwnProjectOptions(userId: string) {
  return db.project.findMany({ where: { ownerId: userId, state: { not: "REMOVED" } }, orderBy: { updatedAt: "desc" }, take: 100, select: { id: true, title: true } });
}

/** Creator Studio: eigene Projekte mit ehrlich beschrifteten Kennzahlen. */
export async function listStudioProjects(userId: string) {
  const rows = await db.project.findMany({
    where: { ownerId: userId, state: { not: "REMOVED" } },
    orderBy: { updatedAt: "desc" },
    take: 200,
    select: {
      id: true, slug: true, title: true, status: true, visibility: true, state: true, category: true, coverUrl: true,
      viewCount: true, likeCount: true, saveCount: true, remixCount: true, commentCount: true, updatedAt: true,
      _count: { select: { updates: true, followers: true } },
    },
  });
  return rows;
}

// ───────────────────────── Projektseite ─────────────────────────

const pageInclude = {
  owner: { select: { id: true, status: true, profile: { select: { handle: true, displayName: true, avatarUrl: true, bio: true, followerCount: true, projectCount: true } } } },
  media: { orderBy: { position: "asc" }, include: { media: { select: { id: true, variants: true, width: true, height: true, kind: true, state: true } } } },
  updates: { orderBy: { happenedAt: "asc" }, include: { author: { select: { id: true, profile: { select: { handle: true, displayName: true, avatarUrl: true } } } }, post: { select: { id: true } } } },
  materials: { orderBy: { position: "asc" }, include: { material: { select: { slug: true, unit: true, safetyInfo: true } } } },
  tools: { orderBy: { position: "asc" }, include: { tool: { select: { slug: true, safetyInfo: true } } } },
  outgoing: { include: { to: { select: { id: true, slug: true, title: true, ownerId: true, visibility: true, state: true, coverUrl: true, category: true, owner: { select: { profile: { select: { handle: true, displayName: true } } } } } } } },
  incoming: {
    where: { kind: "REMIX" },
    orderBy: { createdAt: "desc" },
    take: 24,
    include: { from: { select: { ...projectCardSelect, state: true } } },
  },
  contributors: { include: { user: { select: { profile: { select: { handle: true, displayName: true, avatarUrl: true } } } } } },
  tutorials: { orderBy: { publishedAt: "desc" }, select: { id: true, slug: true, title: true, summary: true, state: true, difficulty: true, minutes: true, coverUrl: true, category: true, publishedAt: true, updatedAt: true, currentVersion: { select: { version: true, _count: { select: { steps: true } } } } } },
  products: {
    where: { status: { in: ["ACTIVE", "SOLD_OUT"] } },
    orderBy: { publishedAt: "desc" },
    take: 12,
    select: { id: true, slug: true, title: true, kind: true, priceMinor: true, currency: true, coverUrl: true, status: true, publishedAt: true, createdAt: true, shop: { select: { slug: true, name: true, status: true } } },
  },
  articles: { include: { article: { select: { id: true, slug: true, title: true, dek: true, coverUrl: true, readingMinutes: true, state: true, publishedAt: true, author: { select: { profile: { select: { handle: true, displayName: true } } } } } } } },
  _count: { select: { followers: true } },
} satisfies Prisma.ProjectInclude;

type JournalMedia = { mediaId: string; url: string | null; alt: string };

export type ProjectPageResult =
  | { kind: "redirect"; to: string }
  | { kind: "ok"; project: Awaited<ReturnType<typeof buildProjectView>> }
  | null;

/**
 * Lädt eine Projektseite inkl. aller Verknüpfungen (Projektfaden) mit Sichtbarkeitsprüfung.
 * Alte Handles werden über HandleRedirect weitergeleitet.
 */
export const getProjectPage = cache(async (handle: string, slug: string, viewerId: string | null): Promise<ProjectPageResult> => {
  const h = decodeURIComponent(handle).toLowerCase();
  const profile = await db.userProfile.findUnique({ where: { handle: h }, select: { userId: true } });
  if (!profile) {
    const r = await db.handleRedirect.findUnique({ where: { oldHandle: h }, select: { profile: { select: { handle: true } } } });
    return r ? { kind: "redirect", to: `/u/${r.profile.handle}/${slug}` } : null;
  }
  const p = await db.project.findUnique({ where: { ownerId_slug: { ownerId: profile.userId, slug: decodeURIComponent(slug) } }, include: pageInclude });
  if (!p) return null;
  const isOwner = viewerId === p.ownerId;
  if (!isOwner && (p.owner.status === "BANNED" || p.owner.status === "DELETED")) return null;
  if (!(await canViewContent(viewerId, { ownerId: p.ownerId, visibility: p.visibility, state: p.state }))) return null;
  return { kind: "ok", project: await buildProjectView(p, viewerId) };
});

async function buildProjectView(p: Prisma.ProjectGetPayload<{ include: typeof pageInclude }>, viewerId: string | null) {
  const isOwner = viewerId === p.ownerId;
  const rel = await relationsFor(viewerId);
  const blocked = new Set(rel.blocked);
  const handle = p.owner.profile?.handle ?? "unbekannt";

  const [viewer, posts, comments] = await Promise.all([
    viewerId
      ? Promise.all([
          db.reaction.findFirst({ where: { userId: viewerId, targetType: "PROJECT", targetId: p.id }, select: { userId: true } }),
          db.bookmark.findFirst({ where: { userId: viewerId, targetType: "PROJECT", targetId: p.id }, select: { userId: true } }),
          db.projectFollow.findUnique({ where: { userId_projectId: { userId: viewerId, projectId: p.id } }, select: { userId: true } }),
          db.follow.findUnique({ where: { followerId_followeeId: { followerId: viewerId, followeeId: p.ownerId } }, select: { followerId: true } }),
        ]).then(([l, s, pf, f]) => ({ liked: !!l, saved: !!s, followingProject: !!pf, followingOwner: !!f }))
      : Promise.resolve({ liked: false, saved: false, followingProject: false, followingOwner: false }),
    db.post.findMany({
      where: { projectId: p.id, state: "PUBLISHED", projectUpdateId: null, ...(isOwner ? {} : { visibility: "PUBLIC" }) },
      orderBy: { publishedAt: "desc" },
      take: 6,
      select: { id: true, body: true, kind: true, publishedAt: true },
    }),
    listComments("PROJECT", p.id, viewerId),
  ]);

  // Original (falls Nachbau)
  const remixRel = p.outgoing.find((r) => r.kind === "REMIX") ?? null;
  let remixOf: { id: string; title: string; href: string; ownerName: string; coverUrl: string | null; category: string; deviations: string } | null = null;
  let remixOfUnavailable = false;
  if (remixRel) {
    const o = remixRel.to;
    if (await canViewContent(viewerId, { ownerId: o.ownerId, visibility: o.visibility, state: o.state })) {
      remixOf = { id: o.id, title: o.title, href: ownerHref(o.owner.profile?.handle, o.slug), ownerName: o.owner.profile?.displayName ?? "", coverUrl: o.coverUrl, category: o.category, deviations: remixRel.deviations };
    } else remixOfUnavailable = true;
  }

  const remixes = p.incoming
    .map((r) => ({ ...r, card: r.from }))
    .filter((r) => r.card.state === "PUBLISHED" && (r.card.visibility === "PUBLIC" || r.card.owner.id === viewerId) && !blocked.has(r.card.owner.id))
    .map((r) => ({ ...toProjectCard(r.card), deviations: r.deviations, remixedAt: r.createdAt.toISOString() }));

  const gallery = p.media
    .filter((m) => m.media.state === "READY" || m.media.state === "PROCESSING")
    .map((m) => ({ id: m.mediaId, alt: m.alt, caption: m.caption, kind: m.media.kind, variants: (m.media.variants ?? {}) as Variants, width: m.media.width, height: m.media.height }));
  const cover = gallery.find((g) => g.id === p.coverMediaId) ?? gallery[0] ?? null;

  const tutorials = p.tutorials
    .filter((t) => t.state === "PUBLISHED" || isOwner)
    .map((t) => ({ id: t.id, slug: t.slug, title: t.title, summary: t.summary, state: t.state, difficulty: t.difficulty, minutes: t.minutes, coverUrl: t.coverUrl, category: t.category, version: t.currentVersion?.version ?? null, steps: t.currentVersion?._count.steps ?? 0, publishedAt: t.publishedAt?.toISOString() ?? null }));

  const products = p.products
    .filter((pr) => pr.shop.status === "ACTIVE")
    .map((pr) => ({ id: pr.id, title: pr.title, kind: pr.kind, priceMinor: pr.priceMinor, currency: pr.currency, coverUrl: pr.coverUrl, soldOut: pr.status === "SOLD_OUT", href: `/markt/${pr.shop.slug}/${pr.slug}`, shopName: pr.shop.name, at: (pr.publishedAt ?? pr.createdAt).toISOString() }));

  const articles = p.articles
    .filter((a) => a.article.state === "PUBLISHED")
    .map((a) => ({ id: a.article.id, title: a.article.title, dek: a.article.dek, coverUrl: a.article.coverUrl, readingMinutes: a.article.readingMinutes, href: `/u/${a.article.author.profile?.handle}/blog/${a.article.slug}`, authorName: a.article.author.profile?.displayName ?? "", at: a.article.publishedAt?.toISOString() ?? null }));

  const journal = p.updates.map((u) => ({
    id: u.id,
    body: u.body,
    milestone: u.milestone,
    problem: u.problem,
    solution: u.solution,
    minutes: u.minutes,
    media: ((u.media ?? []) as JournalMedia[]).filter((m) => m && m.url),
    happenedAt: u.happenedAt.toISOString(),
    postId: u.post?.id ?? null,
    author: { id: u.author.id, handle: u.author.profile?.handle ?? "", displayName: u.author.profile?.displayName ?? "", avatarUrl: u.author.profile?.avatarUrl ?? null },
    canDelete: viewerId === u.authorId || isOwner,
  }));

  return {
    id: p.id,
    slug: p.slug,
    href: ownerHref(handle, p.slug),
    title: p.title,
    description: p.description,
    category: p.category,
    subcategories: p.subcategories,
    tags: p.tags,
    coverUrl: p.coverUrl ?? (cover ? (cover.variants.lg ?? cover.variants.md ?? null) : null),
    cover,
    gallery,
    difficulty: p.difficulty,
    estimatedMinutes: p.estimatedMinutes,
    actualMinutes: p.actualMinutes,
    journalMinutes: p.updates.reduce((a, u) => a + (u.minutes ?? 0), 0),
    budgetMinor: p.budgetMinor,
    currency: (p.currency === "EUR" ? "EUR" : "CHF") as "CHF" | "EUR",
    status: p.status,
    visibility: p.visibility,
    state: p.state,
    publishedAt: (p.publishedAt ?? p.createdAt).toISOString(),
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
    completedAt: p.completedAt?.toISOString() ?? null,
    counts: { views: p.viewCount, likes: p.likeCount, saves: p.saveCount, remixes: p.remixCount, comments: p.commentCount, followers: p._count.followers },
    owner: {
      id: p.ownerId,
      handle,
      displayName: p.owner.profile?.displayName ?? "Unbekannt",
      avatarUrl: p.owner.profile?.avatarUrl ?? null,
      bio: p.owner.profile?.bio ?? "",
      followerCount: p.owner.profile?.followerCount ?? 0,
      projectCount: p.owner.profile?.projectCount ?? 0,
    },
    contributors: p.contributors.map((c) => ({ handle: c.user.profile?.handle ?? "", displayName: c.user.profile?.displayName ?? "", avatarUrl: c.user.profile?.avatarUrl ?? null, role: c.role })),
    materials: p.materials.map((m) => ({ id: m.id, name: m.name, quantity: m.quantity, note: m.note, materialId: m.materialId, materialSlug: m.material?.slug ?? null, unit: m.material?.unit ?? null, safetyInfo: m.material?.safetyInfo || null })),
    tools: p.tools.map((t) => ({ id: t.id, name: t.name, note: t.note, safetyInfo: t.tool?.safetyInfo || null })),
    journal,
    tutorials,
    products,
    articles,
    posts: posts.map((x) => ({ id: x.id, excerpt: x.body.slice(0, 140), kind: x.kind, publishedAt: x.publishedAt.toISOString() })),
    remixOf,
    remixOfUnavailable,
    remixNote: p.remixNote,
    remixes,
    comments,
    viewer: { ...viewer, isOwner },
  };
}

export type ProjectPageView = Awaited<ReturnType<typeof buildProjectView>>;

// ───────────────────────── Editor ─────────────────────────

export async function getProjectForEdit(user: SessionUser, handle: string, slug: string) {
  if (user.profile?.handle !== decodeURIComponent(handle).toLowerCase()) return null;
  const p = await db.project.findUnique({
    where: { ownerId_slug: { ownerId: user.id, slug: decodeURIComponent(slug) } },
    include: {
      media: { orderBy: { position: "asc" }, include: { media: { select: { id: true, variants: true, kind: true, state: true } } } },
      materials: { orderBy: { position: "asc" } },
      tools: { orderBy: { position: "asc" } },
      outgoing: { where: { kind: "REMIX" }, include: { to: { select: { id: true, title: true, slug: true, owner: { select: { profile: { select: { handle: true, displayName: true } } } } } } } },
    },
  });
  if (!p || p.state === "REMOVED") return null;
  const remix = p.outgoing[0];
  return {
    id: p.id,
    slug: p.slug,
    href: ownerHref(user.profile?.handle, p.slug),
    values: {
      title: p.title,
      description: p.description,
      category: p.category,
      tags: p.tags,
      status: p.status,
      visibility: p.visibility,
      difficulty: p.difficulty,
      estimatedMinutes: p.estimatedMinutes,
      actualMinutes: p.actualMinutes,
      budgetMinor: p.budgetMinor,
      coverMediaId: p.coverMediaId,
      media: p.media.map((m) => {
        const v = (m.media.variants ?? {}) as Variants;
        return { id: m.mediaId, alt: m.alt, preview: v.sm ?? v.md ?? v.lg ?? "", kind: m.media.kind };
      }),
      materials: p.materials.map((m) => ({ name: m.name, quantity: m.quantity, note: m.note, materialId: m.materialId ?? undefined })),
      tools: p.tools.map((t) => ({ name: t.name, quantity: "", note: t.note })),
      remixNote: p.remixNote ?? "",
    },
    remixOf: remix ? { id: remix.to.id, title: remix.to.title, href: ownerHref(remix.to.owner.profile?.handle, remix.to.slug), ownerName: remix.to.owner.profile?.displayName ?? "" } : null,
  };
}

export type ProjectEditData = NonNullable<Awaited<ReturnType<typeof getProjectForEdit>>>;

/** Vorlage für einen Nachbau: nur Referenz + (optional übernehmbare) Materialliste – keine Texte oder Dateien. */
export async function getRemixSource(viewerId: string, projectId: string) {
  const o = await db.project.findUnique({
    where: { id: projectId },
    select: {
      id: true, slug: true, title: true, category: true, difficulty: true, ownerId: true, visibility: true, state: true, coverUrl: true,
      owner: { select: { profile: { select: { handle: true, displayName: true } } } },
      materials: { orderBy: { position: "asc" }, select: { name: true, quantity: true, note: true, materialId: true } },
      tools: { orderBy: { position: "asc" }, select: { name: true, note: true } },
    },
  });
  if (!o || !(await canViewContent(viewerId, { ownerId: o.ownerId, visibility: o.visibility, state: o.state }))) return null;
  return {
    id: o.id,
    title: o.title,
    category: o.category,
    difficulty: o.difficulty,
    coverUrl: o.coverUrl,
    href: ownerHref(o.owner.profile?.handle, o.slug),
    ownerName: o.owner.profile?.displayName ?? "",
    materials: o.materials.map((m) => ({ name: m.name, quantity: m.quantity, note: m.note, materialId: m.materialId ?? undefined })),
    tools: o.tools.map((t) => ({ name: t.name, quantity: "", note: t.note })),
  };
}

export type RemixSource = NonNullable<Awaited<ReturnType<typeof getRemixSource>>>;
