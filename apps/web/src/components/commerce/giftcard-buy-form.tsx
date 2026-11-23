"use client";

import { useState } from "react";
import { Gift } from "lucide-react";
import { formatMoney } from "@werkraum/shared";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/field";
import { useAction } from "@/lib/use-action";
import { cn } from "@/lib/utils";
import { buyGiftCardAction } from "@/app/(app)/geschenkgutscheine/actions";

type Offer = {
  shop: { id: string; name: string; currency: string };
  amounts: { valueMinor: number; payMinor: number }[];
  custom: { minMinor: number; maxMinor: number } | null;
  payCurrency: string;
  converted: boolean;
  validityMonths: number;
};

/** Geschenkgutschein kaufen: Betrag, Empfänger:in, Nachricht, Zustellung (sofort oder später). */
export function GiftCardBuyForm({ offer, senderName, mode }: { offer: Offer; senderName: string; mode: "stripe" | "simulated" }) {
  const cur = offer.shop.currency;
  const [amount, setAmount] = useState<number | null>(offer.amounts[Math.min(1, offer.amounts.length - 1)]?.valueMinor ?? null);
  const [custom, setCustom] = useState("");
  const [later, setLater] = useState(false);
  const [message, setMessage] = useState("");
  const buy = useAction(buyGiftCardAction, { redirect: (d) => d.url });
  const customMinor = custom.trim() ? Math.round(Number(custom.replace(",", ".")) * 100) : null;
  const value = amount ?? (customMinor && Number.isFinite(customMinor) ? customMinor : null);

  return (
    <form
      className="space-y-6"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        const when = String(fd.get("deliverAt") ?? "");
        buy.run({
          shopId: offer.shop.id,
          amountMinor: value ?? 0,
          recipientName: String(fd.get("recipientName") ?? ""),
          recipientEmail: String(fd.get("recipientEmail") ?? ""),
          senderName: String(fd.get("senderName") ?? ""),
          message,
          deliverAt: later && when ? new Date(when).toISOString() : null,
        });
      }}
    >
      <fieldset>
        <legend className="mb-2 text-[14px] font-semibold">Wert</legend>
        <div className="flex flex-wrap gap-2">
          {offer.amounts.map((a) => (
            <button
              key={a.valueMinor}
              type="button"
              aria-pressed={amount === a.valueMinor}
              onClick={() => {
                setAmount(a.valueMinor);
                setCustom("");
              }}
              className={cn(
                "num rounded-xl border px-4 py-2.5 text-[15px] font-semibold transition-colors",
                amount === a.valueMinor ? "border-moss bg-moss-soft text-moss-ink" : "border-field bg-card hover:border-ink-2",
              )}
            >
              {formatMoney(a.valueMinor, cur)}
            </button>
          ))}
        </div>
        {offer.custom && (
          <div className="mt-3 max-w-[16rem]">
            <Field label="Eigener Betrag" optional hint={`${formatMoney(offer.custom.minMinor, cur)} bis ${formatMoney(offer.custom.maxMinor, cur)}`} error={buy.fields.amountMinor}>
              {(p) => (
                <Input
                  {...p}
                  inputMode="decimal"
                  value={custom}
                  onChange={(e) => {
                    setCustom(e.target.value);
                    setAmount(null);
                  }}
                  placeholder={cur === "EUR" ? "z. B. 40" : "z. B. 40.–"}
                />
              )}
            </Field>
          </div>
        )}
        {!offer.custom && buy.fields.amountMinor && <p className="mt-1.5 text-[13px] text-danger">{buy.fields.amountMinor}</p>}
        {offer.converted && value ? (
          <p className="mt-2 text-[12.5px] text-muted">
            Wert {formatMoney(value, cur)} · du bezahlst ca. {formatMoney(offer.amounts.find((a) => a.valueMinor === value)?.payMinor ?? value, offer.payCurrency)}, umgerechnet zum Tageskurs.
          </p>
        ) : null}
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Für" error={buy.fields.recipientName}>
          {(p) => <Input {...p} name="recipientName" autoComplete="off" maxLength={80} required />}
        </Field>
        <Field label="E-Mail der beschenkten Person" error={buy.fields.recipientEmail} hint="Dorthin schicken wir den Gutschein.">
          {(p) => <Input {...p} name="recipientEmail" type="email" inputMode="email" autoComplete="off" required />}
        </Field>
        <Field label="Von" error={buy.fields.senderName}>
          {(p) => <Input {...p} name="senderName" defaultValue={senderName} maxLength={80} required />}
        </Field>
      </div>
      <Field label="Persönliche Nachricht" optional hint={`${message.length}/500`} error={buy.fields.message}>
        {(p) => <Textarea {...p} rows={3} maxLength={500} value={message} onChange={(e) => setMessage(e.target.value)} />}
      </Field>

      <fieldset className="space-y-2">
        <legend className="mb-1 text-[14px] font-semibold">Zustellung</legend>
        <label className="flex items-center gap-2 text-[14px]">
          <input type="radio" name="when" checked={!later} onChange={() => setLater(false)} /> Sofort nach der Zahlung
        </label>
        <label className="flex items-center gap-2 text-[14px]">
          <input type="radio" name="when" checked={later} onChange={() => setLater(true)} /> An einem bestimmten Tag
        </label>
        {later && (
          <div className="max-w-[16rem] pl-6">
            <Field label="Zustellen am" error={buy.fields.deliverAt}>
              {(p) => <Input {...p} name="deliverAt" type="datetime-local" required />}
            </Field>
          </div>
        )}
      </fieldset>

      {buy.error && !Object.keys(buy.fields).length && (
        <p role="alert" className="text-[14px] font-medium text-danger">
          {buy.error}
        </p>
      )}
      <div>
        <Button type="submit" size="lg" disabled={buy.pending || !value}>
          <Gift size={16} aria-hidden />
          {buy.pending ? "Einen Moment …" : `Gutschein kaufen${value ? ` · ${formatMoney(value, cur)}` : ""}`}
        </Button>
        <p className="mt-2 text-[12.5px] leading-relaxed text-muted">
          {mode === "simulated" ? "Testmodus – es wird nichts belastet. " : "Du bezahlst sicher über Stripe. "}
          Gültig {offer.validityMonths} Monate, nur bei {offer.shop.name}. Teilbeträge bleiben als Guthaben.
        </p>
      </div>
    </form>
  );
}
