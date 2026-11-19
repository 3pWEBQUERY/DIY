"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Blend, Layers, PenLine, Redo2, Smile, Type, Undo2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { EditorStage, type DrawTool, type EditorStageHandle } from "./editor-stage";
import { nextElementId, strokeTotals, type EditorAction, type EditorState, type NewElement } from "./editor-state";
import { TextTool } from "./tool-text";
import { LayersTool } from "./tool-layers";
import { DEFAULT_DRAW, DrawPanel } from "./tool-draw";
import { StickerPanel } from "./tool-stickers";
import { FilterPanel } from "./tool-filter";

export type EditorTool = "text" | "layers" | "draw" | "stickers" | "filter";

/**
 * Story-Editor: direkt bearbeitbare 9:16-Bühne, darunter die Werkzeugleiste. Rechts (bzw. darunter auf
 * dem Handy) entweder das geöffnete Werkzeug oder die übrigen Angaben der Story (`form`).
 * Rückgängig/Wiederholen auch mit ⌘/Strg+Z bzw. ⌘/Strg+Umschalt+Z.
 */
export function StoryEditor({
  state,
  dispatch,
  background,
  overlay,
  projects,
  media,
  form,
}: {
  state: EditorState;
  dispatch: (a: EditorAction) => void;
  /** Foto, Video oder Farbfläche der Story */
  background: ReactNode;
  /** Nur Vorschau über der Bühne (z. B. Bildunterschrift, Upload-Fortschritt) */
  overlay?: ReactNode;
  projects: { id: string; title: string }[];
  /** Foto/Video der Story (Vorschau-Adresse) – nur dann gibt es Filter */
  media: { kind: "IMAGE" | "VIDEO"; url: string } | null;
  form: ReactNode;
}) {
  const [tool, setTool] = useState<EditorTool | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const stage = useRef<EditorStageHandle>(null);
  const toolButtons = useRef(new Map<EditorTool, HTMLButtonElement | null>());
  const projectTitles = useMemo(() => new Map(projects.map((p) => [p.id, p.title])), [projects]);
  const [draw, setDraw] = useState<DrawTool>(DEFAULT_DRAW);

  const editingEl = editing ? state.layout.elements.find((e) => e.id === editing) : null;
  const textEl = editingEl?.type === "text" ? editingEl : null;
  // Gelöschte Textebene (Rückgängig, Papierkorb): Werkzeug schliessen
  useEffect(() => {
    if (tool === "text" && !textEl) {
      setTool(null);
      setEditing(null);
    }
  }, [tool, textEl]);

  function open(t: EditorTool) {
    setTool((cur) => (cur === t ? null : t));
  }
  /** Werkzeug schliessen und den Fokus dorthin zurück, wo er herkam (WCAG 2.4.3) */
  function close(focus: "tool" | "stage" = "tool") {
    const t = tool;
    setTool(null);
    setEditing(null);
    requestAnimationFrame(() => {
      if (focus === "stage" || !t) stage.current?.focus();
      else toolButtons.current.get(t)?.focus({ preventScroll: true });
    });
  }

  function addText() {
    const id = nextElementId(state);
    dispatch({ type: "add", element: { type: "text", text: "", color: "white", style: "bold", align: "center", x: 0.5, y: 0.42, scale: 1, rotation: 0 } });
    setEditing(id);
    setTool("text");
  }
  function addSticker(element: NewElement) {
    const id = nextElementId(state);
    dispatch({ type: "add", element });
    setTool(null);
    // Neuer Sticker gewählt und fokussiert – gleich mit Tastatur oder Fingern verschiebbar
    requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-el="${id}"][role=button]`)?.focus({ preventScroll: true }));
  }
  function editText(id: string) {
    dispatch({ type: "select", id });
    setEditing(id);
    setTool("text");
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== "z" && e.key.toLowerCase() !== "y") return;
    const t = e.target as HTMLElement;
    if (t.closest("input, textarea, [contenteditable]")) return;
    e.preventDefault();
    dispatch({ type: e.key.toLowerCase() === "y" || e.shiftKey ? "redo" : "undo" });
  }

  const toolBtn = (active: boolean) =>
    cn(
      "inline-flex h-10 min-w-10 items-center justify-center gap-1.5 rounded-xl border px-2.5 text-[13px] font-semibold transition-colors motion-reduce:transition-none disabled:opacity-40",
      active ? "border-ink bg-ink text-paper" : "border-line bg-card text-ink hover:border-line-strong",
    );

  let panel: ReactNode = null;
  if (tool === "draw") panel = <DrawPanel value={draw} onChange={setDraw} strokes={strokeTotals(state.layout).strokes} onDone={() => close()} />;
  else if (tool === "stickers") panel = <StickerPanel projects={projects} onAdd={addSticker} onDone={() => close()} />;
  else if (tool === "filter" && media) panel = <FilterPanel value={state.layout.media ?? { filter: "original", intensity: 100 }} preview={media} dispatch={dispatch} onDone={() => close()} />;
  else if (tool === "text" && textEl) panel = <TextTool key={textEl.id} element={textEl} dispatch={dispatch} onDone={() => close("stage")} />;
  else if (tool === "layers")
    panel = (
      <LayersTool
        state={state}
        dispatch={dispatch}
        onDone={() => close()}
        onPick={(id) => {
          dispatch({ type: "select", id });
          stage.current?.focus();
          // Ausgewähltes Element auch per Tastatur erreichbar machen
          requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-el="${id}"][role=button]`)?.focus({ preventScroll: true }));
        }}
      />
    );

  return (
    <div onKeyDown={onKeyDown} className="grid gap-6 sm:grid-cols-[minmax(0,17rem)_minmax(0,1fr)]">
      <div className="mx-auto w-full max-w-[min(17rem,calc(58dvh*9/16))] sm:max-w-[17rem]">
        <EditorStage ref={stage} state={state} dispatch={dispatch} draw={tool === "draw" ? draw : null} projectTitles={projectTitles} onEditText={editText}>
          {background}
          {overlay}
        </EditorStage>

        <div role="toolbar" aria-label="Gestalten" aria-orientation="horizontal" className="mt-3 flex flex-wrap items-center gap-1.5">
          <button type="button" ref={(el) => void toolButtons.current.set("text", el)} onClick={addText} className={toolBtn(tool === "text")} aria-label="Text hinzufügen" title="Text hinzufügen">
            <Type size={17} aria-hidden /> <span aria-hidden>Aa</span>
          </button>
          <button type="button" ref={(el) => void toolButtons.current.set("draw", el)} onClick={() => open("draw")} aria-pressed={tool === "draw"} className={toolBtn(tool === "draw")} aria-label="Zeichnen" title="Zeichnen">
            <PenLine size={17} aria-hidden />
          </button>
          <button type="button" ref={(el) => void toolButtons.current.set("stickers", el)} onClick={() => open("stickers")} aria-pressed={tool === "stickers"} className={toolBtn(tool === "stickers")} aria-label="Sticker" title="Sticker">
            <Smile size={17} aria-hidden />
          </button>
          {media && (
            <button type="button" ref={(el) => void toolButtons.current.set("filter", el)} onClick={() => open("filter")} aria-pressed={tool === "filter"} className={toolBtn(tool === "filter")} aria-label="Filter" title="Filter">
              <Blend size={17} aria-hidden />
            </button>
          )}
          <button type="button" ref={(el) => void toolButtons.current.set("layers", el)} onClick={() => open("layers")} aria-pressed={tool === "layers"} className={toolBtn(tool === "layers")} aria-label="Ebenen" title="Ebenen">
            <Layers size={17} aria-hidden />
          </button>
          <span className="ml-auto flex gap-1.5">
            <button type="button" onClick={() => dispatch({ type: "undo" })} disabled={!state.past.length} className={toolBtn(false)} aria-label="Rückgängig" title="Rückgängig (⌘/Strg+Z)">
              <Undo2 size={17} aria-hidden />
            </button>
            <button type="button" onClick={() => dispatch({ type: "redo" })} disabled={!state.future.length} className={toolBtn(false)} aria-label="Wiederholen" title="Wiederholen (⌘/Strg+Umschalt+Z)">
              <Redo2 size={17} aria-hidden />
            </button>
          </span>
        </div>
      </div>

      <div className="min-w-0">{panel ?? form}</div>

      {/* Statusmeldungen für Screenreader („Text hinzugefügt“, „Rückgängig“ …) */}
      <p className="sr-only" aria-live="polite" aria-atomic="true">
        <span key={state.notice?.n}>{state.notice?.text}</span>
      </p>
    </div>
  );
}
