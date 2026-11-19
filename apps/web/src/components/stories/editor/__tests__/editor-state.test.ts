import { describe, expect, it } from "vitest";
import { STORY_ELEMENTS_MAX, STORY_STROKES_MAX, type StoryLayout } from "@werkraum/shared";
import {
  EMPTY_LAYOUT,
  HISTORY_MAX,
  editorReducer,
  initialEditorState,
  layoutForSubmit,
  nextElementId,
  normalizeRotation,
  strokesHit,
  toDrawingLocal,
  type EditorAction,
  type EditorState,
  type NewElement,
} from "../editor-state";

const textEl = (text = "Hallo"): NewElement => ({ type: "text", text, color: "white", style: "bold", align: "center", x: 0.5, y: 0.4, scale: 1, rotation: 0 });
const emojiEl = (): NewElement => ({ type: "emoji", emoji: "🧶", x: 0.2, y: 0.2, scale: 1, rotation: 0 });
const run = (actions: EditorAction[], s: EditorState = initialEditorState()) => actions.reduce(editorReducer, s);
const stroke = (pts = [0.1, 0.1, 0.5, 0.5]) => ({ tool: "pen" as const, color: "ink" as const, width: 0.01, points: pts });

describe("Editor: Elemente", () => {
  it("Hinzufügen vergibt Kennung und oberste Ebene, wählt aus und meldet es", () => {
    const s = run([{ type: "add", element: textEl() }, { type: "add", element: emojiEl() }]);
    expect(s.layout.elements.map((e) => [e.id, e.z])).toEqual([["1", 0], ["2", 1]]);
    expect(s.selected).toBe("2");
    expect(s.notice?.text).toBe("Sticker hinzugefügt");
  });

  it("höchstens 20 Elemente", () => {
    const s = run(Array.from({ length: STORY_ELEMENTS_MAX + 2 }, () => ({ type: "add", element: emojiEl() }) as EditorAction));
    expect(s.layout.elements).toHaveLength(STORY_ELEMENTS_MAX);
    expect(s.notice?.text).toContain("Höchstens");
  });

  it("Verschieben, Skalieren, Drehen bleiben in den Grenzen", () => {
    const s = run([{ type: "add", element: textEl() }, { type: "update", id: "1", patch: { x: 1.4, y: -0.2, scale: 9, rotation: 270 } }]);
    expect(s.layout.elements[0]).toMatchObject({ x: 1, y: 0, scale: 4, rotation: -90 });
    expect(normalizeRotation(540)).toBe(180);
    expect(normalizeRotation(-190)).toBe(170);
    expect(normalizeRotation(180)).toBe(180);
    expect(normalizeRotation(Number.NaN)).toBe(0);
  });

  it("Text, Farbe und Stil nur, wo sie hingehören", () => {
    const s = run([{ type: "add", element: emojiEl() }, { type: "update", id: "1", patch: { text: "x", style: "pill", color: "coral" } }]);
    expect(s.layout.elements[0]).not.toHaveProperty("text");
    expect(s.layout.elements[0]).not.toHaveProperty("style");
  });

  it("Ebenen: nach vorne, hinten, ganz nach vorne; an der Grenze nur eine Meldung", () => {
    let s = run([{ type: "add", element: textEl("a") }, { type: "add", element: textEl("b") }, { type: "add", element: textEl("c") }]);
    const z = () => Object.fromEntries(s.layout.elements.map((e) => [e.id, e.z]));
    s = editorReducer(s, { type: "reorder", id: "1", to: "forward" });
    expect(z()).toEqual({ "1": 1, "2": 0, "3": 2 });
    s = editorReducer(s, { type: "reorder", id: "1", to: "front" });
    expect(z()).toEqual({ "1": 2, "2": 0, "3": 1 });
    s = editorReducer(s, { type: "reorder", id: "2", to: "backward" });
    expect(s.notice?.text).toBe("Schon ganz hinten");
    s = editorReducer(s, { type: "reorder", id: "1", to: "back" });
    expect(z()).toEqual({ "1": 0, "2": 1, "3": 2 });
  });

  it("Löschen hebt die Auswahl auf und nummeriert die Ebenen neu", () => {
    const s = run([{ type: "add", element: textEl("a") }, { type: "add", element: textEl("b") }, { type: "remove", id: "2" }]);
    expect(s.selected).toBeNull();
    expect(s.layout.elements.map((e) => [e.id, e.z])).toEqual([["1", 0]]);
    expect(s.notice?.text).toBe("Text gelöscht");
  });
});

describe("Editor: Rückgängig/Wiederholen", () => {
  it("geht Schritt für Schritt zurück und wieder vor", () => {
    let s = run([{ type: "add", element: textEl() }, { type: "update", id: "1", patch: { x: 0.2 } }, { type: "remove", id: "1" }]);
    expect(s.layout.elements).toHaveLength(0);
    s = editorReducer(s, { type: "undo" });
    expect(s.layout.elements[0]?.x).toBe(0.2);
    s = editorReducer(s, { type: "undo" });
    expect(s.layout.elements[0]?.x).toBe(0.5);
    s = editorReducer(s, { type: "redo" });
    expect(s.layout.elements[0]?.x).toBe(0.2);
    expect(s.notice?.text).toBe("Wiederholt");
    // Neue Änderung verwirft „Wiederholen“
    s = editorReducer(s, { type: "update", id: "1", patch: { y: 0.9 } });
    expect(s.future).toEqual([]);
  });

  it("eine Geste ist ein Schritt; danach beginnt ein neuer", () => {
    let s = run([{ type: "add", element: textEl() }]);
    for (const x of [0.1, 0.2, 0.3, 0.4]) s = editorReducer(s, { type: "update", id: "1", patch: { x }, coalesce: "g1" });
    s = editorReducer(s, { type: "endCoalesce" });
    s = editorReducer(s, { type: "update", id: "1", patch: { x: 0.9 }, coalesce: "g1" });
    expect(s.past).toHaveLength(3); // leer → hinzugefügt → Geste → zweite Geste
    s = editorReducer(s, { type: "undo" });
    expect(s.layout.elements[0]?.x).toBe(0.4);
    s = editorReducer(s, { type: "undo" });
    expect(s.layout.elements[0]?.x).toBe(0.5);
  });

  it("mindestens 50 Schritte, begrenzt auf HISTORY_MAX", () => {
    let s = run([{ type: "add", element: textEl() }]);
    for (let i = 0; i < HISTORY_MAX + 30; i++) s = editorReducer(s, { type: "update", id: "1", patch: { x: (i % 100) / 100 } });
    expect(s.past.length).toBe(HISTORY_MAX);
    expect(HISTORY_MAX).toBeGreaterThanOrEqual(50);
    for (let i = 0; i < 60; i++) s = editorReducer(s, { type: "undo" });
    expect(s.future.length).toBe(60);
  });

  it("Auswahl verschwindet, wenn das Element nach Rückgängig fehlt", () => {
    let s = run([{ type: "add", element: textEl() }]);
    expect(s.selected).toBe("1");
    s = editorReducer(s, { type: "undo" });
    expect(s.selected).toBeNull();
    expect(editorReducer(s, { type: "undo" }).notice?.text).toBe("Nichts rückgängig zu machen");
  });

  it("neue Kennungen bleiben nach Rückgängig eindeutig", () => {
    let s = run([{ type: "add", element: textEl() }, { type: "undo" }, { type: "add", element: textEl() }]);
    expect(s.layout.elements[0]?.id).toBe("2");
    s = editorReducer(s, { type: "undo" });
    s = editorReducer(s, { type: "redo" });
    expect(s.layout.elements[0]?.id).toBe("2");
  });
});

describe("Editor: Zeichnen", () => {
  it("Striche landen in der Zeichnung der Sitzung; eine neue entsteht mit der vorhergesagten Kennung", () => {
    let s = run([{ type: "add", element: textEl() }]);
    const id = nextElementId(s);
    s = editorReducer(s, { type: "addStroke", drawingId: id, stroke: stroke() });
    s = editorReducer(s, { type: "addStroke", drawingId: id, stroke: stroke([0.2, 0.2, 0.3, 0.3]) });
    const d = s.layout.elements.find((e) => e.type === "drawing");
    expect(d?.id).toBe(id);
    expect(d?.type === "drawing" && d.strokes.length).toBe(2);
    s = editorReducer(s, { type: "undo" });
    const d2 = s.layout.elements.find((e) => e.type === "drawing");
    expect(d2?.type === "drawing" && d2.strokes.length).toBe(1);
  });

  it("Grenze für Striche", () => {
    let s = initialEditorState();
    const id = nextElementId(s);
    for (let i = 0; i < STORY_STROKES_MAX + 3; i++) s = editorReducer(s, { type: "addStroke", drawingId: id, stroke: stroke() });
    const d = s.layout.elements[0];
    expect(d?.type === "drawing" && d.strokes.length).toBe(STORY_STROKES_MAX);
    expect(s.notice?.text).toContain("Höchstens");
  });

  it("Radierer trifft ganze Striche – auch in verschobenen und gedrehten Zeichnungen", () => {
    let s = initialEditorState();
    const id = nextElementId(s);
    s = editorReducer(s, { type: "addStroke", drawingId: id, stroke: { ...stroke([0.2, 0.5, 0.8, 0.5]), width: 0.02 } });
    s = editorReducer(s, { type: "addStroke", drawingId: id, stroke: stroke([0.5, 0.1, 0.5, 0.2]) });
    expect(strokesHit(s.layout, { x: 0.5, y: 0.5 })).toEqual([{ id, index: 0 }]);
    expect(strokesHit(s.layout, { x: 0.5, y: 0.9 })).toEqual([]);
    // Zeichnung um 90° gedreht: die waagrechte Linie steht jetzt senkrecht durch die Mitte
    s = editorReducer(s, { type: "update", id, patch: { rotation: 90 } });
    expect(strokesHit(s.layout, { x: 0.5, y: 0.6 }).map((h) => h.index)).toContain(0);
    expect(strokesHit(s.layout, { x: 0.2, y: 0.5 })).toEqual([]);
    s = editorReducer(s, { type: "removeStrokes", hits: [{ id, index: 0 }, { id, index: 1 }] });
    expect(s.layout.elements).toHaveLength(0);
    expect(s.notice?.text).toBe("2 Striche gelöscht");
  });

  it("Umrechnung in Zeichnungskoordinaten ist die Umkehrung der Darstellung", () => {
    const e = { x: 0.6, y: 0.4, scale: 2, rotation: 0 };
    expect(toDrawingLocal({ x: 0.6, y: 0.4 }, e)).toEqual({ x: 0.5, y: 0.5 });
    const p = toDrawingLocal({ x: 0.8, y: 0.4 }, e);
    expect(p.x).toBeCloseTo(0.6);
    expect(p.y).toBeCloseTo(0.5);
  });
});

describe("Editor: Filter und Haupttext", () => {
  it("Filter und Textstil mit Grenzen, Regler als ein Schritt", () => {
    let s = initialEditorState();
    s = editorReducer(s, { type: "setFilter", filter: "warm", intensity: 140, coalesce: "f" });
    s = editorReducer(s, { type: "setFilter", filter: "warm", intensity: 40, coalesce: "f" });
    expect(s.layout.media).toEqual({ filter: "warm", intensity: 40 });
    expect(s.past).toHaveLength(1);
    s = editorReducer(s, { type: "setTextLook", look: { style: "caps", scale: 5 } });
    expect(s.layout.text).toEqual({ style: "caps", align: "center", scale: 2 });
  });
});

describe("Editor: Absenden", () => {
  it("bereinigt leere Texte, rundet und passt zur Story-Art", () => {
    let s = run([{ type: "add", element: textEl("  ") }, { type: "add", element: textEl("  Hallo  ") }, { type: "add", element: emojiEl() }]);
    s = editorReducer(s, { type: "setFilter", filter: "mono", intensity: 50 });
    s = editorReducer(s, { type: "setTextLook", look: { style: "pill" } });
    const media = layoutForSubmit(s.layout, "MEDIA").layout!;
    expect(media.elements.map((e) => e.type === "text" ? e.text : e.type)).toEqual(["Hallo", "emoji"]);
    expect(media.elements.map((e) => e.z)).toEqual([0, 1]);
    expect(media.media).toEqual({ filter: "mono", intensity: 50 });
    expect(media.text).toBeUndefined();
    const text = layoutForSubmit(s.layout, "TEXT").layout!;
    expect(text.media).toBeUndefined();
    expect(text.text?.style).toBe("pill");
  });

  it("leer ergibt kein Layout; Erwähnungen ohne vom Client gesetzte Konto-ID", () => {
    expect(layoutForSubmit(EMPTY_LAYOUT, "TEXT")).toEqual({});
    const l: StoryLayout = { version: 1, elements: [{ id: "a", type: "mention", handle: "lena.haekelt", userId: "x", color: "ink", x: 0.5, y: 0.5, scale: 1, rotation: 0, z: 0 }] };
    expect(layoutForSubmit(l, "MEDIA").layout?.elements[0]).not.toHaveProperty("userId");
  });
});

describe("Editor: Hintergrund der Textebene", () => {
  it("setzen und wieder entfernen", () => {
    let s = run([{ type: "add", element: textEl() }, { type: "update", id: "1", patch: { bg: "shade" } }]);
    expect(s.layout.elements[0]).toMatchObject({ bg: "shade" });
    s = editorReducer(s, { type: "update", id: "1", patch: { bg: null } });
    expect(s.layout.elements[0]).not.toHaveProperty("bg");
    // Nur für Text
    s = run([{ type: "add", element: emojiEl() }, { type: "update", id: "1", patch: { bg: "coral" } }]);
    expect(s.layout.elements[0]).not.toHaveProperty("bg");
  });
});
