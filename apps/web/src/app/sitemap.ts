import type { MetadataRoute } from "next";
import { CATEGORIES, listCategories } from "@werkraum/shared";
import { db } from "@/server/db";

export const dynamic = "force-dynamic";

/** Sitemap öffentlicher, indexierbarer Inhalte (§14.5). */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = process.env.APP_URL ?? "http://localhost:3000";
  const u = (p: string) => `${base}${p}`;
  const staticPages = ["/", "/entdecken", "/projekte", "/anleitungen", "/communities", "/markt", "/blogs", "/materialien", "/hilfe", "/richtlinien/community", "/richtlinien/marktplatz", "/richtlinien/sicherheit", "/richtlinien/urheberrecht", "/rechtliches/datenschutz", "/rechtliches/agb", "/rechtliches/impressum"].map((p) => ({ url: u(p), changeFrequency: "daily" as const, priority: p === "/" ? 1 : 0.7 }));
  try {
    const [projects, tutorials, profiles, communities, articles, products, shops] = await Promise.all([
      db.project.findMany({ where: { state: "PUBLISHED", visibility: "PUBLIC" }, select: { slug: true, updatedAt: true, owner: { select: { profile: { select: { handle: true } } } } }, take: 20000 }),
      db.tutorial.findMany({ where: { state: "PUBLISHED" }, select: { slug: true, updatedAt: true }, take: 20000 }),
      db.userProfile.findMany({ where: { user: { status: "ACTIVE" }, OR: [{ projectCount: { gt: 0 } }, { postCount: { gt: 0 } }] }, select: { handle: true, updatedAt: true }, take: 20000 }),
      db.community.findMany({ where: { state: "PUBLISHED", visibility: { not: "PRIVATE" } }, select: { slug: true, updatedAt: true } }),
      db.blogArticle.findMany({ where: { state: "PUBLISHED" }, select: { slug: true, updatedAt: true, author: { select: { profile: { select: { handle: true } } } } }, take: 20000 }),
      db.product.findMany({ where: { status: "ACTIVE", shop: { status: "ACTIVE" } }, select: { slug: true, updatedAt: true, shop: { select: { slug: true } } }, take: 20000 }),
      db.shop.findMany({ where: { status: "ACTIVE" }, select: { slug: true, updatedAt: true }, take: 20000 }),
    ]);
    const blogAuthors = [...new Set(articles.map((a) => a.author.profile?.handle).filter(Boolean))];
    return [
      ...staticPages,
      ...listCategories({ activeOnly: true }).map((c) => ({ url: u(`/entdecken?kategorie=${c.slug}`), changeFrequency: "daily" as const, priority: 0.6 })),
      ...projects.map((p) => ({ url: u(`/u/${p.owner.profile?.handle}/${p.slug}`), lastModified: p.updatedAt, priority: 0.8 })),
      ...tutorials.map((t) => ({ url: u(`/anleitungen/${t.slug}`), lastModified: t.updatedAt, priority: 0.9 })),
      ...articles.map((a) => ({ url: u(`/u/${a.author.profile?.handle}/blog/${a.slug}`), lastModified: a.updatedAt, priority: 0.8 })),
      ...profiles.map((p) => ({ url: u(`/u/${p.handle}`), lastModified: p.updatedAt, priority: 0.5 })),
      ...communities.map((c) => ({ url: u(`/c/${c.slug}`), lastModified: c.updatedAt, priority: 0.5 })),
      ...products.map((p) => ({ url: u(`/markt/${p.shop.slug}/${p.slug}`), lastModified: p.updatedAt, priority: 0.6 })),
      ...shops.map((s) => ({ url: u(`/markt/${s.slug}`), lastModified: s.updatedAt, priority: 0.5 })),
      ...blogAuthors.map((h) => ({ url: u(`/u/${h}/blog`), priority: 0.5 })),
    ];
  } catch {
    return staticPages;
  }
}
