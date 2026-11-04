import Link from "next/link";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { COUNTRY_LABEL, PAYMENT_STATUS_LABEL, SELLER_TYPE_LABEL, formatMoney, type Currency, type ShipCountry } from "@werkraum/shared";
import { BRAND } from "@/config/brand";
import { currentUser } from "@/server/auth/session";
import { getReceipt } from "@/server/commerce/orders";
import { formatBps, netPlatformFee } from "@/server/commerce/rules";
import { AddressBlock } from "@/components/commerce/order-parts";
import { PrintButton } from "@/components/commerce/buyer-order-actions";
import { Wordmark } from "@/components/shell/wordmark";
import { formatDate } from "@/lib/utils";

export const metadata: Metadata = { title: "Beleg", robots: { index: false } };

/** Druckbarer Beleg für Käufer:in und Shop. Bewusst ohne App-Navigation. */
export default async function ReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, user] = await Promise.all([params, currentUser()]);
  if (!user) redirect(`/anmelden?weiter=/beleg/${id}`);
  const r = await getReceipt(user, id);
  if (!r) notFound();
  const o = r.order;
  const currency = (o.currency === "EUR" ? "EUR" : "CHF") as Currency;
  const m = (n: number) => formatMoney(n, currency);
  const v = o.shop.verification;
  const refunded = o.refunds.filter((x) => x.status === "SUCCEEDED").reduce((s, x) => s + x.amountMinor, 0);
  const fee = netPlatformFee(o.platformFeeMinor, o.totalMinor, refunded);
  const payment = o.payments[0];
  const back = r.role === "seller" ? `/studio/bestellungen/${o.id}` : `/bestellungen/${o.id}`;

  return (
    <main id="main" className="mx-auto max-w-[760px] bg-paper px-6 py-10 text-ink print:max-w-none print:px-0 print:py-0">
      <div className="mb-8 flex items-center justify-between gap-4 print:hidden">
        <Link href={back} className="text-[14px] text-muted hover:text-ink">
          ← Zurück zur Bestellung
        </Link>
        <PrintButton label="Beleg drucken" />
      </div>

      <article className="border border-rule bg-card p-8 print:border-0 print:p-0 rounded-2xl">
        <header className="flex flex-wrap items-start justify-between gap-6 border-b border-rule pb-6">
          <div>
            <p className="spec">{r.role === "seller" ? "Verkaufsbeleg" : "Kaufbeleg"}</p>
            <h1 className="display mt-1 text-4xl">Beleg {o.number}</h1>
            <p className="mt-2 text-[13.5px] text-muted">
              Bestellt am {formatDate(o.createdAt)} · bezahlt am {o.paidAt ? formatDate(o.paidAt) : "–"}
            </p>
          </div>
          <div className="text-right">
            <Wordmark compact />
            <p className="mt-1 text-[11px] text-muted">Vermittelt über {BRAND.name}</p>
          </div>
        </header>

        <div className="grid gap-8 border-b border-line py-6 sm:grid-cols-2">
          <div>
            <p className="spec mb-2">Verkäufer</p>
            <p className="text-[14px] font-semibold">{o.shop.sellerType === "BUSINESS" && v?.businessName ? v.businessName : o.shop.name}</p>
            {v && (
              <address className="not-italic text-[13.5px] leading-relaxed text-ink-2">
                {v.legalName && <span className="block">{v.legalName}</span>}
                {v.addressLine && <span className="block">{v.addressLine}</span>}
                {(v.postalCode || v.city) && (
                  <span className="block">
                    {v.postalCode} {v.city}
                    {v.country ? `, ${COUNTRY_LABEL[v.country as ShipCountry] ?? v.country}` : ""}
                  </span>
                )}
                {v.vatId && <span className="block">MWST/USt: {v.vatId}</span>}
              </address>
            )}
            <p className="spec mt-2">{SELLER_TYPE_LABEL[o.shop.sellerType]}</p>
          </div>
          <div>
            <p className="spec mb-2">Käufer:in</p>
            <AddressBlock address={o.shippingAddress} className="text-[13.5px]" />
          </div>
        </div>

        <table className="mt-6 w-full text-[14px]">
          <thead>
            <tr className="border-b border-rule text-left">
              <th scope="col" className="spec py-2 font-normal">
                Artikel
              </th>
              <th scope="col" className="spec py-2 text-right font-normal">
                Menge
              </th>
              <th scope="col" className="spec py-2 text-right font-normal">
                Einzelpreis
              </th>
              <th scope="col" className="spec py-2 text-right font-normal">
                Betrag
              </th>
            </tr>
          </thead>
          <tbody>
            {o.items.map((it) => (
              <tr key={it.id} className="border-b border-line align-top">
                <td className="py-2.5 pr-3">
                  {it.title}
                  {it.variantName && <span className="block text-[12.5px] text-muted">{it.variantName}</span>}
                  {it.isDigital && <span className="block text-[12.5px] text-muted">Digitaler Download</span>}
                </td>
                <td className="num py-2.5 text-right">{it.quantity}</td>
                <td className="num py-2.5 text-right">{m(it.unitMinor)}</td>
                <td className="num py-2.5 text-right">{m(it.unitMinor * it.quantity)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="text-[14px]">
            <tr>
              <td colSpan={3} className="pt-3 text-right text-muted">
                Warenwert
              </td>
              <td className="num pt-3 text-right">{m(o.subtotalMinor)}</td>
            </tr>
            <tr>
              <td colSpan={3} className="py-1 text-right text-muted">
                Versand
              </td>
              <td className="num py-1 text-right">{m(o.shippingMinor)}</td>
            </tr>
            <tr className="font-semibold">
              <td colSpan={3} className="border-t border-rule pt-2 text-right">
                Gesamtbetrag
              </td>
              <td className="num border-t border-rule pt-2 text-right">{m(o.totalMinor)}</td>
            </tr>
            {refunded > 0 && (
              <tr>
                <td colSpan={3} className="py-1 text-right text-muted">
                  Erstattet
                </td>
                <td className="num py-1 text-right">− {m(refunded)}</td>
              </tr>
            )}
            {r.role === "seller" && (
              <>
                <tr>
                  <td colSpan={3} className="py-1 text-right text-muted">
                    Plattformgebühr ({formatBps(o.feeBps)} auf den Warenwert)
                  </td>
                  <td className="num py-1 text-right">− {m(fee)}</td>
                </tr>
                <tr className="font-semibold">
                  <td colSpan={3} className="pt-1 text-right">
                    Auszahlung (vor Gebühren des Zahlungsanbieters)
                  </td>
                  <td className="num pt-1 text-right">{m(o.totalMinor - refunded - fee)}</td>
                </tr>
              </>
            )}
          </tfoot>
        </table>

        <footer className="mt-8 space-y-1 border-t border-line pt-4 text-[12px] leading-relaxed text-muted">
          <p>
            Zahlung: {payment ? (PAYMENT_STATUS_LABEL[payment.status as keyof typeof PAYMENT_STATUS_LABEL] ?? payment.status) : "–"}
            {payment?.provider === "stripe" ? " · über Stripe" : payment?.provider === "simulated" ? " · TESTMODUS (keine echte Zahlung)" : ""}
          </p>
          <p>
            Vertragspartner ist der oben genannte Verkäufer. {BRAND.name} vermittelt den Kauf und wickelt die Zahlung über Stripe ab. Dieser Beleg ist keine Rechnung im
            mehrwertsteuerrechtlichen Sinn, sofern der Verkäufer keine MWST-Nummer ausweist.
          </p>
        </footer>
      </article>
    </main>
  );
}
