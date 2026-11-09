import "server-only";
import { formatMoney, type Currency } from "@werkraum/shared";
import { db, type Prisma, type Tx } from "@/server/db";
import { fail } from "@/server/errors";
import { emit } from "@/server/events";
import { audit } from "@/server/audit";
import { notify } from "@/server/notifications";
import { token } from "@/server/crypto";
import { commitSale, lockOrder, OutOfStockError, refreshSoldOut } from "./inventory";
import { cancelPendingOrderTx } from "./reservations";
import { paymentStatusAfterRefund, refundableAmount } from "./rules";
import { createRefund, expireCheckoutSession, listRefunds, type Stripe, accountStatus, retrieveConnectStatus } from "./stripe";
import { applyAccountStatus } from "./shops";
import { captureError } from "@/server/monitoring";

/**
 * Verbuchung von Zahlungsereignissen (§13.6, §31.4 Nr. 9).
 * Eine Bestellung gilt ausschliesslich dann als bezahlt, wenn der Zahlungsanbieter es
 * meldet – per signiertem Webhook oder (nur Entwicklung) über den simulierten Anbieter.
 * Zahlungs- und Bestellstatus werden getrennt geführt.
 */

const money = (minor: number, currency: string) => formatMoney(minor, (currency === "EUR" ? "EUR" : "CHF") as Currency);

function log(level: "info" | "warn" | "error", msg: string, extra: Record<string, unknown> = {}) {
  console[level === "error" ? "error" : "log"](JSON.stringify({ level, msg, ...extra }));
}

function itemsTitle(items: { title: string }[]) {
  if (!items.length) return "";
  return items.length === 1 ? items[0]!.title : `${items[0]!.title} und ${items.length - 1} weitere`;
}

/**
 * Bestellung mit Relationen in einer Transaktion laden – nacheinander statt per verschachteltem include:
 * Prisma würde mehrere Relationen sonst parallel auf derselben Transaktionsverbindung abfragen
 * (pg-Warnung „client.query() when the client is already executing a query“, ab pg@9 ein Fehler).
 */
async function orderWith(tx: Tx, orderId: string) {
  const order = await tx.order.findUnique({ where: { id: orderId } });
  if (!order) return null;
  const items = await tx.orderItem.findMany({ where: { orderId } });
  const payments = await tx.payment.findMany({ where: { orderId }, orderBy: { createdAt: "desc" } });
  const refunds = await tx.refund.findMany({ where: { orderId } });
  const shop = await tx.shop.findUniqueOrThrow({ where: { id: order.shopId }, select: { id: true, ownerId: true } });
  return { ...order, items, payments, refunds, shop };
}

/* ───────────────────────── Zahlung erfolgreich ───────────────────────── */

export type PaidInput = { provider: "stripe" | "simulated"; providerRef: string; amountMinor: number; currency: string };

export { orderWith };

export async function markOrderPaid(orderId: string, input: PaidInput): Promise<"paid" | "duplicate" | "unknown" | "refunded"> {
  try {
    return await db.$transaction(
      async (tx) => {
        await lockOrder(tx, orderId);
        const order = await orderWith(tx, orderId);
        if (!order) return "unknown" as const;
        const payment = order.payments[0];
        if (order.paidAt || payment?.status === "SUCCEEDED" || payment?.status === "PARTIALLY_REFUNDED" || payment?.status === "REFUNDED") {
          if (payment?.providerRef && payment.providerRef !== input.providerRef) {
            log("warn", "payment_duplicate_charge", { orderId });
            await audit({ action: "payment.duplicate_charge", targetType: "Order", targetId: orderId, meta: { provider: input.provider } }, tx);
          }
          return "duplicate" as const;
        }
        const wasPending = order.status === "PENDING_PAYMENT";
        if (!wasPending && order.status !== "CANCELLED") return "duplicate" as const;

        // Reservierung → Verkauf. Bei verspäteter Zahlung (Reservierung abgelaufen) nur aus freiem Bestand.
        for (const it of order.items) await commitSale(tx, it, { reserved: wasPending });
        await refreshSoldOut(tx, order.items.map((i) => i.productId));

        const amountOk = input.amountMinor === order.totalMinor && input.currency.toUpperCase() === order.currency;
        const digitalOnly = order.items.every((i) => i.isDigital);
        const next = !amountOk ? "PROBLEM" : digitalOnly ? "COMPLETED" : "NEW";
        const now = new Date();
        await tx.order.update({
          where: { id: orderId },
          data: { status: next, paidAt: now, reservationExpiresAt: null, cancelledAt: null, ...(next === "COMPLETED" ? { completedAt: now } : {}) },
        });
        const paymentData = { status: "SUCCEEDED" as const, provider: input.provider, providerRef: input.providerRef, failureReason: null };
        const pay = payment
          ? await tx.payment.update({ where: { id: payment.id }, data: paymentData })
          : await tx.payment.create({ data: { ...paymentData, orderId, amountMinor: input.amountMinor, currency: order.currency, applicationFeeMinor: order.platformFeeMinor } });
        await tx.orderEvent.create({
          data: {
            orderId,
            from: order.status,
            to: next,
            note: !amountOk
              ? `Zahlung eingegangen, Betrag weicht ab (${money(input.amountMinor, input.currency.toUpperCase())}) – wird geprüft`
              : digitalOnly
                ? "Zahlung bestätigt – digitaler Download freigeschaltet"
                : wasPending
                  ? "Zahlung bestätigt"
                  : "Zahlung nach Ablauf der Reservierung bestätigt",
          },
        });
        if (!amountOk) await audit({ action: "payment.amount_mismatch", targetType: "Order", targetId: orderId, meta: { expected: order.totalMinor, received: input.amountMinor } }, tx);

        // Digitale Berechtigungen (§13.7)
        // Nur bei korrektem Betrag freischalten – bei Abweichung entscheidet erst die Prüfung
        for (const it of amountOk ? order.items.filter((i) => i.isDigital) : []) {
          await tx.digitalEntitlement.upsert({
            where: { userId_productId: { userId: order.buyerId, productId: it.productId } },
            create: { userId: order.buyerId, productId: it.productId, orderItemId: it.id },
            // Wiederkauf (z. B. nach Erstattung): Lizenz an die neue Bestellung binden und Downloads neu zählen,
            // sonst fehlt der Download in der neuen Bestellung und eine spätere Erstattung widerriefe nichts
            update: { revokedAt: null, orderItemId: it.id, downloadCount: 0 },
          });
        }
        // Gekaufte Positionen aus dem Warenkorb entfernen
        const cart = await tx.cart.findUnique({ where: { userId: order.buyerId }, select: { id: true } });
        if (cart) {
          await tx.cartItem.deleteMany({ where: { cartId: cart.id, OR: order.items.map((i) => ({ productId: i.productId, variantId: i.variantId })) } });
        }
        await tx.shop.update({ where: { id: order.shopId }, data: { salesCount: { increment: order.items.reduce((s, i) => s + i.quantity, 0) } } });

        await emit({ type: "PaymentConfirmed", orderId, paymentId: pay.id }, tx);
        await emit({ type: "ProductPurchased", orderId }, tx);
        const title = itemsTitle(order.items);
        await notify({ recipientId: order.shop.ownerId, type: "ORDER_NEW", bundle: false, data: { number: order.number, title, href: `/studio/bestellungen/${orderId}` } }, tx);
        await notify({ recipientId: order.buyerId, type: "ORDER_STATUS", bundle: false, data: { number: order.number, title, status: next, note: digitalOnly ? "Dein Download ist bereit." : "Zahlung bestätigt.", href: `/bestellungen/${orderId}` } }, tx);
        return "paid" as const;
      },
      { timeout: 20_000 },
    );
  } catch (e) {
    if (!(e instanceof OutOfStockError)) throw e;
    // Verspätete Zahlung, Ware inzwischen vergeben → sofort und vollständig erstatten.
    await refundUnfulfillable(orderId, input);
    return "refunded";
  }
}

async function refundUnfulfillable(orderId: string, input: PaidInput) {
  const order = await db.$transaction(async (tx) => {
    await cancelPendingOrderTx(tx, orderId, { paymentStatus: "CANCELLED", note: "Zahlung zu spät – Artikel nicht mehr verfügbar" });
    const o = (await orderWith(tx, orderId))!;
    const p = o.payments[0];
    if (p) await tx.payment.update({ where: { id: p.id }, data: { status: "SUCCEEDED", provider: input.provider, providerRef: input.providerRef } });
    else await tx.payment.create({ data: { orderId, provider: input.provider, providerRef: input.providerRef, status: "SUCCEEDED", amountMinor: input.amountMinor, currency: o.currency, applicationFeeMinor: o.platformFeeMinor } });
    await tx.order.update({ where: { id: orderId }, data: { paidAt: new Date() } });
    await audit({ action: "payment.auto_refund_unavailable", targetType: "Order", targetId: orderId, meta: { amountMinor: input.amountMinor } }, tx);
    return o;
  });
  // Schlägt die Erstattung beim Anbieter fehl, holt retryCancelledRefunds sie nach (Bestellung ist storniert, Geld noch da)
  await initiateRefund(orderId, { amountMinor: Math.min(input.amountMinor, order.totalMinor), reason: "Artikel nach Ablauf der Reservierung nicht mehr verfügbar", actorId: null, system: true }).catch((e) =>
    log("error", "auto_refund_deferred", { orderId, err: e instanceof Error ? e.message : String(e) }),
  );
  await notify({
    recipientId: order.buyerId,
    type: "ORDER_STATUS",
    bundle: false,
    data: { number: order.number, title: itemsTitle(order.items), status: "CANCELLED", note: "Die Reservierung war abgelaufen und der Artikel ist vergriffen. Der volle Betrag wird erstattet.", href: `/bestellungen/${orderId}` },
  });
}

/* ───────────────────────── Zahlung offen / fehlgeschlagen ───────────────────────── */

export async function markPaymentProcessing(orderId: string, providerRef?: string | null) {
  await db.payment.updateMany({ where: { orderId, status: "REQUIRES_PAYMENT" }, data: { status: "PROCESSING", ...(providerRef ? { providerRef } : {}) } });
}

/**
 * Zahlung fehlgeschlagen oder Checkout abgelaufen → Reservierung freigeben, Bestellung storniert.
 * Bei Fehlschlag wird die Stripe-Session beendet, damit keine verspätete Zahlung mehr möglich ist.
 */
export async function markPaymentFailed(orderId: string, opts: { kind: "failed" | "expired" | "abandoned"; reason?: string | null; actorId?: string | null }) {
  const order = await db.order.findUnique({ where: { id: orderId }, select: { status: true, checkoutSessionId: true, payments: { select: { provider: true }, take: 1 } } });
  if (!order || order.status !== "PENDING_PAYMENT") return false;
  if (opts.kind !== "expired" && order.checkoutSessionId && order.payments[0]?.provider !== "simulated") {
    const sess = await expireCheckoutSession(order.checkoutSessionId);
    // Bereits bezahlt (Webhook noch unterwegs) oder Stripe gerade nicht erreichbar → NICHT stornieren:
    // sonst wäre eine bezahlte Bestellung storniert und der Bestand für eine Doppelbestellung frei
    if (!sess || sess.status === "complete") return false;
  }
  return db.$transaction((tx) =>
    cancelPendingOrderTx(tx, orderId, {
      paymentStatus: opts.kind === "failed" ? "FAILED" : "CANCELLED",
      failureReason: opts.reason ?? null,
      actorId: opts.actorId ?? null,
      note: opts.kind === "failed" ? "Zahlung fehlgeschlagen – Reservierung freigegeben" : opts.kind === "expired" ? "Checkout abgelaufen – Reservierung freigegeben" : "Bestellung vor der Zahlung verworfen",
    }),
  );
}

/* ───────────────────────── Erstattungen ───────────────────────── */

/**
 * Erstattung anstossen. Die Refund-Zeile bleibt PENDING, bis der Anbieter sie bestätigt
 * (Webhook `charge.refunded`/`refund.updated`). Auditpflichtig (§24.3).
 */
export async function initiateRefund(orderId: string, input: { amountMinor: number; reason: string; actorId: string | null; system?: boolean }) {
  const prepared = await db.$transaction(async (tx) => {
    await lockOrder(tx, orderId);
    const order = await orderWith(tx, orderId);
    if (!order) throw fail.notFound();
    const payment = order.payments[0];
    if (!payment || !payment.providerRef || !["SUCCEEDED", "PARTIALLY_REFUNDED"].includes(payment.status)) {
      throw fail.conflict(payment?.status === "DISPUTED" ? "Die Zahlung ist angefochten – Erstattungen laufen über das Streitfallverfahren." : "Für diese Bestellung gibt es keine erstattbare Zahlung.");
    }
    const refundable = refundableAmount(payment.amountMinor, order.refunds);
    if (input.amountMinor < 1 || input.amountMinor > refundable) throw fail.invalid(`Es können höchstens ${money(refundable, order.currency)} erstattet werden.`, { amountMinor: "Betrag zu hoch" });
    const refund = await tx.refund.create({ data: { orderId, amountMinor: input.amountMinor, reason: input.reason.slice(0, 500), requestedBy: input.actorId, status: "PENDING" } });
    await tx.orderEvent.create({ data: { orderId, actorId: input.actorId, from: order.status, to: order.status, note: `Erstattung über ${money(input.amountMinor, order.currency)} angefordert` } });
    await audit({ actorId: input.actorId, action: input.system ? "order.refund.system" : "order.refund.request", targetType: "Order", targetId: orderId, meta: { refundId: refund.id, amountMinor: input.amountMinor, refundable } }, tx);
    return { refund, payment, currency: order.currency };
  });

  if (prepared.payment.provider === "simulated") {
    // Simulierter Anbieter (nur Entwicklung) bestätigt sofort – über denselben Verbuchungsweg wie Stripe.
    await applyRefunds(orderId, [{ refundRowId: prepared.refund.id, providerRef: `sim_re_${token(9)}`, amountMinor: prepared.refund.amountMinor, status: "SUCCEEDED" }]);
    return prepared.refund;
  }
  try {
    const r = await createRefund({ paymentIntentId: prepared.payment.providerRef!, amountMinor: prepared.refund.amountMinor, refundId: prepared.refund.id, orderId, reason: input.reason });
    await db.refund.update({ where: { id: prepared.refund.id }, data: { providerRef: r.id, ...(r.status === "failed" || r.status === "canceled" ? { status: "FAILED" } : {}) } });
  } catch (e) {
    await db.$transaction(async (tx) => {
      await tx.refund.update({ where: { id: prepared.refund.id }, data: { status: "FAILED" } });
      const o = await tx.order.findUniqueOrThrow({ where: { id: orderId }, select: { status: true } });
      await tx.orderEvent.create({ data: { orderId, actorId: input.actorId, from: o.status, to: o.status, note: "Erstattung beim Zahlungsanbieter fehlgeschlagen" } });
    });
    log("error", "stripe_refund_failed", { orderId, err: e instanceof Error ? e.message : String(e) });
    throw fail.unavailable("Die Erstattung konnte beim Zahlungsanbieter nicht ausgelöst werden. Bitte versuche es später erneut.");
  }
  return prepared.refund;
}

type RefundUpdate = { providerRef: string; amountMinor: number; status: "PENDING" | "SUCCEEDED" | "FAILED"; refundRowId?: string | null };

/** Erstattungsstand vom Anbieter übernehmen – idempotent, auch für im Stripe-Dashboard ausgelöste Erstattungen. */
export async function applyRefunds(orderId: string, updates: RefundUpdate[]) {
  await db.$transaction(async (tx) => {
    await lockOrder(tx, orderId);
    const order = await orderWith(tx, orderId);
    if (!order) return;
    const newlySucceeded: number[] = [];
    for (const u of updates) {
      const row = order.refunds.find((r) => r.providerRef === u.providerRef) ?? (u.refundRowId ? order.refunds.find((r) => r.id === u.refundRowId) : undefined);
      if (row) {
        if (row.status !== u.status || row.providerRef !== u.providerRef) {
          await tx.refund.update({ where: { id: row.id }, data: { status: u.status, providerRef: u.providerRef } });
          if (u.status === "SUCCEEDED" && row.status !== "SUCCEEDED") newlySucceeded.push(u.amountMinor);
          row.status = u.status;
        }
      } else {
        const created = await tx.refund.create({ data: { orderId, providerRef: u.providerRef, amountMinor: u.amountMinor, status: u.status, reason: "Beim Zahlungsanbieter ausgelöst" } });
        order.refunds.push(created);
        if (u.status === "SUCCEEDED") newlySucceeded.push(u.amountMinor);
        await audit({ action: "payment.refund.external", targetType: "Order", targetId: orderId, meta: { amountMinor: u.amountMinor } }, tx);
      }
    }
    const payment = order.payments[0];
    if (!payment || !newlySucceeded.length) return;
    const refunded = order.refunds.filter((r) => r.status === "SUCCEEDED").reduce((s, r) => s + r.amountMinor, 0);
    const payStatus = paymentStatusAfterRefund(payment.amountMinor, refunded);
    if (payment.status !== "DISPUTED") await tx.payment.update({ where: { id: payment.id }, data: { status: payStatus } });
    const full = payStatus === "REFUNDED";
    // Vollständig erstattet → digitale Lizenzen dieser Bestellung widerrufen (§13.7)
    const digitalItems = order.items.filter((i) => i.isDigital).map((i) => i.id);
    if (full && digitalItems.length) await tx.digitalEntitlement.updateMany({ where: { orderItemId: { in: digitalItems }, revokedAt: null }, data: { revokedAt: new Date() } });
    const toRefunded = full && order.status !== "CANCELLED" && order.status !== "REFUNDED";
    const amount = newlySucceeded.reduce((s, n) => s + n, 0);
    await tx.orderEvent.create({
      data: {
        orderId,
        from: order.status,
        to: toRefunded ? "REFUNDED" : order.status,
        note: full ? `Vollständig erstattet (${money(refunded, order.currency)})` : `Teilerstattung über ${money(amount, order.currency)} ausgezahlt`,
      },
    });
    if (toRefunded) {
      await tx.order.update({ where: { id: orderId }, data: { status: "REFUNDED" } });
      await emit({ type: "OrderStatusChanged", orderId, to: "REFUNDED" }, tx);
    }
    await notify(
      {
        recipientId: order.buyerId,
        type: "ORDER_STATUS",
        bundle: false,
        data: {
          number: order.number,
          title: itemsTitle(order.items),
          status: toRefunded ? "REFUNDED" : order.status,
          note: `${money(amount, order.currency)} wurden erstattet. Die Gutschrift kann je nach Bank einige Tage dauern.`,
          href: `/bestellungen/${orderId}`,
        },
      },
      tx,
    );
  });
}

function mapRefundStatus(s: string | null | undefined): RefundUpdate["status"] {
  if (s === "succeeded") return "SUCCEEDED";
  if (s === "failed" || s === "canceled") return "FAILED";
  return "PENDING";
}

/** Holt alle Erstattungen eines PaymentIntents bei Stripe und gleicht sie ab. */
export async function syncStripeRefunds(paymentIntentId: string) {
  const payment = await db.payment.findUnique({ where: { providerRef: paymentIntentId }, select: { orderId: true } });
  if (!payment) return;
  const refunds = await listRefunds(paymentIntentId);
  await applyRefunds(
    payment.orderId,
    refunds.map((r) => ({ providerRef: r.id, amountMinor: r.amount, status: mapRefundStatus(r.status), refundRowId: r.metadata?.refundId ?? null })),
  );
}

/* ───────────────────────── Streitfälle ───────────────────────── */

export async function markDisputed(paymentIntentId: string, d: { disputeId: string; reason: string; amountMinor: number }) {
  await db.$transaction(async (tx) => {
    const payment = await tx.payment.findUnique({ where: { providerRef: paymentIntentId } });
    if (!payment) return;
    await lockOrder(tx, payment.orderId);
    const order = await tx.order.findUniqueOrThrow({ where: { id: payment.orderId }, include: { shop: { select: { ownerId: true } } } });
    if (payment.status === "DISPUTED") return;
    await tx.payment.update({ where: { id: payment.id }, data: { status: "DISPUTED", failureReason: `Streitfall: ${d.reason}`.slice(0, 500) } });
    const toProblem = !["CANCELLED", "REFUNDED", "PROBLEM", "PENDING_PAYMENT"].includes(order.status);
    if (toProblem) await tx.order.update({ where: { id: order.id }, data: { status: "PROBLEM" } });
    await tx.orderEvent.create({ data: { orderId: order.id, from: order.status, to: toProblem ? "PROBLEM" : order.status, note: `Zahlung angefochten (${d.reason}) über ${money(d.amountMinor, order.currency)}` } });
    await audit({ action: "payment.dispute.created", targetType: "Order", targetId: order.id, meta: { disputeId: d.disputeId, reason: d.reason, amountMinor: d.amountMinor } }, tx);
    if (toProblem) await emit({ type: "OrderStatusChanged", orderId: order.id, to: "PROBLEM" }, tx);
    await notify({ recipientId: order.shop.ownerId, type: "ORDER_STATUS", bundle: false, data: { number: order.number, status: "PROBLEM", note: "Die Zahlung wurde von der Karteninhaberin bzw. dem Karteninhaber angefochten.", href: `/studio/bestellungen/${order.id}` } }, tx);
  });
}

export async function markDisputeClosed(paymentIntentId: string, d: { disputeId: string; status: string; amountMinor?: number }) {
  await db.$transaction(async (tx) => {
    // Einzelabfragen statt verschachteltem include: Prisma würde die Relationen sonst parallel über
    // dieselbe Transaktionsverbindung abfragen (pg-Warnung „client.query() while executing“)
    const payment = await tx.payment.findUnique({ where: { providerRef: paymentIntentId } });
    if (!payment || payment.status !== "DISPUTED") return;
    await lockOrder(tx, payment.orderId);
    const won = d.status === "won" || d.status === "warning_closed";
    const base = await tx.order.findUniqueOrThrow({ where: { id: payment.orderId }, select: { id: true, number: true, status: true, currency: true, shopId: true } });
    const refunds = await tx.refund.findMany({ where: { orderId: base.id } });
    const items = await tx.orderItem.findMany({ where: { orderId: base.id }, select: { id: true, isDigital: true } });
    const shop = await tx.shop.findUniqueOrThrow({ where: { id: base.shopId }, select: { ownerId: true } });
    const order = { ...base, refunds, items, shop };
    if (won) {
      const refunded = order.refunds.filter((r) => r.status === "SUCCEEDED").reduce((s, r) => s + r.amountMinor, 0);
      await tx.payment.update({ where: { id: payment.id }, data: { status: paymentStatusAfterRefund(payment.amountMinor, refunded), failureReason: null } });
      await tx.orderEvent.create({ data: { orderId: order.id, from: order.status, to: order.status, note: "Streitfall zugunsten des Shops entschieden" } });
    } else {
      // Verloren: Betrag ist an die Karteninhaberin zurückgebucht → wie eine Erstattung verbuchen
      // (Umsatz/Guthaben sinken, digitale Lizenzen werden widerrufen, Bestellung gilt als erstattet).
      const already = order.refunds.filter((r) => r.status !== "FAILED").reduce((s, r) => s + r.amountMinor, 0);
      const amount = Math.max(0, Math.min(d.amountMinor ?? payment.amountMinor, payment.amountMinor - already));
      if (amount > 0) await tx.refund.create({ data: { orderId: order.id, providerRef: `dispute:${d.disputeId}`, amountMinor: amount, reason: "Streitfall verloren (Rückbuchung)", status: "SUCCEEDED" } });
      const refunded = already + amount;
      await tx.payment.update({ where: { id: payment.id }, data: { status: paymentStatusAfterRefund(payment.amountMinor, refunded) } });
      const digital = order.items.filter((i) => i.isDigital).map((i) => i.id);
      if (digital.length) await tx.digitalEntitlement.updateMany({ where: { orderItemId: { in: digital }, revokedAt: null }, data: { revokedAt: new Date() } });
      const to = order.status === "CANCELLED" ? order.status : "REFUNDED";
      if (to !== order.status) await tx.order.update({ where: { id: order.id }, data: { status: to } });
      await tx.orderEvent.create({ data: { orderId: order.id, from: order.status, to, note: `Streitfall verloren – ${money(amount, order.currency)} wurden zurückgebucht` } });
      if (to !== order.status) await emit({ type: "OrderStatusChanged", orderId: order.id, to }, tx);
      await notify({ recipientId: order.shop.ownerId, type: "ORDER_STATUS", bundle: false, data: { number: order.number, status: to, note: `Der Streitfall ist verloren. ${money(amount, order.currency)} wurden zurückgebucht.`, href: `/studio/bestellungen/${order.id}` } }, tx);
    }
    await audit({ action: "payment.dispute.closed", targetType: "Order", targetId: payment.orderId, meta: { disputeId: d.disputeId, status: d.status } }, tx);
  });
}

/**
 * Stornierte Bestellungen mit noch einbehaltenem Geld vollständig erstatten – holt Erstattungen nach,
 * die beim Anbieter fehlgeschlagen sind (Ausfall, Netzwerk). Höchstens 5 Versuche je Bestellung,
 * danach meldet die Fehlerüberwachung den Fall zur manuellen Klärung.
 */
export async function retryCancelledRefunds() {
  const orders = await db.order.findMany({
    where: { status: "CANCELLED", updatedAt: { gt: new Date(Date.now() - 30 * 86400_000) }, payments: { some: { status: { in: ["SUCCEEDED", "PARTIALLY_REFUNDED"] }, provider: { not: "simulated" } } } },
    select: { id: true, payments: { orderBy: { createdAt: "desc" }, take: 1, select: { amountMinor: true, status: true } }, refunds: { select: { amountMinor: true, status: true, createdAt: true } } },
    take: 50,
  });
  let retried = 0;
  for (const o of orders) {
    const p = o.payments[0];
    if (!p || !["SUCCEEDED", "PARTIALLY_REFUNDED"].includes(p.status)) continue;
    const open = refundableAmount(p.amountMinor, o.refunds);
    if (open <= 0) continue;
    const failed = o.refunds.filter((r) => r.status === "FAILED");
    if (failed.length >= 5) {
      if (failed.length === 5) {
        await captureError(new Error("Erstattung nach 5 Versuchen fehlgeschlagen"), { source: "WORKER", path: "refund_retry", meta: { orderId: o.id, openMinor: open } });
        await db.refund.create({ data: { orderId: o.id, amountMinor: 0, reason: "Automatische Wiederholung beendet – bitte manuell erstatten", status: "FAILED" } });
      }
      continue;
    }
    // Zwischen den Versuchen mindestens 10 Minuten warten
    const last = failed.reduce((t, r) => Math.max(t, r.createdAt.getTime()), 0);
    if (Date.now() - last < 10 * 60_000) continue;
    await initiateRefund(o.id, { amountMinor: open, reason: "Erstattung der stornierten Bestellung (automatischer erneuter Versuch)", actorId: null, system: true })
      .then(() => retried++)
      .catch((e) => log("warn", "refund_retry_failed", { orderId: o.id, err: e instanceof Error ? e.message : String(e) }));
  }
  return { retried };
}

/* ───────────────────────── Auszahlungen ───────────────────────── */

export async function recordPayout(accountId: string, p: Pick<Stripe.Payout, "id" | "amount" | "currency" | "status" | "arrival_date" | "automatic" | "failure_code" | "failure_message">) {
  const { recordPayout: save } = await import("./payouts");
  await save(accountId, p);
}

/* ───────────────────────── Webhook-Verarbeitung ───────────────────────── */

const idOf = (v: string | { id: string } | null | undefined) => (typeof v === "string" ? v : (v?.id ?? null));

async function orderExists(id: string | null | undefined) {
  if (!id) return null;
  const o = await db.order.findUnique({ where: { id }, select: { id: true } });
  return o?.id ?? null;
}

/** Fachliche Behandlung eines verifizierten Stripe-Events. Muss idempotent sein. */
export async function handleStripeEvent(event: Stripe.Event) {
  // Creator Pro (Abo) – eigene Ereignisse, Bestell-Checkout bleibt unberührt
  if (/^(checkout\.session\.completed|customer\.subscription\.|invoice\.payment_failed)/.test(event.type)) {
    const { handleProStripeEvent } = await import("@/server/pro/service");
    if (await handleProStripeEvent(event)) return;
  }
  switch (event.type) {
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded": {
      const s = event.data.object;
      const orderId = await orderExists(s.metadata?.orderId ?? s.client_reference_id);
      if (!orderId) return log("warn", "webhook_order_unknown", { type: event.type });
      const pi = idOf(s.payment_intent);
      if (s.payment_status === "paid") {
        await markOrderPaid(orderId, { provider: "stripe", providerRef: pi ?? s.id, amountMinor: s.amount_total ?? 0, currency: s.currency ?? "chf" });
      } else {
        await markPaymentProcessing(orderId, pi);
      }
      return;
    }
    case "checkout.session.async_payment_failed": {
      const s = event.data.object;
      const orderId = await orderExists(s.metadata?.orderId ?? s.client_reference_id);
      if (orderId) await markPaymentFailed(orderId, { kind: "failed", reason: "Zahlung fehlgeschlagen" });
      return;
    }
    case "checkout.session.expired": {
      const s = event.data.object;
      const orderId = await orderExists(s.metadata?.orderId ?? s.client_reference_id);
      if (orderId) await markPaymentFailed(orderId, { kind: "expired" });
      return;
    }
    case "payment_intent.succeeded": {
      const pi = event.data.object;
      const orderId = await orderExists(pi.metadata?.orderId);
      if (orderId) await markOrderPaid(orderId, { provider: "stripe", providerRef: pi.id, amountMinor: pi.amount_received || pi.amount, currency: pi.currency });
      return;
    }
    case "payment_intent.processing": {
      const pi = event.data.object;
      const orderId = await orderExists(pi.metadata?.orderId);
      if (orderId) await markPaymentProcessing(orderId, pi.id);
      return;
    }
    case "payment_intent.payment_failed": {
      const pi = event.data.object;
      const orderId = await orderExists(pi.metadata?.orderId);
      if (!orderId) return;
      const reason = pi.last_payment_error?.message ?? "Zahlung abgelehnt";
      // Im Stripe Checkout bleibt die Session nach einer Ablehnung offen – die Käuferin kann eine
      // andere Karte versuchen. Erst „expired“/„async_payment_failed“ beenden die Bestellung.
      const o = await db.order.findUnique({ where: { id: orderId }, select: { checkoutSessionId: true } });
      if (o?.checkoutSessionId) {
        await db.payment.updateMany({ where: { orderId, status: { in: ["REQUIRES_PAYMENT", "PROCESSING"] } }, data: { status: "REQUIRES_PAYMENT", failureReason: reason.slice(0, 500) } });
        return;
      }
      await markPaymentFailed(orderId, { kind: "failed", reason });
      return;
    }
    case "charge.refunded": {
      const pi = idOf(event.data.object.payment_intent);
      if (pi) await syncStripeRefunds(pi);
      return;
    }
    case "refund.created":
    case "refund.updated":
    case "refund.failed":
    case "charge.refund.updated": {
      const pi = idOf(event.data.object.payment_intent);
      if (pi) await syncStripeRefunds(pi);
      return;
    }
    case "charge.dispute.created": {
      const d = event.data.object;
      const pi = idOf(d.payment_intent);
      if (pi) await markDisputed(pi, { disputeId: d.id, reason: d.reason, amountMinor: d.amount });
      return;
    }
    case "charge.dispute.closed": {
      const d = event.data.object;
      const pi = idOf(d.payment_intent);
      if (pi) await markDisputeClosed(pi, { disputeId: d.id, status: d.status, amountMinor: d.amount });
      return;
    }
    case "account.updated": {
      // Unsere Konten sind v2-Empfängerkonten: das v1-Feld charges_enabled bleibt dort false
      // (keine Kartenzahlungs-Fähigkeit) und würde den Shop sonst wieder „nicht zahlungsbereit“
      // schalten. Massgeblich ist der v2-Status (stripe_transfers) – das Ereignis ist nur der Anstoss.
      const acc = event.data.object;
      const status = await retrieveConnectStatus(acc.id).catch(() => null);
      await applyAccountStatus(status ?? accountStatus(acc));
      return;
    }
    case "payout.created":
    case "payout.updated":
    case "payout.paid":
    case "payout.failed":
    case "payout.canceled": {
      if (event.account) await recordPayout(event.account, event.data.object);
      return;
    }
    default:
      return;
  }
}

/**
 * Idempotente Webhook-Verarbeitung (§13.6): Event zuerst unter seiner ID speichern,
 * bereits verarbeitete Events sofort bestätigen, Fehler mit Versuchszähler festhalten
 * und 500 liefern, damit der Anbieter erneut zustellt.
 */
export async function processStripeWebhook(event: Stripe.Event): Promise<{ status: number; duplicate?: boolean }> {
  const existing = await db.webhookEvent.findUnique({ where: { id: event.id }, select: { processedAt: true } });
  if (existing?.processedAt) return { status: 200, duplicate: true };
  if (!existing) {
    try {
      await db.webhookEvent.create({ data: { id: event.id, provider: "stripe", type: event.type, payload: event as unknown as Prisma.InputJsonValue } });
    } catch (e) {
      if ((e as { code?: string }).code !== "P2002") throw e;
    }
  }
  await db.webhookEvent.update({ where: { id: event.id }, data: { attempts: { increment: 1 } } });
  try {
    await handleStripeEvent(event);
    await db.webhookEvent.update({ where: { id: event.id }, data: { processedAt: new Date(), error: null } });
    return { status: 200 };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await db.webhookEvent.update({ where: { id: event.id }, data: { error: message.slice(0, 2000) } }).catch(() => {});
    log("error", "webhook_failed", { eventId: event.id, type: event.type, err: message });
    return { status: 500 };
  }
}

/** Transaktions-Helfer für andere Module (z. B. Bestellverwaltung). */
export type { Tx };
