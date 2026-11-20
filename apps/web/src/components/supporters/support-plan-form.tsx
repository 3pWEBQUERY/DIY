"use client";

import { useState } from "react";
import { formatMoney } from "@werkraum/shared";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Textarea } from "@/components/ui/field";
import { useAction } from "@/lib/use-action";
import { cn } from "@/lib/utils";
import { saveSupportPlanAction } from "@/app/studio/unterstuetzer/actions";

/** Studio: Unterstützer-Abo ein-/ausschalten, Stufe und Beschreibung. */
export function SupportPlanForm({ plan, tiers, feeBps, eligible }: { plan: { enabled: boolean; priceMinor: number; perks: string }; tiers: readonly number[]; feeBps: number; eligible: boolean }) {
  const [enabled, setEnabled] = useState(plan.enabled);
  const [price, setPrice] = useState(plan.priceMinor);
  const [perks, setPerks] = useState(plan.perks);
  const save = useAction(saveSupportPlanAction);
  const net = price - Math.round((price * feeBps) / 10_000);

  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        save.run({ enabled, priceMinor: price, perks });
      }}
    >
      <Checkbox
        label={<span className="font-semibold">Unterstützungen annehmen</span>}
        checked={enabled}
        disabled={!eligible && !enabled}
        onChange={(e) => setEnabled(e.target.checked)}
      />
      <fieldset>
        <legend className="mb-2 text-[13px] font-semibold">Monatsbetrag</legend>
        <div className="grid grid-cols-3 gap-2" role="radiogroup">
          {tiers.map((t) => (
            <label
              key={t}
              className={cn(
                "flex cursor-pointer flex-col items-center rounded-2xl border px-3 py-3 text-center has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-moss",
                price === t ? "border-moss bg-moss-soft/60" : "border-rule-strong bg-card hover:border-muted",
              )}
            >
              <input type="radio" name="tier" value={t} checked={price === t} onChange={() => setPrice(t)} className="sr-only" />
              <span className="num text-[18px] font-bold">{formatMoney(t)}</span>
              <span className="text-[12px] text-muted">pro Monat</span>
            </label>
          ))}
        </div>
        <p className="mt-2 text-[12.5px] leading-relaxed text-muted">
          Du erhältst <b className="num text-ink-2">{formatMoney(net)}</b> je Unterstützung und Monat – Werkuno behält {(feeBps / 100).toLocaleString("de-CH")} % für Zahlung und Betrieb. In der iOS-App zahlen Unterstützer:innen etwas mehr (Apple-Gebühr), dein Anteil bleibt gleich. Eine neue Stufe gilt für neue Unterstützungen.
        </p>
      </fieldset>
      <Field label="Was Unterstützer:innen bekommen" optional hint="Zum Beispiel: exklusive Anleitungen, Vorlagen zum Download, früher Zugang zu neuen Projekten." error={save.fields.perks}>
        {(p) => <Textarea {...p} value={perks} onChange={(e) => setPerks(e.target.value)} maxLength={1000} rows={4} />}
      </Field>
      <div className="flex justify-end border-t border-line pt-4">
        <Button type="submit" disabled={save.pending}>
          {save.pending ? "Speichere …" : "Speichern"}
        </Button>
      </div>
    </form>
  );
}
