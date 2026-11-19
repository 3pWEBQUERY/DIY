import { z } from "zod";
import { STORY_BACKGROUNDS, type StoryBackground } from "./stories";

/**
 * Ankündigungen: kurze, wichtige Hinweise der Plattform als Mini-Hero oben auf ausgewählten Seiten
 * (z. B. Wartung, neue Funktion, Aktion im Marktplatz). Verwaltet unter Admin → Ankündigungen.
 */

export const ANNOUNCEMENT_PLACEMENTS = ["feed", "landing", "market", "discover"] as const;
export type AnnouncementPlacement = (typeof ANNOUNCEMENT_PLACEMENTS)[number];
export const ANNOUNCEMENT_PLACEMENT_LABEL: Record<AnnouncementPlacement, { label: string; hint: string }> = {
  feed: { label: "Werkbank", hint: "Startseite der Mitglieder (/feed)" },
  landing: { label: "Startseite für Gäste", hint: "werkuno.ch für nicht angemeldete Besucher" },
  market: { label: "Marktplatz", hint: "/markt" },
  discover: { label: "Entdecken", hint: "/entdecken" },
};

/**
 * Hintergründe aus der Werkuno-Farbwelt – dieselben geprüften Paare wie bei Text-Stories (Schrift
 * mindestens 4,5:1 auf der Fläche). Keine freie Farbwahl: so bleibt jede Ankündigung lesbar.
 */
export const ANNOUNCEMENT_TONES = STORY_BACKGROUNDS;
export type AnnouncementTone = StoryBackground;
export const ANNOUNCEMENT_TONE_KEYS = Object.keys(STORY_BACKGROUNDS) as AnnouncementTone[];

export const ANNOUNCEMENT_TITLE_MAX = 90;
export const ANNOUNCEMENT_BODY_MAX = 700;
export const ANNOUNCEMENT_CTA_MAX = 40;
/** Höchstens so viele gleichzeitig aktive Ankündigungen je Seite werden geladen (die erste nicht ausgeblendete erscheint). */
export const ANNOUNCEMENT_PER_PLACEMENT = 3;

/** Link des Buttons: interne Adresse („/markt“) oder https. Keine anderen Schemata (javascript:, data: …). */
export function isAllowedAnnouncementHref(href: string) {
  if (/^\/(?!\/)[^\s]*$/.test(href)) return true;
  try {
    const u = new URL(href);
    return u.protocol === "https:" && !!u.hostname;
  } catch {
    return false;
  }
}

/** Ein Zeichen aus Emoji-Bausteinen (inkl. Hautton, Verbindungen, Flaggen) – kein Text */
export function isSingleEmoji(s: string) {
  if (!s || s.length > 16) return false;
  return /^(?:\p{Extended_Pictographic}|\p{Regional_Indicator}|[‍️⃣]|\p{Emoji_Modifier}|[#*0-9])+$/u.test(s) && /\p{Extended_Pictographic}|\p{Regional_Indicator}/u.test(s);
}

const optionalDate = z
  .union([z.string(), z.date(), z.null()])
  .optional()
  .transform((v, ctx) => {
    if (v == null || v === "") return null;
    const d = v instanceof Date ? v : new Date(v);
    if (Number.isNaN(d.getTime())) {
      ctx.addIssue({ code: "custom", message: "Ungültiges Datum" });
      return z.NEVER;
    }
    return d;
  });

export const announcementSchema = z
  .object({
    title: z.string().trim().min(3, "Mindestens 3 Zeichen").max(ANNOUNCEMENT_TITLE_MAX, `Höchstens ${ANNOUNCEMENT_TITLE_MAX} Zeichen`),
    /** Auszeichnung aus dem WYSIWYG-Editor (fett, kursiv, Listen, Links) – nie HTML */
    body: z.string().trim().max(ANNOUNCEMENT_BODY_MAX, `Höchstens ${ANNOUNCEMENT_BODY_MAX} Zeichen`).default(""),
    emoji: z
      .string()
      .trim()
      .default("")
      .refine((e) => e === "" || isSingleEmoji(e), "Bitte genau ein Emoji wählen"),
    tone: z.enum(ANNOUNCEMENT_TONE_KEYS as [AnnouncementTone, ...AnnouncementTone[]]).default("coral"),
    ctaLabel: z.string().trim().max(ANNOUNCEMENT_CTA_MAX, `Höchstens ${ANNOUNCEMENT_CTA_MAX} Zeichen`).default(""),
    ctaHref: z.string().trim().max(500).default(""),
    placements: z.array(z.enum(ANNOUNCEMENT_PLACEMENTS)).min(1, "Wähle mindestens eine Seite").max(ANNOUNCEMENT_PLACEMENTS.length),
    startsAt: optionalDate,
    endsAt: optionalDate,
    dismissible: z.boolean().default(true),
    isActive: z.boolean().default(false),
    position: z.coerce.number().int().min(0).max(999).default(0),
  })
  .strict()
  .superRefine((a, ctx) => {
    if (!!a.ctaLabel !== !!a.ctaHref) ctx.addIssue({ code: "custom", path: [a.ctaLabel ? "ctaHref" : "ctaLabel"], message: "Button braucht Beschriftung und Link" });
    if (a.ctaHref && !isAllowedAnnouncementHref(a.ctaHref)) ctx.addIssue({ code: "custom", path: ["ctaHref"], message: "Interne Adresse (/…) oder https://…" });
    if (a.startsAt && a.endsAt && a.endsAt <= a.startsAt) ctx.addIssue({ code: "custom", path: ["endsAt"], message: "Das Ende muss nach dem Start liegen" });
    if (new Set(a.placements).size !== a.placements.length) ctx.addIssue({ code: "custom", path: ["placements"], message: "Doppelte Seite" });
  });
export type AnnouncementInput = z.input<typeof announcementSchema>;
export type AnnouncementData = z.output<typeof announcementSchema>;

/** Läuft die Ankündigung gerade (aktiv und im Zeitraum)? */
export function isAnnouncementLive(a: { isActive: boolean; startsAt: Date | null; endsAt: Date | null }, now = new Date()) {
  return a.isActive && (!a.startsAt || a.startsAt <= now) && (!a.endsAt || a.endsAt > now);
}

/** Zustand für die Verwaltung */
export function announcementStatus(a: { isActive: boolean; startsAt: Date | null; endsAt: Date | null }, now = new Date()): "draft" | "scheduled" | "live" | "ended" {
  if (!a.isActive) return "draft";
  if (a.endsAt && a.endsAt <= now) return "ended";
  if (a.startsAt && a.startsAt > now) return "scheduled";
  return "live";
}
export const ANNOUNCEMENT_STATUS_LABEL = { draft: "Entwurf", scheduled: "Geplant", live: "Sichtbar", ended: "Abgelaufen" } as const;
