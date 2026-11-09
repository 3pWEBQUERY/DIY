"use client";

import { useMemo, useState } from "react";
import { Check, Search, X } from "lucide-react";
import { Avatar } from "@/components/ui/misc";
import { cn } from "@/lib/utils";

export type Candidate = { id: string; handle: string; displayName: string; avatarUrl: string | null };

/**
 * Auswahl mehrerer Personen: Vorschläge (Personen, denen du folgst) durchsuchen oder einen
 * Profilnamen direkt eingeben. Gibt Profilnamen (handles) zurück.
 */
export function PeoplePicker({ candidates, value, onChange, exclude = [], max }: { candidates: Candidate[]; value: string[]; onChange: (handles: string[]) => void; exclude?: string[]; max?: number }) {
  const [q, setQ] = useState("");
  const term = q.trim().replace(/^@/, "").toLowerCase();
  const pool = useMemo(() => candidates.filter((c) => !exclude.includes(c.handle)), [candidates, exclude]);
  const shown = pool.filter((c) => !term || c.handle.includes(term) || c.displayName.toLowerCase().includes(term)).slice(0, 50);
  const known = new Map(candidates.map((c) => [c.handle, c]));
  const full = max != null && value.length >= max;
  const toggle = (h: string) => onChange(value.includes(h) ? value.filter((x) => x !== h) : full ? value : [...value, h]);
  const canAddTyped = /^[a-z0-9._]{2,30}$/.test(term) && !known.has(term) && !value.includes(term) && !exclude.includes(term) && !full;

  return (
    <div>
      {value.length > 0 && (
        <ul className="mb-3 flex flex-wrap gap-2" aria-label="Ausgewählt">
          {value.map((h) => {
            const c = known.get(h);
            return (
              <li key={h}>
                <button type="button" onClick={() => toggle(h)} className="inline-flex items-center gap-1.5 rounded-full border border-moss bg-moss-soft py-1 pl-1 pr-2.5 text-[13px]" aria-label={`${c?.displayName ?? `@${h}`} entfernen`}>
                  <Avatar src={c?.avatarUrl ?? null} name={c?.displayName ?? h} size={22} />
                  {c?.displayName ?? `@${h}`}
                  <X size={13} aria-hidden />
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <div className="flex items-center gap-2 rounded-xl border border-line-strong bg-card px-3 focus-within:border-moss">
        <Search size={15} className="text-muted" aria-hidden />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              if (shown.length === 1) toggle(shown[0]!.handle);
              else if (canAddTyped) toggle(term);
              setQ("");
            }
          }}
          placeholder="Name oder @benutzername"
          aria-label="Personen suchen"
          className="h-11 flex-1 bg-transparent text-[15px] outline-none"
        />
      </div>
      <ul className="mt-2 max-h-72 overflow-y-auto rounded-2xl border border-line bg-card p-1" aria-label="Vorschläge">
        {canAddTyped && (
          <li>
            <button type="button" onClick={() => (toggle(term), setQ(""))} className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm hover:bg-sunken">
              <span className="grid size-8 place-items-center rounded-full bg-sunken text-muted">@</span>
              <span>
                <span className="font-semibold">@{term}</span> hinzufügen
              </span>
            </button>
          </li>
        )}
        {shown.map((c) => {
          const on = value.includes(c.handle);
          return (
            <li key={c.id}>
              <button type="button" role="checkbox" aria-checked={on} disabled={!on && full} onClick={() => toggle(c.handle)} className={cn("flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left hover:bg-sunken disabled:opacity-40", on && "bg-moss-soft hover:bg-moss-soft")}>
                <Avatar src={c.avatarUrl} name={c.displayName} size={32} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{c.displayName}</span>
                  <span className="block truncate text-xs text-muted">@{c.handle}</span>
                </span>
                <span className={cn("grid size-5 shrink-0 place-items-center rounded-md border", on ? "border-moss bg-moss text-paper" : "border-rule-strong")} aria-hidden>
                  {on && <Check size={13} strokeWidth={3} />}
                </span>
              </button>
            </li>
          );
        })}
        {!shown.length && !canAddTyped && <li className="px-3 py-4 text-center text-sm text-muted">{pool.length ? "Niemand gefunden." : "Folge Personen, um sie hier zu finden – oder gib einen @benutzernamen ein."}</li>}
      </ul>
    </div>
  );
}
