"use client";

import { useState } from "react";
import { Tag, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { useAction } from "@/lib/use-action";
import { applyCouponAction, removeCouponAction } from "@/app/(app)/markt/actions";

/**
 * Gutscheincode je Shop im Warenkorb. Eingelöst → Code mit Wert und „Entfernen“; gilt er gerade
 * nicht (z. B. Mindestwert), steht der Grund darunter und der Rabatt entfällt.
 */
export function CouponField({
  shopId,
  shopName,
  coupon,
}: {
  shopId: string;
  shopName: string;
  coupon: { code: string; valueLabel: string; problem: string | null } | null;
}) {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const apply = useAction(applyCouponAction, { success: (d) => `Gutschein ${d.code} eingelöst.`, onSuccess: () => setCode("") });
  const remove = useAction(removeCouponAction);
  const inputId = `coupon-${shopId}`;
  const errId = `${inputId}-err`;
  const fieldError = apply.fields.code ? apply.error : null;

  if (coupon) {
    return (
      <div className="mt-3">
        <div className="flex flex-wrap items-center gap-2 text-[13.5px]">
          <Tag size={14} aria-hidden className="text-muted" />
          <span>
            Gutschein <b className="font-mono text-[12.5px] tracking-[0.04em]">{coupon.code}</b> · {coupon.valueLabel}
          </span>
          <button
            type="button"
            onClick={() => remove.run(shopId)}
            disabled={remove.pending}
            className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[12.5px] text-muted hover:bg-sunken hover:text-ink"
            aria-label={`Gutschein ${coupon.code} entfernen`}
          >
            <X size={13} aria-hidden /> Entfernen
          </button>
        </div>
        {coupon.problem && (
          <p role="status" className="mt-1 text-[12.5px] text-warn">
            {coupon.problem} Der Rabatt wird nicht abgezogen.
          </p>
        )}
      </div>
    );
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="mt-3 inline-flex items-center gap-1.5 text-[13px] font-semibold text-ink-2 underline-offset-2 hover:text-ink hover:underline">
        <Tag size={14} aria-hidden /> Gutscheincode für {shopName}
      </button>
    );
  }

  return (
    <form
      className="mt-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (code.trim()) apply.run(shopId, code);
      }}
    >
      <label htmlFor={inputId} className="mb-1.5 block text-[13px] font-semibold">
        Gutscheincode für {shopName}
      </label>
      <div className="flex gap-2">
        <Input
          id={inputId}
          value={code}
          onChange={(e) => {
            setCode(e.target.value);
            if (apply.error) apply.setError(null);
          }}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          maxLength={24}
          className="h-10 max-w-[220px] font-mono uppercase tracking-[0.04em]"
          aria-invalid={fieldError ? true : undefined}
          aria-describedby={fieldError ? errId : undefined}
          autoFocus
        />
        <Button type="submit" variant="outline" size="sm" className="h-10" disabled={apply.pending || !code.trim()}>
          {apply.pending ? "Prüfe …" : "Einlösen"}
        </Button>
        <Button type="button" variant="ghost" size="sm" className="h-10" onClick={() => setOpen(false)}>
          Abbrechen
        </Button>
      </div>
      {fieldError && (
        <p id={errId} role="alert" className="mt-1.5 text-[13px] font-medium text-danger">
          {fieldError}
        </p>
      )}
    </form>
  );
}
