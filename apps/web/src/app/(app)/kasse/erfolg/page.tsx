import Link from "next/link";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { formatMoney, type Currency } from "@werkraum/shared";
import { currentUser } from "@/server/auth/session";
import { getBuyerOrder } from "@/server/commerce/orders";
import { payableOrders } from "@/server/commerce/checkout";
import { AwaitConfirmation, ResumePaymentButton } from "@/components/commerce/payment-actions";
import { LinkButton } from "@/components/ui/button";
import { Notice } from "@/components/ui/misc";

export const metadata: Metadata = { title: "Danke für deine Bestellung", robots: { index: false } };

/**
 * Rückkehr vom Zahlungsanbieter. Hier wird NICHTS als bezahlt markiert – wir zeigen den
 * Stand, den der Webhook geliefert hat, und warten sonst kurz auf die Bestätigung (§31.4 Nr. 9).
 */
export default async function CheckoutSuccessPage({ searchParams }: { searchParams: Promise<{ bestellung?: string }> }) {
  const [{ bestellung }, user] = await Promise.all([searchParams, currentUser()]);
  if (!user) redirect("/anmelden");
  if (!bestellung) redirect("/bestellungen");
  const order = await getBuyerOrder(user.id, bestellung);
  if (!order) notFound();
  const paid = !!order.paidAt;
  const failed = order.status === "CANCELLED" && !paid;
  const others = (await payableOrders(user.id)).filter((o) => o.id !== order.id);
  const currency = (order.currency === "EUR" ? "EUR" : "CHF") as Currency;
  const digital = order.items.some((i) => i.isDigital);

  return (
    <div className="mx-auto w-full max-w-[640px] px-4 py-10 sm:px-6 md:py-16">
      {!paid && !failed && <AwaitConfirmation />}
      <p className="spec mb-3 flex items-center gap-2">
        <span className="inline-block h-px w-6 bg-ink" />
        Bestellung <span className="font-mono">{order.number}</span>
      </p>
      <h1 className="display text-[2.6rem] text-balance sm:text-5xl">
        {paid ? "Danke – deine Bestellung ist bestätigt." : failed ? "Die Zahlung wurde nicht abgeschlossen." : "Zahlung wird bestätigt …"}
      </h1>
      <p className="mt-4 text-[15px] leading-relaxed text-muted">
        {paid
          ? digital && order.items.every((i) => i.isDigital)
            ? "Dein Download steht in der Bestellübersicht bereit."
            : `${order.shop.name} wurde informiert und bereitet deine Bestellung vor. Du erhältst eine Nachricht, sobald sie versendet ist.`
          : failed
            ? "Es wurde nichts belastet. Deine Artikel liegen weiterhin im Warenkorb."
            : "Das dauert meist nur wenige Sekunden. Diese Seite aktualisiert sich automatisch – du kannst sie auch schliessen; wir benachrichtigen dich."}
      </p>

      <dl className="mt-8 grid grid-cols-2 gap-4 border-y border-line py-5 text-[14px]">
        <div>
          <dt className="spec">Shop</dt>
          <dd className="mt-1">{order.shop.name}</dd>
        </div>
        <div>
          <dt className="spec">Betrag</dt>
          <dd className="num mt-1 font-semibold">{formatMoney(order.totalMinor, currency)}</dd>
        </div>
      </dl>

      {others.length > 0 && (
        <Notice tone="warn" className="mt-8" title={`Noch ${others.length} ${others.length === 1 ? "Bestellung" : "Bestellungen"} offen`}>
          <p>Artikel aus weiteren Shops werden separat bezahlt:</p>
          <ul className="mt-3 space-y-2">
            {others.map((o) => (
              <li key={o.id} className="flex flex-wrap items-center justify-between gap-3">
                <span>
                  {o.shop.name} · <span className="num font-semibold">{formatMoney(o.totalMinor)}</span>
                </span>
                <ResumePaymentButton orderId={o.id} />
              </li>
            ))}
          </ul>
        </Notice>
      )}

      <div className="mt-10 flex flex-wrap gap-3">
        <LinkButton href={`/bestellungen/${order.id}`}>Bestellung ansehen</LinkButton>
        <LinkButton href={failed ? "/warenkorb" : "/markt"} variant="outline">
          {failed ? "Zum Warenkorb" : "Weiter stöbern"}
        </LinkButton>
      </div>
      <p className="mt-8 text-[13px] text-muted">
        Fragen zur Bestellung?{" "}
        <Link href={`/nachrichten/neu?an=${encodeURIComponent(order.shop.owner.profile?.handle ?? "")}&bestellung=${order.id}`} className="underline underline-offset-2 hover:text-ink">
          Schreib dem Shop
        </Link>
        .
      </p>
    </div>
  );
}
