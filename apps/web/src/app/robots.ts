import type { MetadataRoute } from "next";
import { SITEMAP_IDS } from "@/config/sitemap";

export default function robots(): MetadataRoute.Robots {
  const base = process.env.APP_URL ?? "http://localhost:3000";
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/api/", "/studio", "/admin", "/einstellungen", "/nachrichten", "/benachrichtigungen", "/warenkorb", "/kasse", "/bestellungen", "/willkommen", "/passwort-zuruecksetzen", "/verifizieren", "/liste", "/gespeichert", "/einkaufslisten", "/beleg", "/go/", "/materialien/bestand"] }],
    // Aufgeteilte Sitemaps (je < 50'000 URLs), siehe app/sitemap.ts
    sitemap: SITEMAP_IDS.map((id) => `${base}/sitemap/${id}.xml`),
    host: base,
  };
}
