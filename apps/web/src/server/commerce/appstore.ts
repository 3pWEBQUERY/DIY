import "server-only";
import { randomUUID } from "node:crypto";
import { computeFees } from "@werkraum/shared";
import { db, type Tx } from "@/server/db";
import { env } from "@/server/env";
import { fail } from "@/server/errors";
import { emit } from "@/server/events";
import { audit } from "@/server/audit";
import { notify } from "@/server/notifications";
import { humanCode } from "@/server/crypto";
import { getSetting } from "@/server/settings";
import { isBlockedBetween } from "@/server/visibility";
import { captureError } from "@/server/monitoring";
import { feeForShop } from "./fees";
import { formatOrderNumber } from "./rules";
import { createSellerTransfer, isStripeError, paymentsMode, reverseSellerTransfer } from "./stripe";
import { AppStoreVerificationError, verifyAppStoreJws, type AppStoreNotification, type AppStoreTransaction } from "./appstore-verify";

/**
 * Digitale Produkte in der iOS-App: Kauf ausschliesslich über Apple (In-App-Kauf, App Review
 * Guideline 3.1.1). Im Web bleibt es beim Kauf per Stripe.
 *
 * - Preis in der App = Web-Preis + Aufschlag (Einstellung `commerce.iosMarkupBps`, Standard 30 %),
 *   aufgerundet auf die nächste feste Preisstufe. Jede Stufe ist in App Store Connect ein
 *   Verbrauchsartikel `ch.werkuno.app.digital.chf<Franken>`.
 * - Ablauf: App holt eine Kaufabsicht (appAccountToken) → kauft bei Apple → sendet die signierte
 *   Transaktion → Server prüft sie und verbucht Bestellung, Zahlung und Download-Berechtigung.
 * - Der Shop erhält denselben Anteil wie bei einem Web-Verkauf (Web-Preis − Provision) per
 *   Stripe-Überweisung aus dem Plattformguthaben. Testkäufe (Sandbox/Xcode) überweisen nichts.
 * - Erstattungen meldet Apple per Server-Benachrichtigung V2 (/api/webhooks/apple).
 */

/** Preisstufen in Franken – jede ist ein Produkt in App Store Connect. */
export const APP_STORE_TIERS_CHF = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 22, 25, 28, 30, 35, 40, 45, 50, 60, 70, 80, 90, 100, 120, 150, 200] as const;
export const APP_STORE_PRODUCT_PREFIX = "ch.werkuno.app.digital.chf";

const INTENT_MINUTES = 60;

function log(level: "info" | "warn" | "error", msg: string, extra: Record<string, unknown> = {}) {
  console[level === "error" ? "error" : "log"](JSON.stringify({ level, msg, svc: "appstore", ...extra }));
}

/* ───────────────────────── Preise ───────────────────────── */

export type AppPrice = { priceMinor: number; appleProductId: string };

/** App-Preis für einen Web-Preis (in Rappen): kleinste Stufe ≥ Web-Preis × (1 + Aufschlag). */
export function appPriceFor(webMinor: number, markupBps: number): AppPrice | null {
  if (!Number.isInteger(webMinor) || webMinor <= 0) return null;
  const target = Math.ceil((webMinor * (10_000 + Math.max(0, markupBps))) / 10_000);
  const chf = APP_STORE_TIERS_CHF.find((t) => t * 100 >= target);
  return chf ? { priceMinor: chf * 100, appleProductId: `${APP_STORE_PRODUCT_PREFIX}${chf}` } : null;
}

export function webPriceForAppleProduct(appleProductId: string) {
  if (!appleProductId.startsWith(APP_STORE_PRODUCT_PREFIX)) return null;
  const chf = Number(appleProductId.slice(APP_STORE_PRODUCT_PREFIX.length));
  return (APP_STORE_TIERS_CHF as readonly number[]).includes(chf) ? chf * 100 : null;
}

export async function appStoreSettings() {
  const [enabled, markupBps] = await Promise.all([getSetting("commerce.digitalEnabledIos"), getSetting("commerce.iosMarkupBps")]);
  return { enabled: !!enabled, markupBps: Number(markupBps) || 0 };
}

/**
 * Antworten der App-Schnittstelle: digitale Produkte zeigen den App-Preis (`priceMinor`) und die
 * Apple-Produkt-ID (`appStoreProductId`, null = in der App nicht kaufbar). Der Web-Preis wird in der
 * App nicht angezeigt. Gilt nicht für Studio/Verwaltung (dort bearbeitet der Shop seine Web-Preise).
 */
export async function withAppPricing<T>(data: T): Promise<T> {
  let settings: Awaited<ReturnType<typeof appStoreSettings>> | null = null;
  const hasDigital = (v: unknown, depth = 0): boolean => {
    if (depth > 12 || !v || typeof v !== "object") return false;
    if (Array.isArray(v)) return v.some((x) => hasDigital(x, depth + 1));
    const o = v as Record<string, unknown>;
    if (o.kind === "DIGITAL" && typeof o.priceMinor === "number") return true;
    return Object.values(o).some((x) => hasDigital(x, depth + 1));
  };
  if (!hasDigital(data)) return data;
  settings = await appStoreSettings();
  const s = settings;
  const walk = (v: unknown, depth = 0): unknown => {
    if (depth > 12 || !v || typeof v !== "object" || v instanceof Date) return v;
    if (Array.isArray(v)) return v.map((x) => walk(x, depth + 1));
    const o = v as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(o)) out[k] = walk(val, depth + 1);
    if (o.kind === "DIGITAL" && typeof o.priceMinor === "number") {
      const p = appPriceFor(o.priceMinor, s.markupBps);
      out.priceMinor = p?.priceMinor ?? o.priceMinor;
      out.appStoreProductId = s.enabled && p ? p.appleProductId : null;
    }
    return out;
  };
  return walk(data) as T;
}

/* ───────────────────────── Kaufabsicht ───────────────────────── */

type Buyer = { id: string };

async function loadBuyableProduct(buyerId: string, productId: string) {
  const p = await db.product.findUnique({
    where: { id: productId },
    select: {
      id: true,
      title: true,
      slug: true,
      kind: true,
      status: true,
      priceMinor: true,
      currency: true,
      digitalKey: true,
      shop: { select: { id: true, slug: true, name: true, status: true, ownerId: true, stripeAccountId: true, owner: { select: { status: true } } } },
    },
  });
  if (!p || p.kind !== "DIGITAL") throw fail.notFound("Produkt nicht gefunden.");
  if (p.status !== "ACTIVE" || !p.digitalKey) throw fail.conflict(`„${p.title}“ ist nicht mehr verfügbar.`);
  if (p.shop.status !== "ACTIVE" || p.shop.owner.status !== "ACTIVE") throw fail.conflict(`Der Shop „${p.shop.name}“ nimmt gerade keine Bestellungen an.`);
  if (p.shop.ownerId === buyerId) throw fail.invalid("Du kannst keine eigenen Produkte kaufen.");
  if (await isBlockedBetween(buyerId, p.shop.ownerId)) throw fail.forbidden("Bei diesem Shop ist derzeit keine Bestellung möglich.");
  if (paymentsMode() === "stripe" && !p.shop.stripeAccountId) throw fail.conflict(`Der Shop „${p.shop.name}“ kann gerade keine Zahlungen annehmen.`);
  return p;
}

/** Kaufabsicht anlegen: Preis festhalten und appAccountToken für den Apple-Kauf ausgeben. */
export async function createPurchaseIntent(user: Buyer, input: { productId?: unknown }) {
  const productId = typeof input.productId === "string" ? input.productId : "";
  if (!productId) throw fail.invalid("Produkt fehlt.", { productId: "Pflichtfeld" });
  const s = await appStoreSettings();
  if (!s.enabled) throw fail.unavailable("Digitale Produkte können in der App derzeit nicht gekauft werden.");
  const p = await loadBuyableProduct(user.id, productId);
  const owned = await db.digitalEntitlement.findUnique({ where: { userId_productId: { userId: user.id, productId: p.id } }, select: { revokedAt: true } });
  if (owned && !owned.revokedAt) throw fail.conflict("Du besitzt dieses digitale Produkt bereits. Du findest es unter „Bestellungen“.");
  const price = appPriceFor(p.priceMinor, s.markupBps);
  if (!price) throw fail.conflict("Dieses Produkt kann in der App nicht gekauft werden.");
  const feeBps = await feeForShop(p.shop.id);
  const fees = computeFees(p.priceMinor, 0, feeBps);
  // Alte, nicht abgeschlossene Absichten derselben Person für dieses Produkt verfallen lassen
  await db.appStorePurchase.updateMany({ where: { userId: user.id, productId: p.id, status: "PENDING" }, data: { status: "EXPIRED" } });
  const intent = await db.appStorePurchase.create({
    data: {
      token: randomUUID(),
      userId: user.id,
      productId: p.id,
      appleProductId: price.appleProductId,
      priceMinor: price.priceMinor,
      webPriceMinor: p.priceMinor,
      sellerNetMinor: fees.sellerNet,
      currency: p.currency,
      expiresAt: new Date(Date.now() + INTENT_MINUTES * 60_000),
    },
  });
  return { appAccountToken: intent.token, appleProductId: intent.appleProductId, priceMinor: intent.priceMinor, currency: intent.currency };
}

/* ───────────────────────── Kauf verbuchen ───────────────────────── */

async function nextOrderNumber(tx: Tx) {
  const year = new Date().getFullYear();
  for (let i = 0; i < 8; i++) {
    const number = formatOrderNumber(year, humanCode(5));
    if (!(await tx.order.findUnique({ where: { number }, select: { id: true } }))) return number;
  }
  throw new Error("Keine freie Bestellnummer gefunden");
}

function verifyTransaction(signed: string): AppStoreTransaction {
  try {
    return verifyAppStoreJws<AppStoreTransaction>(signed);
  } catch (e) {
    if (e instanceof AppStoreVerificationError) {
      log("warn", "appstore_jws_rejected", { reason: e.message });
      throw fail.invalid(`Der Kaufbeleg von Apple konnte nicht geprüft werden (${e.message}).`);
    }
    throw e;
  }
}

/** Zahlungsfluss eines Kaufs: echte Käufe → Überweisung an den Shop; Testkäufe nicht. */
function transferStatusFor(environment: string): "PENDING" | "SKIPPED" {
  return environment === "Production" && paymentsMode() === "stripe" ? "PENDING" : "SKIPPED";
}

/**
 * Signierte Transaktion aus der App verbuchen. Idempotent über die Apple-Transaktions-ID:
 * wiederholte Meldungen (z. B. nach App-Neustart über Transaction.updates) liefern dieselbe Bestellung.
 */
export async function fulfillAppStoreTransaction(user: Buyer, input: { signedTransaction?: unknown }) {
  const signed = typeof input.signedTransaction === "string" ? input.signedTransaction : "";
  if (!signed) throw fail.invalid("Kaufbeleg fehlt.", { signedTransaction: "Pflichtfeld" });
  const t = verifyTransaction(signed);
  if (t.bundleId !== env().APPLE_IAP_BUNDLE_ID) throw fail.invalid("Der Kaufbeleg gehört zu einer anderen App.");
  if (t.revocationDate) throw fail.conflict("Dieser Kauf wurde von Apple widerrufen.");
  const token = (t.appAccountToken ?? "").toLowerCase();
  if (!token) throw fail.invalid("Der Kauf ist keiner Bestellung zugeordnet.");

  const existing = await db.appStorePurchase.findUnique({ where: { transactionId: t.transactionId }, select: { orderId: true, userId: true, productId: true } });
  if (existing) {
    if (existing.userId !== user.id) throw fail.forbidden();
    return purchaseResult(existing.orderId, existing.productId, user.id);
  }

  const intent = await db.appStorePurchase.findUnique({ where: { token } });
  if (!intent || intent.userId !== user.id) throw fail.forbidden("Dieser Kauf gehört zu einem anderen Konto.");
  if (intent.appleProductId !== t.productId) throw fail.invalid("Der Kaufbeleg passt nicht zum Produkt.");
  if (intent.status === "COMPLETED" && intent.transactionId !== t.transactionId) throw fail.conflict("Dieser Kauf wurde bereits verbucht.");
  // Abgelaufene Absicht: Apple hat trotzdem kassiert → verbuchen (Preis wie festgehalten)

  const product = await db.product.findUniqueOrThrow({
    where: { id: intent.productId },
    select: { id: true, title: true, shop: { select: { id: true, ownerId: true } } },
  });
  const feeBps = await feeForShop(product.shop.id);
  const environment = t.environment;
  const transferStatus = transferStatusFor(environment);
  const isTest = environment !== "Production";

  const orderId = await db.$transaction(
    async (tx) => {
      // Gleichzeitige Meldung derselben Transaktion: nur eine gewinnt (Unique auf transactionId)
      const claimed = await tx.appStorePurchase.updateMany({
        where: { id: intent.id, transactionId: null },
        data: {
          transactionId: t.transactionId,
          originalTransactionId: t.originalTransactionId,
          environment,
          applePriceMilli: typeof t.price === "number" ? t.price : null,
          appleCurrency: t.currency ?? null,
          storefront: t.storefront ?? null,
        },
      });
      if (!claimed.count) {
        const again = await tx.appStorePurchase.findUnique({ where: { id: intent.id }, select: { orderId: true } });
        return again?.orderId ?? null;
      }
      const now = new Date(t.purchaseDate || Date.now());
      const number = await nextOrderNumber(tx);
      const total = intent.priceMinor;
      // Provision so wählen, dass dem Shop genau der Web-Anteil bleibt (der Rest deckt Apple)
      const platformFee = Math.max(0, total - intent.sellerNetMinor);
      const order = await tx.order.create({
        data: {
          number,
          buyerId: user.id,
          shopId: product.shop.id,
          status: "COMPLETED",
          currency: intent.currency,
          subtotalMinor: total,
          shippingMinor: 0,
          totalMinor: total,
          platformFeeMinor: platformFee,
          feeBps,
          shippingAddress: {},
          paidAt: now,
          completedAt: now,
          items: { create: [{ productId: product.id, title: product.title, unitMinor: total, quantity: 1, isDigital: true }] },
          payments: {
            create: {
              provider: "apple",
              providerRef: `apple:${t.transactionId}`,
              status: "SUCCEEDED",
              amountMinor: total,
              currency: intent.currency,
              applicationFeeMinor: platformFee,
            },
          },
          events: {
            create: [
              { actorId: user.id, from: null, to: "COMPLETED", note: isTest ? `Testkauf in der iOS-App (Apple ${environment}) – keine Auszahlung` : "In der iOS-App über Apple bezahlt – digitaler Download freigeschaltet" },
            ],
          },
        },
        include: { items: true },
      });
      const item = order.items[0]!;
      await tx.digitalEntitlement.upsert({
        where: { userId_productId: { userId: user.id, productId: product.id } },
        create: { userId: user.id, productId: product.id, orderItemId: item.id },
        update: { revokedAt: null, orderItemId: item.id, downloadCount: 0 },
      });
      await tx.appStorePurchase.update({
        where: { id: intent.id },
        data: { status: "COMPLETED", orderId: order.id, completedAt: new Date(), transferStatus },
      });
      await tx.shop.update({ where: { id: product.shop.id }, data: { salesCount: { increment: 1 } } });
      await audit({ actorId: user.id, action: "appstore.purchase", targetType: "Order", targetId: order.id, meta: { transactionId: t.transactionId, environment, appleProductId: t.productId } }, tx);
      await emit({ type: "ProductPurchased", orderId: order.id }, tx);
      await notify({ recipientId: product.shop.ownerId, type: "ORDER_NEW", bundle: false, data: { number, title: product.title, href: `/studio/bestellungen/${order.id}` } }, tx);
      await notify({ recipientId: user.id, type: "ORDER_STATUS", bundle: false, data: { number, title: product.title, status: "COMPLETED", note: "Dein Download ist bereit.", href: `/bestellungen/${order.id}` } }, tx);
      return order.id;
    },
    { timeout: 20_000 },
  );

  if (transferStatus === "PENDING") await sendSellerTransfer(intent.id).catch((e) => captureError(e, { source: "SERVER", path: "appstore.transfer" }));
  log("info", "appstore_purchase", { orderId, environment });
  return purchaseResult(orderId, product.id, user.id);
}

async function purchaseResult(orderId: string | null, productId: string, userId: string) {
  const e = await db.digitalEntitlement.findUnique({ where: { userId_productId: { userId, productId } }, select: { id: true, revokedAt: true } });
  return { orderId, entitlementId: e && !e.revokedAt ? e.id : null };
}

/* ───────────────────────── Überweisung an den Shop ───────────────────────── */

const MAX_TRANSFER_ATTEMPTS = 24;

/** Shop-Anteil überweisen (Stripe Connect). Fehler → FAILED, der Worker versucht es erneut. */
export async function sendSellerTransfer(purchaseId: string) {
  const p = await db.appStorePurchase.findUnique({
    where: { id: purchaseId },
    select: { id: true, status: true, transferStatus: true, transferAttempts: true, sellerNetMinor: true, currency: true, order: { select: { id: true, number: true, shop: { select: { stripeAccountId: true, name: true } } } } },
  });
  if (!p || p.status !== "COMPLETED" || !p.order) return "skipped" as const;
  if (p.transferStatus !== "PENDING" && p.transferStatus !== "FAILED") return "skipped" as const;
  const accountId = p.order.shop.stripeAccountId;
  if (!accountId || p.sellerNetMinor <= 0) {
    await db.appStorePurchase.update({ where: { id: p.id }, data: { transferStatus: "FAILED", transferAttempts: { increment: 1 }, transferError: "Shop hat kein Auszahlungskonto" } });
    return "failed" as const;
  }
  try {
    const tr = await createSellerTransfer({
      accountId,
      amountMinor: p.sellerNetMinor,
      currency: p.currency,
      orderId: p.order.id,
      orderNumber: p.order.number,
      idempotencyKey: `appstore-transfer:${p.id}`,
    });
    await db.appStorePurchase.update({ where: { id: p.id }, data: { transferStatus: "SENT", transferId: tr.id, transferError: null, transferAttempts: { increment: 1 } } });
    return "sent" as const;
  } catch (e) {
    const message = isStripeError(e) ? e.message : e instanceof Error ? e.message : String(e);
    await db.appStorePurchase.update({ where: { id: p.id }, data: { transferStatus: "FAILED", transferAttempts: { increment: 1 }, transferError: message.slice(0, 500) } });
    log("warn", "appstore_transfer_failed", { purchaseId: p.id, err: message });
    return "failed" as const;
  }
}

/** Worker: offene oder fehlgeschlagene Überweisungen erneut versuchen; alte Absichten aufräumen. */
export async function retrySellerTransfers() {
  const due = await db.appStorePurchase.findMany({
    where: { transferStatus: { in: ["PENDING", "FAILED"] }, transferAttempts: { lt: MAX_TRANSFER_ATTEMPTS }, updatedAt: { lt: new Date(Date.now() - 30 * 60_000) } },
    select: { id: true },
    take: 50,
  });
  let sent = 0;
  for (const p of due) if ((await sendSellerTransfer(p.id)) === "sent") sent++;
  const expired = await db.appStorePurchase.updateMany({ where: { status: "PENDING", expiresAt: { lt: new Date(Date.now() - 7 * 86400_000) } }, data: { status: "EXPIRED" } });
  return { tried: due.length, sent, expired: expired.count };
}

/* ───────────────────────── Erstattungen (Server-Benachrichtigungen V2) ───────────────────────── */

/** Kauf zurücknehmen: Berechtigung widerrufen, Bestellung erstatten, Überweisung zurückholen. */
async function revokePurchase(transactionId: string, reason: string) {
  const p = await db.appStorePurchase.findUnique({
    where: { transactionId },
    select: { id: true, status: true, userId: true, productId: true, transferStatus: true, transferId: true, orderId: true, priceMinor: true, currency: true },
  });
  if (!p || !p.orderId || p.status === "REFUNDED") return "ignored" as const;
  const order = await db.order.findUniqueOrThrow({ where: { id: p.orderId }, select: { id: true, number: true, status: true, buyerId: true, shop: { select: { ownerId: true } }, items: { select: { title: true } } } });
  const title = order.items[0]?.title ?? "";
  await db.$transaction(async (tx) => {
    await tx.appStorePurchase.update({ where: { id: p.id }, data: { status: "REFUNDED", revokedAt: new Date(), transferStatus: p.transferStatus === "SENT" ? "SENT" : "SKIPPED" } });
    await tx.digitalEntitlement.updateMany({ where: { userId: p.userId, productId: p.productId, revokedAt: null }, data: { revokedAt: new Date() } });
    await tx.order.update({ where: { id: order.id }, data: { status: "REFUNDED" } });
    await tx.payment.updateMany({ where: { orderId: order.id, provider: "apple" }, data: { status: "REFUNDED" } });
    await tx.refund.upsert({
      where: { providerRef: `apple-refund:${transactionId}` },
      create: { orderId: order.id, providerRef: `apple-refund:${transactionId}`, amountMinor: p.priceMinor, reason, status: "SUCCEEDED" },
      update: {},
    });
    await tx.orderEvent.create({ data: { orderId: order.id, from: order.status, to: "REFUNDED", note: `Von Apple erstattet – ${reason}` } });
    await audit({ action: "appstore.refund", targetType: "Order", targetId: order.id, meta: { transactionId } }, tx);
    await notify({ recipientId: order.shop.ownerId, type: "ORDER_STATUS", bundle: false, data: { number: order.number, title, status: "REFUNDED", note: "Apple hat den Kauf erstattet. Dein Anteil wird zurückgebucht.", href: `/studio/bestellungen/${order.id}` } }, tx);
    await notify({ recipientId: order.buyerId, type: "ORDER_STATUS", bundle: false, data: { number: order.number, title, status: "REFUNDED", note: "Apple hat deinen Kauf erstattet.", href: `/bestellungen/${order.id}` } }, tx);
  });
  if (p.transferStatus === "SENT" && p.transferId) {
    try {
      await reverseSellerTransfer(p.transferId, `appstore-reversal:${p.id}`);
      await db.appStorePurchase.update({ where: { id: p.id }, data: { transferStatus: "REVERSED" } });
    } catch (e) {
      log("error", "appstore_reversal_failed", { purchaseId: p.id, err: e instanceof Error ? e.message : String(e) });
      await db.appStorePurchase.update({ where: { id: p.id }, data: { transferError: `Rückbuchung fehlgeschlagen: ${e instanceof Error ? e.message : String(e)}`.slice(0, 500) } });
    }
  }
  log("info", "appstore_refund", { orderId: order.id });
  return "refunded" as const;
}

/** App Store Server Notification V2 verarbeiten. Liefert den HTTP-Status für Apple. */
export async function handleAppStoreNotification(body: { signedPayload?: unknown }): Promise<number> {
  const signed = typeof body.signedPayload === "string" ? body.signedPayload : "";
  if (!signed) return 400;
  let n: AppStoreNotification;
  try {
    n = verifyAppStoreJws<AppStoreNotification>(signed);
  } catch (e) {
    log("warn", "appstore_notification_rejected", { reason: e instanceof Error ? e.message : String(e) });
    return 400;
  }
  if (n.data?.bundleId && n.data.bundleId !== env().APPLE_IAP_BUNDLE_ID) return 200;
  // Doppelte Zustellung: Apple wiederholt bei Fehlern; Ereignis-ID als Schlüssel
  try {
    await db.webhookEvent.create({ data: { id: `apple:${n.notificationUUID}`, provider: "apple", type: n.notificationType, payload: { notificationType: n.notificationType, subtype: n.subtype ?? null } } });
  } catch (e) {
    if ((e as { code?: string }).code === "P2002") return 200;
    throw e;
  }
  try {
    if ((n.notificationType === "REFUND" || n.notificationType === "REVOKE") && n.data?.signedTransactionInfo) {
      const t = verifyAppStoreJws<AppStoreTransaction>(n.data.signedTransactionInfo);
      await revokePurchase(t.transactionId, n.notificationType === "REFUND" ? "Erstattung durch Apple" : "Kauf widerrufen");
    } else {
      log("info", "appstore_notification", { type: n.notificationType, subtype: n.subtype });
    }
    return 200;
  } catch (e) {
    // Ereignis wieder freigeben, damit Apple erneut zustellt
    await db.webhookEvent.delete({ where: { id: `apple:${n.notificationUUID}` } }).catch(() => {});
    captureError(e, { source: "SERVER", path: "/api/webhooks/apple" });
    return 500;
  }
}
