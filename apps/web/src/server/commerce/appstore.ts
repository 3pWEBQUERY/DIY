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
import { requireFlag } from "@/server/flags";
import { isBlockedBetween } from "@/server/visibility";
import { captureError } from "@/server/monitoring";
import { feeForShop } from "./fees";
import { appTierFor, formatOrderNumber } from "./rules";
import { createSellerTransfer, isStripeError, paymentsMode, reverseSellerTransfer } from "./stripe";
import { AppStoreVerificationError, verifyAppStoreJws, type AppStoreNotification, type AppStoreTransaction } from "./appstore-verify";
import { handleAppleProNotification, isProAppleProduct } from "@/server/pro/apple";

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

/**
 * Preisstufen in Franken – jede ist ein Produkt in App Store Connect (`ch.werkuno.app.digital.chf1`
 * bis `…chf30`, ganze Franken). Höhere Stufen erst hier ergänzen, wenn sie in App Store Connect existieren.
 */
export const APP_STORE_TIERS_CHF: readonly number[] = Array.from({ length: 30 }, (_, i) => i + 1);
const APP_STORE_TIERS_MINOR = APP_STORE_TIERS_CHF.map((t) => t * 100);
export const APP_STORE_PRODUCT_PREFIX = "ch.werkuno.app.digital.chf";

const INTENT_MINUTES = 60;

function log(level: "info" | "warn" | "error", msg: string, extra: Record<string, unknown> = {}) {
  console[level === "error" ? "error" : "log"](JSON.stringify({ level, msg, svc: "appstore", ...extra }));
}

/* ───────────────────────── Preise ───────────────────────── */

export type AppPrice = { priceMinor: number; appleProductId: string };

/** App-Preis für einen Web-Preis (in Rappen): kleinste Stufe ≥ Web-Preis × (1 + Aufschlag). */
export function appPriceFor(webMinor: number, markupBps: number): AppPrice | null {
  const minor = appTierFor(webMinor, markupBps, APP_STORE_TIERS_MINOR);
  return minor ? { priceMinor: minor, appleProductId: `${APP_STORE_PRODUCT_PREFIX}${minor / 100}` } : null;
}

export function webPriceForAppleProduct(appleProductId: string) {
  if (!appleProductId.startsWith(APP_STORE_PRODUCT_PREFIX)) return null;
  const chf = Number(appleProductId.slice(APP_STORE_PRODUCT_PREFIX.length));
  return APP_STORE_TIERS_CHF.includes(chf) ? chf * 100 : null;
}

/** Höchster Web-Preis (Rappen), für den es in der App noch eine Preisstufe gibt. */
export function maxWebMinorForApp(markupBps: number) {
  const top = APP_STORE_TIERS_CHF[APP_STORE_TIERS_CHF.length - 1]! * 100;
  return Math.floor((top * 10_000) / (10_000 + Math.max(0, markupBps)));
}

export async function appStoreSettings() {
  const [enabled, markupBps] = await Promise.all([getSetting("commerce.digitalEnabledIos"), getSetting("commerce.iosMarkupBps")]);
  return { enabled: !!enabled, markupBps: Number(markupBps) || 0 };
}

/** Für die Produkteditoren (Web und App): wie ein Web-Preis in der iOS-App erscheint. */
export async function appStorePricingInfo() {
  const { enabled, markupBps } = await appStoreSettings();
  return { enabled, markupBps, tiersMinor: APP_STORE_TIERS_MINOR, maxWebMinor: maxWebMinorForApp(markupBps) };
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
  // Notschalter des Marktplatzes stoppt auch neue In-App-Käufe (das Verbuchen bereits bezahlter bleibt offen)
  await requireFlag("marketplace", user.id);
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
  // Erstattung kam schon vor der Verbuchung (z. B. Beleg zurückgehalten und erstatten lassen)
  if (await db.appStoreRevocation.findUnique({ where: { transactionId: t.transactionId }, select: { transactionId: true } })) {
    throw fail.conflict("Dieser Kauf wurde von Apple widerrufen.");
  }
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
  if (intent.status === "COMPLETED" && intent.transactionId !== t.transactionId) {
    await reportSecondTransaction(intent.id, intent.transactionId, t.transactionId, t.environment);
    throw fail.conflict("Dieser Kauf wurde bereits verbucht.");
  }
  // Abgelaufene Absicht: Apple hat trotzdem kassiert → verbuchen (Preis wie festgehalten)

  const product = await db.product.findUniqueOrThrow({
    where: { id: intent.productId },
    select: { id: true, title: true, shop: { select: { id: true, ownerId: true } } },
  });
  const feeBps = await feeForShop(product.shop.id);
  const environment = t.environment;
  const transferStatus = transferStatusFor(environment);
  const isTest = environment !== "Production";

  let secondTransactionOf: string | null = null;
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
        const again = await tx.appStorePurchase.findUnique({ where: { id: intent.id }, select: { orderId: true, transactionId: true } });
        // Andere Transaktion hat dieselbe Kaufabsicht beansprucht: Apple hat zweimal kassiert → melden
        if (again?.transactionId && again.transactionId !== t.transactionId) secondTransactionOf = again.transactionId;
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
      // Testkäufe (Sandbox/Xcode) sind keine Verkäufe
      if (!isTest) await tx.shop.update({ where: { id: product.shop.id }, data: { salesCount: { increment: 1 } } });
      await audit({ actorId: user.id, action: "appstore.purchase", targetType: "Order", targetId: order.id, meta: { transactionId: t.transactionId, environment, appleProductId: t.productId } }, tx);
      await emit({ type: "ProductPurchased", orderId: order.id }, tx);
      // Testkäufe (Sandbox/Xcode) nicht als neue Bestellung melden – der Shop erhält dafür nichts
      if (!isTest) await notify({ recipientId: product.shop.ownerId, type: "ORDER_NEW", bundle: false, data: { number, title: product.title, href: `/studio/bestellungen/${order.id}` } }, tx);
      await notify({ recipientId: user.id, type: "ORDER_STATUS", bundle: false, data: { number, title: product.title, status: "COMPLETED", note: "Dein Download ist bereit.", href: `/bestellungen/${order.id}` } }, tx);
      return order.id;
    },
    { timeout: 20_000 },
  );

  if (secondTransactionOf) await reportSecondTransaction(intent.id, secondTransactionOf, t.transactionId, environment);

  // Erstattung traf ein, während wir verbucht haben (Benachrichtigung sah den Kauf noch nicht): sofort zurücknehmen
  const late = await db.appStoreRevocation.findUnique({ where: { transactionId: t.transactionId }, select: { reason: true } });
  if (late) {
    await revokePurchase(t.transactionId, late.reason);
    throw fail.conflict("Dieser Kauf wurde von Apple widerrufen.");
  }

  if (transferStatus === "PENDING") await sendSellerTransfer(intent.id).catch((e) => captureError(e, { source: "SERVER", path: "appstore.transfer" }));
  log("info", "appstore_purchase", { orderId, environment });
  return purchaseResult(orderId, product.id, user.id);
}

/**
 * Zweite Apple-Transaktion für eine bereits verbuchte Kaufabsicht (appAccountToken): Apple hat zweimal
 * kassiert, verbucht ist nur der erste Kauf. Zur manuellen Erstattung melden (nur Apple kann erstatten).
 */
async function reportSecondTransaction(purchaseId: string, firstTransactionId: string | null, secondTransactionId: string, environment: string) {
  log("warn", "appstore_second_transaction", { purchaseId, firstTransactionId, secondTransactionId, environment });
  await captureError(new Error("Zweite Apple-Transaktion für dieselbe Kaufabsicht – doppelt kassiert, bitte prüfen"), {
    source: "SERVER",
    path: "appstore.duplicate_transaction",
    meta: { purchaseId, firstTransactionId, secondTransactionId, environment },
  });
}

async function purchaseResult(orderId: string | null, productId: string, userId: string) {
  const e = await db.digitalEntitlement.findUnique({ where: { userId_productId: { userId, productId } }, select: { id: true, revokedAt: true } });
  return { orderId, entitlementId: e && !e.revokedAt ? e.id : null };
}

/* ───────────────────────── Überweisung an den Shop ───────────────────────── */

const MAX_TRANSFER_ATTEMPTS = 24;
const MAX_REVERSAL_ATTEMPTS = MAX_TRANSFER_ATTEMPTS * 4;
const TRANSFER_HELD = "Zurückgehalten: Shop gesperrt bzw. Konto gebannt oder gelöscht";

/** Shop-Anteil überweisen (Stripe Connect). Fehler → FAILED, der Worker versucht es erneut. */
export async function sendSellerTransfer(purchaseId: string) {
  const p = await db.appStorePurchase.findUnique({
    where: { id: purchaseId },
    select: {
      id: true,
      status: true,
      transferStatus: true,
      transferAttempts: true,
      transferId: true,
      transferError: true,
      sellerNetMinor: true,
      currency: true,
      order: { select: { id: true, number: true, shop: { select: { id: true, stripeAccountId: true, name: true, status: true, owner: { select: { status: true } } } } } },
    },
  });
  if (!p || p.status !== "COMPLETED" || !p.order) return "skipped" as const;
  if (p.transferStatus !== "PENDING" && p.transferStatus !== "FAILED") return "skipped" as const;
  // Gesperrter Shop bzw. gebanntes/gelöschtes Konto: nichts überweisen, sondern zurückhalten (Status bleibt
  // offen, kein Versuch wird verbraucht) – wird der Shop wieder freigegeben, holt der Worker es nach
  const shop = p.order.shop;
  if (shop.status === "SUSPENDED" || shop.owner.status === "BANNED" || shop.owner.status === "DELETED") {
    // Immer schreiben (updatedAt): der Worker wählt reihum nach updatedAt – zurückgehaltene Zeilen verdrängen sonst andere
    await db.appStorePurchase.update({ where: { id: p.id }, data: { transferError: TRANSFER_HELD } });
    if (p.transferError !== TRANSFER_HELD) {
      await captureError(new Error("Überweisung an gesperrten Shop zurückgehalten – bitte klären"), { source: "SERVER", path: "appstore.transfer_held", meta: { purchaseId: p.id, shopId: shop.id, shopStatus: shop.status, ownerStatus: shop.owner.status } });
    }
    return "held" as const;
  }
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
      // Erneute Überweisung nach zurückgenommener Erstattung: die alte (zurückgebuchte) Überweisung steckt
      // im Schlüssel – sonst lieferte Stripe innerhalb von 24 Std. nur die zurückgebuchte Überweisung zurück
      idempotencyKey: p.transferId ? `appstore-transfer:${p.id}:${p.transferId}` : `appstore-transfer:${p.id}`,
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
    select: { id: true, transferAttempts: true },
    // Älteste zuerst – sonst verdrängen dauerhaft scheiternde Zeilen neue
    orderBy: { updatedAt: "asc" },
    take: 50,
  });
  let sent = 0;
  for (const p of due) {
    const r = await sendSellerTransfer(p.id);
    if (r === "sent") sent++;
    // Letzter Versuch gescheitert: danach versucht der Worker es nicht mehr → zur manuellen Klärung melden
    if (r === "failed" && p.transferAttempts + 1 >= MAX_TRANSFER_ATTEMPTS) {
      await captureError(new Error("Überweisung an den Shop nach allen Versuchen fehlgeschlagen"), { source: "WORKER", path: "appstore.transfer", meta: { purchaseId: p.id, attempts: p.transferAttempts + 1 } });
    }
  }
  const reversed = await retryTransferReversals();
  const expired = await db.appStorePurchase.updateMany({ where: { status: "PENDING", expiresAt: { lt: new Date(Date.now() - 7 * 86400_000) } }, data: { status: "EXPIRED" } });
  return { tried: due.length, sent, reversed, expired: expired.count };
}

/**
 * Von Apple erstattete Käufe, deren Überweisung an den Shop noch nicht zurückgeholt ist (Rückbuchung
 * gescheitert, z. B. zu wenig Guthaben): erneut versuchen – mit demselben Idempotenz-Schlüssel, also nie doppelt.
 */
async function retryTransferReversals() {
  const open = await db.appStorePurchase.findMany({
    where: { status: "REFUNDED", transferStatus: "SENT", transferId: { not: null }, transferAttempts: { lt: MAX_REVERSAL_ATTEMPTS }, updatedAt: { lt: new Date(Date.now() - 30 * 60_000) } },
    orderBy: { updatedAt: "asc" },
    select: { id: true, transferId: true, transferAttempts: true },
    take: 50,
  });
  let reversed = 0;
  for (const p of open) {
    try {
      await reverseSellerTransfer(p.transferId!, `appstore-reversal:${p.id}`);
      await db.appStorePurchase.update({ where: { id: p.id }, data: { transferStatus: "REVERSED", transferError: null } });
      reversed++;
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      log("error", "appstore_reversal_retry_failed", { purchaseId: p.id, err: message });
      await db.appStorePurchase.update({ where: { id: p.id }, data: { transferAttempts: { increment: 1 }, transferError: `Rückbuchung fehlgeschlagen: ${message}`.slice(0, 500) } });
      // Letzter Versuch: der Shop behält sonst unbemerkt den Anteil eines erstatteten Kaufs
      if (p.transferAttempts + 1 >= MAX_REVERSAL_ATTEMPTS) {
        await captureError(e, { source: "WORKER", path: "appstore.reversal", meta: { purchaseId: p.id, attempts: p.transferAttempts + 1 } });
      }
    }
  }
  return reversed;
}

/* ───────────────────────── Erstattungen (Server-Benachrichtigungen V2) ───────────────────────── */

/** Kauf zurücknehmen: Berechtigung widerrufen, Bestellung erstatten, Überweisung zurückholen. */
async function revokePurchase(transactionId: string, reason: string) {
  const p = await db.appStorePurchase.findUnique({
    where: { transactionId },
    select: { id: true, status: true, userId: true, productId: true, transferStatus: true, transferId: true, orderId: true, priceMinor: true, currency: true },
  });
  if (!p || !p.orderId) {
    // Noch nicht verbucht: Grabstein, damit ein später eingereichter Beleg nichts mehr freischaltet
    await db.appStoreRevocation.upsert({ where: { transactionId }, create: { transactionId, reason }, update: {} });
    return "recorded" as const;
  }
  if (p.status === "REFUNDED") return "ignored" as const;
  const order = await db.order.findUniqueOrThrow({ where: { id: p.orderId }, select: { id: true, number: true, status: true, buyerId: true, shop: { select: { ownerId: true } }, items: { select: { title: true } } } });
  const title = order.items[0]?.title ?? "";
  const applied = await db.$transaction(async (tx) => {
    // Gleichzeitige Zustellung derselben Erstattung: nur ein Durchlauf bucht (bedingtes Update)
    const won = await tx.appStorePurchase.updateMany({ where: { id: p.id, status: { not: "REFUNDED" } }, data: { status: "REFUNDED", revokedAt: new Date(), transferStatus: p.transferStatus === "SENT" ? "SENT" : "SKIPPED" } });
    if (!won.count) return false;
    await tx.digitalEntitlement.updateMany({ where: { userId: p.userId, productId: p.productId, revokedAt: null }, data: { revokedAt: new Date() } });
    await tx.order.update({ where: { id: order.id }, data: { status: "REFUNDED" } });
    await tx.payment.updateMany({ where: { orderId: order.id, provider: "apple" }, data: { status: "REFUNDED" } });
    await tx.refund.upsert({
      where: { providerRef: `apple-refund:${transactionId}` },
      create: { orderId: order.id, providerRef: `apple-refund:${transactionId}`, amountMinor: p.priceMinor, reason, status: "SUCCEEDED" },
      // Erneute Erstattung nach einer zurückgenommenen (REFUND_REVERSED) gilt wieder
      update: { status: "SUCCEEDED", reason },
    });
    await tx.orderEvent.create({ data: { orderId: order.id, from: order.status, to: "REFUNDED", note: `Von Apple erstattet – ${reason}` } });
    await audit({ action: "appstore.refund", targetType: "Order", targetId: order.id, meta: { transactionId } }, tx);
    await notify({ recipientId: order.shop.ownerId, type: "ORDER_STATUS", bundle: false, data: { number: order.number, title, status: "REFUNDED", note: "Apple hat den Kauf erstattet. Dein Anteil wird zurückgebucht.", href: `/studio/bestellungen/${order.id}` } }, tx);
    await notify({ recipientId: order.buyerId, type: "ORDER_STATUS", bundle: false, data: { number: order.number, title, status: "REFUNDED", note: "Apple hat deinen Kauf erstattet.", href: `/bestellungen/${order.id}` } }, tx);
    return true;
  });
  if (!applied) return "ignored" as const;
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

/**
 * Apple hat eine Erstattung zurückgenommen (REFUND_REVERSED): Kauf, Bestellung und Download wieder
 * herstellen und – bei echten Käufen – den Shop-Anteil erneut überweisen. Idempotent: nur ein erstatteter
 * Kauf wird (bedingt) wiederhergestellt.
 */
export async function restorePurchase(transactionId: string) {
  // Grabstein (Erstattung vor der Verbuchung) entfernen, damit der Beleg wieder verbucht werden kann
  await db.appStoreRevocation.deleteMany({ where: { transactionId } });
  const p = await db.appStorePurchase.findUnique({
    where: { transactionId },
    select: { id: true, status: true, userId: true, productId: true, transferStatus: true, environment: true, orderId: true },
  });
  if (!p || !p.orderId || p.status !== "REFUNDED") return "ignored" as const;
  const order = await db.order.findUniqueOrThrow({ where: { id: p.orderId }, select: { id: true, number: true, status: true, buyerId: true, shop: { select: { ownerId: true } }, items: { select: { id: true, title: true } } } });
  const item = order.items[0];
  const title = item?.title ?? "";
  // Noch nicht zurückgeholte Überweisung (SENT) bleibt beim Shop; zurückgebuchte bzw. wegen der Erstattung
  // übersprungene wird – wie beim Kauf nur für echte Käufe mit Stripe – erneut fällig
  const transferStatus = p.transferStatus === "SENT" ? "SENT" : transferStatusFor(p.environment ?? "");
  const applied = await db.$transaction(async (tx) => {
    const won = await tx.appStorePurchase.updateMany({
      where: { id: p.id, status: "REFUNDED" },
      data: { status: "COMPLETED", revokedAt: null, transferStatus, ...(transferStatus === "PENDING" ? { transferAttempts: 0, transferError: null } : {}) },
    });
    if (!won.count) return false;
    if (item) {
      await tx.digitalEntitlement.updateMany({ where: { userId: p.userId, productId: p.productId, revokedAt: { not: null } }, data: { revokedAt: null, orderItemId: item.id } });
    }
    await tx.order.update({ where: { id: order.id }, data: { status: "COMPLETED" } });
    await tx.payment.updateMany({ where: { orderId: order.id, provider: "apple" }, data: { status: "SUCCEEDED" } });
    // Kein eigener Status „zurückgenommen“: FAILED = Erstattung hat nicht stattgefunden (zählt nirgends mehr)
    await tx.refund.updateMany({ where: { providerRef: `apple-refund:${transactionId}` }, data: { status: "FAILED", reason: "Erstattung von Apple zurückgenommen" } });
    await tx.orderEvent.create({ data: { orderId: order.id, from: order.status, to: "COMPLETED", note: "Apple hat die Erstattung zurückgenommen – Download wieder freigeschaltet" } });
    await audit({ action: "appstore.refund_reversed", targetType: "Order", targetId: order.id, meta: { transactionId } }, tx);
    await notify({ recipientId: order.shop.ownerId, type: "ORDER_STATUS", bundle: false, data: { number: order.number, title, status: "COMPLETED", note: `Apple hat die Erstattung zurückgenommen.${transferStatus === "PENDING" ? " Dein Anteil wird erneut überwiesen." : ""}`, href: `/studio/bestellungen/${order.id}` } }, tx);
    await notify({ recipientId: order.buyerId, type: "ORDER_STATUS", bundle: false, data: { number: order.number, title, status: "COMPLETED", note: "Apple hat die Erstattung zurückgenommen. Dein Download ist wieder verfügbar.", href: `/bestellungen/${order.id}` } }, tx);
    return true;
  });
  if (!applied) return "ignored" as const;
  if (transferStatus === "PENDING") await sendSellerTransfer(p.id).catch((e) => captureError(e, { source: "SERVER", path: "appstore.transfer" }));
  log("info", "appstore_refund_reversed", { orderId: order.id });
  return "restored" as const;
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
  // Doppelte Zustellung: Apple wiederholt bei Fehlern; Ereignis-ID als Schlüssel. Als erledigt gilt ein
  // Ereignis erst mit processedAt – brach ein früherer Durchlauf ab (Deploy, Absturz), wird es erneut verarbeitet.
  const eventId = `apple:${n.notificationUUID}`;
  try {
    await db.webhookEvent.create({ data: { id: eventId, provider: "apple", type: n.notificationType, payload: { notificationType: n.notificationType, subtype: n.subtype ?? null } } });
  } catch (e) {
    if ((e as { code?: string }).code !== "P2002") throw e;
    const seen = await db.webhookEvent.findUnique({ where: { id: eventId }, select: { processedAt: true } });
    if (seen?.processedAt) return 200;
  }
  try {
    const sub = n.data?.signedTransactionInfo ? verifyAppStoreJws<AppStoreTransaction>(n.data.signedTransactionInfo) : null;
    if (sub && isProAppleProduct(sub.productId)) {
      // Creator Pro (Abo): Verlängerung, Kündigung, Ablauf, Zahlungsproblem, Erstattung
      const known = await handleAppleProNotification(n.notificationType, sub, n.data?.signedRenewalInfo);
      log("info", "appstore_pro_notification", { type: n.notificationType, subtype: n.subtype, known });
    } else if ((n.notificationType === "REFUND" || n.notificationType === "REVOKE") && n.data?.signedTransactionInfo) {
      const t = verifyAppStoreJws<AppStoreTransaction>(n.data.signedTransactionInfo);
      // Unterstützer-Abo (Apple-Monat) oder digitales Produkt
      const { handleAppleSupportRefund } = await import("@/server/supporters/service");
      if (!(await handleAppleSupportRefund(t.transactionId))) await revokePurchase(t.transactionId, n.notificationType === "REFUND" ? "Erstattung durch Apple" : "Kauf widerrufen");
    } else if (n.notificationType === "REFUND_REVERSED" && n.data?.signedTransactionInfo) {
      const t = verifyAppStoreJws<AppStoreTransaction>(n.data.signedTransactionInfo);
      await restorePurchase(t.transactionId);
    } else {
      log("info", "appstore_notification", { type: n.notificationType, subtype: n.subtype });
    }
    await db.webhookEvent.update({ where: { id: eventId }, data: { processedAt: new Date(), error: null } });
    return 200;
  } catch (e) {
    // Bleibt unerledigt (ohne processedAt) – Apple stellt erneut zu und der nächste Durchlauf verarbeitet es
    await db.webhookEvent
      .update({ where: { id: eventId }, data: { error: (e instanceof Error ? e.message : String(e)).slice(0, 500), attempts: { increment: 1 } } })
      .catch(() => {});
    captureError(e, { source: "SERVER", path: "/api/webhooks/apple" });
    return 500;
  }
}
