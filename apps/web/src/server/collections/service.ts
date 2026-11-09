import "server-only";
import { collectionUpsertSchema } from "@werkraum/shared";
import { cache } from "react";
import { db, type Prisma, type TargetType } from "@/server/db";
import { fail } from "@/server/errors";
import { rateLimit } from "@/server/ratelimit";
import { canViewContent, isBlockedBetween, relationsFor, visibleContentWhere } from "@/server/visibility";
import type { SessionUser } from "@/server/auth/session";
import { hydratePosts, viewableCommunityIds, type PostView } from "@/server/social/posts";
import { getProjectCards, type ProjectCardData } from "@/server/projects/service";
import { getTutorialCards, type TutorialCardData } from "@/server/tutorials/service";
import { slugify } from "@/lib/utils";

/**
 * Gespeichertes & Sammlungen (PRD §10.7). Lesezeichen selbst verwaltet
 * server/social/interactions.setBookmark – hier: Gruppierung, Sammlungen, Hydrierung.
 */

export const SAVED_TYPES = ["POST", "PROJECT", "TUTORIAL", "PRODUCT", "ARTICLE"] as const satisfies readonly TargetType[];
export type SavedType = (typeof SAVED_TYPES)[number];
export const SAVED_LABEL: Record<SavedType, string> = { POST: "Beiträge", PROJECT: "Projekte", TUTORIAL: "Anleitungen", PRODUCT: "Produkte", ARTICLE: "Artikel" };

const PAGE = 48;

export type ProductMini = { id: string; title: string; priceMinor: number; currency: "CHF" | "EUR"; coverUrl: string | null; href: string; shopName: string; soldOut: boolean };
export type ArticleMini = { id: string; title: string; dek: string; coverUrl: string | null; href: string; authorName: string; readingMinutes: number };

export async function getProductMinis(ids: string[], viewerId: string | null = null): Promise<ProductMini[]> {
  if (!ids.length) return [];
  const rel = await relationsFor(viewerId);
  const rows = await db.product.findMany({
    where: {
      id: { in: ids },
      status: { in: ["ACTIVE", "SOLD_OUT"] },
      // Wie Shop-/Produktseiten: keine Shops gesperrter/gelöschter oder blockierter Konten
      shop: { status: "ACTIVE", owner: { status: { in: ["ACTIVE", "SUSPENDED"] } }, ...(rel.blocked.length ? { ownerId: { notIn: rel.blocked } } : {}) },
    },
    select: { id: true, slug: true, title: true, priceMinor: true, currency: true, coverUrl: true, status: true, shop: { select: { slug: true, name: true } } },
  });
  const byId = new Map(rows.map((r) => [r.id, r]));
  return ids.flatMap((id) => {
    const p = byId.get(id);
    return p ? [{ id: p.id, title: p.title, priceMinor: p.priceMinor, currency: (p.currency === "EUR" ? "EUR" : "CHF") as "CHF" | "EUR", coverUrl: p.coverUrl, href: `/markt/${p.shop.slug}/${p.slug}`, shopName: p.shop.name, soldOut: p.status === "SOLD_OUT" }] : [];
  });
}

export async function getArticleMinis(ids: string[], viewerId: string | null): Promise<ArticleMini[]> {
  if (!ids.length) return [];
  const rel = await relationsFor(viewerId);
  const rows = await db.blogArticle.findMany({
    where: { id: { in: ids }, state: "PUBLISHED", author: { status: { in: ["ACTIVE", "SUSPENDED"] } }, ...(rel.blocked.length ? { authorId: { notIn: rel.blocked } } : {}) },
    select: { id: true, slug: true, title: true, dek: true, coverUrl: true, readingMinutes: true, author: { select: { profile: { select: { handle: true, displayName: true } } } } },
  });
  const byId = new Map(rows.map((r) => [r.id, r]));
  return ids.flatMap((id) => {
    const a = byId.get(id);
    return a ? [{ id: a.id, title: a.title, dek: a.dek, coverUrl: a.coverUrl, readingMinutes: a.readingMinutes, href: `/u/${a.author.profile?.handle}/blog/${a.slug}`, authorName: a.author.profile?.displayName ?? "" }] : [];
  });
}

export type SavedItems =
  | { type: "POST"; items: PostView[] }
  | { type: "PROJECT"; items: ProjectCardData[] }
  | { type: "TUTORIAL"; items: TutorialCardData[] }
  | { type: "PRODUCT"; items: ProductMini[] }
  | { type: "ARTICLE"; items: ArticleMini[] };

async function hydrate(type: SavedType, ids: string[], viewerId: string | null): Promise<SavedItems> {
  switch (type) {
    case "POST": {
      if (!ids.length) return { type, items: [] };
      // hydratePosts prüft keine Sichtbarkeit – deshalb vorher filtern. Gleiche Regeln wie canViewContent,
      // aber als eine Abfrage für alle Beiträge (statt zwei Abfragen je Beitrag).
      const rel = await relationsFor(viewerId);
      const rows = await db.post.findMany({
        where: {
          id: { in: ids },
          author: { status: { in: ["ACTIVE", "SUSPENDED"] } },
          state: { not: "REMOVED" },
          OR: [
            ...(viewerId ? [{ authorId: viewerId }] : []),
            { state: "PUBLISHED", ...(rel.blocked.length ? { authorId: { notIn: rel.blocked } } : {}), AND: [visibleContentWhere(viewerId, rel.following) as Prisma.PostWhereInput] },
          ],
        },
        select: { id: true, communityId: true },
      });
      // Beiträge privater Communities nur für Mitglieder – auch in öffentlichen Sammlungen
      const communities = await viewableCommunityIds(rows.flatMap((r) => (r.communityId ? [r.communityId] : [])), viewerId);
      const ok = new Set(rows.filter((r) => !r.communityId || communities.has(r.communityId)).map((r) => r.id));
      return { type, items: await hydratePosts(ids.filter((i) => ok.has(i)), viewerId) };
    }
    case "PROJECT":
      return { type, items: await getProjectCards(ids, viewerId) };
    case "TUTORIAL":
      return { type, items: await getTutorialCards(ids, viewerId) };
    case "PRODUCT":
      return { type, items: await getProductMinis(ids, viewerId) };
    case "ARTICLE":
      return { type, items: await getArticleMinis(ids, viewerId) };
  }
}

/** Alle Lesezeichen gruppiert; Inhalte nur für den aktiven Typ geladen. */
export async function listSaved(user: SessionUser, opts: { type: SavedType; collectionId?: string | null; page?: number }) {
  const page = Math.max(1, Math.min(opts.page ?? 1, 200));
  const colFilter = opts.collectionId === "ohne" ? { collectionId: null } : opts.collectionId ? { collectionId: opts.collectionId } : {};
  if (opts.collectionId && opts.collectionId !== "ohne") {
    const c = await db.collection.findUnique({ where: { id: opts.collectionId }, select: { ownerId: true } });
    if (!c || c.ownerId !== user.id) throw fail.notFound("Sammlung nicht gefunden.");
  }
  const [groups, marks] = await Promise.all([
    db.bookmark.groupBy({ by: ["targetType"], where: { userId: user.id, targetType: { in: [...SAVED_TYPES] }, ...colFilter }, _count: { _all: true } }),
    db.bookmark.findMany({
      where: { userId: user.id, targetType: opts.type, ...colFilter },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE,
      take: PAGE + 1,
      select: { targetId: true, collectionId: true, createdAt: true },
    }),
  ]);
  const counts = Object.fromEntries(SAVED_TYPES.map((t) => [t, groups.find((g) => g.targetType === t)?._count._all ?? 0])) as Record<SavedType, number>;
  const slice = marks.slice(0, PAGE);
  const content = await hydrate(opts.type, slice.map((m) => m.targetId), user.id);
  const meta = Object.fromEntries(slice.map((m) => [m.targetId, { collectionId: m.collectionId, savedAt: m.createdAt.toISOString() }]));
  return { counts, content, meta, hasMore: marks.length > PAGE, page, unavailable: slice.length - content.items.length };
}

// ───────────────────────── Sammlungen ─────────────────────────

export async function listCollections(userId: string) {
  const rows = await db.collection.findMany({
    where: { ownerId: userId },
    orderBy: { updatedAt: "desc" },
    select: { id: true, title: true, slug: true, description: true, visibility: true, updatedAt: true, _count: { select: { items: true } } },
  });
  return rows.map((c) => ({ id: c.id, title: c.title, slug: c.slug, description: c.description, visibility: c.visibility, updatedAt: c.updatedAt.toISOString(), count: c._count.items }));
}
export type CollectionSummary = Awaited<ReturnType<typeof listCollections>>[number];

async function uniqueCollectionSlug(ownerId: string, title: string, excludeId?: string) {
  const root = slugify(title, 50);
  const rows = await db.collection.findMany({ where: { ownerId, slug: { startsWith: root }, ...(excludeId ? { id: { not: excludeId } } : {}) }, select: { slug: true } });
  const taken = new Set(rows.map((r) => r.slug));
  if (!taken.has(root)) return root;
  for (let i = 2; i < 500; i++) if (!taken.has(`${root}-${i}`)) return `${root}-${i}`;
  return `${root}-${Date.now().toString(36)}`;
}

export async function createCollection(user: SessionUser, input: unknown) {
  const data = collectionUpsertSchema.parse(input);
  await rateLimit(`collection:${user.id}`, 60, 3600);
  const count = await db.collection.count({ where: { ownerId: user.id } });
  if (count >= 200) throw fail.invalid("Du hast die maximale Anzahl Sammlungen erreicht.");
  return db.collection.create({
    data: { ownerId: user.id, title: data.title, description: data.description, visibility: data.visibility, slug: await uniqueCollectionSlug(user.id, data.title) },
    select: { id: true, title: true },
  });
}

async function ownedCollection(user: SessionUser, id: string) {
  const c = await db.collection.findUnique({ where: { id }, select: { id: true, ownerId: true, title: true } });
  if (!c || c.ownerId !== user.id) throw fail.notFound("Sammlung nicht gefunden.");
  return c;
}

export async function updateCollection(user: SessionUser, id: string, input: unknown) {
  const data = collectionUpsertSchema.parse(input);
  const c = await ownedCollection(user, id);
  await db.collection.update({
    where: { id },
    data: { title: data.title, description: data.description, visibility: data.visibility, ...(c.title !== data.title ? { slug: await uniqueCollectionSlug(user.id, data.title, id) } : {}) },
  });
}

/** Löscht die Sammlung – die Lesezeichen bleiben unter „Gespeichert“ erhalten. */
export async function deleteCollection(user: SessionUser, id: string) {
  await ownedCollection(user, id);
  await db.collection.delete({ where: { id } });
}

/**
 * Öffentliche bzw. eigene Sammlungsseite. Inhalte werden aus Sicht der Betrachtenden gefiltert.
 * Mit `cache()`: generateMetadata und die Seite teilen sich das Ergebnis innerhalb einer Anfrage.
 */
export const getCollectionPage = cache(async (id: string, viewerId: string | null) => {
  const c = await db.collection.findUnique({
    where: { id },
    include: { owner: { select: { id: true, status: true, profile: { select: { handle: true, displayName: true, avatarUrl: true } } } } },
  });
  if (!c) return null;
  const isOwner = viewerId === c.ownerId;
  if (!isOwner && (c.owner.status === "BANNED" || c.owner.status === "DELETED")) return null;
  if (!(await canViewContent(viewerId, { ownerId: c.ownerId, visibility: c.visibility, state: "PUBLISHED" }))) return null;
  const marks = await db.bookmark.findMany({ where: { collectionId: id, userId: c.ownerId }, orderBy: { createdAt: "desc" }, take: 300, select: { targetType: true, targetId: true } });
  const sections = await Promise.all(
    SAVED_TYPES.map((t) => hydrate(t, marks.filter((m) => m.targetType === t).map((m) => m.targetId), viewerId)),
  );
  return {
    id: c.id,
    title: c.title,
    description: c.description,
    visibility: c.visibility,
    updatedAt: c.updatedAt.toISOString(),
    owner: { id: c.ownerId, handle: c.owner.profile?.handle ?? "", displayName: c.owner.profile?.displayName ?? "", avatarUrl: c.owner.profile?.avatarUrl ?? null },
    isOwner,
    total: sections.reduce((a, s) => a + s.items.length, 0),
    sections: sections.filter((s) => s.items.length > 0),
  };
});

/** Öffentliche Sammlungen eines Profils (für Profilseiten). */
export async function listPublicCollections(ownerId: string, viewerId: string | null) {
  const own = viewerId === ownerId;
  if (!own) {
    // Gesperrte/gelöschte Konten und Blockierungen (beide Richtungen): keine Sammlungen zeigen
    const owner = await db.user.findUnique({ where: { id: ownerId }, select: { status: true } });
    if (!owner || owner.status === "BANNED" || owner.status === "DELETED") return [];
    if (viewerId && (await isBlockedBetween(viewerId, ownerId))) return [];
  }
  const following = viewerId && !own ? !!(await db.follow.findUnique({ where: { followerId_followeeId: { followerId: viewerId, followeeId: ownerId } } })) : false;
  const rows = await db.collection.findMany({
    where: { ownerId, visibility: own ? undefined : { in: following ? ["PUBLIC", "FOLLOWERS"] : ["PUBLIC"] } },
    orderBy: { updatedAt: "desc" },
    select: { id: true, title: true, description: true, visibility: true, _count: { select: { items: true } } },
  });
  return rows.map((r) => ({ id: r.id, title: r.title, description: r.description, visibility: r.visibility, count: r._count.items, href: `/sammlungen/${r.id}` }));
}
