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
  owner: { handle: string; displayName: string; avatarUrl: string | null; region?: string | null };
  covers: { id: string; url: string | null; category: string }[];
};

/**
 * Shop-Karte: Bildkomposition aus drei Arbeiten (eine gross, zwei klein), darunter Shopname,
 * Inhaber:in mit Ort und eine ruhige Kennzahlenzeile.
 */
export function ShopCard({ shop, className }: { shop: ShopCardProps; className?: string }) {
  const tiles = [...shop.covers, ...Array.from({ length: Math.max(0, 3 - shop.covers.length) }, (_, i) => ({ id: `${shop.id}-${i}`, url: null, category: shop.covers[0]?.category ?? "weitere" }))].slice(0, 3);
  const place = [shop.owner.region, COUNTRY_LABEL[shop.country as ShipCountry] ?? shop.country].filter(Boolean).join(", ");
  const stats = [`${shop.productCount} ${shop.productCount === 1 ? "Arbeit" : "Arbeiten"}`, shop.salesCount > 0 ? `${shop.salesCount} ${shop.salesCount === 1 ? "Verkauf" : "Verkäufe"}` : null].filter(Boolean);
  return (
    <article className={cn("group relative flex h-full flex-col overflow-hidden rounded-2xl border border-line bg-card transition-colors duration-200 hover:border-rule-strong", className)}>
      <div className="grid aspect-[16/10] grid-cols-[2fr_1fr] grid-rows-2 gap-0.5 bg-line">
        {tiles.map((t, i) => (
          <Cover key={t.id} url={t.url} alt="" seed={t.id} category={t.category} ratio="auto" sizes={i === 0 ? "320px" : "160px"} className={cn("h-full rounded-none", i === 0 && "row-span-2")} plateNumber={false} />
        ))}
      </div>
      <div className="flex flex-1 flex-col p-4">
        <h3 className="truncate text-[17px] font-semibold leading-tight text-ink">
          <Link href={`/markt/${shop.slug}`} className="after:absolute after:inset-0 decoration-1 underline-offset-4 group-hover:underline">
            {shop.name}
          </Link>
        </h3>
        <div className="mt-2.5 flex items-center gap-2.5">
          <Avatar src={shop.owner.avatarUrl} name={shop.owner.displayName} size={30} />
          <span className="min-w-0 leading-tight">
            <span className="block truncate text-[13px] text-ink-2">{shop.owner.displayName}</span>
            {place && <span className="block truncate text-[12px] text-muted">{place}</span>}
          </span>
        </div>
        {shop.tagline && <p className="mb-4 mt-3 line-clamp-2 text-[13.5px] leading-relaxed text-ink-2">{shop.tagline}</p>}
        <div className="mt-auto flex items-center justify-between gap-3 border-t border-line pt-3 text-[12.5px] text-muted">
          <span className="num">{stats.join(" · ")}</span>
          <RatingInline avg={shop.ratingAvg} count={shop.ratingCount} />
        </div>
      </div>
    </article>
  );
}
