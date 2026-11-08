import Link from "next/link";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { COUNTRY_LABEL, formatMoney, type ShipCountry } from "@werkraum/shared";
import { currentUser } from "@/server/auth/session";
import { getCartView } from "@/server/commerce/cart";
import { payableOrders } from "@/server/commerce/checkout";
import { formatBps } from "@/server/commerce/rules";
import { CartLines } from "@/components/commerce/cart-lines";
import { FeeSummary } from "@/components/commerce/order-parts";
import { ResumePaymentButton } from "@/components/commerce/payment-actions";
import { Empty, Notice, SectionTitle } from "@/components/ui/misc";
import { LinkButton } from "@/components/ui/button";

export const metadata: Metadata = { title: "Warenkorb", robots: { index: false } };

/** Warenkorb gruppiert nach Shop – jede Gruppe wird eine eigene Bestellung (§13.5, §5.7). */
export default async function CartPage() {
  const user = await currentUser();
  if (!user) redirect("/anmelden?weiter=/warenkorb");
  const [cart, pending] = await Promise.all([getCartView(user.id), payableOrders(user.id)]);

  return (
    <div className="mx-auto w-full max-w-[1100px] px-4 py-6 sm:px-6 md:py-10 lg:px-10">
      <header className="mb-8 border-b border-rule pb-6">
        <p className="spec mb-3 flex items-center gap-2">
          <span className="inline-block h-px w-6 bg-rule-strong" />
          Marktplatz
        </p>
        <h1 className="display text-[2.4rem] sm:text-5xl">Warenkorb</h1>
        {cart.count > 0 && (
          <p className="mt-2 text-[14px] text-muted">
            {cart.count} {cart.count === 1 ? "Artikel" : "Artikel"} aus {cart.groups.length} {cart.groups.length === 1 ? "Shop" : "Shops"}
          </p>
        )}
      </header>

      {pending.length > 0 && (
        <Notice tone="warn" className="mb-8" title="Offene Zahlung">
          <ul className="mt-1 space-y-2">
            {pending.map((o) => (
              <li key={o.id} className="flex flex-wrap items-center justify-between gap-3">
                <span>
                  <span className="font-mono text-[12px]">{o.number}</span> · {o.shop.name} · <span className="num font-semibold">{formatMoney(o.totalMinor)}</span>
                  <span className="text-muted"> – reserviert bis {o.reservationExpiresAt!.toLocaleTimeString("de-CH", { hour: "2-digit", minute: "2-digit" })} Uhr</span>
                </span>
                <ResumePaymentButton orderId={o.id} />
              </li>
            ))}
          </ul>
        </Notice>
      )}

      {cart.groups.length === 0 ? (
        <Empty title="Dein Warenkorb ist leer" body="Entdecke Arbeiten aus der Community – viele mit dem Projekt, aus dem sie entstanden sind." action={<LinkButton href="/markt">Zum Marktplatz</LinkButton>} />
      ) : (
        <div className="grid gap-12 lg:grid-cols-[1fr_340px]">
          <div className="min-w-0 space-y-12">
            {cart.groups.map((g, i) => (
              <section key={g.shop.id} aria-labelledby={`shop-${g.shop.id}`}>
                <SectionTitle
                  n={String(i + 1).padStart(2, "0")}
                  title={
                    <Link id={`shop-${g.shop.id}`} href={`/markt/${g.shop.slug}`} className="hover:underline">
                      {g.shop.name}
                    </Link>
                  }
                  action={<span className="spec">Versand ab {COUNTRY_LABEL[g.shop.country as ShipCountry] ?? g.shop.country}</span>}
                />
                <CartLines lines={g.lines} />
                <div className="ml-auto max-w-sm border-t border-line pt-3">
                  <FeeSummary subtotal={g.fees.subtotal} shipping={g.fees.shipping} total={g.fees.total} />
                  <p className="mt-1 text-[12px] text-muted">Kombinierter Versand: es gilt der höchste Versandsatz dieses Shops.</p>
                </div>
              </section>
            ))}
          </div>

          <aside className="lg:sticky lg:top-6 lg:h-fit">
            <div className="border border-rule bg-card p-5 rounded-2xl">
              <p className="spec mb-3">Zusammenfassung</p>
              <FeeSummary subtotal={cart.totals.subtotal} shipping={cart.totals.shipping} total={cart.totals.total} />
              <p className="mt-4 text-[12.5px] leading-relaxed text-muted">
                Für dich fallen keine weiteren Gebühren an. Die Shops zahlen eine Plattformprovision von höchstens {formatBps(cart.feeBps)} auf den Warenwert – sie ist im Preis bereits enthalten.
              </p>
              {cart.groups.length > 1 && <p className="mt-3 text-[12.5px] leading-relaxed text-muted">Du erhältst {cart.groups.length} Bestellungen, die jeweils direkt vom Shop versendet werden.</p>}
              {cart.mode === "disabled" ? (
                <Notice tone="warn" className="mt-5" title="Zahlungen noch nicht aktiviert">
                  Bestellen ist in Kürze möglich.
                </Notice>
              ) : cart.hasProblems ? (
                <p role="alert" className="mt-5 text-[13px] font-semibold text-danger">
                  Bitte entferne oder ändere die markierten Artikel, bevor du zur Kasse gehst.
                </p>
              ) : null}
              <LinkButton
                href="/kasse"
                size="lg"
                className="mt-5 w-full"
                aria-disabled={cart.hasProblems || cart.mode === "disabled" ? true : undefined}
                tabIndex={cart.hasProblems || cart.mode === "disabled" ? -1 : undefined}
              >
                Zur Kasse
              </LinkButton>
              {cart.mode === "simulated" && <p className="mt-3 text-center font-mono text-[11px] uppercase tracking-[0.06em] text-warn">Testmodus · keine echte Zahlung</p>}
            </div>
            <Link href="/markt" className="mt-4 inline-block text-[13.5px] text-muted hover:text-ink">
              ← Weiter stöbern
            </Link>
          </aside>
        </div>
      )}
    </div>
  );
}
