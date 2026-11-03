import Link from "next/link";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Download, ExternalLink, MessageSquare, Star } from "lucide-react";
import { formatMoney, type Currency, type OrderStatus } from "@werkraum/shared";
import { currentUser } from "@/server/auth/session";
import { getBuyerOrder } from "@/server/commerce/orders";
import { canReview, canTransition } from "@/server/commerce/rules";
import { AddressBlock, FeeSummary, OrderStatusBadge, OrderTimeline, PaymentStatusBadge } from "@/components/commerce/order-parts";
import { ConfirmReceiptButton, ReportProblemButton, ReviewForm } from "@/components/commerce/buyer-order-actions";
import { AbandonOrderButton, ResumePaymentButton } from "@/components/commerce/payment-actions";
import { Plate } from "@/components/ui/media";
import { Notice, SectionTitle } from "@/components/ui/misc";
import { buttonClass } from "@/components/ui/button";
import { formatDate } from "@/lib/utils";

export const metadata: Metadata = { title: "Bestellung", robots: { index: false } };

export default async function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, user] = await Promise.all([params, currentUser()]);
  if (!user) redirect(`/anmelden?weiter=/bestellungen/${id}`);
  const o = await getBuyerOrder(user.id, id);
  if (!o) notFound();

  const currency = (o.currency === "EUR" ? "EUR" : "CHF") as Currency;
  const status = o.status as OrderStatus;
  const payment = o.payments[0];
  const refunded = o.refunds.filter((r) => r.status === "SUCCEEDED").reduce((s, r) => s + r.amountMinor, 0);
  const pendingRefund = o.refunds.filter((r) => r.status === "PENDING").reduce((s, r) => s + r.amountMinor, 0);
  const reviewable = canReview(status, payment?.status);
  const sellerHandle = o.shop.owner.profile?.handle ?? "";
  const contactHref = `/nachrichten/neu?an=${encodeURIComponent(sellerHandle)}&bestellung=${o.id}`;
  const open = status === "PENDING_PAYMENT" && !!o.reservationExpiresAt && o.reservationExpiresAt > new Date();

  return (
    <div className="mx-auto w-full max-w-[1100px] px-4 py-6 sm:px-6 md:py-10 lg:px-10">
      <nav aria-label="Brotkrumen" className="spec mb-6">
        <Link href="/bestellungen" className="hover:text-ink">
          Meine Bestellungen
        </Link>{" "}
        / <span className="font-mono text-ink">{o.number}</span>
      </nav>

      <header className="mb-10 flex flex-wrap items-end justify-between gap-6 border-b border-ink pb-6">
        <div>
          <p className="spec">Bestellt am {formatDate(o.createdAt)} bei</p>
          <h1 className="display mt-1 text-[2.4rem] sm:text-5xl">
            <Link href={`/markt/${o.shop.slug}`} className="hover:underline">
              {o.shop.name}
            </Link>
          </h1>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <OrderStatusBadge status={status} />
            {payment && <PaymentStatusBadge status={payment.status} />}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link href={contactHref} className={buttonClass("outline", "sm")}>
            <MessageSquare size={14} /> Shop kontaktieren
          </Link>
          {canTransition(status, "PROBLEM") && <ReportProblemButton orderId={o.id} />}
          {o.paidAt && (
            <Link href={`/beleg/${o.id}`} className={buttonClass("ghost", "sm")}>
              Beleg
            </Link>
          )}
        </div>
      </header>

      {open && (
        <Notice tone="warn" className="mb-8" title="Zahlung ausstehend">
          <p>Die Artikel sind bis {o.reservationExpiresAt!.toLocaleTimeString("de-CH", { hour: "2-digit", minute: "2-digit" })} Uhr für dich reserviert.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <ResumePaymentButton orderId={o.id} />
            <AbandonOrderButton orderId={o.id} redirectTo={`/bestellungen/${o.id}`} />
          </div>
        </Notice>
      )}
      {status === "SHIPPED" && (
        <Notice tone="moss" className="mb-8" title="Unterwegs zu dir">
          <p>Ist alles gut angekommen? Bestätige den Erhalt – damit schliesst du die Bestellung ab.</p>
          <div className="mt-3">
            <ConfirmReceiptButton orderId={o.id} />
          </div>
        </Notice>
      )}
      {pendingRefund > 0 && (
        <Notice className="mb-8" title="Erstattung in Bearbeitung">
          {formatMoney(pendingRefund, currency)} werden erstattet. Sobald der Zahlungsanbieter die Rückzahlung bestätigt, siehst du sie hier.
        </Notice>
      )}

      <div className="grid gap-12 lg:grid-cols-[1fr_320px]">
        <div className="min-w-0 space-y-12">
          <section aria-labelledby="positionen">
            <SectionTitle n="01" title={<span id="positionen">Artikel</span>} />
            <ul className="divide-y divide-line">
              {o.items.map((it) => {
                const ent = o.entitlements.find((e) => e.orderItemId === it.id);
                return (
                  <li key={it.id} className="py-5">
                    <div className="grid grid-cols-[64px_1fr_auto] gap-4">
                      <Link href={`/markt/${it.product.shop.slug}/${it.product.slug}`} className="relative block aspect-[4/5] overflow-hidden border border-line bg-sunken" tabIndex={-1} aria-hidden>
                        {it.product.coverUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={it.product.coverUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
                        ) : (
                          <Plate seed={it.productId} category={it.product.category} number={false} />
                        )}
                      </Link>
                      <div className="min-w-0">
                        <Link href={`/markt/${it.product.shop.slug}/${it.product.slug}`} className="headline text-[17px] leading-snug hover:underline">
                          {it.title}
                        </Link>
                        {it.variantName && <p className="text-[13px] text-muted">Variante: {it.variantName}</p>}
                        <p className="num mt-0.5 text-[13px] text-muted">
                          {it.quantity} × {formatMoney(it.unitMinor, currency)}
                        </p>
                        {ent && (
                          <div className="mt-3 flex flex-wrap items-center gap-3">
                            {ent.revokedAt ? (
                              <span className="text-[13px] text-muted">Lizenz widerrufen</span>
                            ) : (
                              <>
                                <a href={`/api/v1/downloads/${ent.id}`} className={buttonClass("primary", "sm")}>
                                  <Download size={14} /> Herunterladen
                                </a>
                                <span className="spec">
                                  {ent.downloadCount}
                                  {ent.downloadLimit ? ` / ${ent.downloadLimit}` : ""} Downloads
                                </span>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                      <p className="num text-[14.5px] font-semibold">{formatMoney(it.unitMinor * it.quantity, currency)}</p>
                    </div>
                    {it.review ? (
                      <div className="ml-[80px] mt-3 border-l border-ink pl-3 text-[13.5px]">
                        <p className="flex items-center gap-1" aria-label={`Deine Bewertung: ${it.review.productRating} von 5`}>
                          {[1, 2, 3, 4, 5].map((n) => (
                            <Star key={n} size={12} aria-hidden className={n <= it.review!.productRating ? "fill-clay text-clay" : "text-line-strong"} />
                          ))}
                          <span className="spec ml-2">Deine Bewertung</span>
                        </p>
                        {it.review.body && <p className="mt-1 text-ink-2">{it.review.body}</p>}
                      </div>
                    ) : reviewable ? (
                      <div className="ml-[80px] mt-3">
                        <ReviewForm orderId={o.id} orderItemId={it.id} title={it.title} />
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
            <div className="ml-auto mt-2 max-w-sm border-t border-line pt-3">
              <FeeSummary subtotal={o.subtotalMinor} shipping={o.shippingMinor} total={o.totalMinor} currency={currency} refunded={refunded} />
              <p className="mt-2 text-[12px] text-muted">Endpreis – keine Zusatzgebühren. Die Plattformprovision hat der Shop getragen.</p>
            </div>
          </section>

          {o.shipments.length > 0 && (
            <section aria-labelledby="versand">
              <SectionTitle n="02" title={<span id="versand">Sendungsverfolgung</span>} />
              <ul className="mt-4 space-y-3">
                {o.shipments.map((s) => (
                  <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 border border-line bg-card px-4 py-3 text-[14px]">
                    <div>
                      <p className="font-semibold">{s.carrier}</p>
                      <p className="spec mt-0.5">
                        Versendet am {formatDate(s.shippedAt)}
                        {s.trackingNo ? ` · ${s.trackingNo}` : ""}
                        {s.deliveredAt ? ` · zugestellt ${formatDate(s.deliveredAt)}` : ""}
                      </p>
                    </div>
                    {s.trackingUrl && (
                      <a href={s.trackingUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-[13.5px] font-semibold text-moss hover:underline">
                        Sendung verfolgen <ExternalLink size={13} />
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section aria-labelledby="verlauf">
            <SectionTitle n={o.shipments.length ? "03" : "02"} title={<span id="verlauf">Verlauf</span>} />
            <OrderTimeline className="mt-6" events={o.events.map((e) => ({ ...e, from: e.from as OrderStatus | null, to: e.to as OrderStatus }))} />
          </section>
        </div>

        <aside className="space-y-8 lg:sticky lg:top-6 lg:h-fit">
          {o.items.some((i) => !i.isDigital) && (
            <section>
              <p className="spec mb-2">Lieferadresse</p>
              <AddressBlock address={o.shippingAddress} />
            </section>
          )}
          {o.buyerNote && (
            <section>
              <p className="spec mb-2">Deine Nachricht an den Shop</p>
              <p className="text-[14px] leading-relaxed text-ink-2">{o.buyerNote}</p>
            </section>
          )}
          <section>
            <p className="spec mb-2">Rückgabe</p>
            <p className="whitespace-pre-line text-[13.5px] leading-relaxed text-ink-2">{o.shop.returnPolicy || "Es gelten die gesetzlichen Bestimmungen."}</p>
          </section>
          <section className="border-t border-line pt-5 text-[13.5px] leading-relaxed text-muted">
            Etwas stimmt nicht? Schreib zuerst dem Shop – die meisten Fragen lösen sich schnell.{" "}
            <Link href={contactHref} className="font-semibold text-ink underline underline-offset-2">
              Nachricht schreiben
            </Link>
          </section>
        </aside>
      </div>
    </div>
  );
}
