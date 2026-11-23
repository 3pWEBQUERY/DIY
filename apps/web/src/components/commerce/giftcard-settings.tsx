"use client";

import { useState } from "react";
import { formatMoney } from "@werkraum/shared";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input, Textarea } from "@/components/ui/field";
import { Badge } from "@/components/ui/misc";
import { confirmDialog } from "@/components/ui/confirm";
import { useAction } from "@/lib/use-action";
import { formatDate } from "@/lib/utils";
import { refundGiftCardAction, saveGiftCardSettingsAction } from "@/app/studio/geschenkgutscheine/actions";

type Settings = { enabled: boolean; amounts: number[]; customEnabled: boolean; customMinMinor: number; customMaxMinor: number; validityMonths: number; note: string };

const toMinor = (s: string) => {
  const n = Number(s.replace(",", ".").replace(/[^\d.]/g, ""));
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : null;
};
const toInput = (m: number) => (m / 100).toFixed(m % 100 ? 2 : 0);

/** Studio: Geschenkgutscheine anbieten (Beträge, freie Beträge, Gültigkeit, Hinweis) */
export function GiftCardSettingsForm({ settings, currency }: { settings: Settings; currency: string }) {
  const [enabled, setEnabled] = useState(settings.enabled);
  const [amounts, setAmounts] = useState(settings.amounts.map(toInput).join(", "));
  const [customEnabled, setCustomEnabled] = useState(settings.customEnabled);
  const [min, setMin] = useState(toInput(settings.customMinMinor));
  const [max, setMax] = useState(toInput(settings.customMaxMinor));
  const [months, setMonths] = useState(String(settings.validityMonths));
  const [note, setNote] = useState(settings.note);
  const save = useAction(saveGiftCardSettingsAction);
  const parsed = amounts.split(/[,;\s]+/).map((a) => a.trim()).filter(Boolean).map(toMinor);

  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        save.run({
          enabled,
          amounts: parsed.filter((a): a is number => a != null),
          customEnabled,
          customMinMinor: toMinor(min) ?? 0,
          customMaxMinor: toMinor(max) ?? 0,
          validityMonths: Number(months) || 0,
          note,
        });
      }}
    >
      <Checkbox label={<span className="font-semibold">Geschenkgutscheine verkaufen</span>} checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
      <Field label={`Feste Beträge (${currency})`} hint="Mit Komma trennen, z. B. 25, 50, 100" error={save.fields.amounts}>
        {(p) => <Input {...p} value={amounts} onChange={(e) => setAmounts(e.target.value)} inputMode="decimal" />}
      </Field>
      <Checkbox label="Freie Beträge erlauben" checked={customEnabled} onChange={(e) => setCustomEnabled(e.target.checked)} />
      {customEnabled && (
        <div className="grid max-w-md grid-cols-2 gap-3">
          <Field label={`Mindestens (${currency})`} error={save.fields.customMinMinor}>
            {(p) => <Input {...p} value={min} onChange={(e) => setMin(e.target.value)} inputMode="decimal" />}
          </Field>
          <Field label={`Höchstens (${currency})`} error={save.fields.customMaxMinor}>
            {(p) => <Input {...p} value={max} onChange={(e) => setMax(e.target.value)} inputMode="decimal" />}
          </Field>
        </div>
      )}
      <div className="max-w-[12rem]">
        <Field label="Gültigkeit (Monate)" hint="Üblich: 36 Monate" error={save.fields.validityMonths}>
          {(p) => <Input {...p} value={months} onChange={(e) => setMonths(e.target.value)} inputMode="numeric" />}
        </Field>
      </div>
      <Field label="Hinweis auf der Gutscheinseite" optional hint={`${note.length}/200`} error={save.fields.note}>
        {(p) => <Textarea {...p} rows={2} maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} />}
      </Field>
      <Button type="submit" disabled={save.pending}>
        {save.pending ? "Speichert …" : "Speichern"}
      </Button>
    </form>
  );
}

type Card = {
  id: string;
  code: string;
  status: string;
  currency: string;
  initialMinor: number;
  balanceMinor: number;
  recipientName: string;
  createdAt: string;
  expiresAt: string;
  expired: boolean;
  delivered: boolean;
  refundable: boolean;
  redemptions: { amountMinor: number; createdAt: string; orderId: string; orderNumber: string }[];
};

export function GiftCardList({ cards }: { cards: Card[] }) {
  const refund = useAction(refundGiftCardAction);
  if (!cards.length) return <p className="text-[14px] text-muted">Noch keine Gutscheine verkauft.</p>;
  return (
    <ul className="divide-y divide-line border-y border-line">
      {cards.map((c) => (
        <li key={c.id} className="flex flex-wrap items-start justify-between gap-3 py-4">
          <div className="min-w-0">
            <p className="text-[15px] font-semibold">
              <span className="num">{formatMoney(c.initialMinor, c.currency)}</span> <span className="font-mono text-[12.5px] text-muted">{c.code}</span>
            </p>
            <p className="text-[13px] text-muted">
              Für {c.recipientName} · verkauft {formatDate(c.createdAt, { day: "numeric", month: "short", year: "numeric" })} · Guthaben {formatMoney(c.balanceMinor, c.currency)}
              {c.expired ? " · abgelaufen" : ` · gültig bis ${formatDate(c.expiresAt, { day: "numeric", month: "short", year: "numeric" })}`}
            </p>
            {c.redemptions.length > 0 && (
              <p className="mt-1 text-[12.5px] text-ink-2">
                Eingelöst: {c.redemptions.map((r) => `${r.orderNumber} (${formatMoney(r.amountMinor, c.currency)})`).join(", ")}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Badge tone={c.status === "REFUNDED" ? "neutral" : c.delivered ? "moss" : "outline"}>{c.status === "REFUNDED" ? "Erstattet" : c.delivered ? "Zugestellt" : "Geplant"}</Badge>
            {c.refundable && (
              <Button
                variant="ghost"
                size="sm"
                disabled={refund.pending}
                onClick={async () => {
                  if (await confirmDialog({ title: "Gutschein stornieren?", body: "Der Kauf wird vollständig erstattet (inkl. Provision), der Code ist danach ungültig.", confirmLabel: "Stornieren", tone: "danger" })) refund.run(c.id);
                }}
              >
                Stornieren
              </Button>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
