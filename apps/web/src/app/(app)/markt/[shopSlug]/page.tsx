import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Star } from "lucide-react";
import { COUNTRY_LABEL, SELLER_TYPE_LABEL, type ShipCountry } from "@werkraum/shared";
import { currentUser } from "@/server/auth/session";
import { getPublicShop } from "@/server/commerce/shops";
import { listProducts } from "@/server/commerce/products";
import { listShopReviews } from "@/server/commerce/reviews";
import { ProductGrid } from "@/components/commerce/product-card";
import { Avatar, Empty, Notice, SectionTitle, Stat } from "@/components/ui/misc";
import { LinkButton } from "@/components/ui/button";
import { formatDate, relativeTime } from "@/lib/utils";

type Params = { params: Promise<{ shopSlug: string }>; searchParams: Promise<{ cursor?: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { shopSlug } = await params;
  const shop = await getPublicShop(shopSlug, null);
  if (!shop) return { title: "Shop nicht gefunden", robots: { index: false } };
  return {
    title: `${shop.name} – Shop`,
    description: shop.tagline || shop.description.slice(0, 160) || `Handgemachtes von ${shop.owner.profile?.displayName} auf Werkuno.`,
    alternates: { canonical: `/markt/${shop.slug}` },
    openGraph: { title: shop.name, description: shop.tagline || undefined, type: "website" },
  };
}

/** Shopseite: Werkstatt-Kopf, Arbeiten, Bedingungen und Anbieterkennzeichnung. */
export default async function ShopPage({ params, searchParams }: Params) {
  const [{ shopSlug }, sp, user] = await Promise.all([params, searchParams, currentUser()]);
  const shop = await getPublicShop(shopSlug, user?.id);
  if (!shop) notFound();
  const profile = shop.owner.profile!;
  const [products, reviews] = await Promise.all([
    listProducts(
      { shopId: shop.id, includeSoldOut: true, shopStatuses: shop.isOwner ? ["ACTIVE", "PAUSED", "PENDING_VERIFICATION", "DRAFT"] : ["ACTIVE", "PAUSED"] },
      sp.cursor ?? null, { take: 24, viewerId: user?.id }),
    listShopReviews(shop.id, user?.id, 6),
  ]);
  const v = shop.verification;
  const country = COUNTRY_LABEL[shop.country as ShipCountry] ?? shop.country;

  return (
    <div className="mx-auto w-full max-w-[1200px] px-4 py-6 sm:px-6 md:py-10 lg:px-10">
      <nav aria-label="Brotkrumen" className="spec mb-6">
        <Link href="/markt" className="hover:text-ink">
          Marktplatz
        </Link>{" "}
        / <span className="text-ink">{shop.name}</span>
      </nav>

      {shop.isOwner && shop.status !== "ACTIVE" && (
        <Notice tone="warn" className="mb-6" title="Vorschau">
          Dein Shop ist noch nicht öffentlich. <Link href="/studio/shop" className="font-semibold underline">Zur Shopverwaltung</Link>
        </Notice>
      )}
      {shop.status === "PAUSED" && !shop.isOwner && (
        <Notice className="mb-6" title="Dieser Shop macht gerade Pause">
          Die Arbeiten sind sichtbar, können aber im Moment nicht bestellt werden.
        </Notice>
      )}

      <header className="grid gap-8 border-b border-rule pb-10 md:grid-cols-[1fr_auto] md:items-end">
        <div>
          <p className="spec mb-3 flex items-center gap-2">
            <span className="inline-block h-px w-6 bg-rule-strong" />
            Shop · {country}
          </p>
          <h1 className="display text-[2.6rem] text-balance sm:text-6xl">{shop.name}</h1>
          {shop.tagline && <p className="headline mt-3 max-w-2xl text-xl italic text-ink-2">{shop.tagline}</p>}
          <Link href={`/u/${profile.handle}`} className="group mt-6 inline-flex items-center gap-3">
            <Avatar src={profile.avatarUrl} name={profile.displayName} size={40} />
            <span>
              <span className="block text-[14px] font-semibold group-hover:underline">{profile.displayName}</span>
              <span className="block text-[12.5px] text-muted">@{profile.handle} · Profil & Projekte ansehen</span>
            </span>
          </Link>
        </div>
        <dl className="grid grid-cols-3 gap-6 md:min-w-[360px]">
          <Stat label="Arbeiten" value={shop._count.products} />
          <Stat label="Verkauft" value={shop.salesCount} />
          <Stat
            label="Bewertung"
            value={
              shop.ratingCount ? (
                <span className="inline-flex items-center gap-1">
                  <Star size={16} className="fill-clay text-clay" aria-hidden />
                  {shop.ratingAvg.toFixed(1)}
                </span>
              ) : (
                "–"
              )
            }
            note={shop.ratingCount ? `${shop.ratingCount} Bewertungen` : "Noch keine"}
          />
        </dl>
      </header>

      <div className="mt-10 grid gap-12 lg:grid-cols-[1fr_300px]">
        <section aria-labelledby="arbeiten">
          <SectionTitle n="01" title={<span id="arbeiten">Arbeiten</span>} />
          <div className="mt-6">
            {products.items.length ? (
              <ProductGrid products={products.items} priorityFirst={3} className="md:grid-cols-3 xl:grid-cols-3" />
            ) : (
              <Empty title="Noch keine Arbeiten" body="Dieser Shop richtet sich gerade ein." action={<LinkButton href={`/u/${profile.handle}`} variant="outline">Projekte ansehen</LinkButton>} />
            )}
            {products.nextCursor && (
              <div className="mt-10 border-t border-line pt-5 text-right">
                <Link href={`/markt/${shop.slug}?cursor=${products.nextCursor}`} className="text-[14px] font-semibold hover:underline">
                  Weitere Arbeiten →
                </Link>
              </div>
            )}
          </div>

          {reviews.length > 0 && (
            <section className="mt-16" aria-labelledby="stimmen">
              <SectionTitle n="02" title={<span id="stimmen">Stimmen von Käufer:innen</span>} />
              <ul className="mt-2 divide-y divide-line">
                {reviews.map((r) => (
                  <li key={r.id} className="grid gap-2 py-5 sm:grid-cols-[180px_1fr]">
                    <div className="flex items-center gap-2.5">
                      <Avatar src={r.author.profile?.avatarUrl} name={r.author.profile?.displayName ?? "?"} size={28} />
                      <div className="min-w-0">
                        <p className="truncate text-[13px] font-semibold">{r.author.profile?.displayName ?? "Ehemaliges Mitglied"}</p>
                        <p className="spec">{relativeTime(r.createdAt)}</p>
                      </div>
                    </div>
                    <div>
                      <p className="flex items-center gap-1 text-[13px]" aria-label={`${r.sellerRating ?? r.productRating} von 5`}>
                        {[1, 2, 3, 4, 5].map((n) => (
                          <Star key={n} size={12} aria-hidden className={n <= (r.sellerRating ?? r.productRating) ? "fill-clay text-clay" : "text-line-strong"} />
                        ))}
                        <Link href={`/markt/${shop.slug}/${r.product.slug}`} className="ml-2 text-muted hover:text-ink hover:underline">
                          {r.product.title}
                        </Link>
                      </p>
                      {r.body && <p className="mt-1.5 text-[14.5px] leading-relaxed text-ink-2">{r.body}</p>}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </section>

        <aside className="space-y-10" aria-label="Über den Shop">
          {shop.description && (
            <section>
              <SectionTitle title="Über den Shop" />
              <p className="mt-3 whitespace-pre-line text-[14.5px] leading-relaxed text-ink-2">{shop.description}</p>
            </section>
          )}
          <section>
            <SectionTitle title="Versand" />
            <dl className="mt-3 space-y-2 text-[14px]">
              <div className="flex justify-between gap-4">
                <dt className="text-muted">Bearbeitungszeit</dt>
                <dd>{shop.processingDays} Werktage</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted">Versand ab</dt>
                <dd>{country}</dd>
              </div>
            </dl>
            {shop.shippingPolicy && <p className="mt-3 whitespace-pre-line text-[13.5px] leading-relaxed text-ink-2">{shop.shippingPolicy}</p>}
          </section>
          <section>
            <SectionTitle title="Rückgabe & Umtausch" />
            <p className="mt-3 whitespace-pre-line text-[13.5px] leading-relaxed text-ink-2">{shop.returnPolicy || "Der Shop hat keine eigenen Rückgabebedingungen hinterlegt. Es gelten die gesetzlichen Bestimmungen."}</p>
          </section>
          <section>
            <SectionTitle title="Anbieter" />
            <div className="mt-3 space-y-1 text-[13.5px] leading-relaxed text-ink-2">
              <p>
                <span className="spec mr-2">{SELLER_TYPE_LABEL[shop.sellerType]}</span>
                {shop.verification?.state === "VERIFIED" && <span className="spec text-moss">Verifiziert</span>}
              </p>
              {shop.sellerType === "BUSINESS" && v ? (
                <address className="not-italic">
                  <span className="block font-semibold text-ink">{v.businessName}</span>
                  {v.legalName && <span className="block">Verantwortlich: {v.legalName}</span>}
                  <span className="block">{v.addressLine}</span>
                  <span className="block">
                    {v.postalCode} {v.city}, {COUNTRY_LABEL[(v.country ?? "CH") as ShipCountry]}
                  </span>
                  {v.vatId && <span className="block">MWST/USt: {v.vatId}</span>}
                </address>
              ) : (
                <p>Privatverkauf durch {profile.displayName}. Bei privaten Verkäufen gelten teilweise andere Rechte als beim Kauf im Handel – siehe Rückgabebedingungen.</p>
              )}
              <p className="pt-2 text-[12.5px] text-muted">Auf Werkuno seit {formatDate(shop.createdAt, { month: "long", year: "numeric" })}</p>
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
