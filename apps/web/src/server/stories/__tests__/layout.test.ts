import { describe, expect, it } from "vitest";
import {
  STORY_ELEMENTS_MAX,
  STORY_ELEMENT_COLORS,
  STORY_COLOR_KEYS,
  STORY_FILTER_KEYS,
  STORY_IMAGE_SECONDS,
  STORY_LAYOUT_MAX_BYTES,
  STORY_POINTS_MAX,
  STORY_READ_MAX_SECONDS,
  STORY_STROKES_MAX,
  contrastRatio,
  isEmptyStoryLayout,
  parseStoryLayout,
  simplifyStroke,
  storyCreateSchema,
  storyDurationSeconds,
  storyFilterCss,
  storyLayoutBytes,
  storyLayoutSchema,
  storyLayoutText,
  strokePath,
  type StoryElement,
} from "@werkraum/shared";

const base = { x: 0.5, y: 0.5, scale: 1, rotation: 0, z: 0 };
const text = (id: string, t = "Hallo", extra: Partial<StoryElement> = {}) => ({ ...base, id, type: "text", text: t, color: "white", style: "bold", align: "center", ...extra }) as StoryElement;
const layout = (elements: unknown[], extra: Record<string, unknown> = {}) => ({ version: 1, elements, ...extra });

describe("Story-Layout (Schema)", () => {
  it("nimmt alle Elementarten an", () => {
    const l = layout([
      text("a"),
      { ...base, id: "b", type: "emoji", emoji: "🧶" },
      { ...base, id: "c", type: "mention", handle: "lena.haekelt", color: "ink" },
      { ...base, id: "d", type: "projectLink", projectId: "p1", color: "white" },
      { ...base, id: "e", type: "time", text: "14:05", variant: "time", color: "white" },
      { ...base, id: "f", type: "drawing", strokes: [{ tool: "pen", color: "coral", width: 0.01, points: [0.1, 0.1, 0.2, 0.2] }] },
    ], { media: { filter: "warm", intensity: 60 }, text: { style: "pill", align: "left", scale: 1.2 } });
    expect(storyLayoutSchema.safeParse(l).success).toBe(true);
  });

  it("lehnt unbekannte Felder, Typen und Werte ab", () => {
    expect(storyLayoutSchema.safeParse(layout([{ ...text("a"), href: "https://x" }])).success).toBe(false);
    expect(storyLayoutSchema.safeParse(layout([], { html: "<b>" })).success).toBe(false);
    expect(storyLayoutSchema.safeParse(layout([{ ...base, id: "a", type: "link", url: "https://x" }])).success).toBe(false);
    expect(storyLayoutSchema.safeParse(layout([{ ...base, id: "a", type: "emoji", emoji: "💩" }])).success).toBe(false);
    expect(storyLayoutSchema.safeParse(layout([text("a", "x", { color: "#ff0000" as never })])).success).toBe(false);
    expect(storyLayoutSchema.safeParse({ version: 2, elements: [] }).success).toBe(false);
  });

  it("begrenzt Position, Skalierung, Drehung, Ebene und Text", () => {
    expect(storyLayoutSchema.safeParse(layout([text("a", "x", { x: 1.01 })])).success).toBe(false);
    expect(storyLayoutSchema.safeParse(layout([text("a", "x", { y: -0.01 })])).success).toBe(false);
    expect(storyLayoutSchema.safeParse(layout([text("a", "x", { scale: 0.29 })])).success).toBe(false);
    expect(storyLayoutSchema.safeParse(layout([text("a", "x", { scale: 4 })])).success).toBe(true);
    expect(storyLayoutSchema.safeParse(layout([text("a", "x", { rotation: 181 })])).success).toBe(false);
    expect(storyLayoutSchema.safeParse(layout([text("a", "x", { rotation: -180 })])).success).toBe(true);
    expect(storyLayoutSchema.safeParse(layout([text("a", "x", { z: 1.5 })])).success).toBe(false);
    expect(storyLayoutSchema.safeParse(layout([text("a", "x", { x: Number.NaN })])).success).toBe(false);
    expect(storyLayoutSchema.safeParse(layout([text("a", "x".repeat(121))])).success).toBe(false);
    expect(storyLayoutSchema.safeParse(layout([text("a", "   ")])).success).toBe(false);
  });

  it("Erwähnung nur mit gültigem Benutzernamen, Kennungen eindeutig", () => {
    expect(storyLayoutSchema.safeParse(layout([{ ...base, id: "a", type: "mention", handle: "Lena", color: "ink" }])).success).toBe(false);
    expect(storyLayoutSchema.safeParse(layout([{ ...base, id: "a", type: "mention", handle: "ab", color: "ink" }])).success).toBe(false);
    expect(storyLayoutSchema.safeParse(layout([text("a"), text("a")])).success).toBe(false);
    expect(storyLayoutSchema.safeParse(layout([text("A")])).success).toBe(false);
  });

  it("begrenzt Elemente, Striche, Punkte und Bytes", () => {
    const many = Array.from({ length: STORY_ELEMENTS_MAX + 1 }, (_, i) => text(`t${i}`));
    expect(storyLayoutSchema.safeParse(layout(many.slice(0, STORY_ELEMENTS_MAX))).success).toBe(true);
    expect(storyLayoutSchema.safeParse(layout(many)).success).toBe(false);

    const stroke = (n: number) => ({ tool: "pen", color: "ink", width: 0.01, points: Array.from({ length: n * 2 }, (_, i) => (i % 10) / 10) });
    const drawing = (id: string, strokes: unknown[]) => ({ ...base, id, type: "drawing", strokes });
    expect(storyLayoutSchema.safeParse(layout([drawing("d", Array.from({ length: STORY_STROKES_MAX + 1 }, () => stroke(2)))])).success).toBe(false);
    // Mehrere Zeichnungen zusammen über der Strichgrenze
    expect(storyLayoutSchema.safeParse(layout([drawing("d1", Array.from({ length: 40 }, () => stroke(2))), drawing("d2", Array.from({ length: 40 }, () => stroke(2)))])).success).toBe(false);
    expect(storyLayoutSchema.safeParse(layout([drawing("d", [stroke(STORY_POINTS_MAX + 1)])])).success).toBe(false);
    expect(storyLayoutSchema.safeParse(layout([drawing("d", [{ ...stroke(2), points: [0.1, 0.2, 0.3] }])])).success).toBe(false);

    // Bytegrenze: viele lange Texte ergeben über 32 KB nur mit Zeichnung – hier gezielt erzwungen
    const big = layout([drawing("d", Array.from({ length: 10 }, () => ({ ...stroke(390), points: Array.from({ length: 780 }, () => 0.123) })))]);
    expect(storyLayoutBytes(big)).toBeGreaterThan(STORY_LAYOUT_MAX_BYTES);
    const r = storyLayoutSchema.safeParse(big);
    expect(r.success).toBe(false);
  });

  it("Story ohne Layout bleibt gültig (ältere App-Versionen)", () => {
    expect(storyCreateSchema.safeParse({ kind: "TEXT", text: "Hallo", background: "ink" }).success).toBe(true);
    expect(storyCreateSchema.safeParse({ kind: "TEXT", text: "Hallo", background: "ink", layout: layout([text("a")]) }).success).toBe(true);
    expect(storyCreateSchema.safeParse({ kind: "TEXT", text: "Hallo", background: "ink", layout: { elements: [] } }).success).toBe(false);
  });

  it("liest Altbestand tolerant", () => {
    expect(parseStoryLayout(null)).toBeNull();
    expect(parseStoryLayout({ foo: 1 })).toBeNull();
    expect(parseStoryLayout(layout([text("a")]))?.elements).toHaveLength(1);
  });

  it("leeres Layout erkennen", () => {
    expect(isEmptyStoryLayout(null)).toBe(true);
    expect(isEmptyStoryLayout({ version: 1, elements: [] })).toBe(true);
    expect(isEmptyStoryLayout({ version: 1, elements: [], media: { filter: "original", intensity: 100 } })).toBe(true);
    expect(isEmptyStoryLayout({ version: 1, elements: [], text: { style: "bold", align: "center", scale: 1 } })).toBe(true);
    expect(isEmptyStoryLayout({ version: 1, elements: [], media: { filter: "mono", intensity: 50 } })).toBe(false);
    expect(isEmptyStoryLayout({ version: 1, elements: [], text: { style: "caps", align: "center", scale: 1 } })).toBe(false);
  });

  it("Ebenentext in Ebenenreihenfolge", () => {
    const l = storyLayoutSchema.parse(layout([text("a", "oben", { z: 2 }), { ...base, id: "m", type: "mention", handle: "mira.strickt", color: "ink", z: 1 }, { ...base, id: "e", type: "emoji", emoji: "🧶" }]));
    expect(storyLayoutText(l)).toBe("@mira.strickt\noben");
  });
});

describe("Farben und Filter", () => {
  it("jede Pille hat mindestens 4,5:1 Kontrast", () => {
    for (const k of STORY_COLOR_KEYS) {
      const c = STORY_ELEMENT_COLORS[k];
      expect(contrastRatio(c.fg, c.hex), k).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("Filter: Intensität blendet zwischen Neutral- und Zielwert", () => {
    expect(storyFilterCss("original", 100)).toBeUndefined();
    expect(storyFilterCss(null)).toBeUndefined();
    expect(storyFilterCss("mono", 0)).toBeUndefined();
    expect(storyFilterCss("mono", 100)).toBe("grayscale(1) contrast(1.1)");
    expect(storyFilterCss("mono", 50)).toBe("grayscale(0.5) contrast(1.05)");
    expect(storyFilterCss("warm", 50)).toBe("sepia(0.15) saturate(1.125) hue-rotate(-4deg)");
    expect(storyFilterCss("faded", 100)).toBe("contrast(0.8) brightness(1.1) saturate(0.7)");
    // Ausserhalb des Bereichs wird begrenzt
    expect(storyFilterCss("sepia", 250)).toBe(storyFilterCss("sepia", 100));
    expect(STORY_FILTER_KEYS).toHaveLength(8);
  });
});

describe("Striche vereinfachen", () => {
  // Leicht verrauschte Linie plus Bogen: viele Punkte, glatte Form
  const raw: [number, number][] = [];
  for (let i = 0; i <= 200; i++) {
    const t = i / 200;
    raw.push([0.1 + t * 0.8, 0.5 + Math.sin(t * Math.PI) * 0.2 + (i % 2 ? 0.0003 : -0.0003)]);
  }

  it("weniger Punkte, Form bleibt innerhalb der Toleranz", () => {
    const tol = 0.002;
    const s = simplifyStroke(raw, tol);
    expect(s.length / 2).toBeLessThan(raw.length / 4);
    expect(s.slice(0, 2)).toEqual([0.1, 0.5]);
    expect(s.slice(-2)).toEqual([0.9, 0.5]);
    // Jeder Originalpunkt liegt nahe am vereinfachten Linienzug (Toleranz + Rundung)
    const R = 16 / 9;
    const seg = (p: [number, number], a: number[], b: number[]) => {
      const [px, py, ax, ay, bx, by] = [p[0], p[1] * R, a[0]!, a[1]! * R, b[0]!, b[1]! * R];
      const dx = bx - ax, dy = by - ay;
      const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1)));
      return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
    };
    for (const p of raw) {
      let best = Infinity;
      for (let i = 0; i + 3 < s.length; i += 2) best = Math.min(best, seg(p, [s[i]!, s[i + 1]!], [s[i + 2]!, s[i + 3]!]));
      expect(best).toBeLessThan(tol + 0.002);
    }
  });

  it("rundet auf 3 Stellen, begrenzt auf die Bühne, Tippen bleibt sichtbar", () => {
    expect(simplifyStroke([[0.12345, 0.98765], [1.4, -0.2]])).toEqual([0.123, 0.988, 1, 0]);
    expect(simplifyStroke([[0.5, 0.5]])).toEqual([0.5, 0.5, 0.5, 0.5]);
    expect(simplifyStroke([[0.5, 0.5], [0.50001, 0.50001], [0.5, 0.5]])).toEqual([0.5, 0.5, 0.5, 0.5]);
    expect(simplifyStroke([[Number.NaN, 0.5], [0.2, 0.2], [0.3, 0.3]])).toEqual([0.2, 0.2, 0.3, 0.3]);
  });

  it("SVG-Pfad im 9:16-Koordinatensystem", () => {
    expect(strokePath([0, 0, 1, 1])).toBe("M0 0L1 1.7778");
  });
});

describe("Anzeigedauer mit Textebenen", () => {
  it("Foto: +1 s je angefangene 60 Zeichen, gedeckelt", () => {
    expect(storyDurationSeconds({ kind: "MEDIA", text: "", elementText: "" })).toBe(STORY_IMAGE_SECONDS);
    expect(storyDurationSeconds({ kind: "MEDIA", text: "", elementText: "x".repeat(60) })).toBe(STORY_IMAGE_SECONDS + 1);
    expect(storyDurationSeconds({ kind: "MEDIA", text: "", elementText: "x".repeat(61) })).toBe(STORY_IMAGE_SECONDS + 2);
    expect(storyDurationSeconds({ kind: "MEDIA", text: "", elementText: "x".repeat(2000) })).toBe(STORY_READ_MAX_SECONDS);
  });
  it("Text-Story und Video", () => {
    expect(storyDurationSeconds({ kind: "TEXT", text: "x".repeat(150), elementText: "x".repeat(120) })).toBe(12);
    expect(storyDurationSeconds({ kind: "MEDIA", isVideo: true, durationMs: 9_500, elementText: "x".repeat(500) })).toBe(9.5);
  });
});

describe("Haupttext als Fläche", () => {
  it("Hintergrundpaare der Text-Story taugen auch umgekehrt (Fläche in Schriftfarbe)", async () => {
    const { STORY_BACKGROUNDS } = await import("@werkraum/shared");
    for (const [k, b] of Object.entries(STORY_BACKGROUNDS)) expect(contrastRatio(b.bg, b.fg), k).toBeGreaterThanOrEqual(4.5);
  });
});

describe("Hintergrund hinter Textebenen", () => {
  it("abgedunkelt oder Palettenfarbe, sonst nichts", () => {
    expect(storyLayoutSchema.safeParse(layout([text("a", "Hallo", { bg: "shade" } as never)])).success).toBe(true);
    expect(storyLayoutSchema.safeParse(layout([text("a", "Hallo", { bg: "coral" } as never)])).success).toBe(true);
    expect(storyLayoutSchema.safeParse(layout([text("a", "Hallo", { bg: "#000" } as never)])).success).toBe(false);
    expect(storyLayoutSchema.safeParse(layout([{ ...base, id: "e", type: "emoji", emoji: "🧶", bg: "shade" }])).success).toBe(false);
  });
  it("lesbare Schrift je Fläche", async () => {
    const { readableTextColor, STORY_BACKGROUNDS } = await import("@werkraum/shared");
    expect(readableTextColor(STORY_BACKGROUNDS.paper.bg)).toBe("ink");
    expect(readableTextColor(STORY_BACKGROUNDS.ink.bg)).toBe("white");
    expect(readableTextColor(STORY_ELEMENT_COLORS.sun.hex)).toBe("ink");
    // Jede Palettenfarbe als Fläche hat mit der vorgeschlagenen Schrift mindestens 4,5:1
    for (const k of STORY_COLOR_KEYS) {
      const fg = STORY_ELEMENT_COLORS[readableTextColor(STORY_ELEMENT_COLORS[k].hex)].hex;
      expect(contrastRatio(fg, STORY_ELEMENT_COLORS[k].hex), k).toBeGreaterThanOrEqual(4.5);
    }
  });
});
