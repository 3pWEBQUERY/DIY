import { z } from "zod";
import { STORY_BACKGROUNDS, type StoryBackground } from "./stories";
import { contrastRatio } from "./story-layout";

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

// ───────────────────────── Gestaltung ─────────────────────────

/**
 * Schriften (selbst gehostet, keine Anfragen an Dritte). `css` ist der Font-Stack für die Anzeige,
 * `scale` gleicht die optische Grösse aus (Caveat ist bei gleicher Pixelgrösse deutlich kleiner).
 */
export const ANNOUNCEMENT_FONTS = {
  werkuno: { label: "Werkuno", hint: "Klar, wie die ganze Seite", css: '"Manrope Variable", ui-sans-serif, system-ui, sans-serif', scale: 1 },
  serif: { label: "Serif", hint: "Redaktionell, warm", css: '"Fraunces Variable", ui-serif, Georgia, serif', scale: 1 },
  grotesk: { label: "Grotesk", hint: "Technisch, markant", css: '"Space Grotesk Variable", ui-sans-serif, system-ui, sans-serif', scale: 1 },
  hand: { label: "Handschrift", hint: "Persönlich, für kurze Titel", css: '"Caveat Variable", "Bradley Hand", cursive', scale: 1.3 },
  mono: { label: "Schreibmaschine", hint: "Hinweise, Zahlen, Codes", css: '"JetBrains Mono Variable", ui-monospace, monospace', scale: 0.88 },
} as const;
export type AnnouncementFont = keyof typeof ANNOUNCEMENT_FONTS;
export const ANNOUNCEMENT_FONT_KEYS = Object.keys(ANNOUNCEMENT_FONTS) as AnnouncementFont[];

/** Schriftgrössen in rem – Titel wächst ab Tablet um eine Stufe (Werte: [Handy, ab sm]) */
export const ANNOUNCEMENT_TITLE_SIZES = {
  s: { label: "S", rem: [1.1, 1.25] },
  m: { label: "M", rem: [1.3, 1.55] },
  l: { label: "L", rem: [1.6, 2] },
  xl: { label: "XL", rem: [1.9, 2.6] },
} as const;
export type AnnouncementTitleSize = keyof typeof ANNOUNCEMENT_TITLE_SIZES;
export const ANNOUNCEMENT_BODY_SIZES = {
  s: { label: "S", rem: 0.875 },
  m: { label: "M", rem: 0.9375 },
  l: { label: "L", rem: 1.0625 },
} as const;
export type AnnouncementBodySize = keyof typeof ANNOUNCEMENT_BODY_SIZES;

/** Hintergrund: Palettenfarbe, frei gewählte Farbe oder Bild (mit Abdunkeln für die Lesbarkeit) */
export const ANNOUNCEMENT_BG_MODES = ["tone", "color", "image"] as const;
export type AnnouncementBgMode = (typeof ANNOUNCEMENT_BG_MODES)[number];
export const ANNOUNCEMENT_BG_POSITIONS = { top: "Oben", center: "Mitte", bottom: "Unten" } as const;
export type AnnouncementBgPosition = keyof typeof ANNOUNCEMENT_BG_POSITIONS;
export const ANNOUNCEMENT_OVERLAY_MAX = 85;

/** Schnellwahl für Schrift- und Hintergrundfarben (frei wählbar bleibt jede Farbe) */
export const ANNOUNCEMENT_SWATCHES = [
  "#FFFFFF", "#FAF8F5", "#F3EFEB", "#262427", "#000000",
  "#B64B3A", "#973B2C", "#E0A898", "#C29A3E", "#F2D58A",
  "#4F7A55", "#B9D3B6", "#4F6475", "#B7C8D6", "#6E4E64", "#D9C3D3",
] as const;

const INK = "#262427";
const WHITE = "#FFFFFF";
export const isHexColor = (s: string) => /^#[0-9a-f]{6}$/i.test(s);
/** Lesbare Schrift auf einer Fläche: Tinte oder Weiss */
export const readableOn = (bg: string) => (contrastRatio(bg, WHITE) >= contrastRatio(bg, INK) ? WHITE : INK);

/** Mischt `top` mit Deckkraft `alpha` (0–1) über `base` – für die Kontrastprüfung auf abgedunkelten Bildern */
function mix(base: string, top: string, alpha: number) {
  const p = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [a, b] = [p(base), p(top)];
  return "#" + a.map((v, i) => Math.round(v * (1 - alpha) + b[i]! * alpha).toString(16).padStart(2, "0")).join("");
}

export type AnnouncementStyle = {
  tone: StoryBackground;
  bgMode: AnnouncementBgMode;
  bgColor: string;
  bgImageUrl: string | null;
  bgOverlay: number;
  /** Helle Stelle des Bildes (90. Perzentil, beim Hochladen gemessen); unbekannt = Weiss (ungünstigster Fall) */
  bgImageLight?: string;
  textColor: string;
};

/**
 * Wirksame Farben einer Ankündigung. Auf Bildern rechnet die Prüfung mit einer hellen Stelle des
 * Bildes unter der Abdunkelung. `contrast` ist das WCAG-Verhältnis Schrift : Fläche.
 */
export function announcementColors(a: AnnouncementStyle) {
  const image = a.bgMode === "image" && !!a.bgImageUrl;
  const bg = image ? INK : a.bgMode === "color" && isHexColor(a.bgColor) ? a.bgColor : ANNOUNCEMENT_TONES[a.tone].bg;
  const autoFg = image ? WHITE : a.bgMode === "color" ? readableOn(bg) : ANNOUNCEMENT_TONES[a.tone].fg;
  const fg = isHexColor(a.textColor) ? a.textColor : autoFg;
  const overlay = image ? Math.min(Math.max(a.bgOverlay, 0), ANNOUNCEMENT_OVERLAY_MAX) / 100 : 0;
  // Helle Bildstelle unter der Abdunkelung (Tinte mit Deckkraft `overlay`); ohne Messung: reines Weiss
  const light = a.bgImageLight && isHexColor(a.bgImageLight) ? a.bgImageLight : WHITE;
  const effectiveBg = image ? mix(light, INK, overlay) : bg;
  return { bg, fg, overlay, image, contrast: contrastRatio(fg, effectiveBg), buttonBg: fg, buttonFg: readableOn(fg) };
}

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
    titleFont: z.enum(ANNOUNCEMENT_FONT_KEYS as [AnnouncementFont, ...AnnouncementFont[]]).default("werkuno"),
    bodyFont: z.enum(ANNOUNCEMENT_FONT_KEYS as [AnnouncementFont, ...AnnouncementFont[]]).default("werkuno"),
    titleSize: z.enum(Object.keys(ANNOUNCEMENT_TITLE_SIZES) as [AnnouncementTitleSize, ...AnnouncementTitleSize[]]).default("m"),
    bodySize: z.enum(Object.keys(ANNOUNCEMENT_BODY_SIZES) as [AnnouncementBodySize, ...AnnouncementBodySize[]]).default("m"),
    /** Leer = automatisch passend zum Hintergrund */
    textColor: z
      .string()
      .trim()
      .default("")
      .refine((c) => c === "" || isHexColor(c), "Farbe als #RRGGBB"),
    bgMode: z.enum(ANNOUNCEMENT_BG_MODES).default("tone"),
    bgColor: z
      .string()
      .trim()
      .default("")
      .refine((c) => c === "" || isHexColor(c), "Farbe als #RRGGBB"),
    /** Hochgeladenes Bild (Medien-ID); die Adresse ermittelt der Server */
    bgMediaId: z.string().trim().max(64).default(""),
    bgOverlay: z.coerce.number().int().min(0).max(ANNOUNCEMENT_OVERLAY_MAX).default(45),
    bgImageLight: z
      .string()
      .trim()
      .default("#FFFFFF")
      .refine((c) => isHexColor(c), "Farbe als #RRGGBB"),
    bgPosition: z.enum(Object.keys(ANNOUNCEMENT_BG_POSITIONS) as [AnnouncementBgPosition, ...AnnouncementBgPosition[]]).default("center"),
    dismissible: z.boolean().default(true),
    isActive: z.boolean().default(false),
    position: z.coerce.number().int().min(0).max(999).default(0),
  })
  .strict()
  .superRefine((a, ctx) => {
    if (!!a.ctaLabel !== !!a.ctaHref) ctx.addIssue({ code: "custom", path: [a.ctaLabel ? "ctaHref" : "ctaLabel"], message: "Button braucht Beschriftung und Link" });
    if (a.ctaHref && !isAllowedAnnouncementHref(a.ctaHref)) ctx.addIssue({ code: "custom", path: ["ctaHref"], message: "Interne Adresse (/…) oder https://…" });
    if (a.startsAt && a.endsAt && a.endsAt <= a.startsAt) ctx.addIssue({ code: "custom", path: ["endsAt"], message: "Das Ende muss nach dem Start liegen" });
    if (a.bgMode === "color" && !a.bgColor) ctx.addIssue({ code: "custom", path: ["bgColor"], message: "Wähle eine Hintergrundfarbe" });
    if (a.bgMode === "image" && !a.bgMediaId) ctx.addIssue({ code: "custom", path: ["bgMediaId"], message: "Lade ein Bild hoch" });
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
