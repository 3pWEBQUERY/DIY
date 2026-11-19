"use client";

import { useId, type ReactNode } from "react";
import { STORY_COLOR_KEYS, STORY_ELEMENT_COLORS, type StoryColor } from "@werkraum/shared";
import { cn } from "@/lib/utils";
import { buttonClass } from "@/components/ui/button";

/** Bausteine der Editor-Werkzeuge (Werkbuch: Haarlinien, kleine Rundungen, keine Schatten). */

export function ToolPanel({ title, children, onDone, doneLabel = "Fertig", footer }: { title: string; children: ReactNode; onDone: () => void; doneLabel?: string; footer?: ReactNode }) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="space-y-4">
      <div className="flex items-center justify-between gap-3 border-b border-line pb-3">
        <h3 id={id} className="text-[15px] font-bold">
          {title}
        </h3>
        <div className="flex items-center gap-2">
          {footer}
          <button type="button" onClick={onDone} className={buttonClass("outline", "sm")}>
            {doneLabel}
          </button>
        </div>
      </div>
      {children}
    </section>
  );
}

export function FieldLabel({ children, id }: { children: ReactNode; id?: string }) {
  return (
    <span id={id} className="mb-1.5 block text-[13px] font-semibold">
      {children}
    </span>
  );
}

/** Auswahl aus wenigen Optionen als Knopfreihe (`aria-pressed`) */
export function Segmented<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: { value: T; label: string; icon?: ReactNode }[]; onChange: (v: T) => void }) {
  const id = useId();
  return (
    <div role="group" aria-labelledby={id}>
      <FieldLabel id={id}>{label}</FieldLabel>
      <div className="inline-flex flex-wrap gap-1 rounded-xl border border-line bg-sunken p-1">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            aria-pressed={value === o.value}
            aria-label={o.icon ? o.label : undefined}
            title={o.icon ? o.label : undefined}
            onClick={() => onChange(o.value)}
            className={cn(
              "inline-flex h-9 min-w-9 items-center justify-center gap-1.5 rounded-lg border px-3 text-[13px] font-semibold transition-colors motion-reduce:transition-none",
              value === o.value ? "border-line bg-card text-ink" : "border-transparent text-muted hover:text-ink",
            )}
          >
            {o.icon ?? o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function ColorPicker({ label = "Farbe", value, onChange }: { label?: string; value: StoryColor; onChange: (c: StoryColor) => void }) {
  const id = useId();
  return (
    <div role="group" aria-labelledby={id}>
      <FieldLabel id={id}>{label}</FieldLabel>
      <div className="flex flex-wrap gap-1.5">
        {STORY_COLOR_KEYS.map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => onChange(k)}
            aria-pressed={value === k}
            aria-label={STORY_ELEMENT_COLORS[k].label}
            title={STORY_ELEMENT_COLORS[k].label}
            className={cn("grid size-9 place-items-center rounded-full border-2 transition-colors motion-reduce:transition-none", value === k ? "border-ink" : "border-transparent hover:border-line-strong")}
          >
            <span className="size-6 rounded-full border border-black/15" style={{ background: STORY_ELEMENT_COLORS[k].hex }} />
          </button>
        ))}
      </div>
    </div>
  );
}

/** Regler mit sichtbarem Wert; `onCommit` beendet die Zusammenfassung zu einem Verlaufsschritt */
export function Slider({ label, value, min, max, step = 1, format, onChange, onCommit }: { label: string; value: number; min: number; max: number; step?: number; format: (v: number) => string; onChange: (v: number) => void; onCommit?: () => void }) {
  const id = useId();
  return (
    <label htmlFor={id} className="block">
      <span className="mb-1.5 flex items-baseline justify-between text-[13px] font-semibold">
        {label} <span className="font-normal text-muted num">{format(value)}</span>
      </span>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-valuetext={format(value)}
        onChange={(e) => onChange(Number(e.target.value))}
        onPointerUp={onCommit}
        onKeyUp={onCommit}
        onBlur={onCommit}
        className="w-full accent-[var(--color-ink)]"
      />
    </label>
  );
}
