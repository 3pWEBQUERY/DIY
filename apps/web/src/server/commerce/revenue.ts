import "server-only";
import { REAL_ORDER, REAL_ORDER_SQL } from "./real-orders";
import { db, Prisma } from "@/server/db";
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

const ROW_LIMIT = 100;

export async function shopRevenue(shopId: string, range: RevenueRange = "30") {
  const since = range === "alle" ? null : new Date(Date.now() - Number(range) * 86400_000);
  // Summen in der Datenbank statt alle Bestellungen zu laden („alle“ wächst unbegrenzt). Provision wie
  // netPlatformFee je Bestellung (anteilig nach Erstattung, gerundet), dann summiert.
  // Bestellungen in der anderen Währung (Mitglieder aus DE/AT bzw. CH/LI) mit dem Kurs vom Kauf (`shopFx`)
  // in die Shop-Währung umgerechnet.
  const [agg] = await db.$queryRaw<{ n: bigint; gross: bigint | null; refunds: bigint | null; fees: bigint | null }[]>`
    SELECT COUNT(*) AS n,
           SUM(ROUND("Order"."totalMinor" * COALESCE("Order"."shopFx", 1)))::bigint AS gross,
           SUM(ROUND(COALESCE(r.refunded, 0) * COALESCE("Order"."shopFx", 1)))::bigint AS refunds,
           SUM(CASE WHEN "Order"."totalMinor" <= 0 THEN 0
                    ELSE ROUND(("Order"."platformFeeMinor" - ROUND("Order"."platformFeeMinor" * LEAST(1, GREATEST(0, COALESCE(r.refunded, 0)::numeric / "Order"."totalMinor")))) * COALESCE("Order"."shopFx", 1)) END)::bigint AS fees
    FROM "Order"
    LEFT JOIN (SELECT "orderId", SUM("amountMinor") AS refunded FROM "Refund" WHERE "status" = 'SUCCEEDED' GROUP BY "orderId") r ON r."orderId" = "Order"."id"
    WHERE "Order"."shopId" = ${shopId} AND "Order"."paidAt" IS NOT NULL ${since ? Prisma.sql`AND "Order"."paidAt" >= ${since}` : Prisma.empty} ${REAL_ORDER_SQL}`;
  const gross = Number(agg?.gross ?? 0);
  const refunds = Number(agg?.refunds ?? 0);
  const fees = Number(agg?.fees ?? 0);
  const orders = await db.order.findMany({
    where: { shopId, paidAt: since ? { gte: since } : { not: null }, ...REAL_ORDER },
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
      shopFx: true,
      refunds: { where: { status: "SUCCEEDED" }, select: { amountMinor: true } },
    },
    orderBy: [{ paidAt: "desc" }, { id: "desc" }],
    take: ROW_LIMIT,
  });
  const rows = orders.map((o) => {
    const refunded = o.refunds.reduce((s, r) => s + r.amountMinor, 0);
    const fee = netPlatformFee(o.platformFeeMinor, o.totalMinor, refunded);
    // In Shop-Währung; `paidIn` zeigt den bezahlten Betrag, wenn in der anderen Währung bezahlt wurde
    const fx = o.shopFx ?? 1;
    const toShop = (v: number) => Math.round(v * fx);
    return {
      ...o,
      totalMinor: toShop(o.totalMinor),
      refunded: toShop(refunded),
      fee: toShop(fee),
      net: toShop(o.totalMinor) - toShop(refunded) - toShop(fee),
      paidIn: o.shopFx ? { currency: o.currency, totalMinor: o.totalMinor } : null,
    };
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
    orderCount: Number(agg?.n ?? 0),
    pendingRefunds: pendingRefunds._sum.amountMinor ?? 0,
    paidOut,
    payouts,
    rows,
    payoutsEnabled: !!shop?.payoutsEnabled,
    connected: !!shop?.stripeAccountId,
  };
}
