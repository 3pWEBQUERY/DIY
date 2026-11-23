import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { PRODUCT_KIND_LABEL, type Currency, type ProductKind } from "@werkraum/shared";
import { Cover } from "@/components/ui/media";
import { cn } from "@/lib/utils";
import { EmbedPrice, type EmbedSale } from "@/components/commerce/embed-price";

/**
 * Schlanke Karten für verknüpfte Produkte & Artikel auf Projekt-/Anleitungsseiten
 * und unter „Gespeichert“. (Die vollständige Produktkarte baut das Commerce-Team.)
 */
export function ProductMiniCard({
  product: p,
  className,
}: {
  product: { id: string; title: string; kind?: ProductKind | string; priceMinor: number; currency: Currency | string; coverUrl: string | null; href: string; shopName: string; soldOut?: boolean; sale?: EmbedSale };
  className?: string;
}) {
  return (
    <Link href={p.href} className={cn("group flex min-w-0 items-stretch border border-line bg-card transition-colors hover:border-rule-strong rounded-2xl", className)}>
      <div className="relative w-24 shrink-0 border-r border-line">
        <Cover url={p.coverUrl} alt="" kind="project" ratio="1/1" className="h-full" sizes="96px" />
      </div>
      <div className="flex min-w-0 flex-1 flex-col justify-between gap-2 px-3.5 py-3">
        <div className="min-w-0">
          <p className="spec truncate">
            {p.kind && p.kind in PRODUCT_KIND_LABEL ? PRODUCT_KIND_LABEL[p.kind as ProductKind] : "Produkt"} · {p.shopName}
          </p>
          <p className="mt-0.5 line-clamp-2 text-[15px] font-semibold leading-snug">{p.title}</p>
        </div>
        <div className="flex items-center justify-between gap-2">
          <EmbedPrice minor={p.priceMinor} currency={p.currency === "EUR" ? "EUR" : "CHF"} sale={p.sale} className="text-[15px]" />
          {p.soldOut ? <span className="spec text-clay-ink">Ausverkauft</span> : <ArrowUpRight size={15} className="text-muted transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-ink" />}
        </div>
      </div>
    </Link>
  );
}

export function ArticleMiniCard({
  article: a,
  className,
}: {
  article: { id: string; title: string; dek: string; coverUrl: string | null; href: string; authorName: string; readingMinutes: number };
  className?: string;
}) {
  return (
    <Link href={a.href} className={cn("group grid min-w-0 grid-cols-[1fr_auto] gap-4 border-t border-line py-4", className)}>
      <div className="min-w-0">
        <p className="spec">Artikel · {a.readingMinutes} Min. Lesezeit · {a.authorName}</p>
        <p className="headline mt-1 text-xl text-balance group-hover:underline decoration-1 underline-offset-4">{a.title}</p>
        {a.dek && <p className="mt-1 line-clamp-2 text-sm text-muted">{a.dek}</p>}
      </div>
      <div className="w-24 border border-line sm:w-32 rounded-2xl">
        <Cover url={a.coverUrl} alt="" kind="article" ratio="4/3" sizes="128px" />
      </div>
    </Link>
  );
}
