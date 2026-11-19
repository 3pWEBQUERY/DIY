"use client";

import { STORY_FILTERS, STORY_FILTER_KEYS, storyFilterCss, type StoryFilter } from "@werkraum/shared";
import { cn } from "@/lib/utils";
import { FieldLabel, Slider, ToolPanel } from "./editor-ui";
import type { EditorAction } from "./editor-state";

/**
 * Filter für Foto und Video: acht Voreinstellungen plus Intensität. Nicht destruktiv – als CSS-Filter
 * gespeichert und überall gleich dargestellt (Editor, Betrachter, Miniatur).
 */
export function FilterPanel({ value, preview, dispatch, onDone }: { value: { filter: StoryFilter; intensity: number }; preview: { kind: "IMAGE" | "VIDEO"; url: string } | null; dispatch: (a: EditorAction) => void; onDone: () => void }) {
  const set = (filter: StoryFilter, intensity = value.intensity) => dispatch({ type: "setFilter", filter, intensity });
  return (
    <ToolPanel title="Filter" onDone={onDone}>
      <div role="group" aria-label="Filter">
        <FieldLabel>Voreinstellung</FieldLabel>
        <div className="grid grid-cols-4 gap-2">
          {STORY_FILTER_KEYS.map((k) => {
            const on = value.filter === k;
            const css = storyFilterCss(k, 100);
            return (
              <button
                key={k}
                type="button"
                aria-pressed={on}
                onClick={() => set(k, k !== value.filter && value.intensity === 0 ? 100 : value.intensity)}
                className={cn("rounded-xl border-2 p-1 text-center transition-colors motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-ink", on ? "border-ink" : "border-transparent hover:border-line-strong")}
              >
                <span className="relative block aspect-[3/4] overflow-hidden rounded-lg bg-sunken">
                  {preview &&
                    (preview.kind === "IMAGE" ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={preview.url} alt="" className="absolute inset-0 h-full w-full object-cover" style={css ? { filter: css } : undefined} />
                    ) : (
                      <video src={preview.url} muted playsInline preload="metadata" className="absolute inset-0 h-full w-full object-cover" style={css ? { filter: css } : undefined} aria-hidden />
                    ))}
                </span>
                <span className="mt-1 block truncate text-[12px] font-semibold">{STORY_FILTERS[k].label}</span>
              </button>
            );
          })}
        </div>
      </div>
      {value.filter !== "original" && (
        <Slider
          label="Intensität"
          value={value.intensity}
          min={0}
          max={100}
          format={(v) => `${v} %`}
          onChange={(v) => dispatch({ type: "setFilter", filter: value.filter, intensity: v, coalesce: "filter-intensity" })}
          onCommit={() => dispatch({ type: "endCoalesce" })}
        />
      )}
    </ToolPanel>
  );
}
