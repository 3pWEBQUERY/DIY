export const SITEMAP_IDS = ["basis", "projekte", "anleitungen", "markt", "profile"] as const;
export type SitemapId = (typeof SITEMAP_IDS)[number];
