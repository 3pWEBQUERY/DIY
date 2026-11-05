import "server-only";
import Stripe from "stripe";
import { env, features } from "@/server/env";
import { fail } from "@/server/errors";

/**
 * Stripe-Adapter (PRD §13.6, §25.7) – Stripe Connect Express, Destination Charges.
 *
 * Betriebsarten:
 * - "stripe":    STRIPE_SECRET_KEY gesetzt → echte Zahlungen.
 * - "simulated": kein Key UND nicht Produktion → klar gekennzeichneter Testmodus, damit der
 *                Ablauf lokal Ende-zu-Ende geprüft werden kann. Er nutzt dieselben
 *                Verbuchungsfunktionen wie die Webhooks (kein Sonderweg für "bezahlt").
 * - "disabled":  Produktion ohne Key → „Zahlungen noch nicht aktiviert“.
 *
 * Kartendaten berühren unsere Server nie (Stripe Checkout, gehostet).
 */
export type PaymentsMode = "stripe" | "simulated" | "disabled";

export function paymentsMode(): PaymentsMode {
  if (features.payments()) return "stripe";
  return env().NODE_ENV === "production" ? "disabled" : "simulated";
}

export const PAYMENTS_DISABLED_MESSAGE = "Zahlungen sind noch nicht aktiviert. Bitte versuche es später erneut.";

let client: Stripe | null = null;

/** Stripe-Client oder Fehler, wenn Zahlungen nicht konfiguriert sind. */
export function stripe(): Stripe {
  const key = env().STRIPE_SECRET_KEY;
  if (!key) throw fail.unavailable(PAYMENTS_DISABLED_MESSAGE);
  if (!client) {
    client = new Stripe(key, {
      maxNetworkRetries: 2,
      timeout: 20_000,
      appInfo: { name: "Werkuno Marktplatz" },
    });
  }
  return client;
}

export function appUrl(path = "") {
  return new URL(path, env().APP_URL).toString();
}

/* ───────────────────────── Connect: Verkäuferkonten ───────────────────────── */

export async function createExpressAccount(input: { shopId: string; email: string; country: string; sellerType: "PRIVATE" | "BUSINESS"; shopUrl: string; shopName: string }) {
  return stripe().accounts.create(
    {
      type: "express",
      country: input.country,
      email: input.email,
      business_type: input.sellerType === "BUSINESS" ? "company" : "individual",
      capabilities: { card_payments: { requested: true }, transfers: { requested: true } },
      business_profile: { url: input.shopUrl, name: input.shopName, product_description: "Handgemachte Produkte und DIY-Materialien über Werkuno" },
      metadata: { shopId: input.shopId },
    },
    { idempotencyKey: `acct-create:${input.shopId}` },
  );
}

export async function createOnboardingLink(accountId: string) {
  const link = await stripe().accountLinks.create({
    account: accountId,
    type: "account_onboarding",
    refresh_url: appUrl("/studio/shop?stripe=erneut"),
    return_url: appUrl("/studio/shop?stripe=zurueck"),
  });
  return link.url;
}

export async function createDashboardLink(accountId: string) {
  const link = await stripe().accounts.createLoginLink(accountId);
  return link.url;
}

export async function retrieveAccount(accountId: string) {
  return stripe().accounts.retrieve(accountId);
}

/** Relevante Felder eines Connect-Kontos für unsere Verifizierungslogik. */
export function accountStatus(a: Pick<Stripe.Account, "id" | "charges_enabled" | "payouts_enabled" | "details_submitted" | "requirements">) {
  return {
    accountId: a.id,
    chargesEnabled: !!a.charges_enabled,
    payoutsEnabled: !!a.payouts_enabled,
    detailsSubmitted: !!a.details_submitted,
    disabledReason: a.requirements?.disabled_reason ?? null,
    currentlyDue: a.requirements?.currently_due?.length ?? 0,
  };
}

/* ───────────────────────── Checkout ───────────────────────── */

export type CheckoutLine = { name: string; description?: string; unitMinor: number; quantity: number };

export async function createCheckoutSession(input: {
  orderId: string;
  orderNumber: string;
  buyerId: string;
  buyerEmail: string;
  currency: string;
  lines: CheckoutLine[];
  shippingMinor: number;
  applicationFeeMinor: number;
  destinationAccountId: string;
  expiresAt: Date;
  idempotencyKey: string;
}) {
  const currency = input.currency.toLowerCase();
  const line_items: Stripe.Checkout.SessionCreateParams.LineItem[] = input.lines.map((l) => ({
    quantity: l.quantity,
    price_data: {
      currency,
      unit_amount: l.unitMinor,
      product_data: { name: l.name.slice(0, 250), ...(l.description ? { description: l.description.slice(0, 500) } : {}) },
    },
  }));
  if (input.shippingMinor > 0) {
    line_items.push({ quantity: 1, price_data: { currency, unit_amount: input.shippingMinor, product_data: { name: "Versand" } } });
  }
  const metadata = { orderId: input.orderId, orderNumber: input.orderNumber, buyerId: input.buyerId };
  return stripe().checkout.sessions.create(
    {
      mode: "payment",
      line_items,
      customer_email: input.buyerEmail,
      client_reference_id: input.orderId,
      locale: "de",
      expires_at: Math.floor(input.expiresAt.getTime() / 1000),
      success_url: appUrl(`/kasse/erfolg?bestellung=${input.orderId}`),
      cancel_url: appUrl(`/kasse/abgebrochen?bestellung=${input.orderId}`),
      metadata,
      payment_intent_data: {
        application_fee_amount: input.applicationFeeMinor,
        transfer_data: { destination: input.destinationAccountId },
        description: `Werkuno Bestellung ${input.orderNumber}`,
        metadata,
      },
    },
    { idempotencyKey: input.idempotencyKey },
  );
}

export async function retrieveCheckoutSession(id: string) {
  return stripe().checkout.sessions.retrieve(id);
}

/** Offene Session beenden, damit nach Freigabe der Reservierung nicht mehr bezahlt werden kann. */
export async function expireCheckoutSession(id: string) {
  try {
    const s = await stripe().checkout.sessions.retrieve(id);
    if (s.status === "open") return await stripe().checkout.sessions.expire(id);
    return s;
  } catch (e) {
    console.error(JSON.stringify({ level: "warn", msg: "stripe_session_expire_failed", err: e instanceof Error ? e.message : String(e) }));
    return null;
  }
}

/* ───────────────────────── Erstattungen ───────────────────────── */

/**
 * Erstattung einer Destination Charge: Transfer wird anteilig zurückgeholt und die
 * Plattformgebühr anteilig zurückerstattet (Provision nur auf abgeschlossene Umsätze, §22.2).
 */
export async function createRefund(input: { paymentIntentId: string; amountMinor: number; refundId: string; orderId: string; reason?: string }) {
  return stripe().refunds.create(
    {
      payment_intent: input.paymentIntentId,
      amount: input.amountMinor,
      reverse_transfer: true,
      refund_application_fee: true,
      metadata: { orderId: input.orderId, refundId: input.refundId, ...(input.reason ? { reason: input.reason.slice(0, 450) } : {}) },
    },
    { idempotencyKey: `refund:${input.refundId}` },
  );
}

export async function listRefunds(paymentIntentId: string) {
  const res = await stripe().refunds.list({ payment_intent: paymentIntentId, limit: 100 });
  return res.data;
}

/* ───────────────────────── Webhooks ───────────────────────── */

/**
 * Prüft die Signatur gegen das Plattform- und (falls gesetzt) das Connect-Webhook-Secret.
 * `raw` muss der unveränderte Request-Body sein.
 */
export function verifyWebhook(raw: string, signature: string | null): Stripe.Event {
  const secrets = [env().STRIPE_WEBHOOK_SECRET, env().STRIPE_CONNECT_WEBHOOK_SECRET].filter((s): s is string => !!s);
  if (!secrets.length) throw fail.unavailable("Webhook-Secret ist nicht konfiguriert.");
  if (!signature) throw fail.invalid("Signatur fehlt.");
  const verifier = client ?? (env().STRIPE_SECRET_KEY ? stripe() : null);
  const webhooks = verifier?.webhooks ?? Stripe.webhooks;
  let lastError: unknown;
  for (const secret of secrets) {
    try {
      return webhooks.constructEvent(raw, signature, secret);
    } catch (e) {
      lastError = e;
    }
  }
  throw fail.invalid(lastError instanceof Error ? `Ungültige Signatur: ${lastError.message}` : "Ungültige Signatur.");
}

export type { Stripe };
