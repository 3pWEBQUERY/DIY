import { formatMoney } from "@werkraum/shared";
import { cn } from "@/lib/utils";

/** Aktions-Angaben, wie sie `localizeWithSale` liefert (gleiche Form wie auf Produktkarten) */
export type EmbedSale = { percent: number; regularMinor: number } | null | undefined;

/**
 * Preis bei eingebetteten Produkten (Beiträge, Projekte, Anleitungen, Blog, Nachrichten, Suche, Profil):
 * mit laufender Aktion der Aktionspreis, der durchgestrichene reguläre Preis und „−X %“ – wie auf der Karte.
 */
export function EmbedPrice({ minor, currency, sale, soldOut, className }: { minor: number; currency: string; sale?: EmbedSale; soldOut?: boolean; className?: string }) {
  const onSale = !!sale && !soldOut;
  return (
    <span className={cn("inline-flex flex-wrap items-baseline gap-x-1.5", className)}>
      <span className={cn("num font-semibold", soldOut ? "text-muted line-through decoration-1" : onSale ? "text-clay-ink" : "text-ink")}>{formatMoney(minor, currency)}</span>
      {onSale && (
        <>
          <span className="sr-only">statt</span>
          <span className="num text-[0.85em] text-muted line-through decoration-1">{formatMoney(sale!.regularMinor, currency)}</span>
          <span className="num rounded-md bg-clay px-1.5 py-0.5 text-[0.75em] font-bold leading-none text-paper">−{sale!.percent} %</span>
        </>
      )}
    </span>
  );
}
