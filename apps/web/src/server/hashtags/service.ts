import "server-only";
import { isValidHashtag, normalizeHashtag } from "@werkraum/shared";
import { db, Prisma, type TargetType } from "@/server/db";
import { relationsFor } from "@/server/visibility";
import { flagEnabled } from "@/server/flags";
import { targetMeta } from "@/server/social/targets";
import { baseFeedWhere, hydratePosts, type PostView } from "@/server/social/posts";
import { getProjectCards, visibleProjectsWhere, type ProjectCardData } from "@/server/projects/service";
import { getTutorialCards, visibleTutorialsWhere, type TutorialCardData } from "@/server/tutorials/service";
import { listArticles, publicArticleWhere, type ArticleCardData } from "@/server/blog/service";
import { listProducts, productListWhere, type ProductCardData } from "@/server/commerce/products";

/**
 * Hashtag-Seite: alle sichtbaren Inhalte mit einem Hashtag, nach Art getrennt.
 * Sichtbarkeit wird je Inhalt mit denselben Regeln wie in Feed und Listen geprüft
 * (Status, Privatsphäre, Blockierungen, ausgeblendete Inhalte).
 */
export type HashtagKind = "post" | "project" | "tutorial" | "article" | "product" | "comment";
export const HASHTAG_KINDS: HashtagKind[] = ["post", "project", "tutorial", "article", "product", "comment"];

/** URL-Parameter `typ` ↔ Art */
export const HASHTAG_KIND_SLUG: Record<HashtagKind, string> = {
  post: "beitraege",
  project: "projekte",
  tutorial: "anleitungen",
  article: "artikel",
  product: "produkte",
  comment: "kommentare",
};
export const HASHTAG_KIND_LABEL: Record<HashtagKind, string> = {
  post: "Beiträge",
  project: "Projekte",
  tutorial: "Anleitungen",
  article: "Artikel",
  product: "Produkte",
  comment: "Kommentare",
};
export function hashtagKindFromSlug(slug: string | null | undefined): HashtagKind | null {
  return HASHTAG_KINDS.find((k) => HASHTAG_KIND_SLUG[k] === slug || k === slug) ?? null;
}

const TARGET: Record<HashtagKind, TargetType> = { post: "POST", project: "PROJECT", tutorial: "TUTORIAL", article: "ARTICLE", product: "PRODUCT", comment: "COMMENT" };
/** Kandidaten je Art: die jüngsten Verwendungen (Sichtbarkeit filtert danach) */
const CANDIDATES = 5000;
const PAGE: Record<HashtagKind, number> = { post: 12, project: 24, tutorial: 24, article: 12, product: 24, comment: 20 };
const PREVIEW: Record<HashtagKind, number> = { post: 4, project: 6, tutorial: 6, article: 3, product: 6, comment: 3 };

export type HashtagComment = {
  id: string;
  body: string;
  createdAt: Date;
  author: { handle: string; displayName: string; avatarUrl: string | null };
  target: { label: string; title: string; href: string };
};

export type HashtagPage = {
  tag: { name: string; display: string };
  exists: boolean;
  counts: Record<HashtagKind, number>;
  total: number;
  /** gewählte Art; null = Übersicht mit wenigen Treffern je Art */
  kind: HashtagKind | null;
  posts: PostView[];
  projects: ProjectCardData[];
  tutorials: TutorialCardData[];
  articles: ArticleCardData[];
  products: ProductCardData[];
  comments: HashtagComment[];
  nextCursor: string | null;
  related: HashtagSummary[];
};

export type HashtagSummary = { name: string; display: string; count: number };

/** Hashtag aus dem URL-Segment (kodiert, beliebige Schreibweise, mit oder ohne #). */
export function parseHashtagParam(raw: string) {
  let s = raw;
  try {
    s = decodeURIComponent(raw);
  } catch {
    /* bereits dekodiert */
  }
  const name = normalizeHashtag(s.trim());
  return isValidHashtag(name) ? name : null;
}

async function candidateIds(hashtagId: string, kind: HashtagKind) {
  const rows = await db.hashtagUse.findMany({ where: { hashtagId, targetType: TARGET[kind] }, orderBy: { createdAt: "desc" }, take: CANDIDATES, select: { targetId: true } });
  return rows.map((r) => r.targetId);
}

/* ───────────── Sichtbarkeit je Art (Prisma-Filter, gleiche Regeln wie Feed und Listen) ───────────── */

async function postWhere(ids: string[], viewerId: string | null): Promise<Prisma.PostWhereInput> {
  return {
    AND: [
      { id: { in: ids } },
      await baseFeedWhere(viewerId),
      // Community-Beiträge nur aus öffentlichen Communities (wie in der Suche)
      { OR: [{ communityId: null }, { community: { visibility: "PUBLIC", state: "PUBLISHED" } }] },
    ],
  };
}
async function projectWhere(ids: string[], viewerId: string | null): Promise<Prisma.ProjectWhereInput> {
  return { AND: [{ id: { in: ids } }, await visibleProjectsWhere(viewerId)] };
}
async function tutorialWhere(ids: string[], viewerId: string | null): Promise<Prisma.TutorialWhereInput> {
  return { AND: [{ id: { in: ids } }, await visibleTutorialsWhere(viewerId)] };
}
async function commentWhere(ids: string[], viewerId: string | null): Promise<Prisma.CommentWhereInput> {
  const rel = await relationsFor(viewerId);
  return {
    id: { in: ids },
    state: "PUBLISHED",
    targetType: { in: ["POST", "PROJECT", "TUTORIAL", "ARTICLE", "PRODUCT"] },
    author: { status: { in: ["ACTIVE", "SUSPENDED"] } },
    ...(rel.blocked.length ? { authorId: { notIn: rel.blocked } } : {}),
  };
}

/** Zieht die IDs heraus, die für die Person sichtbar sind (für Kommentarziele). */
async function visibleTargets(type: TargetType, ids: string[], viewerId: string | null) {
  if (!ids.length) return new Set<string>();
  const pick = (rows: { id: string }[]) => new Set(rows.map((r) => r.id));
  switch (type) {
    case "POST":
      return pick(await db.post.findMany({ where: await postWhere(ids, viewerId), select: { id: true } }));
    case "PROJECT":
      return pick(await db.project.findMany({ where: await projectWhere(ids, viewerId), select: { id: true } }));
    case "TUTORIAL":
      return pick(await db.tutorial.findMany({ where: await tutorialWhere(ids, viewerId), select: { id: true } }));
    case "ARTICLE":
      return pick(await db.blogArticle.findMany({ where: await publicArticleWhere({ ids, viewerId }), select: { id: true } }));
    case "PRODUCT": {
      if (!(await flagEnabled("marketplace", viewerId))) return new Set<string>();
      const w = await productListWhere({ ids }, viewerId);
      return w ? pick(await db.product.findMany({ where: w, select: { id: true } })) : new Set<string>();
    }
    default:
      return new Set<string>();
  }
}

const TARGET_LABEL: Partial<Record<TargetType, string>> = { POST: "Beitrag", PROJECT: "Projekt", TUTORIAL: "Anleitung", ARTICLE: "Artikel", PRODUCT: "Produkt" };

/* ───────────────────────── Zählen und Laden ───────────────────────── */

async function countKind(kind: HashtagKind, ids: string[], viewerId: string | null, market: boolean) {
  if (!ids.length) return 0;
  switch (kind) {
    case "post":
      return db.post.count({ where: await postWhere(ids, viewerId) });
    case "project":
      return db.project.count({ where: await projectWhere(ids, viewerId) });
    case "tutorial":
      return db.tutorial.count({ where: await tutorialWhere(ids, viewerId) });
    case "article":
      return db.blogArticle.count({ where: await publicArticleWhere({ ids, viewerId }) });
    case "product": {
      if (!market) return 0;
      const w = await productListWhere({ ids }, viewerId);
      return w ? db.product.count({ where: w }) : 0;
    }
    case "comment":
      // Kommentare zählen nur, wenn ihr Inhalt sichtbar ist → wie beim Laden prüfen (höchstens die jüngsten 500)
      return (await loadComments(ids.slice(0, 500), viewerId, 0, 500)).items.length;
  }
}

async function loadComments(ids: string[], viewerId: string | null, offset: number, take: number) {
  if (!ids.length) return { items: [] as HashtagComment[], nextCursor: null };
  const rows = await db.comment.findMany({
    where: await commentWhere(ids, viewerId),
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: { id: true, body: true, createdAt: true, targetType: true, targetId: true, author: { select: { profile: { select: { handle: true, displayName: true, avatarUrl: true } } } } },
  });
  // Ziel muss sichtbar sein (öffentlicher Beitrag, veröffentlichtes Projekt, …)
  const byType = new Map<TargetType, string[]>();
  for (const r of rows) byType.set(r.targetType, [...(byType.get(r.targetType) ?? []), r.targetId]);
  const visible = new Map<TargetType, Set<string>>();
  await Promise.all([...byType].map(async ([t, list]) => visible.set(t, await visibleTargets(t, [...new Set(list)], viewerId))));
  const ok = rows.filter((r) => r.author.profile && visible.get(r.targetType)?.has(r.targetId));
  const page = ok.slice(offset, offset + take);
  const items: HashtagComment[] = [];
  for (const r of page) {
    const meta = await targetMeta(r.targetType, r.targetId);
    if (!meta) continue;
    const p = r.author.profile!;
    items.push({
      id: r.id,
      body: r.body,
      createdAt: r.createdAt,
      author: { handle: p.handle, displayName: p.displayName, avatarUrl: p.avatarUrl },
      target: { label: TARGET_LABEL[r.targetType] ?? "Inhalt", title: meta.title, href: meta.href },
    });
  }
  return { items, nextCursor: ok.length > offset + take ? String(offset + take) : null };
}

type Loaded = { items: unknown[]; nextCursor: string | null };

async function loadKind(kind: HashtagKind, ids: string[], viewerId: string | null, cursor: string | null, take: number, market: boolean): Promise<Loaded> {
  if (!ids.length) return { items: [], nextCursor: null };
  const page = <T extends { id: string }>(rows: T[]) => ({ rows: rows.slice(0, take), next: rows.length > take ? rows[take - 1]!.id : null });
  switch (kind) {
    case "post": {
      const rows = await db.post.findMany({
        where: await postWhere(ids, viewerId),
        orderBy: [{ publishedAt: "desc" }, { id: "desc" }],
        take: take + 1,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        select: { id: true },
      });
      const p = page(rows);
      return { items: await hydratePosts(p.rows.map((r) => r.id), viewerId), nextCursor: p.next };
    }
    case "project": {
      const rows = await db.project.findMany({
        where: await projectWhere(ids, viewerId),
        orderBy: [{ publishedAt: { sort: "desc", nulls: "last" } }, { id: "desc" }],
        take: take + 1,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        select: { id: true },
      });
      const p = page(rows);
      return { items: await getProjectCards(p.rows.map((r) => r.id), viewerId), nextCursor: p.next };
    }
    case "tutorial": {
      const rows = await db.tutorial.findMany({
        where: await tutorialWhere(ids, viewerId),
        orderBy: [{ publishedAt: { sort: "desc", nulls: "last" } }, { id: "desc" }],
        take: take + 1,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        select: { id: true },
      });
      const p = page(rows);
      return { items: await getTutorialCards(p.rows.map((r) => r.id), viewerId), nextCursor: p.next };
    }
    case "article":
      return listArticles({ ids, viewerId, take }, cursor);
    case "product":
      return market ? listProducts({ ids }, cursor, { take, viewerId }) : { items: [], nextCursor: null };
    case "comment":
      return loadComments(ids, viewerId, Number(cursor) || 0, take);
  }
}

/** Hashtags, die oft zusammen mit diesem verwendet werden. */
export async function relatedHashtags(hashtagId: string, limit = 10): Promise<HashtagSummary[]> {
  const rows = await db.$queryRaw<{ name: string; display: string; n: bigint }[]>`
    SELECT h.name, h.display, COUNT(*) AS n
    FROM "HashtagUse" a
    JOIN "HashtagUse" b ON b."targetType" = a."targetType" AND b."targetId" = a."targetId" AND b."hashtagId" <> a."hashtagId"
    JOIN "Hashtag" h ON h.id = b."hashtagId"
    WHERE a."hashtagId" = ${hashtagId}
    GROUP BY h.id
    ORDER BY n DESC, h.name ASC
    LIMIT ${limit}`;
  return rows.map((r) => ({ name: r.name, display: r.display, count: Number(r.n) }));
}

export async function getHashtagPage(raw: string, opts: { kind?: HashtagKind | null; viewerId?: string | null; cursor?: string | null } = {}): Promise<HashtagPage | null> {
  const name = parseHashtagParam(raw);
  if (!name) return null;
  const viewerId = opts.viewerId ?? null;
  const kind = opts.kind ?? null;
  const tag = await db.hashtag.findUnique({ where: { name }, select: { id: true, name: true, display: true } });
  const empty: HashtagPage = {
    tag: { name, display: tag?.display ?? name },
    exists: !!tag,
    counts: { post: 0, project: 0, tutorial: 0, article: 0, product: 0, comment: 0 },
    total: 0,
    kind,
    posts: [],
    projects: [],
    tutorials: [],
    articles: [],
    products: [],
    comments: [],
    nextCursor: null,
    related: [],
  };
  if (!tag) return empty;

  const market = await flagEnabled("marketplace", viewerId);
  const ids = Object.fromEntries(await Promise.all(HASHTAG_KINDS.map(async (k) => [k, await candidateIds(tag.id, k)] as const))) as Record<HashtagKind, string[]>;
  const [counts, related] = await Promise.all([
    Promise.all(HASHTAG_KINDS.map(async (k) => [k, await countKind(k, ids[k], viewerId, market)] as const)).then((e) => Object.fromEntries(e) as Record<HashtagKind, number>),
    relatedHashtags(tag.id),
  ]);
  const out: HashtagPage = { ...empty, counts, total: HASHTAG_KINDS.reduce((n, k) => n + counts[k], 0), related };

  const kinds = kind ? [kind] : HASHTAG_KINDS.filter((k) => counts[k] > 0);
  const loaded = await Promise.all(kinds.map(async (k) => [k, await loadKind(k, ids[k], viewerId, kind ? (opts.cursor ?? null) : null, kind ? PAGE[k] : PREVIEW[k], market)] as const));
  for (const [k, r] of loaded) {
    if (k === "post") out.posts = r.items as PostView[];
    if (k === "project") out.projects = r.items as ProjectCardData[];
    if (k === "tutorial") out.tutorials = r.items as TutorialCardData[];
    if (k === "article") out.articles = r.items as ArticleCardData[];
    if (k === "product") out.products = r.items as ProductCardData[];
    if (k === "comment") out.comments = r.items as HashtagComment[];
    if (kind) out.nextCursor = r.nextCursor;
  }
  return out;
}

/** Vorschläge beim Tippen: passende Hashtags nach Häufigkeit; ohne Eingabe die meistgenutzten der letzten 30 Tage. */
export async function suggestHashtags(q: string, limit = 8): Promise<HashtagSummary[]> {
  const prefix = normalizeHashtag(q.trim()).replace(/[^\p{L}\p{M}\p{N}_]/gu, "").slice(0, 50);
  if (!prefix) return trendingHashtags(limit);
  const rows = await db.$queryRaw<{ name: string; display: string; n: bigint }[]>`
    SELECT h.name, h.display, COUNT(u."targetId") AS n
    FROM "Hashtag" h JOIN "HashtagUse" u ON u."hashtagId" = h.id
    WHERE h.name LIKE ${prefix.replace(/[\\%_]/g, "\\$&") + "%"}
    GROUP BY h.id
    ORDER BY (h.name = ${prefix}) DESC, n DESC, h.name ASC
    LIMIT ${Math.min(Math.max(limit, 1), 20)}`;
  return rows.map((r) => ({ name: r.name, display: r.display, count: Number(r.n) }));
}

/** Meistgenutzte Hashtags der letzten Tage (öffentliche Beiträge, Projekte, Anleitungen, Artikel). */
export async function trendingHashtags(limit = 12, days = 30): Promise<HashtagSummary[]> {
  const since = new Date(Date.now() - days * 86400_000);
  const rows = await db.$queryRaw<{ name: string; display: string; n: bigint }[]>`
    SELECT h.name, h.display, COUNT(*) AS n
    FROM "HashtagUse" u JOIN "Hashtag" h ON h.id = u."hashtagId"
    WHERE u."createdAt" >= ${since} AND u."targetType" IN ('POST', 'PROJECT', 'TUTORIAL', 'ARTICLE')
    GROUP BY h.id
    ORDER BY n DESC, h.name ASC
    LIMIT ${Math.min(Math.max(limit, 1), 30)}`;
  return rows.map((r) => ({ name: r.name, display: r.display, count: Number(r.n) }));
}

/** Nächste Seite einer Art (für „Mehr laden“). */
export async function loadHashtagItems(raw: string, kind: HashtagKind, viewerId: string | null, cursor: string | null) {
  const name = parseHashtagParam(raw);
  const tag = name ? await db.hashtag.findUnique({ where: { name }, select: { id: true } }) : null;
  if (!tag) return { items: [] as unknown[], nextCursor: null };
  const market = await flagEnabled("marketplace", viewerId);
  return loadKind(kind, await candidateIds(tag.id, kind), viewerId, cursor, PAGE[kind], market);
}
