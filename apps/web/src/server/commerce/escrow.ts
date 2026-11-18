import "server-only";
import { db, type Prisma } from "@/server/db";
import { getSetting } from "@/server/settings";
import { holdState, scaleSettlement, sellerShare, type HoldConfig } from "./escrow-rules";
import { paymentsMode, sellerSettlement, transferSettlement } from "./stripe";
import { REAL_ORDER } from "./real-orders";

/**
 * Haltefrist für Verkäufererlöse (§13.6) – Datenbankteil. Regeln: ./escrow-rules.ts.
 * Bei Stripe steht jedes Verkäuferkonto auf „manuell“; Werkuno zahlt nur `payable` aus
 * (Studio-Antrag oder automatischer Plan im Worker, siehe payouts.ts).
 */

export async function holdConfig(shop: { payoutHoldWaived: boolean }): Promise<HoldConfig> {
  const [holdDays, autoCompleteDays] = await Promise.all([getSetting("commerce.payoutHoldDays"), getSetting("commerce.autoCompleteDays")]);
  return { holdDays, autoCompleteDays, waived: shop.payoutHoldWaived };
}

export type HeldOrder = {
  id: string;
  number: string;
  shareMinor: number;
  currency: string;
  releaseAt: Date | null;
  status: string;
  paymentRef: string | null;
  settled: { amountMinor: number; currency: string } | null;
  refundedMinor: number;
  totalMinor: number;
  /** Apple-Kauf: Shop-Anteil kommt per eigener Überweisung (null = noch nicht überwiesen), nicht aus einer Zahlung */
  apple: { transferId: string | null } | null;
};

/** Kandidaten seitenweise laden; über HELD_SCAN_MAX hinaus gilt der Rest als unbekannt (alles zurückhalten). */
const HELD_PAGE = 1000;
const HELD_SCAN_MAX = 20_000;

/** Bezahlte Bestellungen des Shops, deren Erlös noch zurückgehalten wird. */
export async function heldOrders(shop: { id: string; payoutHoldWaived: boolean }, now: Date = new Date()): Promise<HeldOrder[]> {
  return (await scanHeldOrders(shop, now)).orders;
}

async function scanHeldOrders(shop: { id: string; payoutHoldWaived: boolean }, now: Date): Promise<{ orders: HeldOrder[]; truncated: boolean }> {
  const cfg = await holdConfig(shop);
  const since = new Date(now.getTime() - (cfg.holdDays + 1) * 86_400_000);
  // Kandidaten: alles Offene plus kürzlich Abgeschlossene (ältere Abschlüsse sind sicher frei), dazu
  // Storniertes/Erstattetes, dessen Zahlung noch nicht vollständig zurückerstattet ist
  const where = {
    shopId: shop.id,
    paidAt: { not: null },
    OR: [
      { status: { in: ["NEW", "IN_PROGRESS", "READY_TO_SHIP", "SHIPPED", "PROBLEM"] } },
      { status: "COMPLETED", completedAt: { gte: since } },
      { payments: { some: { status: "DISPUTED" } } },
      { status: { in: ["CANCELLED", "REFUNDED"] }, payments: { some: { status: { in: ["SUCCEEDED", "PARTIALLY_REFUNDED"] } } } },
    ],
    // Testkäufe (Apple Sandbox) bringen kein Geld aufs Konto – nichts zurückhalten
    AND: [REAL_ORDER],
  } satisfies Prisma.OrderWhereInput;
  const select = {
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
    payments: { orderBy: { createdAt: "desc" }, take: 1, select: { status: true, provider: true, providerRef: true, amountMinor: true, sellerAmountMinor: true, sellerCurrency: true } },
    appStorePurchase: { select: { transferId: true, transferStatus: true } },
  } satisfies Prisma.OrderSelect;
  const orders: Prisma.OrderGetPayload<{ select: typeof select }>[] = [];
  let truncated = false;
  for (let cursor: string | null = null; ; ) {
    const page: Prisma.OrderGetPayload<{ select: typeof select }>[] = await db.order.findMany({ where, select, orderBy: { id: "asc" }, take: HELD_PAGE, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}) });
    orders.push(...page);
    if (page.length < HELD_PAGE) break;
    if (orders.length >= HELD_SCAN_MAX) {
      truncated = true;
      break;
    }
    cursor = page[page.length - 1]!.id;
  }
  const out: HeldOrder[] = [];
  for (const o of orders) {
    const p = o.payments[0];
    const refundedMinor = o.refunds.reduce((s, r) => s + r.amountMinor, 0);
    const refundOpen = !!p && (p.status === "SUCCEEDED" || p.status === "PARTIALLY_REFUNDED") && (p.amountMinor ?? o.totalMinor) - refundedMinor > 0;
    const h = { ...o, refundedMinor, disputed: p?.status === "DISPUTED", refundOpen };
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
      apple: p?.provider === "apple" ? { transferId: o.appStorePurchase?.transferStatus === "SENT" ? o.appStorePurchase.transferId : null } : null,
    });
  }
  return { orders: out, truncated };
}

/**
 * Zurückgehaltener Betrag in der Währung des Auszahlungsguthabens. Gleiche Währung wie der Shop: direkt;
 * sonst (z. B. EUR-Bankkonto) aus der tatsächlichen Gutschrift je Zahlung (einmal von Stripe geladen und
 * an der Zahlung gespeichert). Lässt sich eine Gutschrift nicht ermitteln, gilt das ganze Guthaben als
 * zurückgehalten (`unknown`) – lieber später auszahlen als zu früh.
 */
export async function heldAmount(shop: { id: string; currency: string; stripeAccountId: string | null; payoutHoldWaived: boolean }, balanceCurrency: string, now: Date = new Date()) {
  const { orders: held, truncated } = await scanHeldOrders(shop, now);
  let sum = 0;
  // Nicht alle Kandidaten geprüft → lieber gar nichts als zu viel auszahlen
  let unknown = truncated;
  for (const o of held) {
    // Apple-Kauf noch nicht überwiesen → der Anteil liegt (noch) nicht im Guthaben, nichts zurückhalten
    if (o.apple && !o.apple.transferId) continue;
    if (balanceCurrency.toUpperCase() === o.currency.toUpperCase()) {
      sum += o.shareMinor;
      continue;
    }
    let settled = o.settled;
    if (o.apple?.transferId) {
      // Apple-Kauf: keine Stripe-Zahlung (providerRef „apple:…“ kennt Stripe nicht) – massgeblich ist die
      // tatsächliche Gutschrift der Überweisung des Shop-Anteils
      if (!settled && shop.stripeAccountId && paymentsMode() === "stripe") {
        settled = await transferSettlement(o.apple.transferId, shop.stripeAccountId).catch(() => null);
        if (settled) await db.payment.updateMany({ where: { orderId: o.id, provider: "apple" }, data: { sellerAmountMinor: settled.amountMinor, sellerCurrency: settled.currency } });
      }
    } else if (!settled && o.paymentRef && shop.stripeAccountId && paymentsMode() === "stripe") {
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
