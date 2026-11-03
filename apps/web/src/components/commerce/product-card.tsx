import Link from "next/link";
import { Star } from "lucide-react";
import { PRODUCT_KIND_LABEL, formatMoney, type Currency, type ProductKind } from "@werkraum/shared";
import { Cover, type Variants } from "@/components/ui/media";
import { cn } from "@/lib/utils";

/** Minimale Kartendaten – kompatibel mit `ProductCardData` aus `server/commerce/products`. */
export type ProductCardProps = {
  id: string;
  title: string;
  priceMinor: number;
  currency: Currency;
  kind: ProductKind;
  category: string;
  status?: string;
  cover: { url: string | null; variants: Variants | null; alt: string };
  shop: { slug: string; name: string };
  ratingAvg?: number;
  ratingCount?: number;
  href: string;
};

export function Price({ minor, currency = "CHF", className }: { minor: number; currency?: Currency | string; className?: string }) {
  return <span className={cn("num whitespace-nowrap", className)}>{formatMoney(minor, (currency === "EUR" ? "EUR" : "CHF") as Currency)}</span>;
}

/** Bewertung als ruhige Kennzahl, nicht als Sternenparade. */
export function RatingInline({ avg, count, className }: { avg: number; count: number; className?: string }) {
  if (!count) return null;
  return (
    <span className={cn("inline-flex items-center gap-1 text-[12px] text-muted", className)} aria-label={`Bewertung ${avg.toFixed(1)} von 5, ${count} Bewertungen`}>
      <Star size={11} strokeWidth={1.8} className="fill-clay text-clay" aria-hidden />
      <span className="num font-semibold text-ink-2">{avg.toFixed(1)}</span>
      <span className="num">({count})</span>
    </span>
  );
}

/**
 * Produktkarte (UI-03): Hochformat 4/5, Titel in Serif, Shop & Preis als ruhige Zeile,
 * Produktart als Datenblatt-Label. Keine Rabatt-Badges, keine Dringlichkeits-Tricks.
 */
export function ProductCard({ product, priority, sizes, className, showShop = true }: { product: ProductCardProps; priority?: boolean; sizes?: string; className?: string; showShop?: boolean }) {
  const p = product;
  const soldOut = p.status === "SOLD_OUT";
  return (
    <article className={cn("group relative", className)}>
      <div className="relative border border-line bg-card transition-colors group-hover:border-ink">
        <Cover plateNumber={false}
          url={p.cover.url}
          variants={p.cover.variants}
          alt={p.cover.alt}
          seed={p.id}
          category={p.category}
          ratio="4/5"
          priority={priority}
          sizes={sizes ?? "(min-width: 1280px) 280px, (min-width: 768px) 30vw, 50vw"}
          className={cn(soldOut && "opacity-60 grayscale-[35%]")}
        />
        <span className="absolute left-2 top-2 bg-paper/95 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.08em] text-ink-2">{PRODUCT_KIND_LABEL[p.kind]}</span>
        {soldOut && <span className="absolute bottom-2 left-2 bg-ink px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.08em] text-paper">Vergriffen</span>}
      </div>
      <div className="mt-2.5 space-y-1">
        <h3 className="headline line-clamp-2 text-[16.5px] leading-snug text-ink">
          <Link href={p.href} className="after:absolute after:inset-0 group-focus-within:underline group-hover:underline decoration-1 underline-offset-[3px]">
            {p.title}
          </Link>
        </h3>
        <div className="flex items-baseline justify-between gap-3 text-[13px]">
          {showShop ? <span className="min-w-0 truncate text-muted">{p.shop.name}</span> : <RatingInline avg={p.ratingAvg ?? 0} count={p.ratingCount ?? 0} />}
          <Price minor={p.priceMinor} currency={p.currency} className="font-semibold text-ink" />
        </div>
        {showShop && (p.ratingCount ?? 0) > 0 && <RatingInline avg={p.ratingAvg ?? 0} count={p.ratingCount ?? 0} />}
      </div>
    </article>
  );
}

/** Raster für Produktkarten – 2 Spalten mobil, bis 4 auf breiten Screens. */
export function ProductGrid({ products, className, priorityFirst }: { products: ProductCardProps[]; className?: string; priorityFirst?: number }) {
  return (
    <ul className={cn("grid grid-cols-2 gap-x-4 gap-y-8 sm:gap-x-6 md:grid-cols-3 xl:grid-cols-4", className)}>
      {products.map((p, i) => (
        <li key={p.id}>
          <ProductCard product={p} priority={i < (priorityFirst ?? 0)} />
        </li>
      ))}
    </ul>
  );
}
