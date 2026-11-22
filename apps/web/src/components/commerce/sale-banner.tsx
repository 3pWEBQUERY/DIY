import { Timer } from "lucide-react";
import { cn } from "@/lib/utils";
import { SaleCountdown } from "./sale-countdown";

/** Banner auf der Shopseite: laufende Aktion mit Rabatt und Restzeit (ruhig, ohne Effekte). */
export function SaleBanner({ sale, className }: { sale: { title: string; percent: number; endsAt: string; allProducts: boolean }; className?: string }) {
  return (
    <section aria-label="Aktion" className={cn("flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl border border-clay/40 bg-clay-soft px-5 py-4", className)}>
      <span className="num rounded-lg bg-clay px-2.5 py-1.5 text-[14px] font-bold leading-none text-paper">−{sale.percent} %</span>
      <div className="min-w-0 flex-1">
        <p className="text-[15px] font-semibold text-ink">{sale.title}</p>
        <p className="text-[13px] text-ink-2">{sale.allProducts ? "Auf alle Arbeiten in diesem Shop." : "Auf ausgewählte Arbeiten – sie sind unten markiert."} Nicht mit Gutscheinen und Sets kombinierbar.</p>
      </div>
      <p className="flex items-center gap-1.5 text-[13.5px] text-clay-ink">
        <Timer size={15} aria-hidden />
        <SaleCountdown endsAt={sale.endsAt} />
      </p>
    </section>
  );
}
