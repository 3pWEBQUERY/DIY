import { SITEMAP_IDS } from "@/config/sitemap";

/**
 * Sitemap-Index unter /sitemap_index.xml (/sitemap.xml selbst belegt Next.js für app/sitemap.ts): verweist auf die Teil-Sitemaps (/sitemap/<id>.xml aus app/sitemap.ts).
 * Diese Adresse trägt man in der Google Search Console bzw. bei Bing ein.
 */
export const dynamic = "force-dynamic";

export function GET() {
  const base = (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
  const now = new Date().toISOString();
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${SITEMAP_IDS.map((id) => `  <sitemap><loc>${base}/sitemap/${id}.xml</loc><lastmod>${now}</lastmod></sitemap>`).join("\n")}
</sitemapindex>
`;
  return new Response(body, { headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=3600" } });
}
