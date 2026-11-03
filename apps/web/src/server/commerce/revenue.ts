import "server-only";
import { db } from "@/server/db";
import { netPlatformFee } from "./rules";

/**
 * Einnahmen eines Shops (§20.4 – ehrlich beschriftet):
 * - Umsatz brutto = bezahlte Bestellungen inkl. Versand
 * - Erstattungen = bestätigte Rückzahlungen
 * - Plattformgebühr = Provision nach anteiliger Rückerstattung bei Erstattungen
 * - Netto = Brutto − Erstattungen − Plattformgebühr
 * Gebühren des Zahlungsanbieters zieht Stripe separat ab; sie sind hier nicht enthalten.
 */
export type RevenueRange = "30" | "90" | "365" | "alle";

export async function shopRevenue(shopId: string, range: RevenueRange = "30") {
  const since = range === "alle" ? null : new Date(Date.now() - Number(range) * 86400_000);
  const orders = await db.order.findMany({
    where: { shopId, paidAt: since ? { gte: since } : { not: null } },
    select: {
      id: true,
      number: true,
      paidAt: true,
      status: true,
      currency: true,
      subtotalMinor: true,
      shippingMinor: true,
      totalMinor: true,
      platformFeeMinor: true,
      feeBps: true,
      refunds: { where: { status: "SUCCEEDED" }, select: { amountMinor: true } },
    },
    orderBy: { paidAt: "desc" },
  });
  let gross = 0;
  let refunds = 0;
  let fees = 0;
  const rows = orders.map((o) => {
    const refunded = o.refunds.reduce((s, r) => s + r.amountMinor, 0);
    const fee = netPlatformFee(o.platformFeeMinor, o.totalMinor, refunded);
    gross += o.totalMinor;
    refunds += refunded;
    fees += fee;
    return { ...o, refunded, fee, net: o.totalMinor - refunded - fee };
  });
  const [pendingRefunds, payouts, shop] = await Promise.all([
    db.refund.aggregate({ where: { order: { shopId }, status: "PENDING" }, _sum: { amountMinor: true } }),
    db.payoutRecord.findMany({ where: { shopId }, orderBy: { createdAt: "desc" }, take: 50 }),
    db.shop.findUnique({ where: { id: shopId }, select: { currency: true, payoutsEnabled: true, stripeAccountId: true } }),
  ]);
  const paidOut = payouts.filter((p) => p.status === "paid").reduce((s, p) => s + p.amountMinor, 0);
  return {
    range,
    currency: shop?.currency ?? "CHF",
    gross,
    refunds,
    fees,
    net: gross - refunds - fees,
    orderCount: orders.length,
    pendingRefunds: pendingRefunds._sum.amountMinor ?? 0,
    paidOut,
    payouts,
    rows: rows.slice(0, 100),
    payoutsEnabled: !!shop?.payoutsEnabled,
    connected: !!shop?.stripeAccountId,
  };
}
