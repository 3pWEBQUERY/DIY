import Link from "next/link";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { MessageSquare } from "lucide-react";
import { formatMoney, type Currency, type OrderStatus } from "@werkraum/shared";
import { currentUser, requirePageUser } from "@/server/auth/session";
import { getSellerOrder } from "@/server/commerce/orders";
import { canSellerCancel, formatBps, netPlatformFee, refundableAmount } from "@/server/commerce/rules";
import { orderBuyer } from "@/server/account/customer";
import { AddressBlock, FeeSummary, OrderStatusBadge, OrderTimeline, PaymentStatusBadge } from "@/components/commerce/order-parts";
import { SellerOrderActions } from "@/components/commerce/seller-order-actions";
import { Avatar, Notice, SectionTitle } from "@/components/ui/misc";
import { buttonClass } from "@/components/ui/button";
import { formatDate } from "@/lib/utils";

export const metadata: Metadata = { title: "Bestellung" };

export default async function StudioOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, viewer] = await Promise.all([params, currentUser()]);
  if (!viewer?.profile) redirect(`/anmelden?weiter=/studio/bestellungen/${id}`);
  const user = await requirePageUser("/studio/bestellungen");
  const o = await getSellerOrder(user, id);
  if (!o) notFound();

  const currency = (o.currency === "EUR" ? "EUR" : "CHF") as Currency;
  const status = o.status as OrderStatus;
  const payment = o.payments[0];
  const refunded = o.refunds.filter((r) => r.status === "SUCCEEDED").reduce((s, r) => s + r.amountMinor, 0);
  const refundable = payment && ["SUCCEEDED", "PARTIALLY_REFUNDED"].includes(payment.status) ? refundableAmount(payment.amountMinor, o.refunds) : 0;
  const netFee = netPlatformFee(o.platformFeeMinor, o.totalMinor, refunded);
  const digitalOnly = o.items.every((i) => i.isDigital);
  const buyer = o.buyer.profile;
  const party = orderBuyer(o);
  const sameAddress = JSON.stringify(party.billing) === JSON.stringify(o.shippingAddress);
  const actorName = (actorId: string | null) => (!actorId ? "System / Zahlungsanbieter" : actorId === o.buyerId ? "Käufer:in" : actorId === o.shop.ownerId ? "Du" : "Team");

  return (
    <div>
      <nav aria-label="Brotkrumen" className="spec mb-6">
        <Link href="/studio/bestellungen" className="hover:text-ink">
          Bestellungen
        </Link>{" "}
        / <span className="font-mono text-ink">{o.number}</span>
      </nav>

      <header className="mb-10 flex flex-wrap items-end justify-between gap-6 border-b border-rule pb-6">
        <div>
          <p className="spec">Bezahlt {o.paidAt ? `am ${formatDate(o.paidAt)}` : "–"}</p>
          <h1 className="display mt-1 font-mono text-[2.2rem] tracking-tight sm:text-5xl">{o.number}</h1>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <OrderStatusBadge status={status} />
            {payment && <PaymentStatusBadge status={payment.status} />}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {buyer && (
            <Link href={`/nachrichten/neu?an=${encodeURIComponent(buyer.handle)}&bestellung=${o.id}`} className={buttonClass("outline", "sm")}>
              <MessageSquare size={14} /> Käufer:in kontaktieren
            </Link>
          )}
          <Link href={`/beleg/${o.id}`} className={buttonClass("ghost", "sm")}>
            Beleg drucken
          </Link>
        </div>
      </header>

      {payment?.status === "DISPUTED" && (
        <Notice tone="danger" className="mb-8 max-w-3xl" title="Zahlung angefochten">
          Die Karteninhaberin bzw. der Karteninhaber hat die Zahlung bei der Bank angefochten. Reiche Belege (Versandnachweis, Kommunikation) im Stripe-Dashboard ein. Erstattungen sind während des Verfahrens gesperrt.
        </Notice>
      )}
      {status === "PROBLEM" && payment?.status !== "DISPUTED" && (
        <Notice tone="warn" className="mb-8 max-w-3xl" title="Problemfall">
          Bitte kläre das Anliegen mit der Käuferin bzw. dem Käufer und setze die Bestellung danach fort – oder storniere und erstatte.
        </Notice>
      )}
      {o.refunds.some((r) => r.status === "PENDING") && (
        <Notice className="mb-8 max-w-3xl" title="Erstattung in Bearbeitung">
          Die Bestätigung des Zahlungsanbieters steht noch aus.
        </Notice>
      )}

      <div className="grid gap-12 xl:grid-cols-[1fr_360px]">
        <div className="min-w-0 space-y-12">
          <section aria-labelledby="positionen">
            <SectionTitle n="01" title={<span id="positionen">Artikel</span>} />
            <div className="overflow-x-auto"><table className="mt-2 w-full text-[14px]">
              <tbody className="divide-y divide-line">
                {o.items.map((it) => (
                  <tr key={it.id} className="align-top">
                    <td className="py-3 pr-4">
                      <Link href={`/markt/${it.product.shop.slug}/${it.product.slug}`} className="font-semibold hover:underline">
                        {it.title}
                      </Link>
                      {it.variantName && <span className="block text-[13px] text-muted">Variante: {it.variantName}</span>}
                      {it.isDigital && <span className="spec block">Digitaler Download</span>}
                    </td>
                    <td className="num py-3 pr-4 text-right text-muted">
                      {it.quantity} × {formatMoney(it.unitMinor, currency)}
                    </td>
                    <td className="num py-3 text-right font-semibold">{formatMoney(it.unitMinor * it.quantity, currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table></div>
            <div className="ml-auto mt-3 max-w-md border-t border-line pt-3">
              <FeeSummary subtotal={o.subtotalMinor} shipping={o.shippingMinor} total={o.totalMinor} currency={currency} refunded={refunded} seller={{ platformFee: netFee, feeLabel: formatBps(o.feeBps) }} />
            </div>
          </section>

          {o.buyerNote && (
            <section>
              <SectionTitle n="02" title="Nachricht der Käuferin / des Käufers" />
              <blockquote className="mt-4 border-l-2 border-clay pl-4 text-[15px] leading-relaxed text-ink-2">{o.buyerNote}</blockquote>
            </section>
          )}

          {o.shipments.length > 0 && (
            <section>
              <SectionTitle n={o.buyerNote ? "03" : "02"} title="Versand" />
              <ul className="mt-4 space-y-2 text-[14px]">
                {o.shipments.map((s) => (
                  <li key={s.id} className="border border-line bg-card px-4 py-3 rounded-2xl">
                    <span className="font-semibold">{s.carrier}</span>
                    {s.trackingNo && <span className="ml-2 font-mono text-[13px]">{s.trackingNo}</span>}
                    <span className="spec ml-2">{formatDate(s.shippedAt)}</span>
                    {s.trackingUrl && (
                      <a href={s.trackingUrl} target="_blank" rel="noopener noreferrer" className="ml-3 text-[13px] text-moss underline">
                        Verfolgen
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {o.refunds.length > 0 && (
            <section>
              <SectionTitle title="Erstattungen" />
              <ul className="mt-3 divide-y divide-line text-[14px]">
                {o.refunds.map((r) => (
                  <li key={r.id} className="flex flex-wrap items-baseline justify-between gap-3 py-2.5">
                    <span>
                      <span className="num font-semibold">{formatMoney(r.amountMinor, currency)}</span>
                      <span className="ml-2 text-muted">{r.reason}</span>
                    </span>
                    <span className="spec">
                      {r.status === "SUCCEEDED" ? "Ausgezahlt" : r.status === "PENDING" ? "In Bearbeitung" : "Fehlgeschlagen"} · {formatDate(r.createdAt, { day: "numeric", month: "short" })}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section aria-labelledby="verlauf">
            <SectionTitle title={<span id="verlauf">Verlauf</span>} />
            <OrderTimeline className="mt-6" events={o.events.map((e) => ({ ...e, from: e.from as OrderStatus | null, to: e.to as OrderStatus, actor: actorName(e.actorId) }))} />
          </section>
        </div>

        <aside className="space-y-8 xl:sticky xl:top-20 xl:h-fit">
          <section className="border border-rule bg-card p-5 rounded-2xl">
            <p className="spec mb-4">Nächster Schritt</p>
            {status === "CANCELLED" || status === "REFUNDED" ? (
              <p className="text-[14px] text-muted">Diese Bestellung ist abgeschlossen ({status === "CANCELLED" ? "storniert" : "erstattet"}).</p>
            ) : (
              <SellerOrderActions
                orderId={o.id}
                status={status}
                currency={currency}
                refundableMinor={refundable}
                canRefund={refundable > 0}
                canCancel={canSellerCancel(status, o.shipments.length > 0) && payment?.status !== "DISPUTED"}
                digitalOnly={digitalOnly}
              />
            )}
          </section>

          <section>
            <p className="spec mb-2">Käufer:in</p>
            {party.name ? <p className="text-[15px] font-semibold">{party.name}</p> : <p className="text-[14px] text-muted">Keine Angaben (ältere Bestellung)</p>}
            {buyer && (
              <Link href={`/u/${buyer.handle}`} className="mt-1.5 flex items-center gap-2 text-[13px] text-muted hover:text-ink hover:underline">
                <Avatar src={buyer.avatarUrl} name={buyer.displayName} size={22} />@{buyer.handle}
              </Link>
            )}
            {party.phone && (
              <a href={`tel:${party.phone.replace(/[^+0-9]/g, "")}`} className="mt-1.5 block text-[13px] text-ink-2 hover:underline">
                {party.phone}
              </a>
            )}
          </section>
          <section>
            <p className="spec mb-2">Rechnungsadresse</p>
            <AddressBlock address={party.billing} />
          </section>
          {!digitalOnly && (
            <section>
              <p className="spec mb-2">Lieferadresse</p>
              {sameAddress ? <p className="text-[14px] text-muted">Wie Rechnungsadresse</p> : <AddressBlock address={o.shippingAddress} />}
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}
