import { z } from "zod";

/**
 * Creator-Pro-Newsletter: gemeinsame Regeln für Server, Editor und Tests (ohne Server-Abhängigkeiten).
 *
 * Karten zu eigenen Inhalten stehen als Platzhalter im Text, je auf einer eigenen Zeile:
 * `[[projekt:ID]]`, `[[anleitung:ID]]`, `[[produkt:ID]]` – der Editor fügt sie über die Auswahl ein,
 * im Versand werden sie zu Karten mit Bild und Link.
 */

export const NEWSLETTER_SUBJECT_MAX = 120;
export const NEWSLETTER_BODY_MAX = 8_000;
export const NEWSLETTER_CARDS_MAX = 3;
export const NEWSLETTER_STATUS = ["DRAFT", "SCHEDULED", "SENDING", "SENT"] as const;
export type NewsletterStatus = (typeof NEWSLETTER_STATUS)[number];

export const NEWSLETTER_STATUS_LABEL: Record<NewsletterStatus, string> = {
  DRAFT: "Entwurf",
  SCHEDULED: "Geplant",
  SENDING: "Wird verschickt",
  SENT: "Verschickt",
};

export const CARD_KINDS = ["projekt", "anleitung", "produkt"] as const;
export type CardKind = (typeof CARD_KINDS)[number];
export type CardRef = { kind: CardKind; id: string };

const TOKEN = /\[\[(projekt|anleitung|produkt):([A-Za-z0-9_-]{6,40})\]\]/g;

/** Platzhalter für Karten (in der Reihenfolge, doppelte nur einmal, höchstens drei) */
export function extractCardRefs(body: string): CardRef[] {
  const out: CardRef[] = [];
  for (const m of body.matchAll(TOKEN)) {
    const ref = { kind: m[1] as CardKind, id: m[2]! };
    if (!out.some((r) => r.kind === ref.kind && r.id === ref.id)) out.push(ref);
  }
  return out.slice(0, NEWSLETTER_CARDS_MAX);
}

/** Text ohne Platzhalter (leere Zeilen zusammengefasst) */
export function stripCardRefs(body: string) {
  return body
    .replace(TOKEN, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export const cardToken = (ref: CardRef) => `[[${ref.kind}:${ref.id}]]`;

export const newsletterInputSchema = z.object({
  subject: z.string().trim().min(3, "Mindestens 3 Zeichen").max(NEWSLETTER_SUBJECT_MAX, `Höchstens ${NEWSLETTER_SUBJECT_MAX} Zeichen`),
  body: z
    .string()
    .trim()
    .min(20, "Schreib mindestens ein paar Sätze (20 Zeichen).")
    .max(NEWSLETTER_BODY_MAX, `Höchstens ${NEWSLETTER_BODY_MAX.toLocaleString("de-CH")} Zeichen`)
    .refine((b) => extractCardRefs(b).length <= NEWSLETTER_CARDS_MAX && [...b.matchAll(TOKEN)].length <= NEWSLETTER_CARDS_MAX * 2, `Höchstens ${NEWSLETTER_CARDS_MAX} Karten`),
});
export type NewsletterInput = z.infer<typeof newsletterInputSchema>;

/** Planen: frühestens jetzt, höchstens 60 Tage im Voraus */
export const scheduleSchema = z.object({
  at: z.coerce.date().nullish(),
});

export const SCHEDULE_MAX_DAYS = 60;

/**
 * Ziel eines Klick-Links: nur http(s) – kein javascript:, data: usw. Relative Pfade werden auf die
 * eigene Domain bezogen. Gibt die absolute URL zurück oder null.
 */
export function safeClickTarget(raw: string | null | undefined, appUrl: string): string | null {
  if (!raw || raw.length > 2_000) return null;
  try {
    const u = raw.startsWith("/") && !raw.startsWith("//") ? new URL(raw, appUrl) : new URL(raw);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    return u.toString();
  } catch {
    return null;
  }
}

/** Öffnungs- bzw. Klickrate in Prozent (gerundet), null ohne Empfänger:innen */
export function rate(count: number, recipients: number) {
  return recipients > 0 ? Math.round((Math.min(count, recipients) / recipients) * 100) : null;
}
