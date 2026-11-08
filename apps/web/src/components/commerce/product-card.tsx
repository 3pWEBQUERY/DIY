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
    <span className={cn("inline-flex items-center gap-1 text-[12.5px] text-muted", className)} aria-label={`Bewertung ${avg.toFixed(1)} von 5, ${count} Bewertungen`}>
      <Star size={11} strokeWidth={1.8} className="fill-clay text-clay" aria-hidden />
      <span className="num font-semibold text-ink-2">{avg.toFixed(1)}</span>
      <span className="num">({count})</span>
    </span>
  );
}

/**
 * Produktkarte: Das Foto ist die Karte (4:5, ruhiger Zoom beim Hover). Darunter eine klare
 * Typo-Hierarchie – Shop, Titel, Preis. Angebotsart dezent auf dem Bild, keine Rabatt-Badges.
 */
export function ProductCard({ product, priority, sizes, className, showShop = true }: { product: ProductCardProps; priority?: boolean; sizes?: string; className?: string; showShop?: boolean }) {
  const p = product;
  const soldOut = p.status === "SOLD_OUT";
  const rated = (p.ratingCount ?? 0) > 0;
  return (
    <article className={cn("group relative flex h-full flex-col", className)}>
      <div className="relative overflow-hidden rounded-2xl bg-sunken">
        <Cover
          plateNumber={false}
          url={p.cover.url}
          variants={p.cover.variants}
          alt={p.cover.alt}
          seed={p.id}
          category={p.category}
          ratio="4/5"
          priority={priority}
          sizes={sizes ?? "(min-width: 1280px) 280px, (min-width: 768px) 30vw, 50vw"}
          className={cn("rounded-none transition-transform duration-500 ease-out group-hover:scale-[1.03] motion-reduce:transition-none motion-reduce:group-hover:scale-100", soldOut && "opacity-55 grayscale-[40%]")}
        />
        <span className="absolute bottom-2.5 left-2.5 rounded-lg bg-paper/90 px-2 py-1 text-[11px] font-semibold leading-none text-ink-2 backdrop-blur-sm">{PRODUCT_KIND_LABEL[p.kind]}</span>
        {soldOut && <span className="absolute right-2.5 top-2.5 rounded-lg bg-ink/85 px-2 py-1 text-[11px] font-semibold leading-none text-paper">Vergriffen</span>}
      </div>
      <div className="flex flex-1 flex-col px-0.5 pt-3">
        {showShop && <p className="truncate text-[12.5px] text-muted">{p.shop.name}</p>}
        <h3 className="mt-0.5 line-clamp-2 text-[15px] font-semibold leading-snug text-ink">
          <Link href={p.href} className="after:absolute after:inset-0 decoration-1 underline-offset-[3px] group-hover:underline group-focus-within:underline">
            {p.title}
          </Link>
        </h3>
        <div className="mt-auto flex items-center justify-between gap-2 pt-1.5">
          <Price minor={p.priceMinor} currency={p.currency} className={cn("text-[15px] font-bold", soldOut ? "text-muted line-through decoration-1" : "text-ink")} />
          {rated && <RatingInline avg={p.ratingAvg ?? 0} count={p.ratingCount ?? 0} />}
        </div>
      </div>
    </article>
  );
}

/** Raster für Produktkarten – 2 Spalten mobil, bis 4 auf breiten Screens. */
export function ProductGrid({ products, className, priorityFirst }: { products: ProductCardProps[]; className?: string; priorityFirst?: number }) {
  return (
    <ul className={cn("grid grid-cols-2 gap-x-4 gap-y-8 sm:gap-x-5 md:grid-cols-3 xl:grid-cols-4", className)}>
      {products.map((p, i) => (
        <li key={p.id} className="h-full">
          <ProductCard product={p} priority={i < (priorityFirst ?? 0)} />
        </li>
      ))}
    </ul>
  );
}
