"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Search, Smile } from "lucide-react";
import { EMOJI_GROUPS, emojiName, searchEmoji } from "@/lib/emoji-data";
import { cn } from "@/lib/utils";

/** Systemschrift für Emojis: auf Apple-Geräten die Apple-Emojis, sonst die des Geräts */
export const EMOJI_FONT = '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", "Segoe UI Symbol", sans-serif';

const RECENT_KEY = "wr-emoji-recent";
function readRecent(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]");
    return Array.isArray(v) ? v.filter((x) => typeof x === "string").slice(0, 16) : [];
  } catch {
    return [];
  }
}
function pushRecent(e: string) {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify([e, ...readRecent().filter((x) => x !== e)].slice(0, 16)));
  } catch {
    /* privater Modus: ohne „Zuletzt verwendet“ */
  }
}

/**
 * Emoji-Auswahl als Aufklapp-Fläche: Suche (deutsche Stichwörter), Kategorien, zuletzt verwendet.
 * Tastatur: Tab durch die Auswahl, Enter fügt ein, Esc schliesst (Fokus zurück auf den Knopf).
 */
export function EmojiPicker({ onPick, label = "Emoji einfügen", className, align = "start", keepFocus = false }: { onPick: (emoji: string) => void; label?: string; className?: string; align?: "start" | "end"; /** Auslöser behält den Fokus nicht (z. B. Editor: Einfügestelle merken) */ keepFocus?: boolean }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState(EMOJI_GROUPS[0]!.id);
  const [recent, setRecent] = useState<string[]>([]);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    setRecent(readRecent());
    requestAnimationFrame(() => search.current?.focus({ preventScroll: true }));
    const onDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  const results = useMemo(() => searchEmoji(query), [query]);
  const shown = query.trim() ? results : (EMOJI_GROUPS.find((g) => g.id === group)?.items.map(([e]) => e) ?? []);

  function close(focusTrigger = true) {
    setOpen(false);
    setQuery("");
    if (focusTrigger) trigger.current?.focus({ preventScroll: true });
  }
  function pick(e: string) {
    pushRecent(e);
    onPick(e);
    close(!keepFocus);
  }

  const cell = "grid size-9 place-items-center rounded-lg text-[22px] leading-none hover:bg-sunken focus-visible:outline-2 focus-visible:outline-ink";
  return (
    <div ref={root} className={cn("relative inline-block", className)} onKeyDown={(e) => e.key === "Escape" && open && (e.preventDefault(), e.stopPropagation(), close())}>
      <button
        ref={trigger}
        type="button"
        aria-label={label}
        title={label}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        // Im Editor: Auswahl/Einfügestelle nicht verlieren
        onMouseDown={(e) => keepFocus && e.preventDefault()}
        onClick={() => (open ? close() : setOpen(true))}
        className={cn("grid size-8 place-items-center rounded-lg text-ink-2 transition-colors hover:bg-sunken hover:text-ink", open && "bg-moss-soft text-moss-ink")}
      >
        <Smile size={16} strokeWidth={2.2} aria-hidden />
      </button>
      {open && (
        <div id={panelId} role="dialog" aria-label="Emojis" className={cn("absolute top-full z-50 mt-1.5 w-[min(21rem,calc(100vw-2rem))] rounded-2xl border border-line bg-card p-2", align === "end" ? "right-0" : "left-0")}>
          <label className="relative block">
            <span className="sr-only">Emoji suchen</span>
            <Search size={15} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" aria-hidden />
            <input
              ref={search}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Suchen, z. B. Herz, Party, Wolle"
              className="h-9 w-full rounded-lg border border-line-strong bg-paper pl-8 pr-2.5 text-[14px] outline-none placeholder:text-muted focus:border-ink"
            />
          </label>
          {!query.trim() && (
            <div role="tablist" aria-label="Kategorien" className="mt-2 flex gap-1 overflow-x-auto pb-1">
              {EMOJI_GROUPS.map((g) => (
                <button
                  key={g.id}
                  type="button"
                  role="tab"
                  aria-selected={group === g.id}
                  onClick={() => setGroup(g.id)}
                  className={cn("shrink-0 rounded-lg border px-2.5 py-1 text-[12px] font-semibold", group === g.id ? "border-ink bg-ink text-paper" : "border-line text-ink-2 hover:border-line-strong")}
                >
                  {g.label}
                </button>
              ))}
            </div>
          )}
          <div className="mt-1.5 max-h-60 overflow-y-auto">
            {!query.trim() && recent.length > 0 && (
              <>
                <p className="spec px-1 pb-1 pt-1.5">Zuletzt verwendet</p>
                <div className="grid grid-cols-8 gap-0.5" style={{ fontFamily: EMOJI_FONT }}>
                  {recent.map((e) => (
                    <button key={`r-${e}`} type="button" className={cell} aria-label={emojiName(e)} title={emojiName(e)} onClick={() => pick(e)}>
                      {e}
                    </button>
                  ))}
                </div>
                <p className="spec px-1 pb-1 pt-2.5">{EMOJI_GROUPS.find((g) => g.id === group)?.label}</p>
              </>
            )}
            {shown.length ? (
              <div className="grid grid-cols-8 gap-0.5" style={{ fontFamily: EMOJI_FONT }}>
                {shown.map((e, i) => (
                  <button key={`${e}-${i}`} type="button" className={cell} aria-label={emojiName(e)} title={emojiName(e)} onClick={() => pick(e)}>
                    {e}
                  </button>
                ))}
              </div>
            ) : (
              <p className="px-2 py-4 text-center text-[13px] text-muted">Kein Emoji gefunden.</p>
            )}
          </div>
          <p className="sr-only" aria-live="polite">
            {query.trim() ? `${results.length} Emojis gefunden` : ""}
          </p>
        </div>
      )}
    </div>
  );
}
