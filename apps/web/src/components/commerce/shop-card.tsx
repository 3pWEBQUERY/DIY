import Link from "next/link";
import { COUNTRY_LABEL, type ShipCountry } from "@werkraum/shared";
import { Avatar } from "@/components/ui/misc";
import { Cover } from "@/components/ui/media";
import { RatingInline } from "./product-card";
import { cn } from "@/lib/utils";

export type ShopCardProps = {
  id: string;
  slug: string;
  name: string;
  tagline: string;
  country: string;
  ratingAvg: number;
  ratingCount: number;
  salesCount: number;
  productCount: number;
  owner: { handle: string; displayName: string; avatarUrl: string | null };
  covers: { id: string; url: string | null; category: string }[];
};

/** Shop-Karte: Werkbank-Ausschnitt (drei Arbeiten), Name in Serif, Datenzeile. */
export function ShopCard({ shop, className }: { shop: ShopCardProps; className?: string }) {
  const tiles = [...shop.covers, ...Array.from({ length: Math.max(0, 3 - shop.covers.length) }, (_, i) => ({ id: `${shop.id}-${i}`, url: null, category: shop.covers[0]?.category ?? "weitere" }))].slice(0, 3);
  return (
    <article className={cn("group relative flex h-full flex-col overflow-hidden rounded-2xl border border-line bg-card transition-[border-color,transform] duration-200 hover:-translate-y-0.5 hover:border-rule-strong", className)}>
      <div className="grid grid-cols-3 gap-px border-b border-line bg-line">
        {tiles.map((t) => (
          <Cover key={t.id} url={t.url} alt="" seed={t.id} category={t.category} ratio="1/1" sizes="120px" />
        ))}
      </div>
      <div className="flex flex-1 flex-col gap-2 p-4">
        <div className="flex items-center gap-2.5">
          <Avatar src={shop.owner.avatarUrl} name={shop.owner.displayName} size={26} />
          <span className="truncate text-[12px] text-muted">von {shop.owner.displayName}</span>
        </div>
        <h3 className="headline line-clamp-1 text-xl leading-tight">
          <Link href={`/markt/${shop.slug}`} className="after:absolute after:inset-0 group-hover:underline decoration-1 underline-offset-4">
            {shop.name}
          </Link>
        </h3>
        <p className="line-clamp-2 min-h-[2lh] text-[13.5px] leading-relaxed text-ink-2">{shop.tagline}</p>
        <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 pt-2">
          <span className="spec">{COUNTRY_LABEL[shop.country as ShipCountry] ?? shop.country}</span>
          <span className="spec">{shop.productCount} Arbeiten</span>
          {shop.salesCount > 0 && <span className="spec">{shop.salesCount} verkauft</span>}
          <RatingInline avg={shop.ratingAvg} count={shop.ratingCount} />
        </div>
      </div>
    </article>
  );
}
