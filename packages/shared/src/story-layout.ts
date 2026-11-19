import { z } from "zod";

/**
 * Gestaltung einer Story (Story-Editor): frei platzierte Ebenen über Foto, Video oder Text-Fläche.
 *
 * Koordinaten sind relativ zur 9:16-Bühne: `x` 0–1 der Breite, `y` 0–1 der Höhe (Mittelpunkt des
 * Elements). Grössen (Schrift, Strichstärke) beziehen sich auf die Bühnenbreite – so sieht eine
 * Story im Editor, im Betrachter und als Miniatur gleich aus. Alles ist streng begrenzt: das Layout
 * ist Nutzerinhalt und wird nur als Text bzw. als SVG-Pfad aus geprüften Zahlen dargestellt.
 */

export const STORY_LAYOUT_VERSION = 1;
export const STORY_ELEMENTS_MAX = 20;
export const STORY_LAYOUT_MAX_BYTES = 32_768;
export const STORY_ELEMENT_TEXT_MAX = 120;
export const STORY_TIME_TEXT_MAX = 40;
export const STORY_STROKES_MAX = 60;
export const STORY_POINTS_MAX = 4000;
export const STORY_SCALE_MIN = 0.3;
export const STORY_SCALE_MAX = 4;
export const STORY_ROTATION_MAX = 180;
export const STORY_Z_MAX = 1000;
/** Strichstärke als Anteil der Bühnenbreite */
export const STORY_STROKE_WIDTH_MIN = 0.004;
export const STORY_STROKE_WIDTH_MAX = 0.08;
/** Höhe der Bühne in Breiten-Einheiten (9:16) */
export const STORY_STAGE_RATIO = 16 / 9;

/**
 * Farben für Text, Pillen, Striche. `fg` ist die Schriftfarbe auf dieser Farbe als Fläche („Pille“) –
 * je Paar mindestens 4,5:1 Kontrast (WCAG AA, geprüft im Test).
 */
export const STORY_ELEMENT_COLORS = {
  white: { label: "Weiss", hex: "#FFFFFF", fg: "#262427" },
  ink: { label: "Tinte", hex: "#262427", fg: "#FFFFFF" },
  coral: { label: "Koralle", hex: "#B64B3A", fg: "#FFFFFF" },
  rose: { label: "Rosé", hex: "#F6E5E0", fg: "#7A2E22" },
  sun: { label: "Sonne", hex: "#F2C230", fg: "#262427" },
  ochre: { label: "Ocker", hex: "#C29A3E", fg: "#262427" },
  sage: { label: "Salbei", hex: "#4F7A55", fg: "#FFFFFF" },
  slate: { label: "Schiefer", hex: "#4F6475", fg: "#FFFFFF" },
  plum: { label: "Pflaume", hex: "#6E4E64", fg: "#FFFFFF" },
} as const;
export type StoryColor = keyof typeof STORY_ELEMENT_COLORS;
export const STORY_COLOR_KEYS = Object.keys(STORY_ELEMENT_COLORS) as StoryColor[];

export const STORY_TEXT_STYLES = ["normal", "bold", "caps", "pill"] as const;
export type StoryTextStyle = (typeof STORY_TEXT_STYLES)[number];
export const STORY_TEXT_STYLE_LABEL: Record<StoryTextStyle, string> = { normal: "Normal", bold: "Fett", caps: "Versalien", pill: "Fläche" };

export const STORY_TEXT_ALIGNS = ["left", "center", "right"] as const;
export type StoryTextAlign = (typeof STORY_TEXT_ALIGNS)[number];
export const STORY_TEXT_ALIGN_LABEL: Record<StoryTextAlign, string> = { left: "Linksbündig", center: "Zentriert", right: "Rechtsbündig" };

/**
 * Filter als CSS-`filter`-Funktionen: [Funktion, Neutralwert, Zielwert, Einheit]. Die Intensität
 * (0–100) blendet linear vom Neutral- zum Zielwert – gleich für Bild und Video, nicht destruktiv.
 */
type FilterStep = readonly [fn: "brightness" | "contrast" | "saturate" | "sepia" | "grayscale" | "hue-rotate", neutral: number, target: number, unit: "" | "deg"];
export const STORY_FILTERS = {
  original: { label: "Original", steps: [] as readonly FilterStep[] },
  warm: { label: "Warm", steps: [["sepia", 0, 0.3, ""], ["saturate", 1, 1.25, ""], ["hue-rotate", 0, -8, "deg"]] as readonly FilterStep[] },
  cool: { label: "Kühl", steps: [["hue-rotate", 0, 12, "deg"], ["saturate", 1, 1.1, ""], ["brightness", 1, 1.03, ""]] as readonly FilterStep[] },
  mono: { label: "Schwarzweiss", steps: [["grayscale", 0, 1, ""], ["contrast", 1, 1.1, ""]] as readonly FilterStep[] },
  contrast: { label: "Kontrast", steps: [["contrast", 1, 1.35, ""], ["saturate", 1, 1.1, ""]] as readonly FilterStep[] },
  faded: { label: "Verblasst", steps: [["contrast", 1, 0.8, ""], ["brightness", 1, 1.1, ""], ["saturate", 1, 0.7, ""]] as readonly FilterStep[] },
  sepia: { label: "Sepia", steps: [["sepia", 0, 0.85, ""], ["contrast", 1, 1.05, ""]] as readonly FilterStep[] },
  vivid: { label: "Lebendig", steps: [["saturate", 1, 1.6, ""], ["contrast", 1, 1.1, ""]] as readonly FilterStep[] },
} as const;
export type StoryFilter = keyof typeof STORY_FILTERS;
export const STORY_FILTER_KEYS = Object.keys(STORY_FILTERS) as StoryFilter[];

/** CSS-`filter` für einen Filter bei gegebener Intensität (0–100); `undefined` = keiner. */
export function storyFilterCss(filter: StoryFilter | null | undefined, intensity = 100): string | undefined {
  const f = filter ? STORY_FILTERS[filter] : null;
  if (!f || !f.steps.length) return undefined;
  const t = Math.min(100, Math.max(0, Number.isFinite(intensity) ? intensity : 100)) / 100;
  if (t === 0) return undefined;
  return f.steps.map(([fn, from, to, unit]) => `${fn}(${round(from + (to - from) * t, 3)}${unit})`).join(" ");
}

/**
 * Sticker-Emojis: feste, kuratierte Auswahl (Werkstatt, Natur, Reaktionen). Keine freie Eingabe –
 * so bleibt der Inhalt prüfbar und überall gleich darstellbar.
 */
export const STORY_EMOJIS = [
  "🧶", "🪡", "🧵", "✂️", "🪚", "🔨", "🪛", "🔧", "🪵", "🧰",
  "🎨", "🖌️", "🖍️", "📐", "📏", "📌", "💡", "🪴", "🌿", "🌱",
  "🌸", "🌻", "🍂", "🏡", "☕", "🍪", "❤️", "🧡", "💛", "💚",
  "💙", "💜", "🤍", "✨", "⭐", "🔥", "👍", "👏", "🙌", "🎉",
  "✅", "😊", "😍", "🤩", "😅", "🤔",
] as const;
export type StoryEmoji = (typeof STORY_EMOJIS)[number];

// ───────────────────────── Schema ─────────────────────────

const unit = z.number().finite().min(0).max(1);
const elementBase = {
  id: z.string().regex(/^[a-z0-9]{1,12}$/, "Ungültige Kennung"),
  x: unit,
  y: unit,
  scale: z.number().finite().min(STORY_SCALE_MIN).max(STORY_SCALE_MAX),
  rotation: z.number().finite().min(-STORY_ROTATION_MAX).max(STORY_ROTATION_MAX),
  z: z.number().int().min(0).max(STORY_Z_MAX),
};
const color = z.enum(STORY_COLOR_KEYS as [StoryColor, ...StoryColor[]]);
const textStyle = z.enum(STORY_TEXT_STYLES);
const align = z.enum(STORY_TEXT_ALIGNS);

const textElement = z.object({ ...elementBase, type: z.literal("text"), text: z.string().trim().min(1).max(STORY_ELEMENT_TEXT_MAX), color, style: textStyle, align }).strict();
const emojiElement = z.object({ ...elementBase, type: z.literal("emoji"), emoji: z.enum(STORY_EMOJIS) }).strict();
const mentionElement = z
  .object({
    ...elementBase,
    type: z.literal("mention"),
    handle: z.string().regex(/^[a-z0-9._]{3,24}$/, "Ungültiger Benutzername"),
    color,
    /** Vom Server beim Erstellen aufgelöst; Eingaben werden überschrieben */
    userId: z.string().min(1).max(40).optional(),
  })
  .strict();
const projectLinkElement = z.object({ ...elementBase, type: z.literal("projectLink"), projectId: z.string().min(1).max(40), color }).strict();
const timeElement = z.object({ ...elementBase, type: z.literal("time"), text: z.string().trim().min(1).max(STORY_TIME_TEXT_MAX), variant: z.enum(["time", "date"]), color }).strict();
const stroke = z
  .object({
    tool: z.enum(["pen", "marker"]),
    color,
    width: z.number().finite().min(STORY_STROKE_WIDTH_MIN).max(STORY_STROKE_WIDTH_MAX),
    /** Punktfolge x0, y0, x1, y1 … (0–1, relativ zu Breite bzw. Höhe der Bühne) */
    points: z.array(unit).min(2).max(STORY_POINTS_MAX * 2),
  })
  .strict()
  .refine((s) => s.points.length % 2 === 0, { message: "Unvollständiger Punkt" });
const drawingElement = z.object({ ...elementBase, type: z.literal("drawing"), strokes: z.array(stroke).min(1).max(STORY_STROKES_MAX) }).strict();

export const storyElementSchema = z.discriminatedUnion("type", [textElement, emojiElement, mentionElement, projectLinkElement, timeElement, drawingElement]);
export type StoryElement = z.infer<typeof storyElementSchema>;
export type StoryElementType = StoryElement["type"];
export type StoryStroke = z.infer<typeof stroke>;

export const storyLayoutSchema = z
  .object({
    version: z.literal(STORY_LAYOUT_VERSION),
    media: z.object({ filter: z.enum(STORY_FILTER_KEYS as [StoryFilter, ...StoryFilter[]]), intensity: z.number().finite().min(0).max(100) }).strict().optional(),
    text: z.object({ style: textStyle, align, scale: z.number().finite().min(0.5).max(2) }).strict().optional(),
    elements: z.array(storyElementSchema).max(STORY_ELEMENTS_MAX, `Höchstens ${STORY_ELEMENTS_MAX} Elemente`),
  })
  .strict()
  .superRefine((l, ctx) => {
    const ids = new Set<string>();
    let strokes = 0;
    let points = 0;
    l.elements.forEach((e, i) => {
      if (ids.has(e.id)) ctx.addIssue({ code: "custom", path: ["elements", i, "id"], message: "Doppelte Kennung" });
      ids.add(e.id);
      if (e.type === "drawing") {
        strokes += e.strokes.length;
        for (const s of e.strokes) points += s.points.length / 2;
      }
    });
    if (strokes > STORY_STROKES_MAX) ctx.addIssue({ code: "custom", path: ["elements"], message: `Höchstens ${STORY_STROKES_MAX} Striche` });
    if (points > STORY_POINTS_MAX) ctx.addIssue({ code: "custom", path: ["elements"], message: `Zeichnung zu detailliert (höchstens ${STORY_POINTS_MAX} Punkte)` });
    if (storyLayoutBytes(l) > STORY_LAYOUT_MAX_BYTES) ctx.addIssue({ code: "custom", path: [], message: "Die Gestaltung ist zu umfangreich" });
  });
export type StoryLayout = z.infer<typeof storyLayoutSchema>;

/** Grösse des Layouts in Bytes (UTF-8 des JSON), wie es gespeichert wird. */
export function storyLayoutBytes(layout: unknown) {
  return new TextEncoder().encode(JSON.stringify(layout)).length;
}

/** Gespeichertes Layout lesen – ungültiger oder fremder Altbestand ergibt `null` (statt eines Fehlers). */
export function parseStoryLayout(raw: unknown): StoryLayout | null {
  if (raw == null) return null;
  const r = storyLayoutSchema.safeParse(raw);
  return r.success ? r.data : null;
}

/** Ist das Layout leer (nichts zu speichern)? */
export function isEmptyStoryLayout(l: StoryLayout | null | undefined) {
  if (!l) return true;
  const filter = l.media && l.media.filter !== "original" && l.media.intensity > 0;
  const text = l.text && (l.text.style !== "bold" || l.text.align !== "center" || l.text.scale !== 1);
  return !l.elements.length && !filter && !text;
}

/** Sichtbarer Text der Ebenen (Text, Erwähnungen, Datum/Uhrzeit) – für Lesezeit, Moderation und Suche. */
export function storyLayoutText(l: Pick<StoryLayout, "elements"> | null | undefined) {
  if (!l) return "";
  return [...l.elements]
    .sort((a, b) => a.z - b.z)
    .map((e) => (e.type === "text" || e.type === "time" ? e.text : e.type === "mention" ? `@${e.handle}` : ""))
    .filter(Boolean)
    .join("\n");
}

// ───────────────────────── Zeichnen ─────────────────────────

function round(n: number, digits: number) {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}

/** Abstand eines Punkts zur Strecke a–b (im Seitenverhältnis der Bühne, damit die Toleranz überall gleich wirkt). */
function segmentDistance(p: readonly [number, number], a: readonly [number, number], b: readonly [number, number]) {
  const [px, py] = [p[0], p[1] * STORY_STAGE_RATIO];
  const [ax, ay] = [a[0], a[1] * STORY_STAGE_RATIO];
  const [bx, by] = [b[0], b[1] * STORY_STAGE_RATIO];
  const dx = bx - ax;
  const dy = by - ay;
  const len = dx * dx + dy * dy;
  const t = len === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/**
 * Strich vereinfachen (Ramer-Douglas-Peucker, iterativ) und auf 3 Nachkommastellen runden.
 * `tolerance` in Bühnenbreiten (Standard 0,002 ≈ 1 px bei 500 px Breite). Ergebnis flach: x0, y0, x1, y1 …
 */
export function simplifyStroke(points: readonly (readonly [number, number])[], tolerance = 0.002): number[] {
  const pts = points
    .filter((p) => Number.isFinite(p[0]) && Number.isFinite(p[1]))
    .map((p) => [Math.min(1, Math.max(0, p[0])), Math.min(1, Math.max(0, p[1]))] as const);
  if (!pts.length) return [];
  const keep = new Uint8Array(pts.length);
  keep[0] = 1;
  keep[pts.length - 1] = 1;
  const stack: [number, number][] = pts.length > 2 ? [[0, pts.length - 1]] : [];
  while (stack.length) {
    const [s, e] = stack.pop()!;
    let max = 0;
    let idx = -1;
    for (let i = s + 1; i < e; i++) {
      const d = segmentDistance(pts[i]!, pts[s]!, pts[e]!);
      if (d > max) {
        max = d;
        idx = i;
      }
    }
    if (idx > 0 && max > tolerance) {
      keep[idx] = 1;
      stack.push([s, idx], [idx, e]);
    }
  }
  const out: number[] = [];
  let lastX = NaN;
  let lastY = NaN;
  pts.forEach((p, i) => {
    if (!keep[i]) return;
    const x = round(p[0], 3);
    const y = round(p[1], 3);
    // Nach dem Runden zusammenfallende Punkte nur einmal
    if (x === lastX && y === lastY) return;
    out.push(x, y);
    lastX = x;
    lastY = y;
  });
  // Ein Tippen (Punkt) bleibt als kurzer Strich sichtbar
  if (out.length === 2) out.push(out[0]!, out[1]!);
  return out;
}

/** SVG-Pfad eines Strichs im Koordinatensystem `viewBox="0 0 1 STORY_STAGE_RATIO"`. */
export function strokePath(points: readonly number[]) {
  let d = "";
  for (let i = 0; i + 1 < points.length; i += 2) {
    const x = round(points[i]!, 4);
    const y = round(points[i + 1]! * STORY_STAGE_RATIO, 4);
    d += `${i === 0 ? "M" : "L"}${x} ${y}`;
  }
  return d;
}

// ───────────────────────── Farben ─────────────────────────

function luminance(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!;
}

/** Kontrastverhältnis zweier Farben (#RRGGBB) nach WCAG 2.x. */
export function contrastRatio(a: string, b: string) {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (l1 + 0.05) / (l2 + 0.05);
}
