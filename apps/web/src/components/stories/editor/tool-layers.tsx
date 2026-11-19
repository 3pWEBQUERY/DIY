"use client";

import { ArrowDown, ArrowUp, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { ToolPanel } from "./editor-ui";
import { describeElement, type EditorAction, type EditorState } from "./editor-state";

/**
 * Ebenenliste – zugängliche Alternative zur Bühne: auswählen, Reihenfolge ändern, löschen.
 * Oben steht, was vorne liegt.
 */
export function LayersTool({ state, dispatch, onDone, onPick }: { state: EditorState; dispatch: (a: EditorAction) => void; onDone: () => void; onPick: (id: string) => void }) {
  const list = [...state.layout.elements].sort((a, b) => b.z - a.z);
  const iconBtn = "grid size-9 place-items-center rounded-lg text-ink-2 hover:bg-sunken disabled:opacity-35 disabled:hover:bg-transparent focus-visible:outline-2 focus-visible:outline-ink";
  return (
    <ToolPanel title="Ebenen" onDone={onDone}>
      {list.length ? (
        <ol className="divide-y divide-line rounded-xl border border-line" aria-label="Ebenen, vorderste zuerst">
          {list.map((e, i) => {
            const label = describeElement(e);
            const selected = state.selected === e.id;
            return (
              <li key={e.id} className={cn("flex items-center gap-1 py-1 pl-1 pr-1.5", selected && "bg-sunken")}>
                <button
                  type="button"
                  onClick={() => onPick(e.id)}
                  aria-pressed={selected}
                  className="min-w-0 flex-1 truncate rounded-lg px-2.5 py-2 text-left text-[14px] hover:bg-sunken focus-visible:outline-2 focus-visible:outline-ink"
                >
                  {label}
                </button>
                <button type="button" className={iconBtn} disabled={i === 0} onClick={() => dispatch({ type: "reorder", id: e.id, to: "forward" })} aria-label={`${label}: weiter nach vorne`}>
                  <ArrowUp size={16} aria-hidden />
                </button>
                <button type="button" className={iconBtn} disabled={i === list.length - 1} onClick={() => dispatch({ type: "reorder", id: e.id, to: "backward" })} aria-label={`${label}: weiter nach hinten`}>
                  <ArrowDown size={16} aria-hidden />
                </button>
                <button type="button" className={cn(iconBtn, "text-danger")} onClick={() => dispatch({ type: "remove", id: e.id })} aria-label={`${label} löschen`}>
                  <Trash2 size={16} aria-hidden />
                </button>
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="rounded-xl bg-sunken px-3.5 py-3 text-[13.5px] text-ink-2">Noch keine Ebenen. Füge Text, Sticker oder eine Zeichnung hinzu.</p>
      )}
      <p className="text-[12.5px] leading-relaxed text-muted">
        Gewählte Ebene auf der Bühne: Pfeiltasten verschieben, + und − ändern die Grösse, [ und ] drehen, Bild ↑ und Bild ↓ ändern die Reihenfolge, Entf löscht.
      </p>
    </ToolPanel>
  );
}
