"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Minus, Plus, Check } from "lucide-react";
import { formatMoney, type Currency } from "@werkraum/shared";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { addToCartAction } from "@/app/(app)/markt/actions";

type Variant = { id: string; name: string; priceDeltaMinor: number; available: number };

/**
 * Kaufbereich: Variante, Menge, Verfügbarkeit, In den Warenkorb.
 * Der Server prüft Preis und Bestand erneut – diese Anzeige ist nur eine Vorschau.
 */
export function BuyBox({
  productId,
  priceMinor,
  currency,
  variants,
  available,
  purchasable,
  isDigital,
  isOwner,
  signedIn,
  entitlementId,
  paymentsLive,
}: {
  productId: string;
  priceMinor: number;
  currency: Currency;
  variants: Variant[];
  /** null = unbegrenzt (digital) */
  available: number | null;
  purchasable: boolean;
  isDigital: boolean;
  isOwner: boolean;
  signedIn: boolean;
  entitlementId: string | null;
  paymentsLive: boolean;
}) {
  const router = useRouter();
  const firstAvailable = variants.find((v) => v.available > 0)?.id ?? variants[0]?.id ?? null;
  const [variantId, setVariantId] = useState<string | null>(firstAvailable);
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);
  const [pending, start] = useTransition();

  const variant = variants.find((v) => v.id === variantId) ?? null;
  const unit = Math.max(0, priceMinor + (variant?.priceDeltaMinor ?? 0));
  const stock = isDigital ? null : variants.length ? (variant?.available ?? 0) : (available ?? 0);
  const maxQty = isDigital ? 1 : Math.max(0, Math.min(stock ?? 0, 99));
  const canBuy = purchasable && !isOwner && paymentsLive && (isDigital || (stock ?? 0) > 0) && !entitlementId;

  function add() {
    if (!signedIn) {
      router.push(`/anmelden?weiter=${encodeURIComponent(location.pathname)}`);
      return;
    }
    start(async () => {
      const r = await addToCartAction({ productId, variantId: variantId ?? undefined, quantity: qty });
      if (r.ok) {
        setAdded(true);
        toast(r.data.capped ? `Im Warenkorb – mehr ist derzeit nicht verfügbar (${r.data.quantity}).` : "In den Warenkorb gelegt.");
        router.refresh();
      } else if (r.code === "UNAUTHENTICATED") router.push(`/anmelden?weiter=${encodeURIComponent(location.pathname)}`);
      else toast(r.error, "error");
    });
  }

  const stockLabel = isDigital
    ? "Sofort als Download verfügbar"
    : stock === 0
      ? variants.length && variant
        ? "Diese Variante ist vergriffen"
        : "Vergriffen"
      : stock === 1
        ? "Letztes Stück"
        : `${stock} verfügbar`;

  return (
    <div className="space-y-5">
      <p className="num text-[1.75rem] font-semibold tracking-tight" aria-live="polite">
        {formatMoney(unit, currency)}
        {qty > 1 && <span className="ml-2 text-[14px] font-normal text-muted">× {qty} = {formatMoney(unit * qty, currency)}</span>}
      </p>

      {variants.length > 0 && (
        <fieldset>
          <legend className="spec mb-2">Variante</legend>
          <div className="flex flex-wrap gap-2">
            {variants.map((v) => {
              const out = v.available <= 0;
              const active = v.id === variantId;
              return (
                <button
                  key={v.id}
                  type="button"
                  aria-pressed={active}
                  disabled={out}
                  onClick={() => {
                    setVariantId(v.id);
                    setQty(1);
                    setAdded(false);
                  }}
                  className={cn(
                    "min-h-10 border px-3.5 text-[14px] transition-colors rounded-2xl",
                    active ? "border-ink bg-ink text-paper" : "border-line-strong bg-card hover:border-ink",
                    out && "cursor-not-allowed text-muted line-through decoration-1",
                  )}
                >
                  {v.name}
                  {v.priceDeltaMinor !== 0 && (
                    <span className={cn("ml-1.5 font-mono text-[11px]", active ? "text-paper/70" : "text-muted")}>
                      {v.priceDeltaMinor > 0 ? "+" : "−"}
                      {formatMoney(Math.abs(v.priceDeltaMinor), currency)}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </fieldset>
      )}

      <p className={cn("flex items-center gap-2 text-[13.5px]", stock === 0 ? "text-danger" : "text-ink-2")}>
        <span aria-hidden className={cn("size-1.5 rounded-full", stock === 0 ? "bg-danger" : stock === 1 ? "bg-clay" : "bg-moss")} />
        {stockLabel}
      </p>

      {entitlementId ? (
        <div className="space-y-3 border border-moss/30 bg-moss-soft p-4 text-[14px] rounded-2xl">
          <p className="font-semibold text-moss-ink">Du besitzt dieses digitale Produkt.</p>
          <a href={`/api/v1/downloads/${entitlementId}`} className="font-semibold text-moss-ink underline underline-offset-2">Jetzt herunterladen</a>
        </div>
      ) : isOwner ? (
        <p className="border border-dashed border-line-strong px-4 py-3 text-[14px] text-muted rounded-2xl">
          Das ist dein Produkt. <Link href={`/studio/produkte/${productId}`} className="font-semibold text-ink underline underline-offset-2">Im Studio bearbeiten</Link>
        </p>
      ) : !paymentsLive ? (
        <p className="border-l-2 border-warn/50 bg-warn-soft px-4 py-3 text-[14px] text-ink-2">Zahlungen noch nicht aktiviert. Bestellungen sind in Kürze möglich.</p>
      ) : (
        <div className="flex items-stretch gap-3">
          {!isDigital && (
            <div className="flex items-center border border-line-strong bg-card rounded-2xl" role="group" aria-label="Menge">
              <button type="button" className="grid size-11 place-items-center hover:bg-sunken disabled:opacity-40 rounded-xl" aria-label="Weniger" disabled={qty <= 1} onClick={() => setQty((q) => Math.max(1, q - 1))}>
                <Minus size={15} />
              </button>
              <output className="num w-8 text-center text-[15px] font-semibold" aria-live="polite">{qty}</output>
              <button type="button" className="grid size-11 place-items-center hover:bg-sunken disabled:opacity-40 rounded-xl" aria-label="Mehr" disabled={qty >= maxQty} onClick={() => setQty((q) => Math.min(maxQty, q + 1))}>
                <Plus size={15} />
              </button>
            </div>
          )}
          <Button size="lg" className="flex-1" disabled={!canBuy || pending} onClick={add}>
            {added ? (
              <>
                <Check size={16} /> Im Warenkorb
              </>
            ) : canBuy ? (
              "In den Warenkorb"
            ) : (
              "Nicht verfügbar"
            )}
          </Button>
        </div>
      )}
      {added && (
        <p className="text-[13.5px]">
          <Link href="/warenkorb" className="font-semibold text-moss underline underline-offset-2">Zum Warenkorb</Link>
          <span className="text-muted"> · oder weiter stöbern</span>
        </p>
      )}
    </div>
  );
}
