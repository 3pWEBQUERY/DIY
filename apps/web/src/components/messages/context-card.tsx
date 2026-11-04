import Link from "next/link";
import { ArrowUpRight, Package } from "lucide-react";
import { ORDER_STATUS_LABEL, formatMoney, type Currency, type OrderStatus } from "@werkraum/shared";
import type { OrderContext } from "@/server/messaging/service";
import { formatDate } from "@/lib/utils";

/** Bestell- bzw. Produktkontext einer Käufer↔Verkäufer-Unterhaltung. */
export function ContextCard({ ctx }: { ctx: OrderContext }) {
  if (ctx.type === "product") {
    return (
      <Link href={ctx.href} className="group flex items-center gap-3 border border-clay/40 bg-clay-soft px-3 py-2.5 hover:border-clay rounded-2xl">
        <span className="relative size-11 shrink-0 overflow-hidden border border-clay/30 bg-card rounded-2xl">
          {ctx.coverUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={ctx.coverUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
          ) : (
            <Package size={16} className="absolute inset-0 m-auto text-clay-ink" aria-hidden />
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="spec text-clay-ink">Anfrage zu Produkt · {ctx.shop.name}</span>
          <span className="block truncate text-sm font-semibold">{ctx.title}</span>
        </span>
        <span className="font-mono text-sm font-semibold">{formatMoney(ctx.priceMinor, ctx.currency as Currency)}</span>
        <ArrowUpRight size={15} className="shrink-0 text-clay-ink" aria-hidden />
      </Link>
    );
  }
  return (
    <div className="border border-clay/40 bg-clay-soft rounded-2xl">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-clay/20 px-3 py-2">
        <span className="spec text-clay-ink">
          Bestellung <span className="font-semibold text-ink">{ctx.number}</span> · {formatDate(ctx.createdAt, { day: "numeric", month: "short", year: "numeric" })}
        </span>
        <span className="inline-flex h-6 items-center bg-card px-2 font-mono text-[11px] uppercase tracking-[0.06em] rounded-xl">{ORDER_STATUS_LABEL[ctx.status as OrderStatus] ?? ctx.status}</span>
      </div>
      <div className="flex items-center gap-3 px-3 py-2.5">
        <ul className="flex -space-x-2" aria-hidden>
          {ctx.items.slice(0, 3).map((i, n) => (
            <li key={n} className="relative size-9 overflow-hidden border border-paper bg-card rounded-2xl">
              {i.coverUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={i.coverUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
              ) : (
                <Package size={14} className="absolute inset-0 m-auto text-clay-ink" />
              )}
            </li>
          ))}
        </ul>
        <p className="min-w-0 flex-1 truncate text-sm">
          {ctx.items.map((i) => `${i.quantity}× ${i.title}${i.variantName ? ` (${i.variantName})` : ""}`).join(", ")}
          {ctx.itemCount > ctx.items.length && ` + ${ctx.itemCount - ctx.items.length} weitere`}
        </p>
        <span className="font-mono text-sm font-semibold">{formatMoney(ctx.totalMinor, ctx.currency as Currency)}</span>
        {ctx.role && (
          <Link href={ctx.href} className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold hover:underline">
            {ctx.role === "seller" ? "Verwalten" : "Details"} <ArrowUpRight size={12} />
          </Link>
        )}
      </div>
      <p className="border-t border-clay/20 px-3 py-1.5 text-[11px] text-clay-ink">Zahlungen nur über den WERKRAUM-Checkout – nur dann gilt der Käuferschutz.</p>
    </div>
  );
}
