import "server-only";
import { db, Prisma } from "@/server/db";
import { relationsFor } from "@/server/visibility";
import { rateLimit } from "@/server/ratelimit";
import { clientIpHash } from "@/server/auth/session";
import { publicProductSql } from "@/server/commerce/restock";

/**
 * Globale Suche (PRD §18) auf Postgres: Volltext (deutsch, unaccent) + Trigramm-Ähnlichkeit
 * für Tippfehlertoleranz. Gesperrte/entfernte Inhalte und blockierte Profile sind ausgeschlossen.
 */
export type SearchType = "project" | "tutorial" | "product" | "user" | "post" | "article" | "community";
export const SEARCH_TYPES: SearchType[] = ["project", "tutorial", "product", "user", "article", "community", "post"];

export type SearchFilters = {
  q: string;
  types?: SearchType[];
  category?: string;
  difficulty?: number;
  maxMinutes?: number;
  priceMin?: number;
  priceMax?: number;
  free?: boolean;
  country?: string;
  sinceDays?: number;
  limit?: number;
};

export type SearchHit = { type: SearchType; id: string; title: string; subtitle?: string; href: string; cover?: string | null; category?: string | null; score: number; meta?: Record<string, unknown> };

function tsQuery(q: string) {
  // websearch_to_tsquery erlaubt "Phrasen", -ausschliessen, OR
  return Prisma.sql`websearch_to_tsquery('german', wr_unaccent(${q}))`;
}

export async function search(f: SearchFilters, viewerId: string | null): Promise<Record<SearchType, SearchHit[]>> {
  // Volltext- und Ähnlichkeitssuche über viele Tabellen ist teuer → je Person bzw. IP begrenzen
  await rateLimit(`search:${viewerId ?? (await clientIpHash().catch(() => "anon"))}`, 120, 60);
  const q = f.q.trim().slice(0, 120);
  const types = f.types?.length ? f.types : SEARCH_TYPES;
  const limit = Math.min(f.limit ?? 8, 40);
  const empty = Object.fromEntries(SEARCH_TYPES.map((t) => [t, []])) as unknown as Record<SearchType, SearchHit[]>;
  if (q.length < 2) return empty;
  const rel = await relationsFor(viewerId);
  const blocked = rel.blocked.length ? rel.blocked : ["__none__"];
  const like = `%${q.replace(/[%_]/g, "")}%`;
  const since = f.sinceDays ? new Date(Date.now() - f.sinceDays * 86400_000) : new Date(0);
  const tasks: Promise<void>[] = [];

  if (types.includes("project")) {
    tasks.push(
      db
        .$queryRaw<{ id: string; title: string; slug: string; category: string; coverUrl: string | null; handle: string; difficulty: number; status: string; score: number }[]>`
        SELECT p.id, p.title, p.slug, p.category, p."coverUrl", up.handle, p.difficulty, p.status::text AS status,
          (ts_rank(p.search, ${tsQuery(q)}) * 2 + similarity(p.title, ${q}) + p."qualityScore" * 0.1)::float AS score
        FROM "Project" p JOIN "UserProfile" up ON up."userId" = p."ownerId" JOIN "User" au ON au.id = p."ownerId" AND au.status = 'ACTIVE'
        WHERE p.state = 'PUBLISHED' AND p.visibility = 'PUBLIC' AND p."ownerId" NOT IN (${Prisma.join(blocked)})
          AND (p.search @@ ${tsQuery(q)} OR p.title % ${q} OR p.title ILIKE ${like})
          ${f.category ? Prisma.sql`AND p.category = ${f.category}` : Prisma.empty}
          ${f.difficulty ? Prisma.sql`AND p.difficulty <= ${f.difficulty}` : Prisma.empty}
          ${f.maxMinutes ? Prisma.sql`AND (p."estimatedMinutes" IS NULL OR p."estimatedMinutes" <= ${f.maxMinutes})` : Prisma.empty}
          AND p."updatedAt" >= ${since}
        ORDER BY score DESC LIMIT ${limit}`
        .then((rows) => {
          empty.project = rows.map((r) => ({ type: "project", id: r.id, title: r.title, subtitle: `Projekt von @${r.handle}`, href: `/u/${r.handle}/${r.slug}`, cover: r.coverUrl, category: r.category, score: r.score, meta: { difficulty: r.difficulty, status: r.status } }));
        }),
    );
  }
  if (types.includes("tutorial")) {
    tasks.push(
      db
        .$queryRaw<{ id: string; title: string; slug: string; category: string; coverUrl: string | null; minutes: number | null; difficulty: number; handle: string; isPaid: boolean; score: number }[]>`
        SELECT t.id, t.title, t.slug, t.category, t."coverUrl", t.minutes, t.difficulty, up.handle, t."isPaid",
          (ts_rank(t.search, ${tsQuery(q)}) * 2 + similarity(t.title, ${q}))::float AS score
        FROM "Tutorial" t JOIN "UserProfile" up ON up."userId" = t."authorId" JOIN "User" au ON au.id = t."authorId" AND au.status = 'ACTIVE'
        WHERE t.state = 'PUBLISHED' AND t."authorId" NOT IN (${Prisma.join(blocked)})
          AND (t.search @@ ${tsQuery(q)} OR t.title % ${q} OR t.title ILIKE ${like})
          ${f.category ? Prisma.sql`AND t.category = ${f.category}` : Prisma.empty}
          ${f.difficulty ? Prisma.sql`AND t.difficulty <= ${f.difficulty}` : Prisma.empty}
          ${f.maxMinutes ? Prisma.sql`AND (t.minutes IS NULL OR t.minutes <= ${f.maxMinutes})` : Prisma.empty}
          ${f.free ? Prisma.sql`AND t."isPaid" = false` : Prisma.empty}
        ORDER BY score DESC LIMIT ${limit}`
        .then((rows) => {
          empty.tutorial = rows.map((r) => ({ type: "tutorial", id: r.id, title: r.title, subtitle: `Anleitung von @${r.handle}${r.minutes ? ` · ${r.minutes} Min.` : ""}`, href: `/anleitungen/${r.slug}`, cover: r.coverUrl, category: r.category, score: r.score, meta: { difficulty: r.difficulty, minutes: r.minutes, isPaid: r.isPaid } }));
        }),
    );
  }
  if (types.includes("product")) {
    tasks.push(
      db
        .$queryRaw<{ id: string; title: string; slug: string; shopSlug: string; shopName: string; category: string; coverUrl: string | null; priceMinor: number; currency: string; score: number }[]>`
        SELECT pr.id, pr.title, pr.slug, s.slug AS "shopSlug", s.name AS "shopName", pr.category, pr."coverUrl", pr."priceMinor", pr.currency,
          (ts_rank(pr.search, ${tsQuery(q)}) * 2 + similarity(pr.title, ${q}))::float AS score
        FROM "Product" pr JOIN "Shop" s ON s.id = pr."shopId"
        WHERE ${publicProductSql("pr")} AND s.status = 'ACTIVE' AND s."ownerId" NOT IN (${Prisma.join(blocked)})
          AND (pr.search @@ ${tsQuery(q)} OR pr.title % ${q} OR pr.title ILIKE ${like})
          ${f.category ? Prisma.sql`AND pr.category = ${f.category}` : Prisma.empty}
          ${f.priceMin != null ? Prisma.sql`AND pr."priceMinor" >= ${f.priceMin}` : Prisma.empty}
          ${f.priceMax != null ? Prisma.sql`AND pr."priceMinor" <= ${f.priceMax}` : Prisma.empty}
          ${f.country ? Prisma.sql`AND pr."shipsFrom" = ${f.country}` : Prisma.empty}
        ORDER BY score DESC LIMIT ${limit}`
        .then((rows) => {
          empty.product = rows.map((r) => ({ type: "product", id: r.id, title: r.title, subtitle: r.shopName, href: `/markt/${r.shopSlug}/${r.slug}`, cover: r.coverUrl, category: r.category, score: r.score, meta: { priceMinor: r.priceMinor, currency: r.currency } }));
        }),
    );
  }
  if (types.includes("user")) {
    tasks.push(
      db
        .$queryRaw<{ userId: string; handle: string; displayName: string; avatarUrl: string | null; bio: string; followerCount: number; score: number }[]>`
        SELECT up."userId", up.handle, up."displayName", up."avatarUrl", up.bio, up."followerCount",
          GREATEST(similarity(up.handle, ${q}), similarity(up."displayName", ${q}))::float AS score
        FROM "UserProfile" up JOIN "User" u ON u.id = up."userId"
        WHERE u.status = 'ACTIVE' AND up."userId" NOT IN (${Prisma.join(blocked)})
          AND (up.handle % ${q} OR up."displayName" % ${q} OR up.handle ILIKE ${like} OR up."displayName" ILIKE ${like})
        ORDER BY score DESC, up."followerCount" DESC LIMIT ${limit}`
        .then((rows) => {
          empty.user = rows.map((r) => ({ type: "user", id: r.userId, title: r.displayName, subtitle: `@${r.handle}`, href: `/u/${r.handle}`, cover: r.avatarUrl, score: r.score, meta: { bio: r.bio, followers: r.followerCount } }));
        }),
    );
  }
  if (types.includes("article")) {
    tasks.push(
      db
        .$queryRaw<{ id: string; title: string; slug: string; dek: string; handle: string; coverUrl: string | null; score: number }[]>`
        SELECT a.id, a.title, a.slug, a.dek, up.handle, a."coverUrl", ts_rank(a.search, ${tsQuery(q)})::float AS score
        FROM "BlogArticle" a JOIN "UserProfile" up ON up."userId" = a."authorId" JOIN "User" au ON au.id = a."authorId" AND au.status = 'ACTIVE'
        WHERE a.state = 'PUBLISHED' AND a."authorId" NOT IN (${Prisma.join(blocked)})
          AND (a.search @@ ${tsQuery(q)} OR a.title ILIKE ${like})
        ORDER BY score DESC LIMIT ${limit}`
        .then((rows) => {
          empty.article = rows.map((r) => ({ type: "article", id: r.id, title: r.title, subtitle: `Artikel von @${r.handle}`, href: `/u/${r.handle}/blog/${r.slug}`, cover: r.coverUrl, score: r.score, meta: { dek: r.dek } }));
        }),
    );
  }
  if (types.includes("community")) {
    tasks.push(
      db
        .$queryRaw<{ id: string; slug: string; name: string; memberCount: number; category: string; score: number }[]>`
        SELECT c.id, c.slug, c.name, c."memberCount", c.category, ts_rank(c.search, ${tsQuery(q)})::float AS score
        FROM "Community" c
        WHERE c.state = 'PUBLISHED' AND c.visibility <> 'PRIVATE' AND (c.search @@ ${tsQuery(q)} OR c.name ILIKE ${like})
          ${f.category ? Prisma.sql`AND c.category = ${f.category}` : Prisma.empty}
        ORDER BY score DESC, c."memberCount" DESC LIMIT ${limit}`
        .then((rows) => {
          empty.community = rows.map((r) => ({ type: "community", id: r.id, title: r.name, subtitle: `${r.memberCount} Mitglieder`, href: `/c/${r.slug}`, category: r.category, score: r.score }));
        }),
    );
  }
  if (types.includes("post")) {
    tasks.push(
      db
        .$queryRaw<{ id: string; body: string; handle: string; score: number }[]>`
        SELECT p.id, p.body, up.handle, ts_rank(p.search, ${tsQuery(q)})::float AS score
        FROM "Post" p JOIN "UserProfile" up ON up."userId" = p."authorId" JOIN "User" au ON au.id = p."authorId" AND au.status = 'ACTIVE'
        WHERE p.state = 'PUBLISHED' AND p.visibility = 'PUBLIC' AND p."communityId" IS NULL AND p."authorId" NOT IN (${Prisma.join(blocked)})
          AND p.search @@ ${tsQuery(q)} AND p."publishedAt" >= ${since}
        ORDER BY score DESC, p."publishedAt" DESC LIMIT ${limit}`
        .then((rows) => {
          empty.post = rows.map((r) => ({ type: "post", id: r.id, title: r.body.slice(0, 90) || "Beitrag", subtitle: `@${r.handle}`, href: `/beitrag/${r.id}`, score: r.score }));
        }),
    );
  }
  await Promise.all(tasks);
  return empty;
}

/** Flache Liste für die Befehlspalette: die besten Treffer je Typ. */
export async function quickSearch(q: string, viewerId: string | null, perType = 3) {
  const r = await search({ q, limit: perType, types: ["project", "tutorial", "user", "product", "community", "article"] }, viewerId);
  return SEARCH_TYPES.flatMap((t) => r[t].map((h) => ({ type: h.type, id: h.id, title: h.title, subtitle: h.subtitle, href: h.href })));
}
