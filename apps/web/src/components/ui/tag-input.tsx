"use client";

import { useId, useRef, useState } from "react";
import { CornerDownLeft, X } from "lucide-react";
import { cn } from "@/lib/utils";

/** Standard-Normalisierung: ohne #, getrimmt, klein, Leerzeichen zu Bindestrich, max. 30 Zeichen. */
export function normalizeTag(raw: string) {
  return raw.replace(/^#+/, "").replace(/[,;]+/g, " ").trim().toLowerCase().replace(/\s+/g, "-").slice(0, 30);
}

/**
 * Schlagwort-Eingabe: Jedes Schlagwort wird einzeln mit Enter hinzugefügt und erscheint
 * als Pille. Backspace im leeren Feld entfernt das letzte, × entfernt gezielt.
 */
export function TagInput({
  value,
  onChange,
  max = 12,
  normalize = normalizeTag,
  placeholder = "Schlagwort eingeben und Enter drücken",
  id,
  invalid,
  describedBy,
  className,
}: {
  value: string[];
  onChange: (next: string[]) => void;
  max?: number;
  normalize?: (raw: string) => string;
  placeholder?: string;
  id?: string;
  invalid?: boolean;
  describedBy?: string;
  className?: string;
}) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const hintId = `${inputId}-hint`;
  const [draft, setDraft] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const full = value.length >= max;

  function add() {
    const t = normalize(draft);
    if (!t) return;
    if (value.includes(t)) {
      setNotice(`„#${t}“ ist schon dabei.`);
      setDraft("");
      return;
    }
    if (full) {
      setNotice(`Höchstens ${max} Schlagwörter.`);
      return;
    }
    onChange([...value, t]);
    setDraft("");
    setNotice(null);
  }

  return (
    <div className={className}>
      <div
        onClick={() => input.current?.focus()}
        className={cn(
          "flex min-h-11 cursor-text flex-wrap items-center gap-1.5 rounded-xl border border-line-strong bg-card px-2 py-1.5 transition-colors hover:border-rule-strong focus-within:border-moss focus-within:ring-4 focus-within:ring-moss/12",
          invalid && "border-danger",
        )}
      >
        {value.map((t) => (
          <span key={t} className="inline-flex h-7 items-center gap-1 rounded-full bg-moss-soft pl-2.5 pr-1 text-[12.5px] font-semibold text-moss-ink animate-pop">
            #{t}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onChange(value.filter((x) => x !== t));
              }}
              className="grid size-5 place-items-center rounded-full transition-colors hover:bg-moss hover:text-paper"
              aria-label={`Schlagwort ${t} entfernen`}
            >
              <X size={11} strokeWidth={2.4} />
            </button>
          </span>
        ))}
        <span className="relative flex min-w-[10rem] flex-1 items-center">
          <input
            ref={input}
            id={inputId}
            value={draft}
            disabled={full && !draft}
            onChange={(e) => {
              setDraft(e.target.value);
              if (notice) setNotice(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                add();
              } else if (e.key === "Backspace" && !draft && value.length) {
                onChange(value.slice(0, -1));
              }
            }}
            placeholder={full ? `Maximum erreicht (${max})` : value.length ? "Weiteres Schlagwort …" : placeholder}
            aria-describedby={[hintId, describedBy].filter(Boolean).join(" ")}
            aria-invalid={invalid || undefined}
            enterKeyHint="enter"
            autoComplete="off"
            className="h-7 w-full bg-transparent pl-1 pr-16 text-[14px] text-ink placeholder:text-muted/80 outline-none disabled:cursor-not-allowed"
          />
          {draft.trim() && (
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={add}
              className="absolute right-0 inline-flex h-6 items-center gap-1 rounded-full bg-moss px-2 text-[11px] font-semibold text-paper animate-pop"
              aria-label="Schlagwort hinzufügen"
            >
              <CornerDownLeft size={11} aria-hidden /> Enter
            </button>
          )}
        </span>
      </div>
      <p id={hintId} className={cn("mt-1.5 text-xs", notice ? "text-danger" : "text-muted")} aria-live="polite">
        {notice ?? `Jedes Schlagwort einzeln mit Enter hinzufügen · ${value.length}/${max}`}
      </p>
    </div>
  );
}
