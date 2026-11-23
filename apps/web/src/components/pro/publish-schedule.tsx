"use client";

import Link from "next/link";
import { useId } from "react";
import { CalendarClock } from "lucide-react";
import { ProMark } from "@/components/pro/pro-mark";
import { cn } from "@/lib/utils";

/** ISO → Wert für `<input type="datetime-local">` in der Zeitzone des Browsers */
export function toLocalInput(iso: string | null | undefined) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** Wert aus `datetime-local` → ISO (oder null) */
export function fromLocalInput(v: string) {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/**
 * „Später veröffentlichen“ (Creator Pro) für Projekte und Anleitungen. Ohne Pro: Hinweis mit Link,
 * kein verstecktes Feld. `value` ist der Wert des datetime-local-Feldes ("" = sofort).
 */
export function PublishSchedule({
  pro,
  enabled,
  onEnabled,
  value,
  onChange,
  error,
  noun,
  className,
}: {
  pro: boolean;
  enabled: boolean;
  onEnabled: (v: boolean) => void;
  value: string;
  onChange: (v: string) => void;
  error?: string;
  /** „das Projekt“ / „die Anleitung“ */
  noun: string;
  className?: string;
}) {
  const id = useId();
  if (!pro) {
    return (
      <p className={cn("flex flex-wrap items-center gap-2 text-[13px] text-muted", className)}>
        <CalendarClock size={15} aria-hidden />
        Zeitgesteuert veröffentlichen kannst du mit
        <Link href="/studio/pro" className="inline-flex items-center gap-1 font-semibold text-ink-2 underline-offset-2 hover:underline">
          Creator Pro <ProMark size="sm" />
        </Link>
      </p>
    );
  }
  const min = toLocalInput(new Date(Date.now() + 6 * 60_000).toISOString());
  return (
    <div className={cn("rounded-2xl border border-line bg-card p-4", className)}>
      <label className="flex cursor-pointer items-center gap-3 text-[14px] font-semibold">
        <input type="checkbox" className="size-4 accent-moss" checked={enabled} onChange={(e) => onEnabled(e.target.checked)} />
        <CalendarClock size={16} aria-hidden />
        Später veröffentlichen
        <ProMark size="sm" />
      </label>
      {enabled && (
        <div className="mt-3">
          <label htmlFor={id} className="mb-1.5 block text-[13px] text-muted">
            Veröffentlichen am
          </label>
          <input
            id={id}
            type="datetime-local"
            value={value}
            min={min}
            onChange={(e) => onChange(e.target.value)}
            aria-invalid={error ? true : undefined}
            className="h-11 w-full max-w-xs rounded-xl border border-field bg-card px-3 text-[15px] outline-none focus:border-moss"
          />
          <p className="mt-1.5 text-[12.5px] text-muted">
            Bis dahin bleibt {noun} ein Entwurf und ist nur für dich sichtbar. Den Termin findest du im{" "}
            <Link href="/studio/kalender" className="underline underline-offset-2 hover:text-ink">
              Inhaltskalender
            </Link>
            .
          </p>
          {error && (
            <p role="alert" className="mt-1 text-[13px] text-danger">
              {error}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
