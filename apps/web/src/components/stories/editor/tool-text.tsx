"use client";

import { useEffect, useRef } from "react";
import { AlignCenter, AlignLeft, AlignRight, Trash2 } from "lucide-react";
import { STORY_ELEMENT_TEXT_MAX, STORY_TEXT_ALIGNS, STORY_TEXT_ALIGN_LABEL, STORY_TEXT_STYLES, STORY_TEXT_STYLE_LABEL, type StoryElement, type StoryTextAlign, type StoryTextStyle } from "@werkraum/shared";
import { buttonClass } from "@/components/ui/button";
import { ColorPicker, Segmented, Slider, ToolPanel } from "./editor-ui";
import type { EditorAction } from "./editor-state";

const ALIGN_ICON: Record<StoryTextAlign, React.ReactNode> = {
  left: <AlignLeft size={16} aria-hidden />,
  center: <AlignCenter size={16} aria-hidden />,
  right: <AlignRight size={16} aria-hidden />,
};

export const STYLE_OPTIONS = STORY_TEXT_STYLES.map((s) => ({ value: s, label: STORY_TEXT_STYLE_LABEL[s] }));
export const ALIGN_OPTIONS = STORY_TEXT_ALIGNS.map((a) => ({ value: a, label: STORY_TEXT_ALIGN_LABEL[a], icon: ALIGN_ICON[a] }));

/** Text-Werkzeug: Inhalt, Stil, Ausrichtung, Farbe und Grösse einer Textebene. */
export function TextTool({ element, dispatch, onDone }: { element: Extract<StoryElement, { type: "text" }>; dispatch: (a: EditorAction) => void; onDone: () => void }) {
  const area = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    area.current?.focus({ preventScroll: true });
    area.current?.select();
  }, [element.id]);
  const id = element.id;
  const done = () => {
    dispatch({ type: "endCoalesce" });
    // Leerer Text bleibt nicht als unsichtbare Ebene zurück
    if (!element.text.trim()) dispatch({ type: "remove", id });
    onDone();
  };
  return (
    <ToolPanel
      title="Text"
      onDone={done}
      footer={
        <button type="button" onClick={() => { dispatch({ type: "remove", id }); onDone(); }} className={buttonClass("ghost", "sm", "text-danger")} aria-label="Text löschen">
          <Trash2 size={15} aria-hidden /> Löschen
        </button>
      }
    >
      <label className="block">
        <span className="mb-1.5 flex items-baseline justify-between text-[13px] font-semibold">
          Text <span className="font-normal text-muted num">{element.text.length}/{STORY_ELEMENT_TEXT_MAX}</span>
        </span>
        <textarea
          ref={area}
          value={element.text}
          rows={3}
          maxLength={STORY_ELEMENT_TEXT_MAX}
          onChange={(e) => dispatch({ type: "update", id, patch: { text: e.target.value.slice(0, STORY_ELEMENT_TEXT_MAX) }, coalesce: `text-${id}` })}
          onKeyDown={(e) => {
            // Esc beendet das Bearbeiten, ohne den ganzen Dialog zu schliessen
            if (e.key === "Escape") {
              e.preventDefault();
              e.stopPropagation();
              done();
            }
          }}
          placeholder="Was soll auf der Story stehen?"
          className="block w-full resize-none rounded-xl border border-line-strong bg-card px-3.5 py-2.5 text-[15px] outline-none placeholder:text-muted focus:border-ink"
        />
      </label>
      <Segmented<StoryTextStyle> label="Stil" value={element.style} options={STYLE_OPTIONS} onChange={(style) => dispatch({ type: "update", id, patch: { style } })} />
      <Segmented<StoryTextAlign> label="Ausrichtung" value={element.align} options={ALIGN_OPTIONS} onChange={(align) => dispatch({ type: "update", id, patch: { align } })} />
      <ColorPicker label={element.style === "pill" ? "Farbe der Fläche" : "Farbe"} value={element.color} onChange={(color) => dispatch({ type: "update", id, patch: { color } })} />
      <Slider
        label="Grösse"
        value={Math.round(element.scale * 100)}
        min={30}
        max={400}
        step={5}
        format={(v) => `${v} %`}
        onChange={(v) => dispatch({ type: "update", id, patch: { scale: v / 100 }, coalesce: `size-${id}` })}
        onCommit={() => dispatch({ type: "endCoalesce" })}
      />
    </ToolPanel>
  );
}
