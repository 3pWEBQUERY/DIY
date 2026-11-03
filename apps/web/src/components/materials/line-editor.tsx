"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Plus, X } from "lucide-react";
import { cn, pad } from "@/lib/utils";

export type Line = { key: string; name: string; quantity: string; note: string; materialId?: string };

export type MaterialSuggestion = { id: string; name: string; unit: string; category: string; brand: string | null };

export const newLine = (init: Partial<Omit<Line, "key">> = {}): Line => ({ key: crypto.randomUUID(), name: "", quantity: "", note: "", ...init });

/**
 * Wiederholbare Zeilen für Material- und Werkzeuglisten (Name, Menge, Notiz).
 * Materialien mit Autovervollständigung aus der Materialdatenbank (/api/v1/materials).
 */
export function LineEditor({
  value,
  onChange,
  kind,
  max = 60,
  errors,
  errorPrefix,
}: {
  value: Line[];
  onChange: (next: Line[]) => void;
  kind: "material" | "tool";
  max?: number;
  errors?: Record<string, string>;
  errorPrefix?: string;
}) {
  const update = (key: string, patch: Partial<Line>) => onChange(value.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= value.length) return;
    const next = [...value];
    [next[i], next[j]] = [next[j]!, next[i]!];
    onChange(next);
  };
  const label = kind === "material" ? "Material" : "Werkzeug";

  return (
    <div>
      {value.length > 0 && (
        <div className="hidden grid-cols-[2rem_minmax(0,1.6fr)_minmax(0,0.7fr)_minmax(0,1fr)_5.5rem] gap-2 border-b border-ink pb-1.5 sm:grid" aria-hidden>
          <span className="spec">Pos.</span>
          <span className="spec">{label}</span>
          <span className="spec">{kind === "material" ? "Menge" : "Anzahl"}</span>
          <span className="spec">Notiz</span>
          <span />
        </div>
      )}
      <ol className="divide-y divide-line">
        {value.map((l, i) => {
          const err = errors?.[`${errorPrefix}.${i}.name`];
          return (
            <li key={l.key} className="grid grid-cols-[2rem_minmax(0,1fr)_auto] gap-2 py-2 sm:grid-cols-[2rem_minmax(0,1.6fr)_minmax(0,0.7fr)_minmax(0,1fr)_5.5rem] sm:items-start">
              <span className="pt-2.5 font-mono text-[11px] text-muted num">{pad(i + 1)}</span>
              <div className="min-w-0">
                {kind === "material" ? (
                  <MaterialInput
                    value={l.name}
                    linked={!!l.materialId}
                    invalid={!!err}
                    label={`${label} ${i + 1}`}
                    onText={(name) => update(l.key, { name, materialId: undefined })}
                    onPick={(s) => update(l.key, { name: s.name, materialId: s.id, quantity: l.quantity || (s.unit ? `1 ${s.unit}` : "") })}
                  />
                ) : (
                  <input
                    value={l.name}
                    onChange={(e) => update(l.key, { name: e.target.value })}
                    maxLength={120}
                    aria-label={`${label} ${i + 1}`}
                    aria-invalid={err ? true : undefined}
                    placeholder="z. B. Japansäge"
                    className="h-10 w-full border border-line-strong bg-card px-2.5 text-[14px] outline-none hover:border-muted focus:border-ink aria-[invalid=true]:border-danger"
                  />
                )}
                {err && <p className="mt-1 text-[12px] text-danger">{err}</p>}
              </div>
              <div className="col-start-2 grid grid-cols-2 gap-2 sm:contents">
                <input
                  value={l.quantity}
                  onChange={(e) => update(l.key, { quantity: e.target.value })}
                  maxLength={40}
                  aria-label={`Menge für ${label} ${i + 1}`}
                  placeholder={kind === "material" ? "z. B. 3 Knäuel" : "1"}
                  className="h-10 w-full border border-line-strong bg-card px-2.5 text-[14px] outline-none hover:border-muted focus:border-ink"
                />
                <input
                  value={l.note}
                  onChange={(e) => update(l.key, { note: e.target.value })}
                  maxLength={200}
                  aria-label={`Notiz für ${label} ${i + 1}`}
                  placeholder="Notiz (optional)"
                  className="h-10 w-full border border-line-strong bg-card px-2.5 text-[14px] outline-none hover:border-muted focus:border-ink"
                />
              </div>
              <div className="col-start-3 row-start-1 flex justify-end sm:col-start-auto sm:row-start-auto">
                <button type="button" onClick={() => move(i, -1)} disabled={i === 0} className="grid size-10 place-items-center text-muted hover:text-ink disabled:opacity-30" aria-label={`${label} ${i + 1} nach oben`}>
                  <ArrowUp size={14} />
                </button>
                <button type="button" onClick={() => move(i, 1)} disabled={i === value.length - 1} className="hidden size-10 place-items-center text-muted hover:text-ink disabled:opacity-30 sm:grid" aria-label={`${label} ${i + 1} nach unten`}>
                  <ArrowDown size={14} />
                </button>
                <button type="button" onClick={() => onChange(value.filter((x) => x.key !== l.key))} className="grid size-10 place-items-center text-muted hover:text-danger" aria-label={`${label} ${i + 1} entfernen`}>
                  <X size={15} />
                </button>
              </div>
            </li>
          );
        })}
      </ol>
      {value.length < max && (
        <button
          type="button"
          onClick={() => onChange([...value, newLine()])}
          className="mt-2 inline-flex h-10 items-center gap-2 border border-dashed border-line-strong px-3 text-[13px] font-semibold text-muted hover:border-ink hover:text-ink"
        >
          <Plus size={14} /> {label} hinzufügen
        </button>
      )}
    </div>
  );
}

/** Kombobox nach ARIA-1.2-Muster mit Vorschlägen aus der Materialdatenbank. */
export function MaterialInput({ value, onText, onPick, linked, invalid, label }: { value: string; onText: (v: string) => void; onPick: (s: MaterialSuggestion) => void; linked: boolean; invalid: boolean; label: string }) {
  const id = useId();
  const [items, setItems] = useState<MaterialSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ctrl = useRef<AbortController | null>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
    ctrl.current?.abort();
  }, []);

  const search = (q: string) => {
    if (timer.current) clearTimeout(timer.current);
    if (q.trim().length < 2) {
      setItems([]);
      setOpen(false);
      return;
    }
    timer.current = setTimeout(async () => {
      ctrl.current?.abort();
      const c = new AbortController();
      ctrl.current = c;
      try {
        const res = await fetch(`/api/v1/materials?q=${encodeURIComponent(q.trim())}&limit=8`, { signal: c.signal });
        if (!res.ok) return;
        const json = (await res.json()) as { data: MaterialSuggestion[] };
        setItems(json.data);
        setActive(-1);
        setOpen(json.data.length > 0);
      } catch {
        /* abgebrochen oder offline */
      }
    }, 180);
  };

  const pick = (s: MaterialSuggestion) => {
    onPick(s);
    setOpen(false);
    setItems([]);
  };

  return (
    <div className="relative">
      <input
        role="combobox"
        aria-expanded={open}
        aria-controls={`${id}-list`}
        aria-autocomplete="list"
        aria-activedescendant={active >= 0 ? `${id}-opt-${active}` : undefined}
        aria-label={label}
        aria-invalid={invalid || undefined}
        value={value}
        maxLength={120}
        placeholder="z. B. Merinowolle"
        autoComplete="off"
        onChange={(e) => {
          onText(e.target.value);
          search(e.target.value);
        }}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        onKeyDown={(e) => {
          if (!open || !items.length) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((a) => (a + 1) % items.length);
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((a) => (a <= 0 ? items.length - 1 : a - 1));
          } else if (e.key === "Enter" && active >= 0) {
            e.preventDefault();
            pick(items[active]!);
          } else if (e.key === "Escape") setOpen(false);
        }}
        className={cn("h-10 w-full border border-line-strong bg-card px-2.5 text-[14px] outline-none hover:border-muted focus:border-ink aria-[invalid=true]:border-danger", linked && "pr-16")}
      />
      {linked && <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 font-mono text-[9px] uppercase tracking-[0.08em] text-moss">Katalog</span>}
      {open && (
        <ul id={`${id}-list`} role="listbox" className="absolute left-0 right-0 top-[calc(100%+2px)] z-30 max-h-64 overflow-y-auto border border-ink bg-card py-1">
          {items.map((s, i) => (
            <li
              key={s.id}
              id={`${id}-opt-${i}`}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => {
                e.preventDefault();
                pick(s);
              }}
              className={cn("flex cursor-pointer items-baseline justify-between gap-3 px-3 py-2 text-[14px]", i === active ? "bg-sunken" : "hover:bg-sunken")}
            >
              <span className="min-w-0 truncate">
                {s.name}
                {s.brand && <span className="text-muted"> · {s.brand}</span>}
              </span>
              <span className="spec shrink-0">{s.category}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
