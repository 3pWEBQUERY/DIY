import { BRAND } from "@/config/brand";

/**
 * Anbieterangaben für Impressum, Nutzungsbedingungen und Datenschutz – EINE Stelle für alle Rechtstexte.
 *
 * Betreiber ist ein Einzelunternehmen ohne Handelsregistereintrag und ohne MWST-Pflicht: Felder, die
 * leer bleiben (Handelsregister, UID, MWST, EU-Vertretung), werden in den Texten weggelassen – es gibt
 * keine sichtbaren Platzhalter. Fehlt eine Pflichtangabe oder ist `reviewed` nicht gesetzt, gelten die
 * Texte als Entwurf (Hinweis sichtbar, `noindex`, nicht in der Sitemap).
 */
export const LEGAL = {
  /** Name bzw. Firma des Betreibers */
  company: "Alexander Sulschani",
  /** Rechtsform */
  legalForm: "Einzelunternehmen",
  /** Strasse und Hausnummer */
  street: "Schaffhauserstrasse 6",
  /** PLZ und Ort */
  city: "8180 Bülach",
  country: "Schweiz",
  /** Telefon (Anzeige) und Wählnummer (tel:-Link) */
  phone: "+41 76 542 44 82",
  phoneHref: "tel:+41765424482",
  /** Kontakt-E-Mail für alle Anliegen */
  email: BRAND.supportEmail,
  /** Handelsregister – leer: nicht eingetragen (Zeile entfällt) */
  register: "",
  /** UID – leer: keine (Zeile entfällt) */
  uid: "",
  /** MWST-Nummer – leer: nicht mehrwertsteuerpflichtig (Zeile entfällt) */
  vat: "",
  /** EU-Vertretung nach Art. 27 DSGVO – leer: Zeile entfällt */
  euRepresentative: "",
  /** Gerichtsstand */
  venue: "Bülach, Schweiz",
  /** Anwendbares Recht */
  law: "Schweizer Recht",
  /** Rechtstexte geprüft und freigegeben */
  reviewed: true,
};

type LegalTextKey = Exclude<keyof typeof LEGAL, "reviewed">;

/** Pflichtangaben für diesen Betreibertyp (Einzelunternehmen ohne Registereintrag). */
const REQUIRED: LegalTextKey[] = ["company", "street", "city", "country", "email", "venue"];

/** Fehlende Pflichtangaben (für Hinweise in Entwicklung und Admin). Telefon oder E-Mail genügt. */
export const LEGAL_MISSING: string[] = [...REQUIRED.filter((k) => !LEGAL[k].trim()), ...(!LEGAL.phone.trim() && !LEGAL.email.trim() ? ["phone"] : [])];

/** Rechtstexte vollständig und geprüft → indexierbar, ohne Entwurfs-Hinweis. */
export const LEGAL_FINAL = LEGAL_MISSING.length === 0 && LEGAL.reviewed;

/** Wert einer Angabe oder `null`, wenn sie leer ist – leere Angaben werden weggelassen, nie als Platzhalter gezeigt. */
export function legalValue(key: LegalTextKey): string | null {
  return LEGAL[key].trim() || null;
}

/** Vollständige Postadresse in einer Zeile. */
export const LEGAL_ADDRESS = [LEGAL.street, LEGAL.city, LEGAL.country].filter((s) => s.trim()).join(", ");

/** Betreiber in einer Zeile, z. B. für Vertragspartner-Angaben. */
export const LEGAL_OPERATOR = `${LEGAL.company} (${LEGAL.legalForm}), ${LEGAL_ADDRESS}`;

/** Plattformname in Rechtstexten. */
export const LEGAL_BRAND = BRAND.name;

/** Metadaten-Zusatz: Entwürfe nicht indexieren. */
export const LEGAL_ROBOTS = LEGAL_FINAL ? undefined : { index: false, follow: true };

/** Seiten mit Anbieterangaben – nur in die Sitemap, wenn final. */
export const LEGAL_PAGES = ["/rechtliches/datenschutz", "/rechtliches/agb", "/rechtliches/impressum"];

/** Stand aller Rechtstexte, Richtlinien und Hilfeseiten. */
export const LEGAL_UPDATED = "11. November 2026";
