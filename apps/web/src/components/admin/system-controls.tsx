"use client";

import { useState } from "react";
import { ShieldCheck, ShieldAlert } from "lucide-react";
import type { ActionResult } from "@/server/errors";
import { useAction } from "@/lib/use-action";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Select } from "@/components/ui/select";

/** Barrierefreier Schalter (role=switch). */
export function Switch({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn("relative inline-flex h-6 w-11 shrink-0 items-center border transition-colors disabled:opacity-50 rounded-xl", checked ? "border-moss bg-moss" : "border-line-strong bg-sunken")}
    >
      <span className={cn("absolute size-4 bg-paper transition-transform", checked ? "translate-x-[22px]" : "translate-x-[3px] border border-line-strong rounded-2xl")} />
    </button>
  );
}

export function SettingControl({
  settingKey,
  value,
  isDefault,
  defaultValue,
  unit,
  min,
  max,
  format,
  locked,
  save,
  reset,
}: {
  settingKey: string;
  value: number | boolean;
  isDefault: boolean;
  defaultValue: number | boolean;
  unit?: string;
  min?: number;
  max?: number;
  format?: "bps";
  locked?: string;
  save: (key: string, value: unknown) => Promise<ActionResult<unknown>>;
  reset: (key: string) => Promise<ActionResult<unknown>>;
}) {
  const s = useAction(save);
  const r = useAction(reset);
  const [draft, setDraft] = useState(String(value));
  if (typeof value === "boolean") {
    return (
      <div className="flex items-center justify-end gap-3">
        {!isDefault && (
          <Button size="sm" variant="ghost" onClick={() => r.run(settingKey)} disabled={r.pending || !!locked}>
            Standard
          </Button>
        )}
        <Switch checked={value} disabled={s.pending || !!locked} onChange={(v) => s.run(settingKey, v)} label={settingKey} />
      </div>
    );
  }
  const n = Number(draft);
  const dirty = draft !== String(value);
  return (
    <form
      className="flex flex-wrap items-center justify-end gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        s.run(settingKey, draft);
      }}
    >
      {format === "bps" && Number.isFinite(n) && <span className="font-mono text-[12px] text-muted">= {(n / 100).toLocaleString("de-CH", { maximumFractionDigits: 2 })} %</span>}
      <span className="flex items-center border border-line-strong bg-card focus-within:border-moss rounded-2xl">
        <input
          type="number"
          value={draft}
          min={min}
          max={max}
          step={1}
          disabled={!!locked}
          onChange={(e) => setDraft(e.target.value)}
          aria-label={`Wert für ${settingKey}`}
          className="h-9 w-24 bg-transparent px-2 text-right font-mono text-[13px] outline-none disabled:text-muted"
        />
        {unit && <span className="border-l border-line px-2 font-mono text-[11px] text-muted">{unit}</span>}
      </span>
      <Button type="submit" size="sm" variant={dirty ? "ink" : "outline"} disabled={!dirty || s.pending || !!locked}>
        Speichern
      </Button>
      {!isDefault && (
        <Button
          size="sm"
          variant="ghost"
          disabled={r.pending || !!locked}
          onClick={() => {
            setDraft(String(defaultValue));
            r.run(settingKey);
          }}
        >
          Standard ({String(defaultValue)})
        </Button>
      )}
      {s.error && <span className="w-full text-right text-[12px] text-danger">{s.error}</span>}
      {locked && <span className="w-full text-right text-[12px] text-muted">{locked}</span>}
    </form>
  );
}

export function FlagSwitch({ flagKey, enabled, toggle }: { flagKey: string; enabled: boolean; toggle: (key: string, enabled: boolean) => Promise<ActionResult<unknown>> }) {
  const { run, pending } = useAction(toggle);
  return <Switch checked={enabled} disabled={pending} onChange={(v) => run(flagKey, v)} label={`Feature ${flagKey}`} />;
}

/** Rollout in Prozent (0–100): Anteil der angemeldeten Konten, für die das Flag gilt. */
export function FlagRollout({ flagKey, rollout, save }: { flagKey: string; rollout: number; save: (key: string, rollout: number) => Promise<ActionResult<unknown>> }) {
  const { run, pending } = useAction(save);
  const [v, setV] = useState(String(rollout));
  const dirty = Number(v) !== rollout;
  return (
    <form
      className="flex items-center justify-end gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        run(flagKey, Number(v));
      }}
    >
      <span className="relative">
        <Input value={v} onChange={(e) => setV(e.target.value.replace(/\D/g, "").slice(0, 3))} inputMode="numeric" aria-label={`Rollout ${flagKey} in Prozent`} className="h-9 w-[72px] pr-6 text-right text-[13px]" />
        <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[12px] text-muted">%</span>
      </span>
      {dirty && (
        <Button type="submit" size="sm" variant="outline" disabled={pending || Number(v) > 100}>
          Speichern
        </Button>
      )}
    </form>
  );
}

export function TicketStatusSelect({ id, status, options, action }: { id: string; status: string; options: { value: string; label: string }[]; action: (id: string, status: string) => Promise<ActionResult<unknown>> }) {
  const { run, pending } = useAction(action);
  return (
    <Select
      defaultValue={status}
      disabled={pending}
      onChange={(e) => run(id, e.target.value)}
      aria-label="Status ändern"
      className="h-9 w-auto min-w-[150px] text-[13px]"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </Select>
  );
}

export type AuditVerifyResult =
  | { ok: true; checked: number; from: number; through: number; complete: boolean; hmac: boolean; lastCheckpoint: { seq: number; at: string } | null }
  | { ok: false; checked: number; from: number; brokenAt: number; reason: string; hmac: boolean; lastCheckpoint: { seq: number; at: string } | null };

/**
 * „Integrität prüfen“: prüft inkrementell ab dem letzten geprüften Prüfpunkt (schnell), „Vollständig“ vom
 * ersten Eintrag an. Zeigt Bereich, Verfahren (mit/ohne Schlüssel) und letzten Prüfpunkt.
 */
export function AuditVerifyButton({ action }: { action: (input?: { full?: boolean }) => Promise<ActionResult<AuditVerifyResult>> }) {
  const [result, setResult] = useState<AuditVerifyResult | null>(null);
  const { run, pending } = useAction(action, { refresh: false, onSuccess: setResult });
  const n = (v: number) => v.toLocaleString("de-CH");
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button variant="ink" size="sm" onClick={() => run({})} disabled={pending} aria-busy={pending}>
        <ShieldCheck size={15} aria-hidden /> {pending ? "Prüfe Hash-Kette …" : "Integrität prüfen"}
      </Button>
      <Button variant="outline" size="sm" onClick={() => run({ full: true })} disabled={pending} title="Gesamte Kette vom ersten Eintrag an prüfen (dauert länger)">
        Vollständig prüfen
      </Button>
      <span role="status" aria-live="polite" className="text-[13px]">
        {result &&
          (result.ok ? (
            <span className="inline-flex flex-wrap items-center gap-1.5 text-moss">
              <ShieldCheck size={15} aria-hidden /> Intakt bis Eintrag #{n(result.through)}
              {" – "}
              {result.from > 0 ? `${n(result.checked)} neue Einträge seit Prüfpunkt #${n(result.from)} geprüft` : `${n(result.checked)} Einträge lückenlos verkettet`}
              {!result.complete && " (Teilprüfung – erneut klicken, um fortzusetzen)"}
              {!result.hmac && <span className="text-warn"> · ohne AUDIT_HMAC_KEY (einfaches SHA-256)</span>}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 font-semibold text-danger">
              <ShieldAlert size={15} aria-hidden /> Kette gebrochen bei Eintrag #{n(result.brokenAt)}: {result.reason} Sofort eskalieren.
            </span>
          ))}
      </span>
    </div>
  );
}
