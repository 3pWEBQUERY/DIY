import { z } from "zod";
import { mediaRefSchema } from "./schemas";
import { storyLayoutSchema } from "./story-layout";

/**
 * Stories: Foto, Video oder Text – 24 Stunden im Story-Kreis, danach im eigenen Archiv.
 * Gemeinsame Regeln für Web, Server und iOS (die App spiegelt Palette und Zeiten in StoryModels.swift).
 */

/** Wie lange eine Story im Story-Kreis bleibt. */
export const STORY_LIFETIME_HOURS = 24;
/** Anzeigedauer eines Fotos bzw. einer Text-Story. */
export const STORY_IMAGE_SECONDS = 6;
/** Längstes Story-Video (längere Videos gehören in einen Beitrag). */
export const STORY_VIDEO_MAX_SECONDS = 60;
/** Höchstens so viele Stories innerhalb von 24 Stunden. */
export const STORY_MAX_ACTIVE = 30;
export const STORY_TEXT_MAX = 500;
export const STORY_CAPTION_MAX = 300;
export const HIGHLIGHT_TITLE_MAX = 30;
export const HIGHLIGHT_MAX_ITEMS = 100;
export const HIGHLIGHT_MAX_PER_PROFILE = 50;

/**
 * Hintergründe für Text-Stories – aus der Werkuno-Farbwelt (globals.css / Theme.swift).
 * Bewusst fest (nicht hell/dunkel umschaltend): eine Story sieht für alle gleich aus.
 */
export const STORY_BACKGROUNDS = {
  coral: { label: "Koralle", bg: "#B64B3A", fg: "#FFFFFF" },
  ink: { label: "Tinte", bg: "#262427", fg: "#FAF8F5" },
  paper: { label: "Papier", bg: "#F3EFEB", fg: "#262427" },
  rose: { label: "Rosé", bg: "#F6E5E0", fg: "#973B2C" },
  ochre: { label: "Ocker", bg: "#C29A3E", fg: "#262427" },
  sage: { label: "Salbei", bg: "#4F7A55", fg: "#FFFFFF" },
  slate: { label: "Schiefer", bg: "#4F6475", fg: "#FFFFFF" },
  plum: { label: "Pflaume", bg: "#6E4E64", fg: "#FFFFFF" },
} as const;
export type StoryBackground = keyof typeof STORY_BACKGROUNDS;
export const STORY_BACKGROUND_KEYS = Object.keys(STORY_BACKGROUNDS) as StoryBackground[];

export const STORY_AUDIENCES = ["PUBLIC", "FOLLOWERS"] as const;
export type StoryAudience = (typeof STORY_AUDIENCES)[number];
export const STORY_AUDIENCE_LABEL: Record<StoryAudience, string> = {
  PUBLIC: "Alle",
  FOLLOWERS: "Nur Follower",
};

export const storyCreateSchema = z
  .object({
    kind: z.enum(["MEDIA", "TEXT"]),
    media: mediaRefSchema.optional(),
    text: z.string().trim().max(STORY_TEXT_MAX, `Höchstens ${STORY_TEXT_MAX} Zeichen`).default(""),
    background: z.enum(STORY_BACKGROUND_KEYS as [StoryBackground, ...StoryBackground[]]).optional(),
    visibility: z.enum(STORY_AUDIENCES).default("PUBLIC"),
    projectId: z.string().min(1).optional(),
    /** Gestaltung aus dem Story-Editor (optional – ältere App-Versionen senden keine) */
    layout: storyLayoutSchema.optional(),
  })
  .superRefine((s, ctx) => {
    if (s.kind === "MEDIA") {
      if (!s.media) ctx.addIssue({ code: "custom", path: ["media"], message: "Wähle ein Foto oder Video" });
      if (s.text.length > STORY_CAPTION_MAX) ctx.addIssue({ code: "custom", path: ["text"], message: `Höchstens ${STORY_CAPTION_MAX} Zeichen` });
    } else {
      if (!s.text) ctx.addIssue({ code: "custom", path: ["text"], message: "Schreib etwas für deine Story" });
      if (!s.background) ctx.addIssue({ code: "custom", path: ["background"], message: "Wähle einen Hintergrund" });
    }
  });
export type StoryCreateInput = z.infer<typeof storyCreateSchema>;

export const storyReplySchema = z.object({
  body: z.string().trim().min(1, "Die Antwort ist leer").max(1000, "Höchstens 1000 Zeichen"),
});

export const highlightTitleSchema = z.string().trim().min(1, "Gib dem Highlight einen Namen").max(HIGHLIGHT_TITLE_MAX, `Höchstens ${HIGHLIGHT_TITLE_MAX} Zeichen`);

export const highlightCreateSchema = z.object({
  title: highlightTitleSchema,
  storyIds: z.array(z.string().min(1)).min(1, "Wähle mindestens eine Story").max(HIGHLIGHT_MAX_ITEMS, `Höchstens ${HIGHLIGHT_MAX_ITEMS} Stories`),
});

export const highlightUpdateSchema = z.object({
  title: highlightTitleSchema.optional(),
  /** Vollständige, geordnete Liste (ersetzt die bisherige) */
  storyIds: z.array(z.string().min(1)).min(1, "Ein Highlight braucht mindestens eine Story").max(HIGHLIGHT_MAX_ITEMS).optional(),
  coverStoryId: z.string().min(1).nullable().optional(),
});

/** Längste Anzeigedauer eines Fotos bzw. einer Text-Story (Sekunden). */
export const STORY_READ_MAX_SECONDS = 15;

/**
 * Wie lange eine Story angezeigt wird (Sekunden): Videos ihre Länge (gedeckelt), sonst feste Zeit plus
 * Lesezeit. `elementText` ist der Text der gestalteten Ebenen (`storyLayoutText`).
 */
export function storyDurationSeconds(s: { kind: "MEDIA" | "TEXT"; isVideo?: boolean; durationMs?: number | null; text?: string; elementText?: string }) {
  if (s.kind === "MEDIA" && s.isVideo) {
    const sec = (s.durationMs ?? 0) / 1000;
    return sec > 0 ? Math.min(sec, STORY_VIDEO_MAX_SECONDS) : 15;
  }
  // Längere Texte bekommen etwas mehr Zeit (ca. 15 Zeichen pro Sekunde) – Bildunterschrift bzw. Text der Text-Story
  const base = Math.max(STORY_IMAGE_SECONDS, Math.round((s.text ?? "").length / 15));
  const extra = (s.elementText ?? "").length;
  // Textebenen: +1 s je angefangene 60 Zeichen; insgesamt höchstens 15 s
  return Math.min(STORY_READ_MAX_SECONDS, base + Math.ceil(extra / 60));
}
