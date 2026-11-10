import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { formatMoney, type Currency } from "@werkraum/shared";
import { currentUser } from "@/server/auth/session";
import { getBuyerOrder } from "@/server/commerce/orders";
import { paymentsMode } from "@/server/commerce/stripe";
import { SimulationPanel } from "@/components/commerce/payment-actions";
import { LinkButton } from "@/components/ui/button";

export const metadata: Metadata = { title: "Testzahlung", robots: { index: false } };

/**
 * Simulierter Zahlungsanbieter – existiert nur im Testmodus (`paymentsMode() === "simulated"`: kein
 * Stripe-Key und NODE_ENV zur Laufzeit nicht „production“). In allen anderen Fällen 404.
 * Bewusst kein `process.env.NODE_ENV` hier: Next ersetzt es beim Build fest durch „production“, die Seite
 * wäre dann auch in Testläufen gegen einen Build (NODE_ENV=test) nie erreichbar. paymentsMode() liest die
 * Laufzeitumgebung und liefert in Produktion ohne Key „disabled“.
 */
export default async function SimulationPage({ searchParams }: { searchParams: Promise<{ bestellung?: string }> }) {
  if (paymentsMode() !== "simulated") notFound();
  const [{ bestellung }, user] = await Promise.all([searchParams, currentUser()]);
  if (!user) redirect("/anmelden");
  const order = bestellung ? await getBuyerOrder(user.id, bestellung) : null;
  if (!order) notFound();
  const currency = (order.currency === "EUR" ? "EUR" : "CHF") as Currency;

  return (
    <div className="mx-auto w-full max-w-[600px] px-4 py-10 sm:px-6 md:py-16">
      <div className="border-2 border-dashed border-warn bg-warn-soft px-5 py-4 rounded-2xl">
        <p className="font-mono text-[12px] font-semibold uppercase tracking-[0.12em] text-warn">Testmodus · keine echte Zahlung</p>
        <p className="mt-1 text-[13.5px] text-ink-2">
          Stripe ist in dieser Entwicklungsumgebung nicht konfiguriert. Diese Seite ersetzt den Zahlungsanbieter und löst dieselben Verbuchungen aus wie ein echter Webhook.
        </p>
      </div>

      <h1 className="display mt-10 text-4xl">Testzahlung</h1>
      <dl className="mt-6 divide-y divide-line border-y border-line text-[14px]">
        <div className="flex justify-between py-2.5">
          <dt className="text-muted">Bestellung</dt>
          <dd className="font-mono">{order.number}</dd>
        </div>
        <div className="flex justify-between py-2.5">
          <dt className="text-muted">Shop</dt>
          <dd>{order.shop.name}</dd>
        </div>
        <div className="flex justify-between py-2.5">
          <dt className="text-muted">Betrag</dt>
          <dd className="num font-semibold">{formatMoney(order.totalMinor, currency)}</dd>
        </div>
        <div className="flex justify-between py-2.5">
          <dt className="text-muted">davon Plattformgebühr (Shop)</dt>
          <dd className="num">{formatMoney(order.platformFeeMinor, currency)}</dd>
        </div>
      </dl>

      <div className="mt-8">
        {order.status === "PENDING_PAYMENT" ? (
          <SimulationPanel orderId={order.id} />
        ) : (
          <LinkButton href={`/bestellungen/${order.id}`}>Zur Bestellung</LinkButton>
        )}
      </div>
    </div>
  );
}
