import Link from "next/link";
import { notFound } from "next/navigation";
import { after } from "next/server";
import type { Metadata } from "next";
import { ShieldAlert, Star } from "lucide-react";
import { COUNTRY_LABEL, PRODUCT_KIND_LABEL, PROJECT_STATUS_LABEL, categoryBySlug, formatMoney, type Currency, type ShipCountry, formatDimensions } from "@werkraum/shared";
import { currentUser } from "@/server/auth/session";
import { countProductView, getProductPage, moreFromShop } from "@/server/commerce/products";
import { listProductReviews } from "@/server/commerce/reviews";
import { paymentsMode } from "@/server/commerce/stripe";
import { env } from "@/server/env";
import { BuyBox } from "@/components/commerce/buy-box";
import { ProductGallery } from "@/components/commerce/product-gallery";
import { ProductSafetyMenu } from "@/components/commerce/product-menu";
import { ProductGrid, RatingInline } from "@/components/commerce/product-card";
import { SaveButton, ShareButton } from "@/components/social/actions";
import { Avatar, Badge, Difficulty, Notice, SectionTitle } from "@/components/ui/misc";
import { Plate, type Variants } from "@/components/ui/media";
import { formatMinutes, relativeTime } from "@/lib/utils";
import { ReviewReply } from "@/components/commerce/review-reply";

type Params = { params: Promise<{ shopSlug: string; productSlug: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { shopSlug, productSlug } = await params;
  const p = await getProductPage(shopSlug, productSlug, null);
  if (!p) return { title: "Produkt nicht gefunden", robots: { index: false } };
  const desc = (p.description || `${PRODUCT_KIND_LABEL[p.kind]} von ${p.shop.name}`).replace(/\s+/g, " ").slice(0, 160);
  const img = p.coverUrl ?? undefined;
  return {
    title: `${p.title} – ${p.shop.name}`,
    description: desc,
    alternates: { canonical: `/markt/${p.shop.slug}/${p.slug}` },
    openGraph: { title: p.title, description: desc, type: "website", images: img ? [{ url: img }] : undefined },
  };
}

function absolute(url: string | null | undefined) {
  if (!url) return undefined;
  try {
    return new URL(url, env().APP_URL).toString();
  } catch {
    return undefined;
  }
}

export default async function ProductPage({ params }: Params) {
  const [{ shopSlug, productSlug }, user] = await Promise.all([params, currentUser()]);
  const p = await getProductPage(shopSlug, productSlug, user?.id);
  if (!p) notFound();
  if (!p.isOwner) after(() => countProductView(p.id));

  const [reviews, more] = await Promise.all([listProductReviews(p.id, user?.id, 20), moreFromShop(p.shopId, p.id, 4)]);
  const currency = (p.currency === "EUR" ? "EUR" : "CHF") as Currency;
  const isDigital = p.kind === "DIGITAL";
  const dims = formatDimensions(p);
  const owner = p.shop.owner.profile!;
  const cat = categoryBySlug(p.category);
  const gallery = p.media
    .filter((m) => m.media.state === "READY" || m.media.state === "PROCESSING")
    .map((m) => ({ id: m.mediaId, alt: m.alt, variants: m.media.variants as Variants, kind: m.media.kind }));
  const mode = paymentsMode();
  const returnText = p.returnPolicy || p.shop.returnPolicy;
  const href = `/markt/${p.shop.slug}/${p.slug}`;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: p.title,
    description: p.description.slice(0, 5000) || undefined,
    image: gallery.map((g) => absolute(g.variants.lg ?? g.variants.md)).filter(Boolean),
    category: cat?.name,
    material: p.materials || undefined,
    brand: { "@type": "Brand", name: p.shop.name },
    url: absolute(href),
    offers: {
      "@type": "Offer",
      price: (p.priceMinor / 100).toFixed(2),
      priceCurrency: currency,
      availability: p.purchasable ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
      itemCondition: "https://schema.org/NewCondition",
      seller: { "@type": "Organization", name: p.shop.name },
      ...(isDigital ? {} : { shippingDetails: { "@type": "OfferShippingDetails", shippingRate: { "@type": "MonetaryAmount", value: (p.shippingMinor / 100).toFixed(2), currency } } }),
    },
    ...(p.ratingCount ? { aggregateRating: { "@type": "AggregateRating", ratingValue: p.ratingAvg.toFixed(1), reviewCount: p.ratingCount } } : {}),
  };

  return (
    <div className="mx-auto w-full max-w-[1200px] px-4 py-6 sm:px-6 md:py-10 lg:px-10">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <nav aria-label="Brotkrumen" className="spec mb-6 truncate">
        <Link href="/markt" className="hover:text-ink">
          Marktplatz
        </Link>{" "}
        /{" "}
        <Link href={`/markt/${p.shop.slug}`} className="hover:text-ink">
          {p.shop.name}
        </Link>{" "}
        / <span className="text-ink">{p.title}</span>
      </nav>

      {p.isOwner && p.status !== "ACTIVE" && (
        <Notice tone="warn" className="mb-6" title="Vorschau">
          Dieses Produkt ist nicht öffentlich ({p.status === "SOLD_OUT" ? "vergriffen, aber sichtbar" : "nicht veröffentlicht"}).{" "}
          <Link href={`/studio/produkte/${p.id}`} className="font-semibold underline">
            Bearbeiten
          </Link>
        </Notice>
      )}

      <div className="grid gap-10 lg:grid-cols-[1.1fr_1fr] lg:gap-14">
        <ProductGallery items={gallery} seed={p.id} category={p.category} title={p.title} />

        <div className="min-w-0">
          <div className="flex items-center justify-between gap-3">
            <p className="spec">
              {PRODUCT_KIND_LABEL[p.kind]}
              {cat ? ` · ${cat.name}` : ""}
            </p>
            {!p.isOwner && <ProductSafetyMenu productId={p.id} sellerId={p.shop.ownerId} sellerName={p.shop.name} />}
          </div>
          <h1 className="display mt-2 text-[2.2rem] text-balance sm:text-5xl">{p.title}</h1>
          <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[14px] text-muted">
            <span>
              von{" "}
              <Link href={`/markt/${p.shop.slug}`} className="font-semibold text-ink hover:underline">
                {p.shop.name}
              </Link>
            </span>
            <RatingInline avg={p.ratingAvg} count={p.ratingCount} />
          </p>

          <div className="mt-7 border-t border-rule pt-6">
            <BuyBox
              productId={p.id}
              priceMinor={p.priceMinor}
              currency={currency}
              variants={p.variantStock}
              available={p.available}
              purchasable={p.purchasable}
              isDigital={isDigital}
              isOwner={p.isOwner}
              signedIn={!!user}
              entitlementId={p.viewer.entitlementId}
              paymentsLive={mode !== "disabled"}
            />
            {p.shop.status === "PAUSED" && <p className="mt-3 text-[13px] text-muted">Der Shop macht gerade Pause – Bestellungen sind vorübergehend nicht möglich.</p>}
            {mode === "simulated" && <p className="mt-3 font-mono text-[11px] uppercase tracking-[0.06em] text-warn">Testmodus · Zahlungen werden simuliert</p>}
          </div>

          <div className="mt-6 flex items-center gap-5 border-y border-line py-3">
            <SaveButton type="PRODUCT" id={p.id} saved={p.viewer.saved} label />
            <ShareButton url={href} title={p.title} />
            {p.saveCount > 0 && <span className="spec ml-auto">{p.saveCount} × gemerkt</span>}
          </div>

          {/* Datenblatt */}
          <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-4 text-[14px]">
            {(p.materialList.length > 0 || p.materials) && (
              <div className="col-span-2">
                <dt className="spec">Materialien</dt>
                <dd className="mt-1">
                  {p.materialList.length > 1 ? (
                    <ul className="space-y-0.5">
                      {p.materialList.map((m, i) => (
                        <li key={i} className="flex gap-2">
                          <span className="mt-[9px] size-1 shrink-0 rounded-full bg-rule-strong" aria-hidden />
                          {m}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    p.materialList[0] ?? p.materials
                  )}
                </dd>
              </div>
            )}
            {(dims || p.dimensions) && (
              <div className="col-span-2 sm:col-span-1">
                <dt className="spec">Masse</dt>
                {dims && <dd className="mt-1 num">{dims}</dd>}
                {p.dimensions && <dd className={dims ? "text-[13px] text-ink-2" : "mt-1 num"}>{p.dimensions}</dd>}
              </div>
            )}
            {isDigital ? (
              <div className="col-span-2 sm:col-span-1">
                <dt className="spec">Lieferung</dt>
                <dd className="mt-1">Sofortiger Download nach Zahlungsbestätigung</dd>
              </div>
            ) : (
              <>
                <div>
                  <dt className="spec">{p.kind === "MADE_TO_ORDER" ? "Fertigung" : "Bearbeitungszeit"}</dt>
                  <dd className="mt-1 num">{p.productionDays} Werktage</dd>
                </div>
                <div>
                  <dt className="spec">Versand</dt>
                  <dd className="mt-1 num">{p.shippingMinor ? formatMoney(p.shippingMinor, currency) : "kostenlos"}</dd>
                </div>
                <div>
                  <dt className="spec">Versand ab</dt>
                  <dd className="mt-1">{COUNTRY_LABEL[p.shipsFrom as ShipCountry] ?? p.shipsFrom}</dd>
                </div>
              </>
            )}
          </dl>
          <p className="mt-5 text-[12.5px] leading-relaxed text-muted">
            Endpreis{isDigital ? "" : " zuzüglich Versand (pro Bestellung gilt der höchste Versandsatz eines Shops)"}. Keine weiteren Gebühren für dich – die Plattformprovision trägt der Shop.
          </p>
        </div>
      </div>

      <div className="mt-16 grid gap-14 lg:grid-cols-[1fr_340px]">
        <div className="min-w-0 space-y-14">
          {p.description && (
            <section aria-labelledby="beschreibung">
              <SectionTitle n="01" title={<span id="beschreibung">Beschreibung</span>} />
              <div className="prose-werk mt-5 whitespace-pre-line">{p.description}</div>
            </section>
          )}

          {(p.project || p.tutorial) && (
            <section aria-labelledby="entstehung">
              <SectionTitle n="02" title={<span id="entstehung">So ist es entstanden</span>} />
              <ol className="relative mt-6 ml-1.5 space-y-6 border-l border-rule">
                {p.project && (
                  <li className="relative pl-6">
                    <span aria-hidden className="absolute -left-[5px] top-4 size-[9px] border border-rule bg-paper rounded-full" />
                    <Link href={`/u/${p.project.ownerHandle}/${p.project.slug}`} className="group flex items-stretch border border-line bg-card transition-colors hover:border-rule-strong rounded-2xl">
                      <div className="relative w-24 shrink-0 overflow-hidden border-r border-line">
                        {p.project.coverUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={p.project.coverUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
                        ) : (
                          <Plate seed={p.project.id} category={p.project.category} number={false} />
                        )}
                      </div>
                      <div className="min-w-0 px-4 py-3">
                        <p className="spec">Projekt · {PROJECT_STATUS_LABEL[p.project.status]}</p>
                        <p className="headline mt-1 text-lg group-hover:underline">{p.project.title}</p>
                        <p className="mt-1 text-[13px] text-muted">Journal, Materialien und Zwischenschritte ansehen →</p>
                      </div>
                    </Link>
                  </li>
                )}
                {p.tutorial && (
                  <li className="relative pl-6">
                    <span aria-hidden className="absolute -left-[5px] top-4 size-[9px] border border-rule bg-paper rounded-full" />
                    <Link href={`/anleitungen/${p.tutorial.slug}`} className="group flex items-center justify-between gap-4 border border-line bg-card px-4 py-3 transition-colors hover:border-rule-strong rounded-2xl">
                      <div className="min-w-0">
                        <p className="spec">Anleitung · {formatMinutes(p.tutorial.minutes)}</p>
                        <p className="headline mt-1 text-lg group-hover:underline">{p.tutorial.title}</p>
                        <p className="mt-1 text-[13px] text-muted">Lieber selbst machen? Hier ist die Anleitung.</p>
                      </div>
                      <Difficulty level={p.tutorial.difficulty} />
                    </Link>
                  </li>
                )}
                <li className="relative pl-6">
                  <span aria-hidden className="absolute -left-[5px] top-1.5 size-[9px] bg-ink rounded-full" />
                  <p className="text-[14px] font-semibold">Dieses Stück</p>
                  <p className="text-[13px] text-muted">{PRODUCT_KIND_LABEL[p.kind]}</p>
                </li>
              </ol>
            </section>
          )}

          <section aria-labelledby="pflicht">
            <SectionTitle n={p.project || p.tutorial ? "03" : "02"} title={<span id="pflicht">Sicherheit & Pflichtangaben</span>} />
            <div className="mt-5 space-y-5 text-[14.5px] leading-relaxed text-ink-2">
              {p.safetyInfo ? (
                <div className="rounded-2xl flex gap-3 bg-warn-soft px-4 py-3">
                  <ShieldAlert size={18} className="mt-0.5 shrink-0 text-warn" aria-hidden />
                  <p className="whitespace-pre-line">{p.safetyInfo}</p>
                </div>
              ) : (
                <p className="text-muted">Der Shop hat keine besonderen Sicherheitshinweise hinterlegt.</p>
              )}
              <div>
                <h3 className="spec mb-1.5">Rückgabe & Umtausch</h3>
                <p className="whitespace-pre-line">{returnText || "Es gelten die gesetzlichen Bestimmungen. Der Shop hat keine eigenen Bedingungen hinterlegt."}</p>
              </div>
              {isDigital && (
                <div>
                  <h3 className="spec mb-1.5">Lizenz</h3>
                  <p>Persönliche, nicht übertragbare Nutzung. Die Datei steht nach dem Kauf in deinen Bestellungen zum Download bereit.</p>
                </div>
              )}
            </div>
          </section>

          <section aria-labelledby="bewertungen">
            <SectionTitle
              n={p.project || p.tutorial ? "04" : "03"}
              title={<span id="bewertungen">Bewertungen</span>}
              action={p.ratingCount > 0 ? <span className="spec">{p.ratingAvg.toFixed(1)} von 5 · {p.ratingCount}</span> : undefined}
            />
            {reviews.length ? (
              <ul className="divide-y divide-line">
                {reviews.map((r) => (
                  <li key={r.id} className="py-5">
                    <div className="flex items-center gap-3">
                      <Avatar src={r.author.profile?.avatarUrl} name={r.author.profile?.displayName ?? "?"} size={30} />
                      <div className="min-w-0 flex-1">
                        <p className="text-[13.5px] font-semibold">
                          {r.author.profile ? (
                            <Link href={`/u/${r.author.profile.handle}`} className="hover:underline">
                              {r.author.profile.displayName}
                            </Link>
                          ) : (
                            "Ehemaliges Mitglied"
                          )}
                        </p>
                        <p className="spec">
                          {relativeTime(r.createdAt)}
                          {r.orderItem.variantName ? ` · ${r.orderItem.variantName}` : ""} · Verifizierter Kauf
                        </p>
                      </div>
                      <span className="flex items-center gap-0.5" aria-label={`${r.productRating} von 5`}>
                        {[1, 2, 3, 4, 5].map((n) => (
                          <Star key={n} size={13} aria-hidden className={n <= r.productRating ? "fill-clay text-clay" : "text-line-strong"} />
                        ))}
                      </span>
                    </div>
                    {r.body && <p className="mt-3 text-[14.5px] leading-relaxed text-ink-2">{r.body}</p>}
                    {r.sellerReply && (
                      <div className="mt-3 rounded-2xl bg-sunken px-4 py-3 text-[13.5px] text-ink-2">
                        <p className="spec mb-0.5">Antwort von {p.shop.name}</p>
                        {r.sellerReply}
                      </div>
                    )}
                    {p.isOwner && <ReviewReply reviewId={r.id} current={r.sellerReply ?? null} path={`/markt/${shopSlug}/${productSlug}`} />}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="py-5 text-[14px] text-muted">Noch keine Bewertungen. Bewerten können nur Personen, die diesen Artikel gekauft haben.</p>
            )}
          </section>
        </div>

        <aside className="space-y-8 lg:sticky lg:top-6 lg:h-fit" aria-label="Verkäufer">
          <section className="border border-rule bg-card p-5 rounded-2xl">
            <p className="spec mb-3">Gemacht von</p>
            <Link href={`/u/${owner.handle}`} className="group flex items-center gap-3">
              <Avatar src={owner.avatarUrl} name={owner.displayName} size={48} />
              <span className="min-w-0">
                <span className="headline block truncate text-lg group-hover:underline">{owner.displayName}</span>
                <span className="block text-[12.5px] text-muted">
                  @{owner.handle}
                  {owner.region ? ` · ${owner.region}` : ""}
                </span>
              </span>
            </Link>
            {owner.bio && <p className="mt-4 line-clamp-4 text-[13.5px] leading-relaxed text-ink-2">{owner.bio}</p>}
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <Badge tone="outline">{p.shop.sellerType === "BUSINESS" ? "Gewerblich" : "Privat"}</Badge>
              {p.shop.ratingCount > 0 && <RatingInline avg={p.shop.ratingAvg} count={p.shop.ratingCount} />}
            </div>
            <div className="mt-5 flex flex-col gap-2 border-t border-line pt-4 text-[14px]">
              <Link href={`/markt/${p.shop.slug}`} className="font-semibold hover:underline">
                Zum Shop „{p.shop.name}“ →
              </Link>
              {!p.isOwner && (
                <Link href={`/nachrichten/neu?an=${encodeURIComponent(owner.handle)}`} className="text-muted hover:text-ink hover:underline">
                  Frage zum Produkt stellen
                </Link>
              )}
            </div>
          </section>
          {p.shop.sellerType === "BUSINESS" && p.shop.verification && (
            <section className="text-[12.5px] leading-relaxed text-muted">
              <p className="spec mb-1">Anbieter</p>
              <p>
                {p.shop.verification.businessName}, {p.shop.verification.addressLine}, {p.shop.verification.postalCode} {p.shop.verification.city}
                {p.shop.verification.vatId ? ` · MWST ${p.shop.verification.vatId}` : ""}
              </p>
            </section>
          )}
        </aside>
      </div>

      {more.length > 0 && (
        <section className="mt-20" aria-labelledby="mehr">
          <SectionTitle title={<span id="mehr">Mehr aus diesem Shop</span>} action={<Link href={`/markt/${p.shop.slug}`} className="text-[13px] text-muted hover:text-ink">Alle ansehen</Link>} />
          <ProductGrid products={more} className="mt-6" />
        </section>
      )}
    </div>
  );
}
