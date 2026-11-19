"use client";

import { useEffect, useRef } from "react";
import { AlignCenter, AlignLeft, AlignRight, Trash2 } from "lucide-react";
import {
  STORY_ELEMENT_COLORS,
  STORY_ELEMENT_TEXT_MAX,
  STORY_TEXT_ALIGNS,
  STORY_TEXT_ALIGN_LABEL,
  STORY_TEXT_SHADE,
  STORY_TEXT_STYLES,
  STORY_TEXT_STYLE_LABEL,
  contrastRatio,
  readableTextColor,
  type StoryColor,
  type StoryElement,
  type StoryTextAlign,
  type StoryTextStyle,
} from "@werkraum/shared";
import { buttonClass } from "@/components/ui/button";
import { ColorPicker, Segmented, Slider, ToolPanel } from "./editor-ui";
import type { EditorAction } from "./editor-state";

const ALIGN_ICON: Record<StoryTextAlign, React.ReactNode> = {
  left: <AlignLeft size={16} aria-hidden />,
  center: <AlignCenter size={16} aria-hidden />,
  right: <AlignRight size={16} aria-hidden />,
};

export const STYLE_OPTIONS = STORY_TEXT_STYLES.map((s) => ({ value: s, label: STORY_TEXT_STYLE_LABEL[s] }));
/** Textebenen: Fläche ist ein eigener Hintergrund (unten), nicht ein Stil */
const ELEMENT_STYLE_OPTIONS = STYLE_OPTIONS.filter((o) => o.value !== "pill");

type BgMode = "none" | "shade" | "color";
const BG_OPTIONS: { value: BgMode; label: string }[] = [
  { value: "none", label: "Ohne" },
  { value: "shade", label: "Abgedunkelt" },
  { value: "color", label: "Farbfläche" },
];

/** Wie gut lesbar ist die Schrift? Abgedunkelt: gegen Schwarz gerechnet (dunkelster denkbarer Untergrund) */
function readability(text: StoryColor, bg: string | undefined, stageColor: string | null) {
  const fg = STORY_ELEMENT_COLORS[text].hex;
  if (bg === STORY_TEXT_SHADE) return { ratio: contrastRatio(fg, "#000000"), against: "#000000" };
  if (bg) return { ratio: contrastRatio(fg, STORY_ELEMENT_COLORS[bg as StoryColor].hex), against: STORY_ELEMENT_COLORS[bg as StoryColor].hex };
  if (stageColor) return { ratio: contrastRatio(fg, stageColor), against: stageColor };
  return null; // auf Fotos nicht berechenbar
}
export const ALIGN_OPTIONS = STORY_TEXT_ALIGNS.map((a) => ({ value: a, label: STORY_TEXT_ALIGN_LABEL[a], icon: ALIGN_ICON[a] }));

/** Text-Werkzeug: Inhalt, Stil, Ausrichtung, Farbe und Grösse einer Textebene. */
export function TextTool({ element, dispatch, onDone, stageColor }: { element: Extract<StoryElement, { type: "text" }>; dispatch: (a: EditorAction) => void; onDone: () => void; /** Farbe der Text-Story (für die Kontrastprüfung); null bei Foto/Video */ stageColor: string | null }) {
  const area = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    area.current?.focus({ preventScroll: true });
    area.current?.select();
  }, [element.id]);
  const id = element.id;
  const bgMode: BgMode = element.bg === STORY_TEXT_SHADE ? "shade" : element.bg ? "color" : "none";
  const check = readability(element.color, element.bg, stageColor);
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
      <Segmented<StoryTextStyle> label="Stil" value={element.style === "pill" ? "bold" : element.style} options={ELEMENT_STYLE_OPTIONS} onChange={(style) => dispatch({ type: "update", id, patch: { style } })} />
      <Segmented<StoryTextAlign> label="Ausrichtung" value={element.align} options={ALIGN_OPTIONS} onChange={(align) => dispatch({ type: "update", id, patch: { align } })} />
      <ColorPicker label="Schriftfarbe" value={element.color} onChange={(color) => dispatch({ type: "update", id, patch: { color } })} />
      <Segmented<BgMode>
        label="Hintergrund"
        value={bgMode}
        options={BG_OPTIONS}
        onChange={(mode) => {
          if (mode === "none") return dispatch({ type: "update", id, patch: { bg: null } });
          if (mode === "shade") return dispatch({ type: "update", id, patch: { bg: STORY_TEXT_SHADE, color: "white" } });
          // Farbfläche in der bisherigen Schriftfarbe, Schrift darauf gut lesbar
          dispatch({ type: "update", id, patch: { bg: element.color, color: readableTextColor(STORY_ELEMENT_COLORS[element.color].hex) } });
        }}
      />
      {bgMode === "color" && element.bg && element.bg !== STORY_TEXT_SHADE && (
        <ColorPicker
          label="Farbe der Fläche"
          value={element.bg}
          onChange={(bg) => dispatch({ type: "update", id, patch: { bg, color: readableTextColor(STORY_ELEMENT_COLORS[bg].hex) } })}
        />
      )}
      {check && check.ratio < 4.5 ? (
        <div role="status" className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl bg-warn-soft px-3.5 py-3 text-[13.5px] text-ink">
          <span className="min-w-0 flex-1">Schwer lesbar: Schrift und Hintergrund sind sich zu ähnlich.</span>
          <button type="button" onClick={() => dispatch({ type: "update", id, patch: { color: readableTextColor(check.against) } })} className={buttonClass("outline", "sm")}>
            Lesbar machen
          </button>
        </div>
      ) : !check && bgMode === "none" ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl bg-sunken px-3.5 py-3 text-[13.5px] text-ink-2">
          <span className="min-w-0 flex-1">Auf Fotos ist Text mit Hintergrund am besten lesbar.</span>
          <button type="button" onClick={() => dispatch({ type: "update", id, patch: { bg: STORY_TEXT_SHADE, color: "white" } })} className={buttonClass("outline", "sm")}>
            Abdunkeln
          </button>
        </div>
      ) : null}
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
