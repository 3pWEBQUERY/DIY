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
 * Simulierter Zahlungsanbieter – existiert nur, wenn kein Stripe-Key gesetzt ist und
 * NODE_ENV nicht „production“ ist. In allen anderen Fällen 404.
 */
export default async function SimulationPage({ searchParams }: { searchParams: Promise<{ bestellung?: string }> }) {
  if (paymentsMode() !== "simulated" || process.env.NODE_ENV === "production") notFound();
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
