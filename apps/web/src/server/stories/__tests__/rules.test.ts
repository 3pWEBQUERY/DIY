import { describe, expect, it } from "vitest";
import {
  STORY_BACKGROUNDS,
  STORY_CAPTION_MAX,
  STORY_IMAGE_SECONDS,
  STORY_VIDEO_MAX_SECONDS,
  highlightCreateSchema,
  highlightUpdateSchema,
  storyCreateSchema,
  storyDurationSeconds,
  storyReplySchema,
} from "@werkraum/shared";
import { toStoryRef } from "../ref";

describe("Story erstellen (Schema)", () => {
  it("Foto/Video braucht ein Medium", () => {
    expect(storyCreateSchema.safeParse({ kind: "MEDIA" }).success).toBe(false);
    const ok = storyCreateSchema.parse({ kind: "MEDIA", media: { id: "m1" }, text: "  Zugeschnitten  " });
    expect(ok.text).toBe("Zugeschnitten");
    expect(ok.visibility).toBe("PUBLIC");
  });
  it("Bildunterschrift ist kürzer als der Text einer Text-Story", () => {
    const long = "x".repeat(STORY_CAPTION_MAX + 1);
    expect(storyCreateSchema.safeParse({ kind: "MEDIA", media: { id: "m1" }, text: long }).success).toBe(false);
    expect(storyCreateSchema.safeParse({ kind: "TEXT", text: long, background: "ink" }).success).toBe(true);
  });
  it("Text-Story braucht Text und einen Hintergrund aus der Palette", () => {
    expect(storyCreateSchema.safeParse({ kind: "TEXT", text: "", background: "ink" }).success).toBe(false);
    expect(storyCreateSchema.safeParse({ kind: "TEXT", text: "Hallo" }).success).toBe(false);
    expect(storyCreateSchema.safeParse({ kind: "TEXT", text: "Hallo", background: "neon" }).success).toBe(false);
    expect(storyCreateSchema.safeParse({ kind: "TEXT", text: "Hallo", background: "sage" }).success).toBe(true);
  });
  it("Stories sind öffentlich oder nur für Follower – nie privat", () => {
    expect(storyCreateSchema.safeParse({ kind: "TEXT", text: "a", background: "ink", visibility: "PRIVATE" }).success).toBe(false);
    expect(storyCreateSchema.safeParse({ kind: "TEXT", text: "a", background: "ink", visibility: "FOLLOWERS" }).success).toBe(true);
  });
  it("Palette: jede Farbe mit Vorder- und Hintergrund als Hex", () => {
    for (const b of Object.values(STORY_BACKGROUNDS)) {
      expect(b.bg).toMatch(/^#[0-9A-F]{6}$/i);
      expect(b.fg).toMatch(/^#[0-9A-F]{6}$/i);
    }
  });
});

describe("Anzeigedauer", () => {
  it("Videos laufen so lange sie sind, höchstens bis zur Obergrenze", () => {
    expect(storyDurationSeconds({ kind: "MEDIA", isVideo: true, durationMs: 9_500 })).toBe(9.5);
    expect(storyDurationSeconds({ kind: "MEDIA", isVideo: true, durationMs: 90_000 })).toBe(STORY_VIDEO_MAX_SECONDS);
    expect(storyDurationSeconds({ kind: "MEDIA", isVideo: true, durationMs: null })).toBe(15);
  });
  it("Fotos und kurze Texte: feste Zeit; lange Texte etwas länger, gedeckelt", () => {
    expect(storyDurationSeconds({ kind: "MEDIA", text: "" })).toBe(STORY_IMAGE_SECONDS);
    expect(storyDurationSeconds({ kind: "TEXT", text: "Kurz." })).toBe(STORY_IMAGE_SECONDS);
    expect(storyDurationSeconds({ kind: "TEXT", text: "x".repeat(150) })).toBe(10);
    expect(storyDurationSeconds({ kind: "TEXT", text: "x".repeat(500) })).toBe(15);
  });
});

describe("Antworten und Highlights", () => {
  it("leere Antworten werden abgelehnt", () => {
    expect(storyReplySchema.safeParse({ body: "   " }).success).toBe(false);
    expect(storyReplySchema.parse({ body: " Schön! " }).body).toBe("Schön!");
  });
  it("Highlight braucht Namen und mindestens eine Story", () => {
    expect(highlightCreateSchema.safeParse({ title: "", storyIds: ["a"] }).success).toBe(false);
    expect(highlightCreateSchema.safeParse({ title: "Werkstatt", storyIds: [] }).success).toBe(false);
    expect(highlightCreateSchema.safeParse({ title: "x".repeat(31), storyIds: ["a"] }).success).toBe(false);
    expect(highlightCreateSchema.safeParse({ title: "Werkstatt", storyIds: ["a", "b"] }).success).toBe(true);
    expect(highlightUpdateSchema.safeParse({ storyIds: [] }).success).toBe(false);
    expect(highlightUpdateSchema.safeParse({ coverStoryId: null }).success).toBe(true);
  });
});

describe("Story-Bezug in Nachrichten", () => {
  const base = {
    id: "s1",
    kind: "MEDIA" as const,
    text: "",
    background: null,
    state: "PUBLISHED" as const,
    author: { profile: { handle: "sophie.naeht" } },
    media: { kind: "IMAGE" as const, state: "READY" as const, variants: { sm: "/media/m/s1/sm.webp", lg: "/media/m/s1/lg.webp" } },
  };
  it("zeigt die Vorschau, solange die Story läuft", () => {
    const r = toStoryRef({ ...base, expiresAt: new Date(Date.now() + 3600_000) });
    expect(r).toMatchObject({ id: "s1", available: true, thumb: "/media/m/s1/sm.webp", ownerHandle: "sophie.naeht" });
  });
  it("abgelaufen oder moderiert: kein Bild mehr", () => {
    expect(toStoryRef({ ...base, expiresAt: new Date(Date.now() - 1000) })).toMatchObject({ available: false, thumb: null });
    expect(toStoryRef({ ...base, state: "HIDDEN", expiresAt: new Date(Date.now() + 3600_000) })).toMatchObject({ available: false, thumb: null });
    expect(toStoryRef(null)).toBeNull();
  });
});
