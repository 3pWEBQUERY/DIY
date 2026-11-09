import "server-only";
import { resolveOrderParty } from "@/server/account/customer";
import { checkoutSchema, formatMoney, type Currency } from "@werkraum/shared";
import { db, type Prisma } from "@/server/db";
import { AppError, fail } from "@/server/errors";
import { limit } from "@/server/ratelimit";
import { getSetting } from "@/server/settings";
import { feeResolver } from "./fees";
import { humanCode, token } from "@/server/crypto";
import type { SessionUser } from "@/server/auth/session";
import { OutOfStockError, reserve } from "./inventory";
import { cancelPendingOrderTx } from "./reservations";
import { formatOrderNumber, groupByShop, grandTotal, unitPrice } from "./rules";
import { createCheckoutSession, expireCheckoutSession, paymentsMode, PAYMENTS_DISABLED_MESSAGE, retrieveCheckoutSession } from "./stripe";
import { markOrderPaid, markPaymentFailed } from "./payments";
import { requireFlag } from "@/server/flags";

/**
 * Checkout (§13.5, §31.4 Nr. 8):
 * 1. Idempotenzschlüssel des Clients sichern (Doppelklick, Netzwerk-Retry).
 * 2. In EINER Transaktion: Preise & Verfügbarkeit neu prüfen, Bestand atomar reservieren,
 *    je Shop eine Bestellung (PENDING_PAYMENT) samt Zahlung (REQUIRES_PAYMENT) anlegen.
 * 3. Danach je Bestellung eine Stripe-Checkout-Session (Destination Charge an den Shop).
 * Bezahlt wird eine Bestellung erst durch das Provider-Ereignis (Webhook).
 */

type CheckoutResponse = { url: string; orderIds: string[]; mode: "stripe" | "simulated" };

const lineInclude = {
  product: {
    include: {
      shop: { select: { id: true, name: true, status: true, ownerId: true, stripeAccountId: true, chargesEnabled: true, owner: { select: { status: true } } } },
      inventory: { where: { variantId: null }, select: { id: true } },
    },
  },
  variant: { select: { id: true, name: true, priceDeltaMinor: true } },
} satisfies Prisma.CartItemInclude;

async function claimIdempotencyKey(userId: string, clientKey: string): Promise<CheckoutResponse | null> {
  const key = `checkout:${userId}:${clientKey}`;
  try {
    await db.idempotencyKey.create({ data: { key, userId, scope: "checkout" } });
    return null;
  } catch (e) {
    if ((e as { code?: string }).code !== "P2002") throw e;
    const row = await db.idempotencyKey.findUnique({ where: { key } });
    if (!row || row.userId !== userId) throw fail.forbidden();
    if (row.response) return row.response as CheckoutResponse;
    throw fail.conflict("Deine Bestellung wird bereits verarbeitet. Einen Moment bitte.");
  }
}

async function releaseIdempotencyKey(userId: string, clientKey: string) {
  await db.idempotencyKey.delete({ where: { key: `checkout:${userId}:${clientKey}` } }).catch(() => {});
}

async function nextOrderNumber(tx: Prisma.TransactionClient) {
  const year = new Date().getFullYear();
  for (let i = 0; i < 8; i++) {
    const number = formatOrderNumber(year, humanCode(5));
    if (!(await tx.order.findUnique({ where: { number }, select: { id: true } }))) return number;
  }
  throw new Error("Keine freie Bestellnummer gefunden");
}

/** Eigene, noch unbezahlte Bestellungen verwerfen, damit deren Reservierungen nicht blockieren. */
async function abandonOwnPending(userId: string) {
  const pending = await db.order.findMany({ where: { buyerId: userId, status: "PENDING_PAYMENT" }, select: { id: true } });
  for (const o of pending) await markPaymentFailed(o.id, { kind: "abandoned", actorId: userId });
}

export async function startCheckout(user: SessionUser, input: unknown): Promise<CheckoutResponse> {
  const data = checkoutSchema.parse(input);
  await requireFlag("marketplace", user.id);
  const mode = paymentsMode();
  if (mode === "disabled") throw fail.unavailable(PAYMENTS_DISABLED_MESSAGE);
  await limit("checkout", user.id);
  // Wer bestellt? Name und Adresse sind Pflicht (einmal angeben, danach gespeichert)
  const party = await resolveOrderParty(user.id, data);

  const cached = await claimIdempotencyKey(user.id, data.idempotencyKey);
  if (cached) return cached;

  let created: { id: string; number: string; totalMinor: number; shippingMinor: number; platformFeeMinor: number; currency: string; destination: string | null; lines: { name: string; unitMinor: number; quantity: number }[] }[] = [];
  try {
    await abandonOwnPending(user.id);
    const [reservationMinutes, digitalEnabled] = await Promise.all([
      getSetting("commerce.reservationMinutes"),
      getSetting("commerce.digitalEnabledWeb"),
    ]);
    // Stripe verlangt mind. 30 Minuten Laufzeit; die Reservierung läuft etwas länger als die Session,
    // damit ein Zahlungsabschluss in letzter Sekunde noch verbucht werden kann.
    const sessionMinutes = mode === "stripe" ? Math.max(31, reservationMinutes) : reservationMinutes;
    const sessionExpiresAt = new Date(Date.now() + sessionMinutes * 60_000);
    const reservationExpiresAt = new Date(sessionExpiresAt.getTime() + (mode === "stripe" ? 5 * 60_000 : 0));

    created = await db.$transaction(
      async (tx) => {
        // Warenkorb über den normalen Pool lesen: das verschachtelte include fragt mehrere Relationen
        // parallel ab, was auf der einen Transaktionsverbindung nicht geht. Bestand/Reservierung prüfen
        // die atomaren Updates weiter unten ohnehin innerhalb der Transaktion.
        const cart = await db.cart.findUnique({ where: { userId: user.id }, include: { items: { include: lineInclude, orderBy: { createdAt: "asc" } } } });
        const items = cart?.items ?? [];
        if (!items.length) throw fail.invalid("Dein Warenkorb ist leer.");

        // ── Preise & Verfügbarkeit neu prüfen ──
        const lines = items.map((it) => {
          const p = it.product;
          const title = `„${p.title}“`;
          if (p.status !== "ACTIVE") throw fail.conflict(`${title} ist nicht mehr verfügbar.`);
          if (p.shop.status !== "ACTIVE" || p.shop.owner.status !== "ACTIVE") throw fail.conflict(`Der Shop „${p.shop.name}“ nimmt gerade keine Bestellungen an.`);
          if (p.shop.ownerId === user.id) throw fail.invalid("Du kannst keine eigenen Produkte kaufen.");
          if (mode === "stripe" && (!p.shop.stripeAccountId || !p.shop.chargesEnabled)) throw fail.conflict(`Der Shop „${p.shop.name}“ kann gerade keine Zahlungen annehmen.`);
          const isDigital = p.kind === "DIGITAL";
          if (isDigital && !digitalEnabled) throw fail.conflict("Digitale Produkte sind derzeit nicht verfügbar.");
          if (it.variantId && !it.variant) throw fail.conflict(`Die gewählte Variante von ${title} gibt es nicht mehr.`);
          return {
            shopId: p.shop.id,
            productId: p.id,
            variantId: it.variantId,
            title: p.title,
            variantName: it.variant?.name ?? null,
            unitMinor: unitPrice(p.priceMinor, it.variant?.priceDeltaMinor ?? 0),
            quantity: isDigital ? 1 : it.quantity,
            shippingMinor: isDigital ? 0 : p.shippingMinor,
            isDigital,
            currency: p.currency,
            shop: p.shop,
          };
        });
        // Wechselseitige Blockierungen gelten auch im Handel (§9.7)
        const owners = [...new Set(lines.map((l) => l.shop.ownerId))];
        const blocked = await tx.userBlock.findFirst({
          where: { OR: [{ blockerId: user.id, blockedId: { in: owners } }, { blockerId: { in: owners }, blockedId: user.id }] },
          select: { blockerId: true },
        });
        if (blocked) throw fail.forbidden("Bei diesem Shop ist derzeit keine Bestellung möglich.");

        const digitalIds = lines.filter((l) => l.isDigital).map((l) => l.productId);
        if (digitalIds.length) {
          const owned = await tx.digitalEntitlement.findFirst({ where: { userId: user.id, productId: { in: digitalIds }, revokedAt: null }, select: { product: { select: { title: true } } } });
          if (owned) throw fail.conflict(`Du besitzt „${owned.product.title}“ bereits.`);
        }
        if (new Set(lines.map((l) => l.currency)).size > 1) throw fail.invalid("Artikel in verschiedenen Währungen können nicht gemeinsam bestellt werden.");

        // Provision je Shop (Creator Pro: tiefer)
        const fee = await feeResolver(lines.map((l) => l.shopId));
        const groups = groupByShop(lines, fee);
        if (data.expectedTotalMinor != null && data.expectedTotalMinor !== grandTotal(groups).total) {
          throw fail.conflict("Preise oder Versandkosten haben sich geändert. Bitte prüfe deine Bestellung erneut.");
        }

        // ── Bestand atomar reservieren ──
        for (const l of lines) {
          try {
            await reserve(tx, l);
          } catch (e) {
            if (e instanceof OutOfStockError) throw fail.conflict(`„${l.title}“ ist in dieser Menge nicht mehr verfügbar.`);
            throw e;
          }
        }

        // ── Bestellungen je Shop ──
        const out: typeof created = [];
        for (const g of groups) {
          const number = await nextOrderNumber(tx);
          const currency = g.lines[0]!.currency;
          const order = await tx.order.create({
            data: {
              number,
              buyerId: user.id,
              shopId: g.shopId,
              status: "PENDING_PAYMENT",
              currency,
              subtotalMinor: g.fees.subtotal,
              shippingMinor: g.fees.shipping,
              totalMinor: g.fees.total,
              platformFeeMinor: g.fees.platformFee,
              feeBps: fee(g.shopId),
              shippingAddress: party.shippingAddress,
              buyerDetails: party.buyerDetails,
              buyerNote: data.buyerNote,
              reservationExpiresAt,
              items: {
                create: g.lines.map((l) => ({
                  productId: l.productId,
                  variantId: l.variantId,
                  title: l.title,
                  variantName: l.variantName,
                  unitMinor: l.unitMinor,
                  quantity: l.quantity,
                  isDigital: l.isDigital,
                })),
              },
              payments: {
                create: { provider: mode, status: "REQUIRES_PAYMENT", amountMinor: g.fees.total, currency, applicationFeeMinor: g.fees.platformFee },
              },
              events: { create: { actorId: user.id, from: null, to: "PENDING_PAYMENT", note: "Bestellung aufgegeben – Zahlung ausstehend" } },
            },
          });
          out.push({
            id: order.id,
            number,
            totalMinor: order.totalMinor,
            shippingMinor: order.shippingMinor,
            platformFeeMinor: order.platformFeeMinor,
            currency,
            destination: g.lines[0]!.shop.stripeAccountId,
            lines: g.lines.map((l) => ({ name: l.variantName ? `${l.title} – ${l.variantName}` : l.title, unitMinor: l.unitMinor, quantity: l.quantity })),
          });
        }
        return out;
      },
      { timeout: 20_000 },
    );

    // ── Zahlungsanbieter ──
    let firstUrl = "";
    if (mode === "stripe") {
      for (const o of created) {
        const session = await createCheckoutSession({
          orderId: o.id,
          orderNumber: o.number,
          buyerId: user.id,
          buyerEmail: user.email,
          currency: o.currency,
          lines: o.lines,
          shippingMinor: o.shippingMinor,
          applicationFeeMinor: o.platformFeeMinor,
          destinationAccountId: o.destination!,
          expiresAt: sessionExpiresAt,
          idempotencyKey: `checkout-session:${o.id}`,
        });
        await db.order.update({ where: { id: o.id }, data: { checkoutSessionId: session.id } });
        if (!firstUrl && session.url) firstUrl = session.url;
      }
      if (!firstUrl) throw new Error("Stripe lieferte keine Checkout-URL");
    } else {
      firstUrl = `/kasse/simulation?bestellung=${created[0]!.id}`;
    }

    const response: CheckoutResponse = { url: firstUrl, orderIds: created.map((o) => o.id), mode };
    await db.idempotencyKey.update({ where: { key: `checkout:${user.id}:${data.idempotencyKey}` }, data: { response } });
    return response;
  } catch (e) {
    // Kompensation: angelegte Bestellungen verwerfen, Reservierungen freigeben, Key freigeben.
    for (const o of created) {
      const order = await db.order.findUnique({ where: { id: o.id }, select: { checkoutSessionId: true } });
      if (order?.checkoutSessionId) await expireCheckoutSession(order.checkoutSessionId);
      await db.$transaction((tx) => cancelPendingOrderTx(tx, o.id, { paymentStatus: "CANCELLED", note: "Zahlung konnte nicht gestartet werden" })).catch(() => {});
    }
    await releaseIdempotencyKey(user.id, data.idempotencyKey);
    if (e instanceof AppError) throw e;
    if (e && typeof e === "object" && "type" in e && String((e as { type: unknown }).type).startsWith("Stripe")) {
      console.error(JSON.stringify({ level: "error", msg: "stripe_checkout_failed", err: e instanceof Error ? e.message : String(e) }));
      throw fail.unavailable("Die Zahlung konnte gerade nicht gestartet werden. Es wurde nichts belastet – bitte versuche es erneut.");
    }
    throw e;
  }
}

/** Offene Bestellungen des Käufers, die noch bezahlt werden können (z. B. zweiter Shop). */
export async function payableOrders(userId: string) {
  return db.order.findMany({
    where: { buyerId: userId, status: "PENDING_PAYMENT", reservationExpiresAt: { gt: new Date() } },
    orderBy: { createdAt: "asc" },
    select: { id: true, number: true, totalMinor: true, currency: true, reservationExpiresAt: true, shop: { select: { name: true } }, items: { select: { title: true, quantity: true } } },
  });
}

/** Zahlung einer offenen Bestellung fortsetzen. */
export async function resumePayment(user: SessionUser, orderId: string) {
  const o = await db.order.findUnique({ where: { id: orderId }, select: { buyerId: true, status: true, checkoutSessionId: true, reservationExpiresAt: true, payments: { select: { provider: true }, take: 1 } } });
  if (!o || o.buyerId !== user.id) throw fail.notFound();
  if (o.status !== "PENDING_PAYMENT" || !o.reservationExpiresAt || o.reservationExpiresAt < new Date()) throw fail.conflict("Diese Bestellung kann nicht mehr bezahlt werden. Bitte lege die Artikel erneut in den Warenkorb.");
  if (o.payments[0]?.provider === "simulated") {
    if (paymentsMode() !== "simulated") throw fail.unavailable(PAYMENTS_DISABLED_MESSAGE);
    return `/kasse/simulation?bestellung=${orderId}`;
  }
  if (!o.checkoutSessionId) throw fail.conflict("Für diese Bestellung wurde keine Zahlung gestartet.");
  const s = await retrieveCheckoutSession(o.checkoutSessionId);
  if (s.status !== "open" || !s.url) throw fail.conflict("Die Zahlungssitzung ist abgelaufen. Bitte starte die Bestellung neu.");
  return s.url;
}

/** Käufer verwirft eine unbezahlte Bestellung – Reservierung wird sofort frei. */
export async function abandonPendingOrder(user: SessionUser, orderId: string) {
  const o = await db.order.findUnique({ where: { id: orderId }, select: { buyerId: true } });
  if (!o || o.buyerId !== user.id) throw fail.notFound();
  return markPaymentFailed(orderId, { kind: "abandoned", actorId: user.id });
}

/* ───────────────────────── Testmodus (nur Entwicklung) ───────────────────────── */

/**
 * Simulierter Zahlungsanbieter: nur ohne Stripe-Key und ausserhalb der Produktion.
 * Ruft exakt dieselben Verbuchungsfunktionen wie der Stripe-Webhook auf.
 */
export async function simulatePayment(user: SessionUser, orderId: string, outcome: "success" | "failure") {
  if (paymentsMode() !== "simulated" || process.env.NODE_ENV === "production") throw fail.forbidden("Der Testmodus ist hier nicht verfügbar.");
  const o = await db.order.findUnique({ where: { id: orderId }, select: { buyerId: true, status: true, totalMinor: true, currency: true, number: true } });
  if (!o || o.buyerId !== user.id) throw fail.notFound();
  if (o.status !== "PENDING_PAYMENT") throw fail.conflict("Diese Bestellung wartet nicht mehr auf eine Zahlung.");
  if (outcome === "failure") {
    await markPaymentFailed(orderId, { kind: "failed", reason: "Simulierte Ablehnung (Testmodus)" });
    return { status: "failed" as const };
  }
  const r = await markOrderPaid(orderId, { provider: "simulated", providerRef: `sim_pi_${token(12)}`, amountMinor: o.totalMinor, currency: o.currency });
  return { status: r, label: `${o.number} · ${formatMoney(o.totalMinor, o.currency as Currency)}` };
}
