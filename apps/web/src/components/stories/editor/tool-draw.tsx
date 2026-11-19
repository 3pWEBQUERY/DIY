"use client";

import { Eraser, Highlighter, Pencil } from "lucide-react";
import { STORY_STROKES_MAX, STORY_STROKE_WIDTH_MAX, STORY_STROKE_WIDTH_MIN, type StoryColor } from "@werkraum/shared";
import { ColorPicker, Segmented, Slider, ToolPanel } from "./editor-ui";
import type { DrawTool } from "./editor-stage";

/** Strichstärke als Stufe 1–20 (Anzeige) ↔ Anteil der Bühnenbreite (gespeichert) */
const STEPS = 20;
export const widthFromStep = (v: number) => Math.round((STORY_STROKE_WIDTH_MIN + ((STORY_STROKE_WIDTH_MAX - STORY_STROKE_WIDTH_MIN) * (v - 1)) / (STEPS - 1)) * 10_000) / 10_000;
export const stepFromWidth = (w: number) => Math.round(1 + ((w - STORY_STROKE_WIDTH_MIN) / (STORY_STROKE_WIDTH_MAX - STORY_STROKE_WIDTH_MIN)) * (STEPS - 1));

export const DEFAULT_DRAW: DrawTool = { tool: "pen", color: "white", width: widthFromStep(3) };
const DEFAULT_WIDTH: Record<DrawTool["tool"], number> = { pen: widthFromStep(3), marker: widthFromStep(10), eraser: widthFromStep(3) };

/**
 * Zeichnen: Stift, Marker (halbtransparent, breit) und Radierer (löscht ganze Striche). Rückgängig über
 * die Werkzeugleiste. Freihandzeichnen ist an sich eine Zeigerbewegung (WCAG 2.5.7: wesentlich) – Striche
 * lassen sich aber per Ebenenliste und Rückgängig ohne Ziehen wieder entfernen.
 */
export function DrawPanel({ value, onChange, strokes, onDone }: { value: DrawTool; onChange: (v: DrawTool) => void; strokes: number; onDone: () => void }) {
  return (
    <ToolPanel title="Zeichnen" onDone={onDone}>
      <Segmented<DrawTool["tool"]>
        label="Werkzeug"
        value={value.tool}
        options={[
          { value: "pen", label: "Stift", icon: <span className="inline-flex items-center gap-1.5"><Pencil size={15} aria-hidden /> Stift</span> },
          { value: "marker", label: "Marker", icon: <span className="inline-flex items-center gap-1.5"><Highlighter size={15} aria-hidden /> Marker</span> },
          { value: "eraser", label: "Radierer", icon: <span className="inline-flex items-center gap-1.5"><Eraser size={15} aria-hidden /> Radierer</span> },
        ]}
        onChange={(tool) => onChange({ ...value, tool, width: tool === value.tool ? value.width : DEFAULT_WIDTH[tool] })}
      />
      {value.tool === "eraser" ? (
        <p className="rounded-xl bg-sunken px-3.5 py-3 text-[13.5px] text-ink-2">Über einen Strich wischen, um ihn ganz zu löschen.</p>
      ) : (
        <>
          <ColorPicker value={value.color} onChange={(color: StoryColor) => onChange({ ...value, color })} />
          <Slider label="Strichstärke" value={stepFromWidth(value.width)} min={1} max={STEPS} format={(v) => `${v}`} onChange={(v) => onChange({ ...value, width: widthFromStep(v) })} />
        </>
      )}
      <p className="text-[12.5px] text-muted num">
        {strokes} von {STORY_STROKES_MAX} Strichen
      </p>
    </ToolPanel>
  );
}
