import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { currentUser } from "@/server/auth/session";
import { getBuyerOrder } from "@/server/commerce/orders";
import { AbandonOrderButton, ResumePaymentButton } from "@/components/commerce/payment-actions";
import { LinkButton } from "@/components/ui/button";

export const metadata: Metadata = { title: "Zahlung abgebrochen", robots: { index: false } };

/** Rückkehr nach Abbruch: Zahlung erneut versuchen oder Bestellung verwerfen (gibt Reservierung sofort frei). */
export default async function CheckoutCancelledPage({ searchParams }: { searchParams: Promise<{ bestellung?: string; grund?: string }> }) {
  const [{ bestellung, grund }, user] = await Promise.all([searchParams, currentUser()]);
  if (!user) redirect("/anmelden");
  const order = bestellung ? await getBuyerOrder(user.id, bestellung) : null;
  const open = order?.status === "PENDING_PAYMENT" && !!order.reservationExpiresAt && order.reservationExpiresAt > new Date();

  return (
    <div className="mx-auto w-full max-w-[640px] px-4 py-10 sm:px-6 md:py-16">
      <p className="spec mb-3 flex items-center gap-2">
        <span className="inline-block h-px w-6 bg-rule-strong" />
        Kasse
      </p>
      <h1 className="display text-[2.6rem] text-balance sm:text-5xl">{grund === "fehlgeschlagen" ? "Die Zahlung wurde abgelehnt." : "Zahlung abgebrochen."}</h1>
      <p className="mt-4 text-[15px] leading-relaxed text-muted">
        Es wurde nichts belastet. Deine Artikel liegen weiterhin im Warenkorb.
        {open && order?.reservationExpiresAt
          ? ` Wir halten sie noch bis ${order.reservationExpiresAt.toLocaleTimeString("de-CH", { hour: "2-digit", minute: "2-digit" })} Uhr für dich reserviert.`
          : ""}
      </p>
      <div className="mt-10 flex flex-wrap gap-3">
        {open && order ? (
          <>
            <ResumePaymentButton orderId={order.id} label="Erneut bezahlen" />
            <AbandonOrderButton orderId={order.id} />
          </>
        ) : (
          <LinkButton href="/warenkorb">Zum Warenkorb</LinkButton>
        )}
      </div>
    </div>
  );
}
