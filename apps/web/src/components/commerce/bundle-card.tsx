import Link from "next/link";
import { formatMoney, type Currency } from "@werkraum/shared";
import type { BundleView } from "@/server/commerce/promotions";
import { AddBundleButton } from "./add-bundle-button";
import { cn } from "@/lib/utils";

/**
 * Set (Bundle) aus dem Marktplatz: Teile mit Menge und Einzelpreis, Set-Preis statt Summe,
 * ein Klick legt alles in den Warenkorb. `label` z. B. „Materialset“ bei einer Anleitung.
 */
export function BundleCard({ bundle: b, signedIn, owner, label = "Set", className }: { bundle: BundleView; signedIn: boolean; owner?: boolean; label?: string; className?: string }) {
  const fmt = (m: number) => formatMoney(m, b.currency as Currency);
  return (
    <article aria-labelledby={`bundle-${b.id}`} className={cn("rounded-2xl border border-rule bg-card", className)}>
      <header className="border-b border-line px-5 py-3">
        <p className="spec">
          {label} · <Link href={`/markt/${b.shop.slug}`} className="hover:text-ink hover:underline">{b.shop.name}</Link>
        </p>
        <h3 id={`bundle-${b.id}`} className="mt-1 text-[16px] font-bold leading-snug">
          {b.title}
        </h3>
        {b.description && <p className="mt-1 text-[13.5px] leading-relaxed text-ink-2">{b.description}</p>}
      </header>
      <ul className="px-5 py-2 text-[13.5px]">
        {b.items.map((i) => (
          <li key={i.productId} className="flex items-baseline justify-between gap-3 border-b border-line py-2 last:border-b-0">
            <span className="min-w-0">
              {i.quantity > 1 && <span className="num text-muted">{i.quantity} × </span>}
              <Link href={i.href} className="font-medium hover:underline">
                {i.title}
              </Link>
              {!i.inStock && <span className="ml-2 text-[12px] text-warn">nicht verfügbar</span>}
            </span>
            <span className="num shrink-0 text-ink-2">{fmt(i.unitMinor * i.quantity)}</span>
          </li>
        ))}
      </ul>
      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-5 py-3.5">
        <p className="text-[14px]">
          <b className="num text-[18px]">{fmt(b.priceMinor)}</b>{" "}
          {b.discountMinor > 0 && (
            <span className="text-muted">
              statt <s className="num">{fmt(b.fullMinor)}</s> · −{b.discountPct} %
            </span>
          )}
          <span className="block text-[12px] text-muted">zzgl. Versand des Shops</span>
        </p>
        {owner ? (
          <Link href="/studio/rabatte" className="text-[13px] font-semibold text-ink-2 underline-offset-2 hover:underline">
            Dein Set bearbeiten
          </Link>
        ) : b.purchasable ? <AddBundleButton bundleId={b.id} title={b.title} signedIn={signedIn} /> : <span className="text-[13px] text-warn">Gerade nicht vollständig erhältlich</span>}
      </footer>
    </article>
  );
}
