import { BRAND } from "@/config/brand";

/**
 * Anbieterangaben für Impressum, AGB und Datenschutz – EINE Stelle für alle Rechtstexte.
 *
 * Solange Pflichtangaben fehlen oder `reviewed` nicht gesetzt ist, gelten die Rechtstexte als Entwurf:
 * Entwurfs-Hinweis sichtbar, Impressum/AGB/Datenschutz mit `noindex` und nicht in der Sitemap.
 * `reviewed: true` erst setzen, wenn die Texte juristisch geprüft sind.
 */
export const LEGAL = {
  /** Firma der Betreiberin, z. B. „Werkuno GmbH“ */
  company: "",
  /** z. B. „Gesellschaft mit beschränkter Haftung (GmbH)“ */
  legalForm: "",
  /** Strasse, PLZ Ort */
  address: "",
  /** z. B. „Handelsregisteramt des Kantons Zürich“ */
  register: "",
  /** UID, z. B. „CHE-123.456.789“ */
  uid: "",
  /** MWST-Nummer; leer lassen, falls (noch) nicht MWST-pflichtig */
  vat: "",
  /** Vertretungsberechtigte Person(en) */
  representative: "",
  /** Telefon (optional, empfohlen) */
  phone: "",
  /** Gerichtsstand (Ort) */
  venue: "",
  /** EU-Vertretung nach Art. 27 DSGVO (Name, Adresse in der EU) */
  euRepresentative: "",
  /** Rechtstexte juristisch geprüft? */
  reviewed: false,
};

const REQUIRED = ["company", "legalForm", "address", "register", "uid", "representative", "venue"] as const;

/** Fehlende Pflichtangaben (für Hinweise in Entwicklung und Admin). */
export const LEGAL_MISSING: string[] = REQUIRED.filter((k) => !LEGAL[k].trim());

/** Rechtstexte vollständig und geprüft → indexierbar, ohne Entwurfs-Hinweis. */
export const LEGAL_FINAL = LEGAL_MISSING.length === 0 && LEGAL.reviewed;

/** Wert oder sichtbarer Platzhalter in eckigen Klammern. */
export function legalValue(key: keyof Omit<typeof LEGAL, "reviewed">, placeholder: string) {
  return LEGAL[key].trim() || `[${placeholder}]`;
}

/** Plattformname in Rechtstexten – „(Arbeitstitel)“, bis die Texte final sind. */
export const LEGAL_BRAND = LEGAL_FINAL ? BRAND.name : `${BRAND.name} (Arbeitstitel)`;

/** Metadaten-Zusatz: Entwürfe nicht indexieren. */
export const LEGAL_ROBOTS = LEGAL_FINAL ? undefined : { index: false, follow: true };

/** Seiten mit Anbieterangaben – nur in die Sitemap, wenn final. */
export const LEGAL_PAGES = ["/rechtliches/datenschutz", "/rechtliches/agb", "/rechtliches/impressum"];
