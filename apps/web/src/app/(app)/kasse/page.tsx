import Link from "next/link";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { formatMoney } from "@werkraum/shared";
import { currentUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { getCartView } from "@/server/commerce/cart";
import { CheckoutForm } from "@/components/commerce/checkout-form";
import { FeeSummary } from "@/components/commerce/order-parts";
import { Notice } from "@/components/ui/misc";
import { LinkButton } from "@/components/ui/button";

export const metadata: Metadata = { title: "Kasse", robots: { index: false } };

/** Kasse: Adresse erfassen, alle Kosten sehen, dann sicher zum Zahlungsanbieter (§5.7, §13.5). */
export default async function CheckoutPage() {
  const user = await currentUser();
  if (!user?.profile) redirect("/anmelden?weiter=/kasse");
  const cart = await getCartView(user.id);
  if (!cart.groups.length) redirect("/warenkorb");

  if (cart.mode === "disabled" || cart.hasProblems) {
    return (
      <div className="mx-auto w-full max-w-[640px] px-4 py-10 sm:px-6">
        <h1 className="display text-4xl">Kasse</h1>
        <Notice tone="warn" className="mt-6" title={cart.mode === "disabled" ? "Zahlungen noch nicht aktiviert" : "Bitte prüfe deinen Warenkorb"}>
          {cart.mode === "disabled" ? "Bestellungen sind in Kürze möglich. Deine Artikel bleiben im Warenkorb." : "Einige Artikel sind nicht mehr in der gewünschten Menge verfügbar."}
        </Notice>
        <LinkButton href="/warenkorb" variant="outline" className="mt-6">
          Zum Warenkorb
        </LinkButton>
      </div>
    );
  }

  const last = await db.order.findFirst({ where: { buyerId: user.id }, orderBy: { createdAt: "desc" }, select: { shippingAddress: true } });
  const initial = (last?.shippingAddress as Record<string, string> | null) ?? { name: user.profile.displayName };
  const digitalOnly = cart.groups.every((g) => g.lines.every((l) => l.isDigital));

  return (
    <div className="mx-auto w-full max-w-[1100px] px-4 py-6 sm:px-6 md:py-10 lg:px-10">
      <header className="mb-10 border-b border-rule pb-6">
        <p className="spec mb-3 flex items-center gap-2">
          <span className="inline-block h-px w-6 bg-rule-strong" />
          <Link href="/warenkorb" className="hover:text-ink">
            Warenkorb
          </Link>{" "}
          → Kasse → Zahlung
        </p>
        <h1 className="display text-[2.4rem] sm:text-5xl">Kasse</h1>
      </header>

      <div className="grid gap-12 lg:grid-cols-[1fr_380px]">
        <CheckoutForm initial={initial} totalMinor={cart.totals.total} currency="CHF" orderCount={cart.groups.length} mode={cart.mode === "stripe" ? "stripe" : "simulated"} digitalOnly={digitalOnly} />

        <aside className="lg:sticky lg:top-6 lg:h-fit">
          <div className="border border-rule bg-card rounded-2xl">
            <p className="spec border-b border-line px-5 py-3">Deine Bestellung</p>
            {cart.groups.map((g) => (
              <div key={g.shop.id} className="border-b border-line px-5 py-4">
                <p className="text-[13.5px] font-semibold">{g.shop.name}</p>
                <ul className="mt-2 space-y-1.5 text-[13.5px]">
                  {g.lines.map((l) => (
                    <li key={l.id} className="flex justify-between gap-3">
                      <span className="min-w-0 text-ink-2">
                        {l.quantity} × {l.title}
                        {l.variantName ? <span className="text-muted"> ({l.variantName})</span> : null}
                      </span>
                      <span className="num shrink-0">{formatMoney(l.lineMinor)}</span>
                    </li>
                  ))}
                </ul>
                <p className="mt-2 flex justify-between text-[13px] text-muted">
                  <span>Versand</span>
                  <span className="num">{g.fees.shipping ? formatMoney(g.fees.shipping) : "kostenlos"}</span>
                </p>
                <p className="mt-1 text-[12px] text-muted">Versand in ca. {g.shop.processingDays} Werktagen</p>
              </div>
            ))}
            <div className="px-5 py-4">
              <FeeSummary subtotal={cart.totals.subtotal} shipping={cart.totals.shipping} total={cart.totals.total} />
              <p className="mt-3 text-[12px] leading-relaxed text-muted">Endpreis. Keine Zusatzgebühren für Käufer:innen.</p>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
