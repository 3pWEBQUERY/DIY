"use client";

import { useCallback, useEffect, useId, useRef, useState, type ChangeEvent, type KeyboardEvent } from "react";
import { suggestHashtagsAction } from "@/app/(app)/hashtag/actions";
import { cn } from "@/lib/utils";

type Suggestion = { name: string; display: string; count: number };

/** Angefangener Hashtag direkt vor der Schreibmarke (gleiche Grenzen wie die Erkennung). */
const TRIGGER = /(?:^|[^\p{L}\p{M}\p{N}_&#/=?.\-])#([\p{L}\p{M}\p{N}_]{0,50})$/u;

/**
 * Hashtag-Vorschläge beim Tippen in einem Textfeld: Nach `#` erscheinen bereits verwendete Hashtags
 * (passende zuerst nach Häufigkeit, ohne Eingabe die meistgenutzten). Pfeiltasten wählen,
 * Enter oder Tab übernimmt, Esc schliesst. Das Textfeld bleibt ein normales `<textarea>`/`<input>`.
 *
 * ```tsx
 * const tags = useHashtagAssist(body, setBody);
 * <div className="relative">
 *   <textarea ref={tags.ref} value={body} onChange={tags.onChange} onKeyDown={(e) => tags.onKeyDown(e)} onSelect={tags.onSelect} {...tags.aria} />
 *   {tags.popup}
 * </div>
 * ```
 */
export function useHashtagAssist(value: string, onChange: (v: string) => void) {
  const el = useRef<HTMLTextAreaElement | HTMLInputElement | null>(null);
  const listId = useId();
  const [query, setQuery] = useState<string | null>(null);
  const [items, setItems] = useState<Suggestion[]>([]);
  const [active, setActive] = useState(0);
  const [dismissed, setDismissed] = useState(false);
  const seq = useRef(0);

  const readCaret = useCallback((text: string) => {
    const node = el.current;
    const caret = node?.selectionStart ?? text.length;
    const m = TRIGGER.exec(text.slice(0, caret));
    setQuery(m ? m[1]! : null);
  }, []);

  useEffect(() => {
    if (query === null || dismissed) return;
    const n = ++seq.current;
    const t = setTimeout(async () => {
      const r = await suggestHashtagsAction(query).catch(() => [] as Suggestion[]);
      if (n !== seq.current) return;
      // Bereits vollständig getippter, einziger Treffer: nichts anbieten
      setItems(r.length === 1 && r[0]!.name === query.toLowerCase() ? [] : r);
      setActive(0);
    }, 140);
    return () => clearTimeout(t);
  }, [query, dismissed]);

  const open = query !== null && !dismissed && items.length > 0;

  const apply = (s: Suggestion) => {
    const node = el.current;
    const caret = node?.selectionStart ?? value.length;
    const before = value.slice(0, caret);
    const m = TRIGGER.exec(before);
    if (!m) return;
    const start = caret - m[1]!.length - 1;
    const insert = `#${s.display} `;
    const after = value.slice(caret).replace(/^[\p{L}\p{M}\p{N}_]+/u, "");
    onChange(value.slice(0, start) + insert + (after.startsWith(" ") ? after.slice(1) : after));
    setQuery(null);
    setItems([]);
    requestAnimationFrame(() => {
      const pos = start + insert.length;
      el.current?.focus();
      el.current?.setSelectionRange(pos, pos);
    });
  };

  return {
    ref: (node: HTMLTextAreaElement | HTMLInputElement | null) => {
      el.current = node;
    },
    onChange: (e: ChangeEvent<HTMLTextAreaElement | HTMLInputElement>) => {
      onChange(e.target.value);
      setDismissed(false);
      readCaret(e.target.value);
    },
    onSelect: () => readCaret(value),
    /** true = Taste wurde für die Vorschläge verwendet (nicht weiterverarbeiten) */
    onKeyDown: (e: KeyboardEvent): boolean => {
      if (!open || e.nativeEvent.isComposing) return false;
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        setActive((a) => (a + (e.key === "ArrowDown" ? 1 : items.length - 1)) % items.length);
        return true;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        apply(items[active]!);
        return true;
      }
      if (e.key === "Escape") {
        // Nur die Vorschläge schliessen, nicht einen umgebenden Dialog
        e.preventDefault();
        e.stopPropagation();
        setDismissed(true);
        return true;
      }
      return false;
    },
    aria: {
      "aria-autocomplete": "list" as const,
      "aria-controls": open ? listId : undefined,
      "aria-expanded": open,
      "aria-activedescendant": open ? `${listId}-${active}` : undefined,
    },
    popup: open ? (
      <ul id={listId} role="listbox" aria-label="Hashtag-Vorschläge" className="absolute inset-x-0 top-full z-30 mt-1.5 max-h-64 overflow-y-auto rounded-2xl border border-line bg-card py-1.5">
        {items.map((s, i) => (
          <li
            key={s.name}
            id={`${listId}-${i}`}
            role="option"
            aria-selected={i === active}
            // Fokus im Textfeld lassen
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => apply(s)}
            onMouseEnter={() => setActive(i)}
            className={cn("flex cursor-pointer items-baseline justify-between gap-4 px-4 py-2 text-[14.5px]", i === active ? "bg-sunken text-ink" : "text-ink-2")}
          >
            <span className="truncate">
              <span className="text-moss">#</span>
              {s.display}
            </span>
            <span className="shrink-0 font-mono text-[11px] text-muted">{new Intl.NumberFormat("de-CH").format(s.count)}×</span>
          </li>
        ))}
      </ul>
    ) : null,
  };
}
