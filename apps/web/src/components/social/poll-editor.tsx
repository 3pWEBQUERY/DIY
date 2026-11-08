"use client";

import { Plus, X } from "lucide-react";
import { Input } from "@/components/ui/field";
import { Select } from "@/components/ui/select";

export type PollDraft = { options: string[]; durationHours: number; multiple: boolean };
export const emptyPoll = (): PollDraft => ({ options: ["", ""], durationHours: 72, multiple: false });
export const pollReady = (p: PollDraft | null) => !p || (p.options.filter((o) => o.trim()).length >= 2 && p.options.every((o) => o.trim()));

/** Antworten (2–4), Laufzeit und Mehrfachauswahl einer Umfrage. Die Frage ist der Beitragstext. */
export function PollEditor({ value, onChange, onRemove }: { value: PollDraft; onChange: (p: PollDraft) => void; onRemove: () => void }) {
  const set = (i: number, v: string) => onChange({ ...value, options: value.options.map((o, k) => (k === i ? v : o)) });
  return (
    <div className="rounded-2xl border border-line bg-paper p-4">
      <div className="mb-3 flex items-center justify-between">
        <p className="spec">Umfrage</p>
        <button type="button" onClick={onRemove} className="text-[13px] text-muted hover:text-ink">
          Umfrage entfernen
        </button>
      </div>
      <ol className="space-y-2">
        {value.options.map((o, i) => (
          <li key={i} className="flex items-center gap-2">
            <Input value={o} onChange={(e) => set(i, e.target.value)} maxLength={80} placeholder={`Antwort ${i + 1}`} aria-label={`Antwort ${i + 1}`} className="h-10 text-sm" />
            {value.options.length > 2 && (
              <button type="button" onClick={() => onChange({ ...value, options: value.options.filter((_, k) => k !== i) })} className="grid size-9 shrink-0 place-items-center rounded-xl text-muted hover:bg-sunken hover:text-ink" aria-label={`Antwort ${i + 1} entfernen`}>
                <X size={16} />
              </button>
            )}
          </li>
        ))}
      </ol>
      {value.options.length < 4 && (
        <button type="button" onClick={() => onChange({ ...value, options: [...value.options, ""] })} className="mt-2 inline-flex items-center gap-1.5 text-[13px] font-semibold text-moss hover:underline">
          <Plus size={14} /> Antwort hinzufügen
        </button>
      )}
      <div className="mt-4 flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2 text-[13px]">
          <span className="text-muted">Laufzeit</span>
          <Select value={String(value.durationHours)} onChange={(e) => onChange({ ...value, durationHours: Number(e.target.value) })} className="h-9 w-auto min-w-[110px] text-[13px]">
            <option value="24">1 Tag</option>
            <option value="72">3 Tage</option>
            <option value="168">7 Tage</option>
          </Select>
        </label>
        <label className="flex cursor-pointer items-center gap-2 text-[13px]">
          <input type="checkbox" checked={value.multiple} onChange={(e) => onChange({ ...value, multiple: e.target.checked })} className="size-4 accent-[var(--color-moss)]" />
          Mehrfachauswahl erlauben
        </label>
      </div>
    </div>
  );
}
