"use client";

import { useState } from "react";
import { Gift, X } from "lucide-react";
import { formatMoney } from "@werkraum/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { useAction } from "@/lib/use-action";
import { applyGiftCardAction, removeGiftCardAction } from "@/app/(app)/geschenkgutscheine/actions";

/** Geschenkgutschein einlösen (Code bestimmt den Shop) – im Warenkorb und an der Kasse. */
export function GiftCardField({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const apply = useAction(applyGiftCardAction, {
    success: (d) => `Geschenkgutschein für ${d.shopName} hinterlegt – Guthaben ${formatMoney(d.balanceMinor, d.currency)}.`,
    onSuccess: () => {
      setCode("");
      setOpen(false);
    },
  });
  const fieldError = apply.fields.code ? apply.error : null;

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className={`inline-flex items-center gap-1.5 text-[13px] font-semibold text-ink-2 underline-offset-2 hover:text-ink hover:underline ${className ?? ""}`}>
        <Gift size={14} aria-hidden /> Geschenkgutschein einlösen
      </button>
    );
  }
  return (
    <form
      className={className}
      onSubmit={(e) => {
        e.preventDefault();
        if (code.trim()) apply.run(code);
      }}
    >
      <label htmlFor="giftcard-code" className="mb-1.5 block text-[13px] font-semibold">
        Code des Geschenkgutscheins
      </label>
      <div className="flex gap-2">
        <Input
          id="giftcard-code"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="XXXX-XXXX-XXXX-XXXX"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          className="font-mono tracking-[0.06em]"
          aria-invalid={fieldError ? true : undefined}
          aria-describedby={fieldError ? "giftcard-code-err" : undefined}
        />
        <Button type="submit" variant="secondary" disabled={apply.pending || !code.trim()}>
          {apply.pending ? "Prüfe …" : "Einlösen"}
        </Button>
      </div>
      {fieldError && (
        <p id="giftcard-code-err" role="alert" className="mt-1.5 text-[12.5px] text-danger">
          {fieldError}
        </p>
      )}
      <p className="mt-1.5 text-[12px] text-muted">Gilt nur im Shop, der ihn ausgestellt hat. Was übrig bleibt, bleibt dir als Guthaben.</p>
    </form>
  );
}

/** Angerechneter Gutschein einer Shop-Gruppe (mit „Entfernen“) */
export function GiftCardApplied({
  shopId,
  giftCard,
  currency,
}: {
  shopId: string;
  giftCard: { code: string; currency: string; appliedMinor: number; balanceAfterMinor: number; problem: string | null };
  currency: string;
}) {
  const remove = useAction(removeGiftCardAction);
  return (
    <div className="mt-3 text-[13.5px]">
      <div className="flex flex-wrap items-center gap-2">
        <Gift size={14} aria-hidden className="text-muted" />
        <span>
          Geschenkgutschein <b className="font-mono text-[12.5px] tracking-[0.04em]">{giftCard.code}</b>
          {giftCard.appliedMinor > 0 && (
            <>
              {" "}
              · −{formatMoney(giftCard.appliedMinor, currency)} · Restguthaben {formatMoney(giftCard.balanceAfterMinor, giftCard.currency)}
            </>
          )}
        </span>
        <button
          type="button"
          onClick={() => remove.run(shopId)}
          disabled={remove.pending}
          className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[12.5px] text-muted hover:bg-sunken hover:text-ink"
          aria-label={`Geschenkgutschein ${giftCard.code} entfernen`}
        >
          <X size={13} aria-hidden /> Entfernen
        </button>
      </div>
      {giftCard.problem && (
        <p role="status" className="mt-1 text-[12.5px] text-warn">
          {giftCard.problem}
        </p>
      )}
    </div>
  );
}
