import Link from "next/link";
import { Star, Store } from "lucide-react";
import type { ProfileReview } from "@/server/commerce/reviews";
import { Avatar } from "@/components/ui/misc";
import { cn, relativeTime } from "@/lib/utils";

/** Bewertungen auf der Profilseite: erhalten (Shop) bzw. abgegeben (Käufer:in). */

export function Stars({ value, size = 13, className }: { value: number; size?: number; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-0.5", className)} role="img" aria-label={`${value.toLocaleString("de-CH", { maximumFractionDigits: 1 })} von 5 Sternen`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} size={size} aria-hidden className={n <= Math.round(value) ? "fill-clay text-clay" : "fill-line text-line"} />
      ))}
    </span>
  );
}

/** Kopf mit Durchschnitt und Verteilung (nur bei erhaltenen Bewertungen). */
export function RatingSummary({ avg, count, dist }: { avg: number; count: number; dist: { stars: number; n: number }[] }) {
  const max = Math.max(1, ...dist.map((d) => d.n));
  return (
    <div className="grid gap-6 rounded-2xl border border-line bg-card p-5 sm:grid-cols-[auto_1fr] sm:items-center sm:gap-10 sm:p-6">
      <div>
        <p className="num text-5xl font-bold tracking-tight">{avg.toLocaleString("de-CH", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</p>
        <Stars value={avg} size={15} className="mt-2" />
        <p className="mt-1.5 text-[13px] text-muted">
          {count} {count === 1 ? "Bewertung" : "Bewertungen"}
        </p>
      </div>
      <ul className="space-y-1.5" aria-label="Verteilung der Bewertungen">
        {dist.map((d) => (
          <li key={d.stars} className="grid grid-cols-[2.2rem_1fr_2rem] items-center gap-3 text-[12.5px]">
            <span className="inline-flex items-center gap-1 text-ink-2">
              {d.stars} <Star size={11} className="fill-clay text-clay" aria-hidden />
            </span>
            <span className="h-1.5 overflow-hidden rounded-full bg-sunken">
              <span className="block h-full rounded-full bg-clay" style={{ width: `${(d.n / max) * 100}%` }} />
            </span>
            <span className="num text-right text-muted">{d.n}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function productHref(r: ProfileReview) {
  const public_ = ["ACTIVE", "SOLD_OUT"].includes(r.product.status) && ["ACTIVE", "PAUSED"].includes(r.product.shop.status);
  return public_ ? `/markt/${r.product.shop.slug}/${r.product.slug}` : null;
}

function Reply({ text, shopName }: { text: string; shopName: string }) {
  return (
    <div className="mt-3 rounded-xl bg-sunken px-3.5 py-2.5">
      <p className="text-[12px] font-semibold text-ink-2">Antwort von {shopName}</p>
      <p className="mt-0.5 whitespace-pre-line text-[13.5px] leading-relaxed text-ink-2">{text}</p>
    </div>
  );
}

/** Erhaltene Bewertungen: wer hat bewertet, welches Produkt. */
export function ReceivedReviewList({ reviews }: { reviews: ProfileReview[] }) {
  return (
    <ul className="divide-y divide-line">
      {reviews.map((r) => {
        const href = productHref(r);
        const author = r.author.profile;
        return (
          <li key={r.id} className="py-5">
            <div className="flex items-start gap-3">
              {author ? (
                <Link href={`/u/${author.handle}`} className="shrink-0">
                  <Avatar src={author.avatarUrl} name={author.displayName} size={36} />
                </Link>
              ) : (
                <Avatar src={null} name="?" size={36} />
              )}
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-baseline gap-x-2 text-[14px]">
                  {author ? (
                    <Link href={`/u/${author.handle}`} className="font-semibold hover:underline">
                      {author.displayName}
                    </Link>
                  ) : (
                    <span className="font-semibold">Ehemaliges Mitglied</span>
                  )}
                  <span className="text-[12.5px] text-muted">{relativeTime(r.createdAt)}</span>
                </p>
                <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[13px]">
                  <Stars value={r.sellerRating ?? r.productRating} />
                  <span className="text-muted">
                    {href ? (
                      <Link href={href} className="hover:text-ink hover:underline">
                        {r.product.title}
                      </Link>
                    ) : (
                      r.product.title
                    )}
                    {r.orderItem.variantName && ` · ${r.orderItem.variantName}`}
                  </span>
                </div>
                {r.body && <p className="mt-2 whitespace-pre-line text-[14.5px] leading-relaxed text-ink-2">{r.body}</p>}
                {r.sellerReply && <Reply text={r.sellerReply} shopName={r.product.shop.name} />}
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/** Abgegebene Bewertungen: welches Produkt aus welchem Shop. */
export function GivenReviewList({ reviews }: { reviews: ProfileReview[] }) {
  return (
    <ul className="divide-y divide-line">
      {reviews.map((r) => {
        const href = productHref(r);
        const Title = href ? Link : "span";
        return (
          <li key={r.id} className="py-5">
            <div className="flex items-start gap-3.5">
              <span className="size-14 shrink-0 overflow-hidden rounded-xl bg-sunken">
                {r.product.coverUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={r.product.coverUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
                ) : (
                  <span className="grid h-full place-items-center text-muted">
                    <Store size={18} aria-hidden />
                  </span>
                )}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[14px] leading-snug">
                  <Title href={href ?? ""} className={cn("font-semibold", href && "hover:underline")}>
                    {r.product.title}
                  </Title>
                </p>
                <p className="text-[12.5px] text-muted">
                  {["ACTIVE", "PAUSED"].includes(r.product.shop.status) ? (
                    <Link href={`/markt/${r.product.shop.slug}`} className="hover:text-ink hover:underline">
                      {r.product.shop.name}
                    </Link>
                  ) : (
                    r.product.shop.name
                  )}{" "}
                  · {relativeTime(r.createdAt)}
                </p>
                <Stars value={r.productRating} className="mt-1.5" />
                {r.body && <p className="mt-2 whitespace-pre-line text-[14.5px] leading-relaxed text-ink-2">{r.body}</p>}
                {r.sellerReply && <Reply text={r.sellerReply} shopName={r.product.shop.name} />}
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
