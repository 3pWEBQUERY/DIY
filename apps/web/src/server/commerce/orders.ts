import "server-only";
import { ORDER_STATUS_LABEL, formatMoney, problemReportSchema, refundSchema, shipmentSchema, type Currency, type OrderStatus } from "@werkraum/shared";
import { db, type Prisma } from "@/server/db";
import { fail } from "@/server/errors";
import { emit } from "@/server/events";
import { audit } from "@/server/audit";
import { notify } from "@/server/notifications";
import { rateLimit } from "@/server/ratelimit";
import type { SessionUser } from "@/server/auth/session";
import { hasRole } from "@/server/authz";
import { lockOrder, refreshSoldOut, restock } from "./inventory";
import { orderWith, initiateRefund } from "./payments";
import { canReview, canSellerCancel, canTransition, refundableAmount, SELLER_ORDER_TABS } from "./rules";
import { requireOwnShop } from "./shops";

/**
 * Bestellverwaltung (§13.6). Jeder Statuswechsel läuft in einer Transaktion mit Zeilensperre,
 * wird gegen ORDER_TRANSITIONS geprüft und als OrderEvent protokolliert.
 */

const money = (minor: number, currency: string) => formatMoney(minor, (currency === "EUR" ? "EUR" : "CHF") as Currency);

export const orderDetailInclude = {
  items: {
    include: {
      product: { select: { id: true, slug: true, coverUrl: true, category: true, kind: true, shop: { select: { slug: true } } } },
      review: { select: { id: true, productRating: true, sellerRating: true, body: true, createdAt: true, sellerReply: true } },
    },
  },
  payments: { orderBy: { createdAt: "desc" } },
  refunds: { orderBy: { createdAt: "desc" } },
  shipments: { orderBy: { shippedAt: "desc" } },
  events: { orderBy: { createdAt: "asc" } },
  shop: {
    select: {
      id: true,
      slug: true,
      name: true,
      ownerId: true,
      sellerType: true,
      returnPolicy: true,
      shippingPolicy: true,
      processingDays: true,
      verification: { select: { legalName: true, businessName: true, vatId: true, addressLine: true, postalCode: true, city: true, country: true } },
      owner: { select: { profile: { select: { handle: true, displayName: true } } } },
    },
  },
  buyer: { select: { id: true, profile: { select: { handle: true, displayName: true, avatarUrl: true } } } },
} satisfies Prisma.OrderInclude;

export type OrderDetail = Prisma.OrderGetPayload<{ include: typeof orderDetailInclude }>;

/**
 * Bestellbenachrichtigungen sind transaktional: ohne actorId, damit Stummschaltungen sie
 * nicht unterdrücken (Blockierungen verhindern neue Bestellungen bereits im Checkout).
 */
function notifyBuyer(tx: Prisma.TransactionClient, order: { id: string; number: string; buyerId: string }, status: OrderStatus, note?: string, _actorId?: string) {
  return notify(
    { recipientId: order.buyerId, type: "ORDER_STATUS", bundle: false, data: { number: order.number, status, statusLabel: ORDER_STATUS_LABEL[status], note: note || undefined, href: `/bestellungen/${order.id}` } },
    tx,
  );
}

function notifySeller(tx: Prisma.TransactionClient, order: { id: string; number: string }, sellerId: string, status: OrderStatus, note?: string, _actorId?: string) {
  return notify(
    { recipientId: sellerId, type: "ORDER_STATUS", bundle: false, data: { number: order.number, status, statusLabel: ORDER_STATUS_LABEL[status], note: note || undefined, href: `/studio/bestellungen/${order.id}` } },
    tx,
  );
}

/* ───────────────────────── Käufer ───────────────────────── */

export async function listBuyerOrders(userId: string, cursor?: string | null, take = 20) {
  const rows = await db.order.findMany({
    where: { buyerId: userId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: take + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    include: {
      shop: { select: { name: true, slug: true } },
      items: { select: { id: true, title: true, variantName: true, quantity: true, isDigital: true, product: { select: { coverUrl: true, category: true } } } },
      payments: { orderBy: { createdAt: "desc" }, take: 1, select: { status: true } },
      shipments: { take: 1, orderBy: { shippedAt: "desc" }, select: { carrier: true, trackingNo: true } },
    },
  });
  const page = rows.slice(0, take);
  return { items: page, nextCursor: rows.length > take ? page[page.length - 1]!.id : null };
}

export async function getBuyerOrder(userId: string, orderId: string) {
  const o = await db.order.findUnique({ where: { id: orderId }, include: orderDetailInclude });
  if (!o || o.buyerId !== userId) return null;
  const digitalIds = o.items.filter((i) => i.isDigital).map((i) => i.id);
  const entitlements = digitalIds.length
    ? await db.digitalEntitlement.findMany({ where: { userId, orderItemId: { in: digitalIds } }, select: { id: true, orderItemId: true, downloadCount: true, downloadLimit: true, revokedAt: true, licenseText: true } })
    : [];
  return { ...o, entitlements };
}

/** „Problem melden“ – Bestellung wird zum Problemfall, Verkäufer wird benachrichtigt. */
export async function reportProblem(user: SessionUser, orderId: string, input: unknown) {
  const { note } = problemReportSchema.parse(input);
  await rateLimit(`order-problem:${user.id}`, 10, 3600);
  return db.$transaction(async (tx) => {
    await lockOrder(tx, orderId);
    const o = await tx.order.findUnique({ where: { id: orderId }, include: { shop: { select: { ownerId: true } } } });
    if (!o || o.buyerId !== user.id) throw fail.notFound();
    if (!canTransition(o.status, "PROBLEM")) throw fail.conflict(o.status === "PROBLEM" ? "Für diese Bestellung ist bereits ein Problem gemeldet." : "Für diese Bestellung kann kein Problem gemeldet werden.");
    await tx.order.update({ where: { id: orderId }, data: { status: "PROBLEM" } });
    await tx.orderEvent.create({ data: { orderId, actorId: user.id, from: o.status, to: "PROBLEM", note: `Problem gemeldet: ${note}` } });
    await emit({ type: "OrderStatusChanged", orderId, to: "PROBLEM" }, tx);
    await notifySeller(tx, o, o.shop.ownerId, "PROBLEM", note.slice(0, 200), user.id);
  });
}

/** Käufer bestätigt den Erhalt (Versendet → Abgeschlossen). */
export async function confirmReceipt(user: SessionUser, orderId: string) {
  return db.$transaction(async (tx) => {
    await lockOrder(tx, orderId);
    const o = await tx.order.findUnique({ where: { id: orderId }, include: { shop: { select: { ownerId: true } } } });
    if (!o || o.buyerId !== user.id) throw fail.notFound();
    if (o.status !== "SHIPPED") throw fail.conflict("Der Erhalt kann erst nach dem Versand bestätigt werden.");
    await tx.order.update({ where: { id: orderId }, data: { status: "COMPLETED", completedAt: new Date() } });
    await tx.shipment.updateMany({ where: { orderId, deliveredAt: null }, data: { deliveredAt: new Date() } });
    await tx.orderEvent.create({ data: { orderId, actorId: user.id, from: "SHIPPED", to: "COMPLETED", note: "Erhalt durch Käufer:in bestätigt" } });
    await emit({ type: "OrderStatusChanged", orderId, to: "COMPLETED" }, tx);
    await notifySeller(tx, o, o.shop.ownerId, "COMPLETED", "Erhalt bestätigt", user.id);
  });
}

/* ───────────────────────── Verkäufer ───────────────────────── */

export async function sellerOrderCounts(shopId: string) {
  const rows = await db.order.groupBy({ by: ["status"], where: { shopId, status: { not: "PENDING_PAYMENT" } }, _count: { _all: true } });
  return Object.fromEntries(rows.map((r) => [r.status, r._count._all])) as Partial<Record<OrderStatus, number>>;
}

export async function listShopOrders(user: SessionUser, tabKey: string | undefined, cursor?: string | null, take = 30) {
  const shop = await requireOwnShop(user);
  const tab = SELLER_ORDER_TABS.find((t) => t.key === tabKey) ?? SELLER_ORDER_TABS[0];
  const rows = await db.order.findMany({
    where: { shopId: shop.id, status: tab.status },
    orderBy: [{ createdAt: tab.status === "NEW" || tab.status === "IN_PROGRESS" || tab.status === "READY_TO_SHIP" ? "asc" : "desc" }, { id: "asc" }],
    take: take + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    include: {
      buyer: { select: { profile: { select: { handle: true, displayName: true } } } },
      items: { select: { title: true, variantName: true, quantity: true, isDigital: true } },
      payments: { orderBy: { createdAt: "desc" }, take: 1, select: { status: true } },
    },
  });
  const page = rows.slice(0, take);
  return { shop, tab, items: page, nextCursor: rows.length > take ? page[page.length - 1]!.id : null, counts: await sellerOrderCounts(shop.id) };
}

export async function getSellerOrder(user: SessionUser, orderId: string) {
  const o = await db.order.findUnique({ where: { id: orderId }, include: orderDetailInclude });
  if (!o || o.shop.ownerId !== user.id || o.status === "PENDING_PAYMENT") return null;
  return o;
}

async function requireSellerOrder(tx: Prisma.TransactionClient, user: SessionUser, orderId: string) {
  await lockOrder(tx, orderId);
  // Einzelabfragen statt include mit mehreren Relationen (in Transaktionen sonst parallel auf einer Verbindung)
  const base = await tx.order.findUnique({ where: { id: orderId } });
  if (!base) throw fail.notFound();
  const shop = await tx.shop.findUniqueOrThrow({ where: { id: base.shopId }, select: { ownerId: true, status: true } });
  if (shop.ownerId !== user.id) throw fail.notFound();
  if (shop.status === "SUSPENDED") throw fail.forbidden("Dein Shop ist gesperrt.");
  const shipments = await tx.shipment.findMany({ where: { orderId }, select: { id: true } });
  return { ...base, shop, shipments };
}

/** Generischer Statuswechsel durch Verkäufer (ohne Versand/Storno, die eigene Abläufe haben). */
export async function transitionOrder(user: SessionUser, orderId: string, to: OrderStatus, note = "") {
  if (to === "SHIPPED") throw fail.invalid("Bitte erfasse den Versand mit Sendungsangaben.");
  if (to === "CANCELLED") throw fail.invalid("Bitte nutze „Stornieren & erstatten“.");
  if (to === "REFUNDED" || to === "PENDING_PAYMENT" || to === "NEW") throw fail.invalid("Dieser Status wird automatisch durch den Zahlungsanbieter gesetzt.");
  await rateLimit(`order-transition:${user.id}`, 300, 3600);
  return db.$transaction(async (tx) => {
    const o = await requireSellerOrder(tx, user, orderId);
    if (!canTransition(o.status, to)) throw fail.conflict(`Von „${ORDER_STATUS_LABEL[o.status]}“ nach „${ORDER_STATUS_LABEL[to]}“ ist kein gültiger Schritt.`);
    // Abschliessen nur mit erfasstem Versand – ausser die Bestellung ist rein digital
    if (to === "COMPLETED" && !o.shipments.length && (await tx.orderItem.count({ where: { orderId, isDigital: false } })) > 0) {
      throw fail.conflict("Erfasse zuerst den Versand – erst danach kann die Bestellung abgeschlossen werden.");
    }
    const now = new Date();
    await tx.order.update({ where: { id: orderId }, data: { status: to, ...(to === "COMPLETED" ? { completedAt: now } : {}) } });
    await tx.orderEvent.create({ data: { orderId, actorId: user.id, from: o.status, to, note: note.slice(0, 1000) } });
    await emit({ type: "OrderStatusChanged", orderId, to }, tx);
    await notifyBuyer(tx, o, to, note.slice(0, 200), user.id);
  });
}

/** Versand erfassen → SHIPPED, Käufer wird benachrichtigt, OrderShipped wird ausgelöst. */
export async function addShipment(user: SessionUser, orderId: string, input: unknown) {
  const data = shipmentSchema.parse(input);
  return db.$transaction(async (tx) => {
    const o = await requireSellerOrder(tx, user, orderId);
    if (!canTransition(o.status, "SHIPPED")) throw fail.conflict("Markiere die Bestellung zuerst als „Versandbereit“.");
    const now = new Date();
    await tx.shipment.create({ data: { orderId, carrier: data.carrier, trackingNo: data.trackingNo, trackingUrl: data.trackingUrl || null, shippedAt: now } });
    await tx.order.update({ where: { id: orderId }, data: { status: "SHIPPED", shippedAt: now } });
    const label = [data.carrier, data.trackingNo].filter(Boolean).join(" · ");
    await tx.orderEvent.create({ data: { orderId, actorId: user.id, from: o.status, to: "SHIPPED", note: [`Versendet mit ${label}`, data.note].filter(Boolean).join(" – ") } });
    await emit({ type: "OrderShipped", orderId }, tx);
    await emit({ type: "OrderStatusChanged", orderId, to: "SHIPPED" }, tx);
    await notifyBuyer(tx, o, "SHIPPED", data.trackingNo ? `Sendungsnummer ${data.trackingNo} (${data.carrier})` : `Versand mit ${data.carrier}`, user.id);
  });
}

/** Teil- oder Vollerstattung über den Zahlungsanbieter (Refund bleibt PENDING bis zum Webhook). */
export async function refundOrder(user: SessionUser, orderId: string, input: unknown) {
  const data = refundSchema.parse(input);
  await rateLimit(`order-refund:${user.id}`, 30, 3600);
  const o = await db.order.findUnique({ where: { id: orderId }, select: { shop: { select: { ownerId: true, status: true } } } });
  if (!o || o.shop.ownerId !== user.id) throw fail.notFound();
  if (o.shop.status === "SUSPENDED") throw fail.forbidden("Dein Shop ist gesperrt.");
  return initiateRefund(orderId, { amountMinor: data.amountMinor, reason: data.reason, actorId: user.id });
}

/**
 * Stornierung vor dem Versand: Bestand zurückbuchen, digitale Berechtigungen widerrufen,
 * verbleibenden Betrag vollständig erstatten. Auditpflichtig.
 */
export async function cancelBySeller(user: SessionUser, orderId: string, reason: string) {
  const why = reason.trim();
  if (why.length < 3) throw fail.invalid("Bitte gib einen Grund für die Stornierung an.", { reason: "Grund fehlt" });
  await rateLimit(`order-refund:${user.id}`, 30, 3600);
  const result = await db.$transaction(async (tx) => {
    const o = await requireSellerOrder(tx, user, orderId);
    if (!canSellerCancel(o.status, o.shipments.length > 0)) throw fail.conflict("Diese Bestellung kann nicht mehr storniert werden.");
    const full = (await orderWith(tx, orderId))!;
    for (const it of full.items) await restock(tx, it);
    await refreshSoldOut(tx, full.items.map((i) => i.productId));
    const digital = full.items.filter((i) => i.isDigital).map((i) => i.id);
    if (digital.length) await tx.digitalEntitlement.updateMany({ where: { orderItemId: { in: digital } }, data: { revokedAt: new Date() } });
    await tx.shop.update({ where: { id: o.shopId }, data: { salesCount: { decrement: full.items.reduce((s, i) => s + i.quantity, 0) } } });
    await tx.order.update({ where: { id: orderId }, data: { status: "CANCELLED", cancelledAt: new Date() } });
    await tx.orderEvent.create({ data: { orderId, actorId: user.id, from: o.status, to: "CANCELLED", note: `Vom Shop storniert: ${why.slice(0, 500)}` } });
    await audit({ actorId: user.id, action: "order.cancel.seller", targetType: "Order", targetId: orderId, meta: { from: o.status } }, tx);
    await emit({ type: "OrderStatusChanged", orderId, to: "CANCELLED" }, tx);
    await notifyBuyer(tx, o, "CANCELLED", `Storniert durch den Shop: ${why.slice(0, 160)}`, user.id);
    const payment = full.payments[0];
    const refundable = payment && ["SUCCEEDED", "PARTIALLY_REFUNDED"].includes(payment.status) ? refundableAmount(payment.amountMinor, full.refunds) : 0;
    return { refundable, currency: full.currency };
  });
  // Die Stornierung steht bereits fest. Scheitert die Erstattung beim Anbieter, wiederholt der Worker sie
  // automatisch (retryCancelledRefunds) – kein zweiter Klick nötig, das Geld geht nicht verloren.
  let refundDeferred = false;
  if (result.refundable > 0) await initiateRefund(orderId, { amountMinor: result.refundable, reason: `Stornierung: ${why}`, actorId: user.id }).catch(() => (refundDeferred = true));
  return { refundedMinor: result.refundable, label: money(result.refundable, result.currency), refundDeferred };
}

/**
 * Administration (nur ADMIN): Bestellung erstatten, wenn der Shop das nicht mehr kann oder darf – z. B.
 * gesperrter Shop, gebanntes oder gelöschtes Verkäuferkonto. Vor dem Versand wird storniert (Bestand
 * zurück, digitale Lizenzen widerrufen), danach der gesamte noch erstattbare Betrag zurückgezahlt.
 */
export async function refundOrderByAdmin(actor: Pick<SessionUser, "id" | "role">, orderId: string, reason: string) {
  if (!hasRole(actor, "ADMIN")) throw fail.forbidden();
  const why = reason.trim();
  if (why.length < 3) throw fail.invalid("Bitte gib einen Grund an.", { reason: "Grund fehlt" });
  await rateLimit(`order-refund-admin:${actor.id}`, 60, 3600);
  const result = await db.$transaction(async (tx) => {
    await lockOrder(tx, orderId);
    const full = await orderWith(tx, orderId);
    if (!full) throw fail.notFound();
    if (full.status === "PENDING_PAYMENT") throw fail.conflict("Die Bestellung ist noch nicht bezahlt.");
    const shipped = (await tx.shipment.count({ where: { orderId } })) > 0;
    const cancel = canSellerCancel(full.status, shipped);
    if (cancel) {
      for (const it of full.items) await restock(tx, it);
      await refreshSoldOut(tx, full.items.map((i) => i.productId));
      const digital = full.items.filter((i) => i.isDigital).map((i) => i.id);
      if (digital.length) await tx.digitalEntitlement.updateMany({ where: { orderItemId: { in: digital } }, data: { revokedAt: new Date() } });
      await tx.shop.update({ where: { id: full.shopId }, data: { salesCount: { decrement: full.items.reduce((s, i) => s + i.quantity, 0) } } });
      await tx.order.update({ where: { id: orderId }, data: { status: "CANCELLED", cancelledAt: new Date() } });
      await tx.orderEvent.create({ data: { orderId, actorId: actor.id, from: full.status, to: "CANCELLED", note: "Von der Plattform storniert" } });
      await emit({ type: "OrderStatusChanged", orderId, to: "CANCELLED" }, tx);
    }
    await audit({ actorId: actor.id, action: "order.refund.admin", targetType: "Order", targetId: orderId, meta: { from: full.status, cancelled: cancel, reason: why.slice(0, 500) } }, tx);
    await notifyBuyer(tx, full, cancel ? "CANCELLED" : full.status, "Die Plattform hat die Bestellung storniert. Der Betrag wird erstattet.");
    await notifySeller(tx, full, full.shop.ownerId, cancel ? "CANCELLED" : full.status, "Die Plattform hat diese Bestellung erstattet.");
    const payment = full.payments[0];
    const refundable = payment && ["SUCCEEDED", "PARTIALLY_REFUNDED"].includes(payment.status) ? refundableAmount(payment.amountMinor, full.refunds) : 0;
    return { refundable, currency: full.currency };
  });
  if (result.refundable <= 0) throw fail.conflict("Für diese Bestellung gibt es keinen erstattbaren Betrag mehr.");
  // Scheitert die Erstattung beim Anbieter, holt retryCancelledRefunds sie bei stornierten Bestellungen nach
  await initiateRefund(orderId, { amountMinor: result.refundable, reason: `Plattform: ${why}`, actorId: actor.id });
  return { refundedMinor: result.refundable, label: money(result.refundable, result.currency) };
}

/** Beleg für Käufer:in oder Verkäufer:in (druckbare Ansicht). */
export async function getReceipt(user: SessionUser, orderId: string) {
  const o = await db.order.findUnique({ where: { id: orderId }, include: orderDetailInclude });
  if (!o) return null;
  const role = o.buyerId === user.id ? "buyer" : o.shop.ownerId === user.id ? "seller" : null;
  if (!role || o.status === "PENDING_PAYMENT" || !o.paidAt) return null;
  return { order: o, role };
}

export { canReview };
