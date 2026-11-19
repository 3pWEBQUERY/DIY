import {
  STORY_ELEMENTS_MAX,
  STORY_POINTS_MAX,
  STORY_ROTATION_MAX,
  STORY_SCALE_MAX,
  STORY_SCALE_MIN,
  STORY_STAGE_RATIO,
  STORY_STROKES_MAX,
  STORY_Z_MAX,
  isEmptyStoryLayout,
  storyLayoutSchema,
  type StoryColor,
  type StoryElement,
  type StoryFilter,
  type StoryLayout,
  type StoryStroke,
  type StoryTextAlign,
  type StoryTextBg,
  type StoryTextStyle,
} from "@werkraum/shared";

/**
 * Zustand des Story-Editors als reiner Reducer (testbar ohne Browser): das Layout, die Auswahl und ein
 * Verlauf für Rückgängig/Wiederholen. Gesten und Tippen fassen viele kleine Änderungen zu einem
 * Verlaufsschritt zusammen (`coalesce`), damit „Rückgängig“ eine ganze Bewegung zurücknimmt.
 */

export const HISTORY_MAX = 100;

/** Element ohne Kennung und Ebene – beides vergibt der Reducer */
export type NewElement = StoryElement extends infer E ? (E extends StoryElement ? Omit<E, "id" | "z"> : never) : never;
export type ElementPatch = Partial<{ x: number; y: number; scale: number; rotation: number; text: string; color: StoryColor; style: StoryTextStyle; align: StoryTextAlign; bg: StoryTextBg | null }>;

export type EditorState = {
  layout: StoryLayout;
  past: StoryLayout[];
  future: StoryLayout[];
  selected: string | null;
  /** Zähler für neue Kennungen (bleibt über Rückgängig hinweg eindeutig) */
  seq: number;
  /** Schlüssel der zuletzt zusammengefassten Änderung (null = nächste Änderung ist ein neuer Schritt) */
  coalesce: string | null;
  /** Letzte Meldung für die Live-Region (Screenreader) */
  notice: { text: string; n: number } | null;
};

export type EditorAction =
  | { type: "add"; element: NewElement }
  | { type: "update"; id: string; patch: ElementPatch; coalesce?: string }
  | { type: "remove"; id: string }
  | { type: "select"; id: string | null }
  | { type: "reorder"; id: string; to: "forward" | "backward" | "front" | "back" }
  /** Strich zur Zeichnung `drawingId` hinzufügen; gibt es sie nicht, entsteht sie mit genau dieser Kennung (`nextElementId`) */
  | { type: "addStroke"; drawingId: string; stroke: StoryStroke }
  | { type: "removeStrokes"; hits: { id: string; index: number }[] }
  | { type: "setFilter"; filter: StoryFilter; intensity: number; coalesce?: string }
  | { type: "setTextLook"; look: Partial<NonNullable<StoryLayout["text"]>>; coalesce?: string }
  | { type: "undo" }
  | { type: "redo" }
  | { type: "endCoalesce" }
  | { type: "reset"; layout?: StoryLayout };

export const EMPTY_LAYOUT: StoryLayout = { version: 1, elements: [] };
export const DEFAULT_TEXT_LOOK = { style: "bold", align: "center", scale: 1 } as const;

/** Kennung, die das nächste neue Element bekommt */
export function nextElementId(state: Pick<EditorState, "seq">) {
  return (state.seq + 1).toString(36);
}

export function initialEditorState(layout: StoryLayout = EMPTY_LAYOUT): EditorState {
  return { layout, past: [], future: [], selected: null, seq: layout.elements.length, coalesce: null, notice: null };
}

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, Number.isFinite(v) ? v : min));
/** Drehung auf −180…180 Grad */
export function normalizeRotation(deg: number) {
  if (!Number.isFinite(deg)) return 0;
  let r = ((((deg + 180) % 360) + 360) % 360) - 180;
  if (r === -180 && deg > 0) r = 180;
  return Math.round(r * 10) / 10;
}
const r4 = (v: number) => Math.round(v * 10_000) / 10_000;

/** Ebenen fortlaufend 0…n−1 durchnummerieren (Reihenfolge bleibt) */
function renumber(elements: StoryElement[]): StoryElement[] {
  const order = [...elements].sort((a, b) => a.z - b.z).map((e) => e.id);
  return elements.map((e) => ({ ...e, z: order.indexOf(e.id) }));
}

export function strokeTotals(layout: StoryLayout) {
  let strokes = 0;
  let points = 0;
  for (const e of layout.elements) if (e.type === "drawing") for (const s of e.strokes) {
    strokes++;
    points += s.points.length / 2;
  }
  return { strokes, points };
}

export const ELEMENT_LABEL: Record<StoryElement["type"], string> = {
  text: "Text",
  emoji: "Sticker",
  mention: "Erwähnung",
  projectLink: "Projekt-Link",
  time: "Uhrzeit",
  drawing: "Zeichnung",
};

/** Kurze Beschreibung eines Elements (Ebenenliste, Screenreader) */
export function describeElement(e: StoryElement) {
  switch (e.type) {
    case "text":
      return e.text.trim() ? `Text „${e.text.trim().slice(0, 30)}${e.text.trim().length > 30 ? "…" : ""}“` : "Text (leer)";
    case "emoji":
      return `Sticker ${e.emoji}`;
    case "mention":
      return `Erwähnung @${e.handle}`;
    case "projectLink":
      return "Projekt-Link";
    case "time":
      return e.variant === "time" ? `Uhrzeit ${e.text}` : `Datum ${e.text}`;
    case "drawing":
      return `Zeichnung (${e.strokes.length} ${e.strokes.length === 1 ? "Strich" : "Striche"})`;
  }
}

function say(state: EditorState, text: string): EditorState["notice"] {
  return { text, n: (state.notice?.n ?? 0) + 1 };
}

/** Neue Fassung übernehmen: Verlauf schreiben (ausser beim Zusammenfassen), Wiederholen verwerfen */
function commit(state: EditorState, layout: StoryLayout, opts: { coalesce?: string | null; selected?: string | null; notice?: string; seq?: number } = {}): EditorState {
  const merge = !!opts.coalesce && opts.coalesce === state.coalesce;
  const past = merge ? state.past : [...state.past, state.layout].slice(-HISTORY_MAX);
  return {
    ...state,
    layout,
    past,
    future: [],
    selected: opts.selected === undefined ? state.selected : opts.selected,
    seq: opts.seq ?? state.seq,
    coalesce: opts.coalesce ?? null,
    notice: opts.notice ? say(state, opts.notice) : state.notice,
  };
}

function patchElement(e: StoryElement, p: ElementPatch): StoryElement {
  const next = { ...e } as Record<string, unknown>;
  if (p.x !== undefined) next.x = r4(clamp(p.x, 0, 1));
  if (p.y !== undefined) next.y = r4(clamp(p.y, 0, 1));
  if (p.scale !== undefined) next.scale = r4(clamp(p.scale, STORY_SCALE_MIN, STORY_SCALE_MAX));
  if (p.rotation !== undefined) next.rotation = normalizeRotation(clamp(p.rotation, -10_000, 10_000));
  if (p.text !== undefined && (e.type === "text" || e.type === "time")) next.text = p.text;
  if (p.color !== undefined && "color" in e) next.color = p.color;
  if (p.style !== undefined && e.type === "text") next.style = p.style;
  if (p.align !== undefined && e.type === "text") next.align = p.align;
  if (p.bg !== undefined && e.type === "text") {
    if (p.bg === null) delete next.bg;
    else next.bg = p.bg;
  }
  return next as StoryElement;
}

export function editorReducer(state: EditorState, action: EditorAction): EditorState {
  const els = state.layout.elements;
  switch (action.type) {
    case "add": {
      if (els.length >= STORY_ELEMENTS_MAX) return { ...state, notice: say(state, `Höchstens ${STORY_ELEMENTS_MAX} Elemente pro Story.`) };
      const id = nextElementId(state);
      const z = els.length ? Math.max(...els.map((e) => e.z)) + 1 : 0;
      const element = { ...action.element, id, z: Math.min(z, STORY_Z_MAX) } as StoryElement;
      const layout = { ...state.layout, elements: renumber([...els, element]) };
      return commit(state, layout, { selected: id, seq: state.seq + 1, notice: `${ELEMENT_LABEL[element.type]} hinzugefügt` });
    }
    case "update": {
      const i = els.findIndex((e) => e.id === action.id);
      if (i < 0) return state;
      const next = patchElement(els[i]!, action.patch);
      const elements = els.map((e, j) => (j === i ? next : e));
      return commit(state, { ...state.layout, elements }, { coalesce: action.coalesce ?? null });
    }
    case "remove": {
      const e = els.find((x) => x.id === action.id);
      if (!e) return state;
      const elements = renumber(els.filter((x) => x.id !== action.id));
      return commit(state, { ...state.layout, elements }, { selected: state.selected === action.id ? null : state.selected, notice: `${ELEMENT_LABEL[e.type]} gelöscht` });
    }
    case "select":
      if (action.id !== null && !els.some((e) => e.id === action.id)) return state;
      return { ...state, selected: action.id, coalesce: null };
    case "reorder": {
      const order = [...els].sort((a, b) => a.z - b.z).map((e) => e.id);
      const from = order.indexOf(action.id);
      if (from < 0) return state;
      const to = action.to === "front" ? order.length - 1 : action.to === "back" ? 0 : action.to === "forward" ? Math.min(order.length - 1, from + 1) : Math.max(0, from - 1);
      if (to === from) return { ...state, notice: say(state, action.to === "forward" || action.to === "front" ? "Schon ganz vorne" : "Schon ganz hinten") };
      order.splice(from, 1);
      order.splice(to, 0, action.id);
      const elements = els.map((e) => ({ ...e, z: order.indexOf(e.id) }));
      return commit(state, { ...state.layout, elements }, { notice: to > from ? "Weiter nach vorne" : "Weiter nach hinten" });
    }
    case "addStroke": {
      const totals = strokeTotals(state.layout);
      const pts = action.stroke.points.length / 2;
      if (totals.strokes + 1 > STORY_STROKES_MAX) return { ...state, notice: say(state, `Höchstens ${STORY_STROKES_MAX} Striche pro Story.`) };
      if (totals.points + pts > STORY_POINTS_MAX) return { ...state, notice: say(state, "Die Zeichnung ist zu detailliert – lösche ein paar Striche.") };
      const target = els.find((e) => e.id === action.drawingId);
      if (target && target.type === "drawing") {
        const elements = els.map((e) => (e.id === target.id && e.type === "drawing" ? { ...e, strokes: [...e.strokes, action.stroke] } : e));
        return commit(state, { ...state.layout, elements });
      }
      if (target) return state;
      if (els.length >= STORY_ELEMENTS_MAX) return { ...state, notice: say(state, `Höchstens ${STORY_ELEMENTS_MAX} Elemente pro Story.`) };
      const id = nextElementId(state);
      const z = els.length ? Math.max(...els.map((e) => e.z)) + 1 : 0;
      const drawing: StoryElement = { id, type: "drawing", x: 0.5, y: 0.5, scale: 1, rotation: 0, z, strokes: [action.stroke] };
      return commit(state, { ...state.layout, elements: renumber([...els, drawing]) }, { seq: state.seq + 1 });
    }
    case "removeStrokes": {
      if (!action.hits.length) return state;
      const remove = new Map<string, Set<number>>();
      for (const h of action.hits) remove.set(h.id, (remove.get(h.id) ?? new Set()).add(h.index));
      const elements = renumber(
        els.flatMap((e) => {
          if (e.type !== "drawing" || !remove.has(e.id)) return [e];
          const strokes = e.strokes.filter((_, i) => !remove.get(e.id)!.has(i));
          return strokes.length ? [{ ...e, strokes }] : [];
        }),
      );
      const n = action.hits.length;
      return commit(state, { ...state.layout, elements }, { selected: elements.some((e) => e.id === state.selected) ? state.selected : null, notice: n === 1 ? "Strich gelöscht" : `${n} Striche gelöscht` });
    }
    case "setFilter":
      return commit(state, { ...state.layout, media: { filter: action.filter, intensity: Math.round(clamp(action.intensity, 0, 100)) } }, { coalesce: action.coalesce ?? null });
    case "setTextLook": {
      const cur = state.layout.text ?? DEFAULT_TEXT_LOOK;
      const next = { ...cur, ...action.look };
      return commit(state, { ...state.layout, text: { style: next.style, align: next.align, scale: r4(clamp(next.scale, 0.5, 2)) } }, { coalesce: action.coalesce ?? null });
    }
    case "undo": {
      const prev = state.past.at(-1);
      if (!prev) return { ...state, notice: say(state, "Nichts rückgängig zu machen") };
      return {
        ...state,
        layout: prev,
        past: state.past.slice(0, -1),
        future: [state.layout, ...state.future].slice(0, HISTORY_MAX),
        selected: prev.elements.some((e) => e.id === state.selected) ? state.selected : null,
        coalesce: null,
        notice: say(state, "Rückgängig"),
      };
    }
    case "redo": {
      const [next, ...rest] = state.future;
      if (!next) return { ...state, notice: say(state, "Nichts zu wiederholen") };
      return {
        ...state,
        layout: next,
        past: [...state.past, state.layout].slice(-HISTORY_MAX),
        future: rest,
        selected: next.elements.some((e) => e.id === state.selected) ? state.selected : null,
        coalesce: null,
        notice: say(state, "Wiederholt"),
      };
    }
    case "endCoalesce":
      return state.coalesce ? { ...state, coalesce: null } : state;
    case "reset":
      return initialEditorState(action.layout);
  }
}

// ───────────────────────── Geometrie ─────────────────────────

type Pt = { x: number; y: number };

/**
 * Punkt der Bühne (0–1) in das unverschobene Koordinatensystem einer Zeichnung umrechnen (Umkehrung von
 * Verschieben, Drehen und Skalieren um die Bühnenmitte) – im Seitenverhältnis 9:16 gerechnet.
 */
export function toDrawingLocal(p: Pt, e: { x: number; y: number; scale: number; rotation: number }): Pt {
  const R = STORY_STAGE_RATIO;
  // In Breiten-Einheiten, Ursprung in der verschobenen Mitte
  const dx = p.x - e.x;
  const dy = (p.y - e.y) * R;
  const a = (-e.rotation * Math.PI) / 180;
  const rx = (dx * Math.cos(a) - dy * Math.sin(a)) / e.scale;
  const ry = (dx * Math.sin(a) + dy * Math.cos(a)) / e.scale;
  return { x: 0.5 + rx, y: 0.5 + ry / R };
}

/** Striche, die ein Radierer-Punkt trifft (Abstand ≤ halbe Strichstärke + `slop`, in Bühnenbreiten). */
export function strokesHit(layout: StoryLayout, p: Pt, slop = 0.02) {
  const R = STORY_STAGE_RATIO;
  const hits: { id: string; index: number }[] = [];
  for (const e of layout.elements) {
    if (e.type !== "drawing") continue;
    const l = toDrawingLocal(p, e);
    const lx = l.x;
    const ly = l.y * R;
    e.strokes.forEach((s, index) => {
      const tol = s.width / 2 + slop / e.scale;
      for (let i = 0; i + 1 < s.points.length; i += 2) {
        const ax = s.points[i]!;
        const ay = s.points[i + 1]! * R;
        const bx = s.points[i + 2] ?? ax;
        const by = (s.points[i + 3] ?? s.points[i + 1]!) * R;
        const dx = bx - ax;
        const dy = by - ay;
        const len = dx * dx + dy * dy;
        const t = len === 0 ? 0 : Math.max(0, Math.min(1, ((lx - ax) * dx + (ly - ay) * dy) / len));
        if (Math.hypot(lx - (ax + t * dx), ly - (ay + t * dy)) <= tol) {
          hits.push({ id: e.id, index });
          break;
        }
      }
    });
  }
  return hits;
}

// ───────────────────────── Absenden ─────────────────────────

/**
 * Layout fürs Speichern: leere Texte und leere Zeichnungen entfernen, Werte in die erlaubten Bereiche
 * bringen, Ebenen durchnummerieren, nur zur Story-Art Passendes. `layout: undefined` = nichts zu speichern;
 * `error`, wenn die Gestaltung die Grenzen sprengt (dann nicht senden, sondern Bescheid geben).
 */
export function layoutForSubmit(layout: StoryLayout, kind: "MEDIA" | "TEXT"): { layout?: StoryLayout; error?: string } {
  const elements = renumber(
    layout.elements.flatMap((e): StoryElement[] => {
      if ((e.type === "text" || e.type === "time") && !e.text.trim()) return [];
      if (e.type === "drawing" && !e.strokes.length) return [];
      const base = { x: r4(clamp(e.x, 0, 1)), y: r4(clamp(e.y, 0, 1)), scale: r4(clamp(e.scale, STORY_SCALE_MIN, STORY_SCALE_MAX)), rotation: clamp(normalizeRotation(e.rotation), -STORY_ROTATION_MAX, STORY_ROTATION_MAX) };
      if (e.type === "text" || e.type === "time") return [{ ...e, ...base, text: e.text.trim() } as StoryElement];
      if (e.type === "mention") {
        const { userId: _ignored, ...rest } = e;
        return [{ ...rest, ...base }];
      }
      return [{ ...e, ...base }];
    }),
  );
  const out: StoryLayout = {
    version: 1,
    ...(kind === "MEDIA" && layout.media ? { media: layout.media } : {}),
    ...(kind === "TEXT" && layout.text ? { text: layout.text } : {}),
    elements,
  };
  if (isEmptyStoryLayout(out)) return {};
  // Letzte Sicherung: was der Server ablehnen würde, gar nicht erst senden
  const r = storyLayoutSchema.safeParse(out);
  return r.success ? { layout: r.data } : { error: r.error.issues[0]?.message ?? "Die Gestaltung ist ungültig." };
}
