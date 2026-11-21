"use client";

import { useId } from "react";
import { MEMBER_COUNTRIES, MEMBER_COUNTRY_FLAG, MEMBER_COUNTRY_LABEL, currencyForCountry, type MemberCountry } from "@werkraum/shared";
import { cn } from "@/lib/utils";

/**
 * Wahl des Landes (CH, LI, DE, AT) als vier Kacheln mit Währung. Echte Radio-Buttons im Formular
 * (`name`), damit `formToObject` und Tastaturbedienung ohne Zusatzlogik funktionieren.
 */
export function CountryPicker({
  name = "country",
  value,
  defaultValue,
  onChange,
  error,
  legend = "Land",
  hint = "Bestimmt, in welcher Währung du Preise siehst und bezahlst.",
  className,
}: {
  name?: string;
  value?: MemberCountry | null;
  defaultValue?: MemberCountry | null;
  onChange?: (c: MemberCountry) => void;
  error?: string;
  legend?: string;
  hint?: string | null;
  className?: string;
}) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errId = error ? `${id}-err` : undefined;
  return (
    <fieldset className={className} aria-describedby={[hintId, errId].filter(Boolean).join(" ") || undefined} aria-invalid={error ? true : undefined}>
      <legend className="mb-1.5 text-[14px] font-semibold text-ink">{legend}</legend>
      {hint && (
        <p id={hintId} className="mb-2.5 text-[13px] leading-snug text-muted">
          {hint}
        </p>
      )}
      <div className="grid grid-cols-2 gap-2">
        {MEMBER_COUNTRIES.map((c) => {
          const cur = currencyForCountry(c);
          const controlled = value !== undefined ? { checked: value === c, onChange: () => onChange?.(c) } : { defaultChecked: defaultValue === c, onChange: () => onChange?.(c) };
          return (
            <label
              key={c}
              className={cn(
                "flex cursor-pointer items-center gap-3 rounded-xl border bg-card px-3.5 py-3 transition-colors",
                "border-field hover:border-ink-2 has-[:checked]:border-moss has-[:checked]:bg-moss-soft has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-1 has-[:focus-visible]:outline-moss",
                error && "border-danger",
              )}
            >
              <input type="radio" name={name} value={c} className="sr-only" required {...controlled} />
              <span className="text-[20px] leading-none" aria-hidden>
                {MEMBER_COUNTRY_FLAG[c]}
              </span>
              <span className="min-w-0">
                <span className="block text-[14.5px] font-semibold leading-tight">{MEMBER_COUNTRY_LABEL[c]}</span>
                <span className="block font-mono text-[11.5px] uppercase tracking-[0.06em] text-muted">Preise in {cur === "EUR" ? "€ Euro" : "CHF Franken"}</span>
              </span>
            </label>
          );
        })}
      </div>
      {error && (
        <p id={errId} role="alert" className="mt-1.5 text-[13px] text-danger">
          {error}
        </p>
      )}
    </fieldset>
  );
}
