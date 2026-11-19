"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ArrowUpRight, AtSign, Clock, Loader2 } from "lucide-react";
import { STORY_EMOJIS } from "@werkraum/shared";
import { Avatar } from "@/components/ui/misc";
import { callAction } from "@/lib/use-action";
import { storyMentionSearchAction } from "@/app/(app)/stories/actions";
import type { MentionSuggestion } from "@/server/stories/layout";
import { FieldLabel, ToolPanel } from "./editor-ui";
import type { NewElement } from "./editor-state";

const at = (x: number, y: number) => ({ x, y, scale: 1, rotation: 0 });

/** Uhrzeit und Datum zum Erstellzeitpunkt (Europe/Zurich), als fester Text */
export function nowLabels(d = new Date()) {
  return {
    time: d.toLocaleTimeString("de-CH", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Zurich" }),
    date: d.toLocaleDateString("de-CH", { weekday: "long", day: "numeric", month: "long", timeZone: "Europe/Zurich" }),
  };
}

/**
 * Sticker: Emoji aus der festen Auswahl, Erwähnung (@Person, im Betrachter antippbar), Link auf ein
 * eigenes öffentliches Projekt, Uhrzeit oder Datum. Ein Klick setzt den Sticker auf die Bühne.
 */
export function StickerPanel({ projects, onAdd, onDone }: { projects: { id: string; title: string }[]; onAdd: (e: NewElement) => void; onDone: () => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<MentionSuggestion[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);
  const searchId = useId();
  const labels = nowLabels();

  // Suche mit kurzer Verzögerung; nur die neueste Antwort zählt
  useEffect(() => {
    const q = query.trim().replace(/^@/, "");
    if (!q) {
      setResults(null);
      setError(null);
      return;
    }
    const n = ++seq.current;
    const t = setTimeout(async () => {
      setSearching(true);
      const r = await callAction(() => storyMentionSearchAction(q));
      if (n !== seq.current) return;
      setSearching(false);
      if (r.ok) {
        setResults(r.data);
        setError(null);
      } else setError(r.error);
    }, 250);
    return () => clearTimeout(t);
  }, [query]);

  const tile = "grid place-items-center rounded-xl border border-line bg-card text-[26px] leading-none hover:border-line-strong focus-visible:outline-2 focus-visible:outline-ink";
  return (
    <ToolPanel title="Sticker" onDone={onDone}>
      <div>
        <FieldLabel>Emoji</FieldLabel>
        <div className="grid grid-cols-8 gap-1.5 sm:grid-cols-10">
          {STORY_EMOJIS.map((emoji) => (
            <button key={emoji} type="button" className={`${tile} aspect-square`} aria-label={`Sticker ${emoji}`} onClick={() => onAdd({ type: "emoji", emoji, ...at(0.5, 0.45) })}>
              {emoji}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label htmlFor={searchId}>
          <FieldLabel>Person erwähnen</FieldLabel>
        </label>
        <div className="relative">
          <AtSign size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" aria-hidden />
          <input
            id={searchId}
            value={query}
            onChange={(e) => setQuery(e.target.value.slice(0, 30))}
            placeholder="Benutzername oder Name"
            autoComplete="off"
            aria-describedby={`${searchId}-status`}
            className="h-11 w-full rounded-xl border border-line-strong bg-card pl-9 pr-10 text-[15px] outline-none placeholder:text-muted focus:border-ink"
          />
          {searching && <Loader2 size={16} className="absolute right-3.5 top-1/2 -translate-y-1/2 animate-spin text-muted" aria-hidden />}
        </div>
        <p id={`${searchId}-status`} className="sr-only" aria-live="polite">
          {results ? (results.length ? `${results.length} Personen gefunden` : "Niemand gefunden") : ""}
        </p>
        {error && <p className="mt-2 text-[13px] text-danger">{error}</p>}
        {results && (
          results.length ? (
            <ul className="mt-2 divide-y divide-line rounded-xl border border-line">
              {results.map((p) => (
                <li key={p.handle}>
                  <button
                    type="button"
                    onClick={() => onAdd({ type: "mention", handle: p.handle, color: "white", ...at(0.5, 0.62) })}
                    className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-sunken focus-visible:outline-2 focus-visible:outline-ink"
                  >
                    <Avatar src={p.avatarUrl} name={p.displayName} size={32} />
                    <span className="min-w-0">
                      <span className="block truncate text-[14px] font-semibold">{p.displayName}</span>
                      <span className="block truncate text-[12.5px] text-muted">@{p.handle}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-[13px] text-muted">Niemand gefunden.</p>
          )
        )}
      </div>

      <div>
        <FieldLabel>Projekt verlinken</FieldLabel>
        {projects.length ? (
          <ul className="space-y-1.5">
            {projects.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => onAdd({ type: "projectLink", projectId: p.id, color: "coral", ...at(0.5, 0.72) })}
                  className="flex w-full items-center gap-2 rounded-xl border border-line bg-card px-3 py-2.5 text-left text-[14px] font-semibold hover:border-line-strong focus-visible:outline-2 focus-visible:outline-ink"
                >
                  <ArrowUpRight size={16} className="shrink-0 text-muted" aria-hidden />
                  <span className="truncate">{p.title}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-xl bg-sunken px-3.5 py-3 text-[13.5px] text-ink-2">Verlinken kannst du eigene, öffentliche Projekte.</p>
        )}
      </div>

      <div>
        <FieldLabel>Zeit</FieldLabel>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => onAdd({ type: "time", variant: "time", text: labels.time, color: "white", ...at(0.5, 0.3) })} className="inline-flex h-10 items-center gap-2 rounded-xl border border-line bg-card px-3.5 text-[14px] font-semibold hover:border-line-strong num">
            <Clock size={15} aria-hidden /> {labels.time}
          </button>
          <button type="button" onClick={() => onAdd({ type: "time", variant: "date", text: labels.date, color: "white", ...at(0.5, 0.3) })} className="inline-flex h-10 items-center gap-2 rounded-xl border border-line bg-card px-3.5 text-[14px] font-semibold hover:border-line-strong">
            {labels.date}
          </button>
        </div>
      </div>
    </ToolPanel>
  );
}
