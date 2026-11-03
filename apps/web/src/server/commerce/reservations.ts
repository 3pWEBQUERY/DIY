import "server-only";
import { db, type Tx } from "@/server/db";
import { emit } from "@/server/events";
import { expireCheckoutSession, paymentsMode, retrieveCheckoutSession } from "./stripe";
import { lockOrder, release } from "./inventory";

/**
 * Storniert eine noch unbezahlte Bestellung und gibt die Reservierung frei.
 * Idempotent: nur PENDING_PAYMENT wird verändert. Gibt `true` zurück, wenn storniert wurde.
 */
export async function cancelPendingOrderTx(
  tx: Tx,
  orderId: string,
  opts: { paymentStatus: "FAILED" | "CANCELLED"; note: string; actorId?: string | null; failureReason?: string | null },
) {
  await lockOrder(tx, orderId);
  const order = await tx.order.findUnique({ where: { id: orderId }, select: { status: true, items: { select: { productId: true, variantId: true, quantity: true, isDigital: true } } } });
  if (!order || order.status !== "PENDING_PAYMENT") return false;
  for (const it of order.items) await release(tx, it);
  await tx.order.update({ where: { id: orderId }, data: { status: "CANCELLED", cancelledAt: new Date(), reservationExpiresAt: null } });
  await tx.payment.updateMany({
    where: { orderId, status: { in: ["REQUIRES_PAYMENT", "PROCESSING"] } },
    data: { status: opts.paymentStatus, ...(opts.failureReason ? { failureReason: opts.failureReason.slice(0, 500) } : {}) },
  });
  await tx.orderEvent.create({ data: { orderId, actorId: opts.actorId ?? null, from: "PENDING_PAYMENT", to: "CANCELLED", note: opts.note } });
  await emit({ type: "OrderStatusChanged", orderId, to: "CANCELLED" }, tx);
  return true;
}

/**
 * Worker-Job: gibt abgelaufene Reservierungen frei (§13.5).
 * Offene Stripe-Sessions werden vorher beendet, damit nach der Freigabe nicht mehr bezahlt
 * werden kann. Bereits abgeschlossene Sessions bleiben unangetastet – deren Zahlung wird
 * ausschliesslich über den Webhook verbucht (§31.4 Nr. 9).
 */
export async function releaseExpiredReservations(opts: { limit?: number; now?: Date } = {}) {
  const now = opts.now ?? new Date();
  const due = await db.order.findMany({
    where: { status: "PENDING_PAYMENT", reservationExpiresAt: { lt: now } },
    select: { id: true, checkoutSessionId: true },
    orderBy: { reservationExpiresAt: "asc" },
    take: opts.limit ?? 200,
  });
  let released = 0;
  let skipped = 0;
  const stripeMode = paymentsMode() === "stripe";
  for (const o of due) {
    try {
      if (stripeMode && o.checkoutSessionId) {
        const s = await retrieveCheckoutSession(o.checkoutSessionId).catch(() => null);
        if (s?.status === "complete") {
          skipped++;
          continue;
        }
        if (s?.status === "open") await expireCheckoutSession(o.checkoutSessionId);
      }
      const done = await db.$transaction((tx) => cancelPendingOrderTx(tx, o.id, { paymentStatus: "CANCELLED", note: "Reservierung abgelaufen – Zahlung nicht abgeschlossen" }));
      if (done) released++;
    } catch (e) {
      skipped++;
      console.error(JSON.stringify({ level: "error", msg: "reservation_release_failed", orderId: o.id, err: e instanceof Error ? e.message : String(e) }));
    }
  }
  return { checked: due.length, released, skipped };
}
