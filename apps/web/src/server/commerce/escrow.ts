import "server-only";
import { db } from "@/server/db";
import { getSetting } from "@/server/settings";
import { holdState, scaleSettlement, sellerShare, type HoldConfig } from "./escrow-rules";
import { paymentsMode, sellerSettlement } from "./stripe";

/**
 * Haltefrist für Verkäufererlöse (§13.6) – Datenbankteil. Regeln: ./escrow-rules.ts.
 * Bei Stripe steht jedes Verkäuferkonto auf „manuell“; Werkuno zahlt nur `payable` aus
 * (Studio-Antrag oder automatischer Plan im Worker, siehe payouts.ts).
 */

export async function holdConfig(shop: { payoutHoldWaived: boolean }): Promise<HoldConfig> {
  const [holdDays, autoCompleteDays] = await Promise.all([getSetting("commerce.payoutHoldDays"), getSetting("commerce.autoCompleteDays")]);
  return { holdDays, autoCompleteDays, waived: shop.payoutHoldWaived };
}

export type HeldOrder = { id: string; number: string; shareMinor: number; currency: string; releaseAt: Date | null; status: string; paymentRef: string | null; settled: { amountMinor: number; currency: string } | null; refundedMinor: number; totalMinor: number };

/** Bezahlte Bestellungen des Shops, deren Erlös noch zurückgehalten wird. */
export async function heldOrders(shop: { id: string; payoutHoldWaived: boolean }, now: Date = new Date()): Promise<HeldOrder[]> {
  const cfg = await holdConfig(shop);
  const since = new Date(now.getTime() - (cfg.holdDays + 1) * 86_400_000);
  // Kandidaten: alles Offene plus kürzlich Abgeschlossene (ältere Abschlüsse sind sicher frei)
  const orders = await db.order.findMany({
    where: {
      shopId: shop.id,
      paidAt: { not: null },
      OR: [{ status: { in: ["NEW", "IN_PROGRESS", "READY_TO_SHIP", "SHIPPED", "PROBLEM"] } }, { status: "COMPLETED", completedAt: { gte: since } }, { payments: { some: { status: "DISPUTED" } } }],
    },
    select: {
      id: true,
      number: true,
      status: true,
      currency: true,
      paidAt: true,
      shippedAt: true,
      completedAt: true,
      totalMinor: true,
      platformFeeMinor: true,
      refunds: { where: { status: "SUCCEEDED" }, select: { amountMinor: true } },
      payments: { orderBy: { createdAt: "desc" }, take: 1, select: { status: true, providerRef: true, sellerAmountMinor: true, sellerCurrency: true } },
    },
    take: 2000,
  });
  const out: HeldOrder[] = [];
  for (const o of orders) {
    const p = o.payments[0];
    const refundedMinor = o.refunds.reduce((s, r) => s + r.amountMinor, 0);
    const h = { ...o, refundedMinor, disputed: p?.status === "DISPUTED" };
    const state = holdState(h, cfg, now);
    if (!state.held) continue;
    out.push({
      id: o.id,
      number: o.number,
      shareMinor: sellerShare(h),
      currency: o.currency,
      releaseAt: state.releaseAt,
      status: o.status,
      paymentRef: p?.providerRef ?? null,
      settled: p?.sellerAmountMinor != null && p.sellerCurrency ? { amountMinor: p.sellerAmountMinor, currency: p.sellerCurrency } : null,
      refundedMinor,
      totalMinor: o.totalMinor,
    });
  }
  return out;
}

/**
 * Zurückgehaltener Betrag in der Währung des Auszahlungsguthabens. Gleiche Währung wie der Shop: direkt;
 * sonst (z. B. EUR-Bankkonto) aus der tatsächlichen Gutschrift je Zahlung (einmal von Stripe geladen und
 * an der Zahlung gespeichert). Lässt sich eine Gutschrift nicht ermitteln, gilt das ganze Guthaben als
 * zurückgehalten (`unknown`) – lieber später auszahlen als zu früh.
 */
export async function heldAmount(shop: { id: string; currency: string; stripeAccountId: string | null; payoutHoldWaived: boolean }, balanceCurrency: string, now: Date = new Date()) {
  const held = await heldOrders(shop, now);
  let sum = 0;
  let unknown = false;
  for (const o of held) {
    if (balanceCurrency.toUpperCase() === o.currency.toUpperCase()) {
      sum += o.shareMinor;
      continue;
    }
    let settled = o.settled;
    if (!settled && o.paymentRef && shop.stripeAccountId && paymentsMode() === "stripe") {
      settled = await sellerSettlement(o.paymentRef, shop.stripeAccountId).catch(() => null);
      if (settled) await db.payment.updateMany({ where: { providerRef: o.paymentRef }, data: { sellerAmountMinor: settled.amountMinor, sellerCurrency: settled.currency } });
    }
    if (!settled || settled.currency.toUpperCase() !== balanceCurrency.toUpperCase()) {
      unknown = true;
      continue;
    }
    sum += scaleSettlement(settled.amountMinor, o);
  }
  const next = held.map((o) => o.releaseAt).filter((d): d is Date => !!d).sort((a, b) => a.getTime() - b.getTime())[0] ?? null;
  return { heldMinor: sum, unknown, nextReleaseAt: next, orders: held.length };
}

/**
 * Auszahlbarer Betrag: Gesamtguthaben (verfügbar + bei Stripe noch ausstehend) minus zurückgehaltene
 * Erlöse, höchstens das bei Stripe verfügbare. (Frische Zahlungen liegen bei Stripe einige Tage als
 * „ausstehend“ – sie nur vom verfügbaren Teil abzuziehen, hielte doppelt zurück.)
 */
export function payableFrom(availableMinor: number, pendingMinor: number, held: { heldMinor: number; unknown: boolean }) {
  if (held.unknown) return 0;
  return Math.max(0, Math.min(availableMinor, availableMinor + Math.max(0, pendingMinor) - held.heldMinor));
}
