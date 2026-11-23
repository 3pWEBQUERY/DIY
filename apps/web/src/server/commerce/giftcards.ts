import "server-only";
import type Stripe from "stripe";
import {
  GIFT_CARD_DEFAULT_MONTHS,
  formatGiftCode,
  formatMoney,
  giftCardPurchaseSchema,
  giftCardSettingsSchema,
  maskGiftCode,
  normalizeGiftCode,
  type Currency,
} from "@werkraum/shared";
import { db, type Prisma } from "@/server/db";
import { fail } from "@/server/errors";
import { rateLimit } from "@/server/ratelimit";
import { audit } from "@/server/audit";
import { notify } from "@/server/notifications";
import { sendMail } from "@/server/mail";
import { captureError } from "@/server/monitoring";
import { humanCode } from "@/server/crypto";
import { requireFlag } from "@/server/flags";
import { requireAdult } from "@/server/auth/adult";
import type { SessionUser } from "@/server/auth/session";
import { BRAND } from "@/config/brand";
import { feeResolver } from "./fees";
import { localize, priceContextFor, type PriceContext } from "./currency";
import { appUrl, excludedPaymentMethods, isStripeError, paymentsMode, PAYMENTS_DISABLED_MESSAGE, stripe } from "./stripe";
import { requireOwnShop } from "./shops";
import { balanceInOrderCurrency, debitForApplied, feeAfterGiftCard, giftAmountAllowed, giftCardExpiry, planGiftCardUse } from "./giftcard-rules";

/**
 * Geschenkgutscheine je Shop.
 *
 * Kauf: eigene Stripe-Checkout-Session (Destination Charge an den Shop wie eine Bestellung). Die Provision
 * fällt beim Kauf an – beim Einlösen nur noch auf den bar bezahlten Teil (keine doppelte Provision). Der Shop
 * erhält das Geld also schon beim Kauf; beim Einlösen sinkt entsprechend der Betrag, den die Käuferin an der
 * Kasse über Stripe bezahlt (Order.giftCardMinor), und damit die Auszahlung dieser Bestellung.
 *
 * Einlösen: Code im Warenkorb bzw. an der Kasse; nur im ausstellenden Shop. Teilbeträge bleiben als
 * Guthaben. Storno, Abbruch vor der Zahlung oder Vollerstattung bucht das Guthaben zurück.
 */

const CODE_LENGTH = 16; // 32 Zeichen Alphabet → 80 Bit

export type GiftCardStatus = "PENDING" | "ACTIVE" | "CANCELLED" | "REFUNDED";

function money(minor: number, currency: string) {
  return formatMoney(minor, currency as Currency);
}

async function newCode(tx: Prisma.TransactionClient | typeof db = db) {
  for (let i = 0; i < 6; i++) {
    const code = humanCode(CODE_LENGTH);
    if (!(await tx.giftCard.findUnique({ where: { code }, select: { id: true } }))) return code;
  }
  throw new Error("Kein freier Gutscheincode gefunden");
}

/* ───────────────────────── Einstellungen (Studio) ───────────────────────── */

const DEFAULT_SETTINGS = { enabled: false, amounts: [2500, 5000, 10000], customEnabled: true, customMinMinor: 1000, customMaxMinor: 30000, validityMonths: GIFT_CARD_DEFAULT_MONTHS, note: "" };

export async function giftCardSettings(shopId: string) {
  const s = await db.shopGiftCardSettings.findUnique({ where: { shopId } });
  return s ? { enabled: s.enabled, amounts: s.amounts, customEnabled: s.customEnabled, customMinMinor: s.customMinMinor, customMaxMinor: s.customMaxMinor, validityMonths: s.validityMonths, note: s.note } : DEFAULT_SETTINGS;
}

export async function saveGiftCardSettings(user: Pick<SessionUser, "id">, input: unknown) {
  const shop = await requireOwnShop(user, { writable: true });
  const d = giftCardSettingsSchema.parse(input);
  const amounts = [...new Set(d.amounts)].sort((a, b) => a - b);
  const data = { enabled: d.enabled, amounts, customEnabled: d.customEnabled, customMinMinor: d.customMinMinor, customMaxMinor: d.customMaxMinor, validityMonths: d.validityMonths, note: d.note };
  await db.shopGiftCardSettings.upsert({ where: { shopId: shop.id }, create: { shopId: shop.id, ...data }, update: data });
  await audit({ actorId: user.id, action: d.enabled ? "giftcard.settings_saved" : "giftcard.disabled", targetType: "Shop", targetId: shop.id });
  return { ...data };
}

/** Studio: Einstellungen, Kennzahlen und verkaufte Gutscheine (Code maskiert) */
export async function giftCardStudio(user: Pick<SessionUser, "id">) {
  const shop = await requireOwnShop(user);
  const [settings, cards] = await Promise.all([
    giftCardSettings(shop.id),
    db.giftCard.findMany({
      where: { shopId: shop.id, status: { in: ["ACTIVE", "REFUNDED"] } },
      orderBy: { createdAt: "desc" },
      take: 200,
      include: { redemptions: { where: { reversedAt: null }, select: { amountMinor: true, createdAt: true, order: { select: { id: true, number: true } } } } },
    }),
  ]);
  const active = cards.filter((c) => c.status === "ACTIVE");
  return {
    shop: { id: shop.id, slug: shop.slug, name: shop.name, currency: shop.currency },
    settings,
    stats: {
      sold: active.length,
      soldMinor: active.reduce((s, c) => s + c.initialMinor, 0),
      openMinor: active.filter((c) => c.expiresAt > new Date()).reduce((s, c) => s + c.balanceMinor, 0),
      redeemedMinor: active.reduce((s, c) => s + (c.initialMinor - c.balanceMinor), 0),
    },
    cards: cards.map((c) => ({
      id: c.id,
      code: maskGiftCode(c.code),
      status: c.status as GiftCardStatus,
      currency: c.currency,
      initialMinor: c.initialMinor,
      balanceMinor: c.balanceMinor,
      recipientName: c.recipientName,
      createdAt: c.createdAt.toISOString(),
      expiresAt: c.expiresAt.toISOString(),
      delivered: !!c.deliveredAt,
      deliverAt: c.deliverAt.toISOString(),
      expired: c.expiresAt < new Date(),
      /** Erstattbar: noch nie (auch nicht teilweise) eingelöst */
      refundable: c.status === "ACTIVE" && c.balanceMinor === c.initialMinor && c.redemptions.length === 0,
      redemptions: c.redemptions.map((r) => ({ amountMinor: r.amountMinor, createdAt: r.createdAt.toISOString(), orderId: r.order.id, orderNumber: r.order.number })),
    })),
  };
}

/** Studio: unbenutzten Gutschein stornieren und den Kauf vollständig erstatten (inkl. Provision). */
export async function refundGiftCardBySeller(user: Pick<SessionUser, "id">, giftCardId: string) {
  const shop = await requireOwnShop(user, { writable: true });
  await rateLimit(`giftcard-refund:${user.id}`, 30, 3600);
  const card = await db.giftCard.findUnique({ where: { id: giftCardId }, include: { redemptions: { where: { reversedAt: null }, select: { id: true } } } });
  if (!card || card.shopId !== shop.id) throw fail.notFound();
  if (card.status !== "ACTIVE") throw fail.conflict("Dieser Gutschein ist nicht aktiv.");
  if (card.balanceMinor !== card.initialMinor || card.redemptions.length) throw fail.conflict("Der Gutschein wurde schon eingelöst und kann nicht mehr erstattet werden.");
  // Zuerst sperren (Guthaben 0), damit er während der Erstattung nicht eingelöst wird
  const locked = await db.giftCard.updateMany({ where: { id: card.id, status: "ACTIVE", balanceMinor: card.initialMinor }, data: { status: "REFUNDED", balanceMinor: 0, refundedAt: new Date() } });
  if (locked.count !== 1) throw fail.conflict("Der Gutschein wurde gerade verwendet.");
  await db.cartGiftCard.deleteMany({ where: { giftCardId: card.id } });
  if (card.paymentIntentId && paymentsMode() === "stripe") {
    try {
      await stripe().refunds.create(
        { payment_intent: card.paymentIntentId, reverse_transfer: true, refund_application_fee: true, metadata: { kind: "giftcard", giftCardId: card.id } },
        { idempotencyKey: `giftcard-refund:${card.id}` },
      );
    } catch (e) {
      // Erstattung gescheitert → Gutschein wieder aktiv, nichts verloren
      await db.giftCard.update({ where: { id: card.id }, data: { status: "ACTIVE", balanceMinor: card.initialMinor, refundedAt: null } });
      await captureError(e, { source: "SERVER", path: "giftcard.refund", userId: user.id, meta: { giftCardId: card.id } });
      throw fail.unavailable(isStripeError(e) ? "Die Erstattung konnte beim Zahlungsanbieter nicht ausgelöst werden. Bitte versuche es später erneut." : "Die Erstattung ist fehlgeschlagen.");
    }
  }
  await audit({ actorId: user.id, action: "giftcard.refunded", targetType: "Shop", targetId: shop.id, meta: { giftCardId: card.id, amountMinor: card.paidMinor } });
  if (card.purchaserId) {
    await notify({ recipientId: card.purchaserId, type: "ORDER_STATUS", bundle: false, data: { kind: "giftcard", text: `Dein Geschenkgutschein für ${shop.name} wurde storniert und erstattet.`, note: `${money(card.paidMinor, card.paidCurrency)} gehen zurück auf dein Zahlungsmittel.`, href: "/geschenkgutscheine" } });
  }
  return { refundedMinor: card.paidMinor, currency: card.paidCurrency };
}

/* ───────────────────────── Angebot (Shop-Seite) ───────────────────────── */

/** Was die Shop-Seite zeigt. null = der Shop bietet keine Geschenkgutscheine an. */
export async function giftCardOffer(shopSlug: string, viewerId: string | null | undefined) {
  const shop = await db.shop.findUnique({
    where: { slug: shopSlug },
    select: { id: true, slug: true, name: true, status: true, currency: true, ownerId: true, chargesEnabled: true, stripeAccountId: true, giftCardSettings: true, owner: { select: { status: true } } },
  });
  if (!shop || shop.status !== "ACTIVE" || shop.owner.status !== "ACTIVE" || !shop.giftCardSettings?.enabled) return null;
  const s = shop.giftCardSettings;
  const ctx = await priceContextFor(viewerId);
  const conv = (m: number) => localize(ctx, m, shop.currency);
  return {
    shop: { id: shop.id, slug: shop.slug, name: shop.name, currency: shop.currency },
    isOwner: viewerId === shop.ownerId,
    payable: paymentsMode() === "simulated" || (paymentsMode() === "stripe" && !!shop.stripeAccountId && shop.chargesEnabled),
    amounts: s.amounts.map((a) => ({ valueMinor: a, payMinor: conv(a) })),
    custom: s.customEnabled ? { minMinor: s.customMinMinor, maxMinor: s.customMaxMinor } : null,
    validityMonths: s.validityMonths,
    note: s.note,
    /** Bezahlt wird in der Währung der Käufer:in; Wert und Guthaben bleiben in der Shop-Währung */
    payCurrency: ctx.currency,
    converted: ctx.currency !== shop.currency,
  };
}

/* ───────────────────────── Kauf ───────────────────────── */

function parseDeliverAt(raw: string | null | undefined, now: Date) {
  if (!raw) return now;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) throw fail.invalid("Ungültiges Zustelldatum.", { deliverAt: "Ungültiges Datum" });
  if (d.getTime() > now.getTime() + 366 * 86_400_000) throw fail.invalid("Höchstens ein Jahr im Voraus.", { deliverAt: "Höchstens ein Jahr im Voraus" });
  return d < now ? now : d;
}

/** Kauf starten → URL zum Bezahlen (Stripe) bzw. zur Bestätigung (Testmodus). */
export async function startGiftCardPurchase(user: SessionUser, input: unknown) {
  const d = giftCardPurchaseSchema.parse(input);
  await requireFlag("marketplace", user.id);
  const mode = paymentsMode();
  if (mode === "disabled") throw fail.unavailable(PAYMENTS_DISABLED_MESSAGE);
  await requireAdult(user);
  await rateLimit(`giftcard-buy:${user.id}`, 10, 3600);
  const shop = await db.shop.findUnique({
    where: { id: d.shopId },
    select: { id: true, slug: true, name: true, status: true, currency: true, ownerId: true, stripeAccountId: true, chargesEnabled: true, giftCardSettings: true, owner: { select: { status: true } } },
  });
  const s = shop?.giftCardSettings;
  if (!shop || !s?.enabled || shop.status !== "ACTIVE" || shop.owner.status !== "ACTIVE") throw fail.notFound("Dieser Shop bietet gerade keine Geschenkgutscheine an.");
  if (shop.ownerId === user.id) throw fail.invalid("Für deinen eigenen Shop kannst du keinen Gutschein kaufen.");
  if (mode === "stripe" && (!shop.stripeAccountId || !shop.chargesEnabled)) throw fail.conflict("Der Shop kann gerade keine Zahlungen annehmen.");
  if (!giftAmountAllowed(d.amountMinor, s)) throw fail.invalid("Dieser Betrag ist nicht verfügbar.", { amountMinor: "Bitte wähle einen angebotenen Betrag" });
  const blocked = await db.userBlock.findFirst({ where: { OR: [{ blockerId: user.id, blockedId: shop.ownerId }, { blockerId: shop.ownerId, blockedId: user.id }] }, select: { blockerId: true } });
  if (blocked) throw fail.forbidden("Bei diesem Shop ist derzeit kein Kauf möglich.");

  const now = new Date();
  const deliverAt = parseDeliverAt(d.deliverAt, now);
  const ctx = await priceContextFor(user.id);
  const paidMinor = localize(ctx, d.amountMinor, shop.currency);
  const feeBps = (await feeResolver([shop.id]))(shop.id);
  const platformFeeMinor = Math.round((paidMinor * feeBps) / 10_000);
  // Offene, nie bezahlte Käufe dieser Person verwerfen (Abbruch und neuer Versuch)
  await db.giftCard.updateMany({ where: { purchaserId: user.id, status: "PENDING", createdAt: { lt: new Date(now.getTime() - 60 * 60_000) } }, data: { status: "CANCELLED" } });
  const card = await db.giftCard.create({
    data: {
      code: await newCode(),
      shopId: shop.id,
      currency: shop.currency,
      initialMinor: d.amountMinor,
      balanceMinor: d.amountMinor,
      status: "PENDING",
      purchaserId: user.id,
      senderName: d.senderName,
      recipientEmail: d.recipientEmail,
      recipientName: d.recipientName,
      message: d.message,
      deliverAt,
      expiresAt: giftCardExpiry(deliverAt, s.validityMonths),
      paidCurrency: ctx.currency,
      paidMinor,
      feeBps,
      platformFeeMinor,
    },
  });

  if (mode === "simulated") {
    await activateGiftCard(card.id, { paymentIntentId: null });
    return { url: `/geschenkgutscheine?gekauft=${card.id}`, giftCardId: card.id };
  }
  try {
    const excluded = [...new Set([...(await excludedPaymentMethods()), "klarna" as const])];
    const metadata = { kind: "giftcard", giftCardId: card.id, buyerId: user.id };
    const session = await stripe().checkout.sessions.create(
      {
        mode: "payment",
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: ctx.currency.toLowerCase(),
              unit_amount: paidMinor,
              product_data: { name: `Geschenkgutschein ${shop.name}`.slice(0, 250), description: `Wert ${money(d.amountMinor, shop.currency)} · für ${d.recipientName}`.slice(0, 500) },
            },
          },
        ],
        excluded_payment_method_types: excluded,
        customer_email: user.email,
        client_reference_id: user.id,
        locale: "de",
        expires_at: Math.floor((now.getTime() + 31 * 60_000) / 1000),
        success_url: appUrl(`/geschenkgutscheine?gekauft=${card.id}&session_id={CHECKOUT_SESSION_ID}`),
        cancel_url: appUrl(`/markt/${shop.slug}/geschenkgutschein?abgebrochen=1`),
        metadata,
        payment_intent_data: {
          application_fee_amount: platformFeeMinor,
          transfer_data: { destination: shop.stripeAccountId! },
          description: `${BRAND.name} Geschenkgutschein ${shop.name}`,
          metadata,
        },
      },
      { idempotencyKey: `giftcard-session:${card.id}` },
    );
    await db.giftCard.update({ where: { id: card.id }, data: { checkoutSessionId: session.id } });
    if (!session.url) throw new Error("Checkout ohne URL");
    return { url: session.url, giftCardId: card.id };
  } catch (e) {
    await db.giftCard.update({ where: { id: card.id }, data: { status: "CANCELLED" } }).catch(() => {});
    if (!isStripeError(e)) throw e;
    await captureError(e, { source: "SERVER", path: "giftcard.checkout", userId: user.id });
    throw fail.unavailable("Die Zahlung konnte gerade nicht gestartet werden. Es wurde nichts belastet – bitte versuche es erneut.");
  }
}

/** Bezahlter Kauf → Gutschein aktiv; Zustellung sofort oder zum gewählten Zeitpunkt (Worker). */
export async function activateGiftCard(id: string, opts: { paymentIntentId: string | null }) {
  const now = new Date();
  const done = await db.giftCard.updateMany({ where: { id, status: { in: ["PENDING", "CANCELLED"] }, paidAt: null }, data: { status: "ACTIVE", paidAt: now, paymentIntentId: opts.paymentIntentId } });
  if (done.count !== 1) return false;
  const card = await db.giftCard.findUniqueOrThrow({ where: { id }, include: { shop: { select: { name: true, ownerId: true } } } });
  await notify({
    recipientId: card.shop.ownerId,
    type: "ORDER_NEW",
    bundle: false,
    data: { title: `Geschenkgutschein über ${money(card.initialMinor, card.currency)}`, href: "/studio/geschenkgutscheine" },
  });
  if (card.deliverAt <= now) await deliverGiftCard(card.id);
  return true;
}

/** Rückkehr aus Stripe Checkout: sofort übernehmen (Webhook kann einen Moment dauern). */
export async function confirmGiftCardCheckout(userId: string, giftCardId: string, sessionId: string | null | undefined) {
  if (paymentsMode() !== "stripe" || !sessionId || !/^cs_[\w]+$/.test(sessionId)) return;
  try {
    const s = await stripe().checkout.sessions.retrieve(sessionId);
    if (s.metadata?.kind !== "giftcard" || s.metadata?.giftCardId !== giftCardId || s.client_reference_id !== userId) return;
    if (s.payment_status === "paid") await activateGiftCard(giftCardId, { paymentIntentId: typeof s.payment_intent === "string" ? s.payment_intent : (s.payment_intent?.id ?? null) });
  } catch {
    // Webhook übernimmt
  }
}

/** Stripe-Webhook: true, wenn das Ereignis einen Gutscheinkauf betraf. */
export async function handleGiftCardStripeEvent(event: Stripe.Event) {
  if (!event.type.startsWith("checkout.session.")) return false;
  const s = event.data.object as Stripe.Checkout.Session;
  if (s.metadata?.kind !== "giftcard") return false;
  const id = s.metadata.giftCardId;
  if (!id) return true;
  if ((event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") && s.payment_status === "paid") {
    await activateGiftCard(id, { paymentIntentId: typeof s.payment_intent === "string" ? s.payment_intent : (s.payment_intent?.id ?? null) });
  } else if (event.type === "checkout.session.expired" || event.type === "checkout.session.async_payment_failed") {
    await db.giftCard.updateMany({ where: { id, status: "PENDING" }, data: { status: "CANCELLED" } });
  }
  return true;
}

/* ───────────────────────── Zustellung ───────────────────────── */

async function deliverGiftCard(id: string) {
  // Genau einmal zustellen (paralleler Worker / Rückkehr aus dem Checkout)
  const claimed = await db.giftCard.updateMany({ where: { id, status: "ACTIVE", deliveredAt: null }, data: { deliveredAt: new Date() } });
  if (claimed.count !== 1) return false;
  const c = await db.giftCard.findUniqueOrThrow({ where: { id }, include: { shop: { select: { name: true, slug: true } } } });
  const value = money(c.initialMinor, c.currency);
  const until = c.expiresAt.toLocaleDateString("de-CH", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Zurich" });
  const text = [
    `Hallo ${c.recipientName}`,
    `${c.senderName} schenkt dir einen Gutschein über ${value} für den Shop „${c.shop.name}“ auf ${BRAND.name}.`,
    c.message ? `„${c.message}“` : "",
    `Dein Code: ${formatGiftCode(c.code)}`,
    `Gültig bis ${until}. Lege Artikel aus dem Shop in den Warenkorb und gib den Code beim Shop ein – was übrig bleibt, bleibt dir als Guthaben.`,
  ]
    .filter(Boolean)
    .join("\n\n");
  try {
    await sendMail(c.recipientEmail, `${c.senderName} schenkt dir einen Gutschein für ${c.shop.name}`, text, {
      eyebrow: "Geschenkgutschein",
      heading: `Ein Gutschein über ${value}`,
      preheader: `Von ${c.senderName} – einlösbar bei ${c.shop.name}`,
      cta: { label: "Gutschein ansehen", url: appUrl(`/geschenkgutscheine?code=${c.code}`) },
    });
  } catch (e) {
    // Zustellung später erneut versuchen
    await db.giftCard.update({ where: { id }, data: { deliveredAt: null } });
    await captureError(e, { source: "WORKER", path: "giftcard.deliver", meta: { giftCardId: id } });
    return false;
  }
  // Mit Konto: auch als Benachrichtigung
  const recipient = await db.user.findUnique({ where: { email: c.recipientEmail }, select: { id: true, status: true } });
  if (recipient && recipient.status === "ACTIVE") {
    await notify({ recipientId: recipient.id, type: "ORDER_STATUS", bundle: false, data: { kind: "giftcard", text: `${c.senderName} schenkt dir einen Gutschein über ${value} für ${c.shop.name}.`, note: c.message || null, href: "/geschenkgutscheine" } });
  }
  if (c.purchaserId) {
    await notify({ recipientId: c.purchaserId, type: "ORDER_STATUS", bundle: false, data: { kind: "giftcard", text: `Dein Geschenkgutschein für ${c.recipientName} wurde zugestellt.`, note: null, href: "/geschenkgutscheine" } });
  }
  return true;
}

/** Worker: geplante Gutscheine zustellen */
export async function deliverDueGiftCards(now = new Date(), take = 100) {
  const due = await db.giftCard.findMany({ where: { status: "ACTIVE", deliveredAt: null, deliverAt: { lte: now } }, orderBy: { deliverAt: "asc" }, take, select: { id: true } });
  let delivered = 0;
  for (const d of due) if (await deliverGiftCard(d.id)) delivered++;
  // Nie bezahlte Käufe nach einem Tag verwerfen
  await db.giftCard.updateMany({ where: { status: "PENDING", createdAt: { lt: new Date(now.getTime() - 24 * 3600_000) } }, data: { status: "CANCELLED" } });
  return { delivered };
}

/* ───────────────────────── Meine Gutscheine ───────────────────────── */

function cardView(c: Prisma.GiftCardGetPayload<{ include: { shop: { select: { name: true; slug: true } } } }>, viewerId: string, showCode: boolean) {
  const now = new Date();
  return {
    id: c.id,
    code: showCode ? formatGiftCode(c.code) : maskGiftCode(c.code),
    shop: { name: c.shop.name, slug: c.shop.slug },
    currency: c.currency,
    initialMinor: c.initialMinor,
    balanceMinor: c.balanceMinor,
    status: c.status as GiftCardStatus,
    expiresAt: c.expiresAt.toISOString(),
    expired: c.expiresAt < now,
    senderName: c.senderName,
    recipientName: c.recipientName,
    recipientEmail: c.purchaserId === viewerId ? c.recipientEmail : null,
    message: c.message,
    deliverAt: c.deliverAt.toISOString(),
    delivered: !!c.deliveredAt,
    paidMinor: c.purchaserId === viewerId ? c.paidMinor : null,
    paidCurrency: c.purchaserId === viewerId ? c.paidCurrency : null,
  };
}

/**
 * Erhaltene Gutscheine (per Code hinzugefügt oder an die bestätigte E-Mail-Adresse des Kontos) und gekaufte.
 * Gekaufte zeigen den Code erst nach der Zustellung – die Überraschung gehört der beschenkten Person.
 */
export async function myGiftCards(user: Pick<SessionUser, "id" | "email" | "emailVerifiedAt">) {
  const include = { shop: { select: { name: true, slug: true } } } as const;
  const [received, bought] = await Promise.all([
    db.giftCard.findMany({
      where: { status: "ACTIVE", deliveredAt: { not: null }, OR: [{ claimedById: user.id }, ...(user.emailVerifiedAt ? [{ recipientEmail: user.email.toLowerCase() }] : [])] },
      orderBy: { createdAt: "desc" },
      take: 100,
      include,
    }),
    db.giftCard.findMany({ where: { purchaserId: user.id, status: { in: ["ACTIVE", "REFUNDED"] } }, orderBy: { createdAt: "desc" }, take: 100, include }),
  ]);
  return {
    received: received.map((c) => cardView(c, user.id, true)),
    bought: bought.map((c) => cardView(c, user.id, c.purchaserId === user.id && !!c.deliveredAt)),
  };
}

/** Gutschein per Code dem eigenen Konto hinzufügen */
export async function claimGiftCard(user: Pick<SessionUser, "id">, rawCode: string) {
  await rateLimit(`giftcard-claim:${user.id}`, 20, 3600);
  const code = normalizeGiftCode(String(rawCode ?? ""));
  if (code.length !== CODE_LENGTH) throw fail.invalid("Bitte gib den vollständigen Code ein (16 Zeichen).", { code: "16 Zeichen" });
  const c = await db.giftCard.findUnique({ where: { code }, include: { shop: { select: { name: true, slug: true } } } });
  if (!c || c.status !== "ACTIVE") throw fail.notFound("Diesen Gutschein gibt es nicht oder er ist nicht mehr gültig.");
  if (c.claimedById && c.claimedById !== user.id) throw fail.conflict("Dieser Gutschein ist bereits einem anderen Konto zugeordnet.");
  if (!c.claimedById) await db.giftCard.update({ where: { id: c.id }, data: { claimedById: user.id, ...(c.deliveredAt ? {} : { deliveredAt: new Date() }) } });
  return cardView(c, user.id, true);
}

/* ───────────────────────── Warenkorb & Kasse ───────────────────────── */

export type CartGiftCardInfo = { id: string; code: string; currency: string; balanceMinor: number; status: string; expiresAt: Date };

/** Im Warenkorb hinterlegte Gutscheine je Shop */
export async function cartGiftCards(cartId: string | null | undefined, client: Prisma.TransactionClient | typeof db = db) {
  if (!cartId) return new Map<string, CartGiftCardInfo>();
  const rows = await client.cartGiftCard.findMany({ where: { cartId }, select: { shopId: true, giftCard: { select: { id: true, code: true, currency: true, balanceMinor: true, status: true, expiresAt: true } } } });
  return new Map(rows.map((r) => [r.shopId, r.giftCard]));
}

/** Problem eines Gutscheins für eine Bestellung (null = einlösbar) */
export function giftCardProblem(card: Pick<CartGiftCardInfo, "status" | "balanceMinor" | "expiresAt">, now = new Date()) {
  if (card.status !== "ACTIVE") return "Dieser Gutschein ist nicht mehr gültig.";
  if (card.expiresAt < now) return "Dieser Gutschein ist abgelaufen.";
  if (card.balanceMinor <= 0) return "Das Guthaben ist aufgebraucht.";
  return null;
}

/**
 * Anrechnung eines Gutscheins auf eine Shop-Bestellung (Warenkorb, Kasse – gleiche Rechnung).
 * goodsNet = Warenwert nach Rabatten; Beträge in der Bestellwährung.
 */
export function giftCardForOrder(card: CartGiftCardInfo, g: { goodsNetMinor: number; shippingMinor: number; feeBps: number }, orderCurrency: string, ctx: Pick<PriceContext, "eurChf">) {
  const problem = giftCardProblem(card);
  if (problem) return { appliedMinor: 0, debitMinor: 0, platformFeeMinor: Math.round((g.goodsNetMinor * g.feeBps) / 10_000), problem };
  const balance = balanceInOrderCurrency(card.balanceMinor, card.currency, orderCurrency, ctx.eurChf);
  const applied = planGiftCardUse({ goodsNetMinor: g.goodsNetMinor, shippingMinor: g.shippingMinor, balanceInOrderMinor: balance });
  return {
    appliedMinor: applied,
    debitMinor: debitForApplied(applied, card.balanceMinor, card.currency, orderCurrency, ctx.eurChf),
    platformFeeMinor: feeAfterGiftCard(g.goodsNetMinor, applied, g.feeBps),
    problem: applied === 0 ? "Der Gutschein kann bei dieser Bestellung nicht angerechnet werden." : null,
  };
}

/** Code im Warenkorb für den passenden Shop hinterlegen */
export async function applyGiftCardToCart(user: Pick<SessionUser, "id">, rawCode: string) {
  await rateLimit(`giftcard-apply:${user.id}`, 30, 3600);
  const code = normalizeGiftCode(String(rawCode ?? ""));
  if (code.length !== CODE_LENGTH) throw fail.invalid("Bitte gib den vollständigen Code ein (16 Zeichen).", { code: "16 Zeichen" });
  const card = await db.giftCard.findUnique({ where: { code }, include: { shop: { select: { id: true, name: true, ownerId: true } } } });
  if (!card || card.status !== "ACTIVE") throw fail.invalid("Diesen Gutschein gibt es nicht oder er ist nicht mehr gültig.", { code: "Unbekannter Code" });
  const problem = giftCardProblem(card);
  if (problem) throw fail.invalid(problem, { code: problem });
  if (card.shop.ownerId === user.id) throw fail.invalid("Gutscheine deines eigenen Shops kannst du nicht einlösen.", { code: "Eigener Shop" });
  if (card.claimedById && card.claimedById !== user.id) throw fail.invalid("Dieser Gutschein ist einem anderen Konto zugeordnet.", { code: "Anderes Konto" });
  const cart = await db.cart.findUnique({ where: { userId: user.id }, select: { id: true, items: { where: { product: { shopId: card.shopId } }, select: { id: true }, take: 1 } } });
  if (!cart || !cart.items.length) throw fail.invalid(`Dieser Gutschein gilt nur bei ${card.shop.name}. Lege zuerst Artikel aus diesem Shop in den Warenkorb.`, { code: `Nur bei ${card.shop.name}` });
  await db.cartGiftCard.upsert({ where: { cartId_shopId: { cartId: cart.id, shopId: card.shopId } }, create: { cartId: cart.id, shopId: card.shopId, giftCardId: card.id }, update: { giftCardId: card.id } });
  if (!card.claimedById) await db.giftCard.update({ where: { id: card.id }, data: { claimedById: user.id } });
  return { shopId: card.shopId, shopName: card.shop.name, balanceMinor: card.balanceMinor, currency: card.currency };
}

export async function removeGiftCardFromCart(user: Pick<SessionUser, "id">, shopId: string) {
  const cart = await db.cart.findUnique({ where: { userId: user.id }, select: { id: true } });
  if (cart) await db.cartGiftCard.deleteMany({ where: { cartId: cart.id, shopId } });
  return { removed: true };
}

/**
 * In der Checkout-Transaktion: Guthaben atomar abbuchen (nie unter 0 – zwei gleichzeitige Bestellungen
 * können denselben Gutschein nicht doppelt ausgeben) und die Einlösung festhalten.
 */
export async function debitGiftCardTx(tx: Prisma.TransactionClient, input: { giftCardId: string; orderId: string; debitMinor: number; appliedMinor: number }) {
  const n = await tx.$executeRaw`UPDATE "GiftCard" SET "balanceMinor" = "balanceMinor" - ${input.debitMinor}, "updatedAt" = NOW()
    WHERE id = ${input.giftCardId} AND status = 'ACTIVE' AND "expiresAt" > NOW() AND "balanceMinor" >= ${input.debitMinor}`;
  if (n !== 1) throw fail.conflict("Das Guthaben deines Geschenkgutscheins hat sich geändert. Bitte prüfe deine Bestellung erneut.");
  await tx.giftCardRedemption.create({ data: { giftCardId: input.giftCardId, orderId: input.orderId, amountMinor: input.debitMinor, orderAmountMinor: input.appliedMinor } });
}

/**
 * Guthaben einer Bestellung zurückbuchen (Abbruch vor der Zahlung, Storno, Vollerstattung) – je Einlösung
 * genau einmal. Abgelaufene Gutscheine erhalten das Guthaben trotzdem zurück (Kulanz: es war nicht verbraucht).
 */
export async function restoreGiftCardsTx(tx: Prisma.TransactionClient, orderId: string) {
  const rows = await tx.giftCardRedemption.findMany({ where: { orderId, reversedAt: null }, select: { id: true, giftCardId: true, amountMinor: true } });
  let restored = 0;
  for (const r of rows) {
    const claimed = await tx.giftCardRedemption.updateMany({ where: { id: r.id, reversedAt: null }, data: { reversedAt: new Date() } });
    if (claimed.count !== 1) continue;
    await tx.$executeRaw`UPDATE "GiftCard" SET "balanceMinor" = LEAST("initialMinor", "balanceMinor" + ${r.amountMinor}), "updatedAt" = NOW() WHERE id = ${r.giftCardId} AND status = 'ACTIVE'`;
    restored += r.amountMinor;
  }
  return restored;
}

/** Bestellansicht: mit Gutschein bezahlt (maskierter Code) */
export async function orderGiftCards(orderId: string) {
  const rows = await db.giftCardRedemption.findMany({ where: { orderId }, select: { orderAmountMinor: true, reversedAt: true, giftCard: { select: { code: true } } } });
  return rows.map((r) => ({ code: maskGiftCode(r.giftCard.code), amountMinor: r.orderAmountMinor, reversed: !!r.reversedAt }));
}
