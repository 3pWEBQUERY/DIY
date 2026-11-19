import { BRAND } from "@/config/brand";

/**
 * Suchmaschinen (Google, Bing …): gemeinsame Bausteine für Metadaten und strukturierte Daten
 * (schema.org als JSON-LD). Seiten binden die Daten mit `<JsonLd data={…} />` ein.
 */

export function siteUrl() {
  return (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
}

export function absoluteUrl(path: string) {
  if (/^https?:\/\//.test(path)) return path;
  return `${siteUrl()}${path.startsWith("/") ? "" : "/"}${path}`;
}

/** Suchbegriffe, unter denen Werkuno gefunden werden soll (Google wertet `keywords` kaum, Bing schon). */
export const SEO_KEYWORDS = [
  "DIY",
  "Selbstgemacht",
  "Handmade",
  "Handarbeit",
  "Häkeln",
  "Stricken",
  "Nähen",
  "Holzarbeiten",
  "Upcycling",
  "Basteln",
  "Anleitungen",
  "Bauanleitung",
  "Schnittmuster",
  "Handmade Marktplatz Schweiz",
  "DIY Community",
  "Maker",
  "Werkstatt",
];

const ORG_ID = () => `${siteUrl()}/#organisation`;
const SITE_ID = () => `${siteUrl()}/#website`;

/** Organisation und Website (mit Suchfeld für Google) – auf der Startseite. */
export function siteJsonLd() {
  const base = siteUrl();
  const appId = process.env.APPLE_APP_STORE_ID?.trim();
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": ORG_ID(),
        name: BRAND.name,
        url: `${base}/`,
        logo: { "@type": "ImageObject", url: `${base}/brand/werkuno-icon.png`, width: 512, height: 512 },
        email: BRAND.supportEmail,
        description: BRAND.description,
        areaServed: { "@type": "Country", name: "Schweiz" },
        ...(appId ? { sameAs: [`https://apps.apple.com/ch/app/id${appId}`] } : {}),
      },
      {
        "@type": "WebSite",
        "@id": SITE_ID(),
        name: BRAND.name,
        url: `${base}/`,
        description: BRAND.description,
        inLanguage: BRAND.locale,
        publisher: { "@id": ORG_ID() },
        potentialAction: {
          "@type": "SearchAction",
          target: { "@type": "EntryPoint", urlTemplate: `${base}/suche?q={search_term_string}` },
          "query-input": "required name=search_term_string",
        },
      },
    ],
  };
}

/** Brotkrumen für die Trefferanzeige („Werkuno › Marktplatz › Shop › Produkt“). */
export function breadcrumbJsonLd(items: { name: string; path: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => ({ "@type": "ListItem", position: i + 1, name: it.name, item: absoluteUrl(it.path) })),
  };
}

/** Kurztext für `description`: ohne Zeilenumbrüche, höchstens 160 Zeichen, an einer Wortgrenze gekürzt. */
export function metaDescription(text: string | null | undefined, fallback: string) {
  const clean = (text ?? "").replace(/\s+/g, " ").trim() || fallback;
  if (clean.length <= 160) return clean;
  const cut = clean.slice(0, 157);
  const at = cut.lastIndexOf(" ");
  return `${(at > 100 ? cut.slice(0, at) : cut).replace(/[\s,.;:–-]+$/, "")} …`;
}

/** Standard-Vorschaubild (app/opengraph-image.png, 1200 × 630), wenn ein Inhalt kein eigenes Bild hat. */
export const DEFAULT_OG_IMAGE = { url: "/opengraph-image.png", width: 1200, height: 630, alt: BRAND.name };

/**
 * Grundwerte für `openGraph`: Next.js ersetzt das `openGraph` des Layouts komplett, sobald eine Seite
 * eigenes setzt – ohne diese Werte fehlten Seitenname und Sprache in Link-Vorschauen.
 */
export const OG_BASE = { siteName: BRAND.name, locale: "de_CH", type: "website", images: [DEFAULT_OG_IMAGE] };
