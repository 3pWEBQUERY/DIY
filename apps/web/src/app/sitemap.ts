import type { MetadataRoute } from "next";
import { listCategories } from "@werkraum/shared";
import { db } from "@/server/db";
import { LEGAL_FINAL, LEGAL_PAGES } from "@/config/legal";
import { SITEMAP_IDS, type SitemapId } from "@/config/sitemap";

export const dynamic = "force-dynamic";

/**
 * Sitemaps öffentlicher, indexierbarer Inhalte (§14.5) – aufgeteilt nach Bereich, damit keine Datei das
 * Limit von 50'000 URLs überschreitet (Google weist sonst die ganze Sitemap zurück). Je Teil höchstens
 * PART_LIMIT URLs; die Teile stehen in robots.txt (`/sitemap/<id>.xml`).
 */
const PART_LIMIT = 45_000;

export async function generateSitemaps() {
  return SITEMAP_IDS.map((id) => ({ id }));
}

// Höchstens einmal pro Stunde neu berechnen – Crawler rufen Sitemaps oft ab (Datenbank-Pool schonen)
const cache = new Map<string, { at: number; data: MetadataRoute.Sitemap }>();

export default async function sitemap({ id }: { id: Promise<string> }): Promise<MetadataRoute.Sitemap> {
  const part = (await id) as SitemapId;
  if (!SITEMAP_IDS.includes(part)) return [];
  const hit = cache.get(part);
  if (hit && Date.now() - hit.at < 3600_000) return hit.data;
  try {
    const data = (await build(part)).slice(0, PART_LIMIT);
    cache.set(part, { at: Date.now(), data });
    return data;
  } catch {
    return part === "basis" ? staticPages() : [];
  }
}

const base = () => process.env.APP_URL ?? "http://localhost:3000";
const u = (p: string) => `${base()}${p}`;

function staticPages(): MetadataRoute.Sitemap {
  const pages = ["/", "/entdecken", "/projekte", "/anleitungen", "/communities", "/markt", "/blogs", "/materialien", "/wettbewerbe", "/events", "/hilfe", "/richtlinien/community", "/richtlinien/marktplatz", "/richtlinien/sicherheit", "/richtlinien/urheberrecht", ...(LEGAL_FINAL ? LEGAL_PAGES : [])];
  return pages.map((p) => ({ url: u(p), changeFrequency: "daily" as const, priority: p === "/" ? 1 : 0.7 }));
}

async function build(part: SitemapId): Promise<MetadataRoute.Sitemap> {
  const take = PART_LIMIT;
  switch (part) {
    case "basis": {
      const [communities, materials] = await Promise.all([
        db.community.findMany({ where: { state: "PUBLISHED", visibility: { not: "PRIVATE" } }, select: { slug: true, updatedAt: true }, take }),
        db.material.findMany({ select: { slug: true }, take }),
      ]);
      return [
        ...staticPages(),
        ...listCategories({ activeOnly: true }).map((c) => ({ url: u(`/entdecken?kategorie=${c.slug}`), changeFrequency: "daily" as const, priority: 0.6 })),
        ...communities.map((c) => ({ url: u(`/c/${c.slug}`), lastModified: c.updatedAt, priority: 0.5 })),
        ...materials.map((m) => ({ url: u(`/materialien/${m.slug}`), changeFrequency: "weekly" as const, priority: 0.5 })),
      ];
    }
    case "projekte": {
      const projects = await db.project.findMany({ where: { state: "PUBLISHED", visibility: "PUBLIC", owner: { status: "ACTIVE" } }, select: { slug: true, updatedAt: true, owner: { select: { profile: { select: { handle: true } } } } }, orderBy: { updatedAt: "desc" }, take });
      return projects.map((p) => ({ url: u(`/u/${p.owner.profile?.handle}/${p.slug}`), lastModified: p.updatedAt, priority: 0.8 }));
    }
    case "anleitungen": {
      const [tutorials, articles] = await Promise.all([
        db.tutorial.findMany({ where: { state: "PUBLISHED", author: { status: "ACTIVE" } }, select: { slug: true, updatedAt: true }, orderBy: { updatedAt: "desc" }, take: take / 2 }),
        db.blogArticle.findMany({ where: { state: "PUBLISHED", author: { status: "ACTIVE" } }, select: { slug: true, updatedAt: true, author: { select: { profile: { select: { handle: true } } } } }, orderBy: { updatedAt: "desc" }, take: take / 2 - 1000 }),
      ]);
      const blogAuthors = [...new Set(articles.map((a) => a.author.profile?.handle).filter(Boolean))].slice(0, 1000);
      return [
        ...tutorials.map((t) => ({ url: u(`/anleitungen/${t.slug}`), lastModified: t.updatedAt, priority: 0.9 })),
        ...articles.map((a) => ({ url: u(`/u/${a.author.profile?.handle}/blog/${a.slug}`), lastModified: a.updatedAt, priority: 0.8 })),
        ...blogAuthors.map((h) => ({ url: u(`/u/${h}/blog`), priority: 0.5 })),
      ];
    }
    case "markt": {
      const [products, shops] = await Promise.all([
        db.product.findMany({ where: { status: "ACTIVE", shop: { status: "ACTIVE" } }, select: { slug: true, updatedAt: true, shop: { select: { slug: true } } }, orderBy: { updatedAt: "desc" }, take: take - 5000 }),
        db.shop.findMany({ where: { status: "ACTIVE" }, select: { slug: true, updatedAt: true }, orderBy: { updatedAt: "desc" }, take: 5000 }),
      ]);
      return [
        ...products.map((p) => ({ url: u(`/markt/${p.shop.slug}/${p.slug}`), lastModified: p.updatedAt, priority: 0.6 })),
        ...shops.map((s) => ({ url: u(`/markt/${s.slug}`), lastModified: s.updatedAt, priority: 0.5 })),
      ];
    }
    case "profile": {
      const profiles = await db.userProfile.findMany({ where: { user: { status: "ACTIVE" }, OR: [{ projectCount: { gt: 0 } }, { postCount: { gt: 0 } }] }, select: { handle: true, updatedAt: true }, orderBy: { updatedAt: "desc" }, take });
      return profiles.map((p) => ({ url: u(`/u/${p.handle}`), lastModified: p.updatedAt, priority: 0.5 }));
    }
  }
}
