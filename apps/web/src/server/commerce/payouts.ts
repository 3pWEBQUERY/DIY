import "server-only";
import { z } from "zod";
import { formatMoney, type Currency } from "@werkraum/shared";
import { db } from "@/server/db";
import { fail } from "@/server/errors";
import { notify } from "@/server/notifications";
import { rateLimit } from "@/server/ratelimit";
import type { SessionUser } from "@/server/auth/session";
import {
  connectedBalance,
  connectedPayoutSettings,
  createAccountUpdateLink,
  createConnectedPayout,
  isStripeError,
  listConnectedPayouts,
  paymentsMode,
  updatePayoutSchedule,
  type PayoutSchedule,
} from "./stripe";
import { requireOwnShop } from "./shops";
import { shopRevenue } from "./revenue";

/**
 * Auszahlungen über Werkuno (statt im Stripe-Dashboard):
 * - Guthaben (verfügbar / noch gesperrt) und Bankkonto anzeigen
 * - Auszahlungsplan wählen: auf Anfrage, täglich, wöchentlich, monatlich
 * - Auszahlung beantragen (Stripe erlaubt manuelle Auszahlungen nur im Plan „auf Anfrage“ –
 *   wir stellen auf Wunsch in einem Schritt um)
 * - Benachrichtigung bei jeder Auszahlung, auch bei automatischen von Stripe
 *   (Webhook `payout.*` und zusätzlich Abgleich im Worker)
 */

export type PayoutStatus = "pending" | "in_transit" | "paid" | "failed" | "canceled";

export const PAYOUT_STATUS_LABEL: Record<string, string> = {
  pending: "In Vorbereitung",
  in_transit: "Unterwegs",
  paid: "Gutgeschrieben",
  failed: "Fehlgeschlagen",
  canceled: "Storniert",
};

const FAILURE_LABEL: Record<string, string> = {
  account_closed: "Das Bankkonto ist geschlossen.",
  account_frozen: "Das Bankkonto ist gesperrt.",
  bank_account_restricted: "Das Bankkonto nimmt diese Zahlung nicht an.",
  could_not_process: "Die Bank konnte die Zahlung nicht verarbeiten.",
  invalid_account_number: "Die Kontonummer (IBAN) ist ungültig.",
  incorrect_account_holder_name: "Der Name der Kontoinhaberin bzw. des Kontoinhabers stimmt nicht.",
  invalid_currency: "Das Bankkonto unterstützt diese Währung nicht.",
  no_account: "Das Bankkonto wurde nicht gefunden.",
  insufficient_funds: "Das Guthaben reichte nicht aus.",
};

export function payoutFailureText(code: string | null | undefined, fallback?: string | null) {
  return (code && FAILURE_LABEL[code]) || fallback || "Die Bank hat die Zahlung zurückgewiesen.";
}

/* ───────────────────────── Verbuchen & benachrichtigen ───────────────────────── */

type ProviderPayout = { id: string; amount: number; currency: string; status: string; arrival_date: number | null; automatic?: boolean; failure_code?: string | null; failure_message?: string | null };

/**
 * Auszahlung speichern (Webhook oder Abgleich) und bei neuen Zuständen benachrichtigen:
 * unterwegs (nur automatische – beantragte hat die Person selbst ausgelöst), gutgeschrieben,
 * fehlgeschlagen/storniert. Jeder Zustand wird höchstens einmal gemeldet.
 */
export async function recordPayout(accountId: string, p: ProviderPayout) {
  const shop = await db.shop.findUnique({ where: { stripeAccountId: accountId }, select: { id: true, ownerId: true } });
  if (!shop) return null;
  return savePayout(shop, p);
}

async function savePayout(shop: { id: string; ownerId: string }, p: ProviderPayout) {
  const prev = await db.payoutRecord.findUnique({ where: { providerRef: p.id }, select: { notified: true, automatic: true, status: true } });
  const automatic = prev?.automatic ?? p.automatic ?? true;
  // Webhooks kommen nicht zwingend in Reihenfolge: ein Endzustand (gutgeschrieben, fehlgeschlagen,
  // storniert) wird nie durch ein verspätetes „unterwegs“ überschrieben
  const FINAL = ["paid", "failed", "canceled"];
  const stale = !!prev && FINAL.includes(prev.status) && !FINAL.includes(p.status);
  if (stale) return db.payoutRecord.findUniqueOrThrow({ where: { providerRef: p.id } });
  const data = {
    amountMinor: p.amount,
    currency: p.currency.toUpperCase(),
    status: p.status,
    arrivalAt: p.arrival_date ? new Date(p.arrival_date * 1000) : null,
    failureMessage: p.status === "failed" ? payoutFailureText(p.failure_code, p.failure_message) : null,
  };
  const rec = await db.payoutRecord.upsert({ where: { providerRef: p.id }, create: { shopId: shop.id, providerRef: p.id, automatic, ...data }, update: data });

  const notified = new Set(prev?.notified ?? []);
  const key = p.status === "pending" ? "in_transit" : p.status;
  const worth = key === "paid" || key === "failed" || key === "canceled" || (key === "in_transit" && automatic && !notified.has("paid"));
  // Meldung „beanspruchen“, bevor sie rausgeht: laufen Webhook und Abgleich gleichzeitig,
  // gewinnt nur einer (bedingtes Update) – keine doppelte Benachrichtigung
  const claimed = worth && !notified.has(key) ? (await db.payoutRecord.updateMany({ where: { id: rec.id, NOT: { notified: { has: key } } }, data: { notified: { push: key } } })).count === 1 : false;
  if (claimed) {
    const amount = formatMoney(p.amount, data.currency as Currency);
    await notify({
      recipientId: shop.ownerId,
      type: "ORDER_STATUS",
      bundle: false,
      data: {
        kind: "payout",
        status: key,
        amount,
        arrival: data.arrivalAt?.toISOString() ?? null,
        reason: data.failureMessage,
        automatic,
        href: "/studio/einnahmen#auszahlungen",
      },
    }).catch(() => {});
  }
  return rec;
}

/** Worker: Auszahlungen aller verbundenen Shops abgleichen (falls ein Webhook fehlt). */
export async function syncPayouts(limitShops = 200) {
  if (paymentsMode() !== "stripe") return 0;
  const shops = await db.shop.findMany({ where: { stripeAccountId: { not: null }, payoutsEnabled: true }, take: limitShops, select: { id: true, ownerId: true, stripeAccountId: true } });
  let n = 0;
  for (const s of shops) {
    try {
      const list = await listConnectedPayouts(s.stripeAccountId!, 10);
      for (const p of list) await savePayout(s, p);
      n += list.length;
    } catch (e) {
      const { captureError } = await import("@/server/monitoring");
      await captureError(e, { source: "WORKER", path: "stripe.payouts" });
    }
  }
  return n;
}

/* ───────────────────────── Übersicht ───────────────────────── */

export type PayoutOverview = {
  mode: "stripe" | "simulated" | "disabled";
  connected: boolean;
  payoutsEnabled: boolean;
  currency: string;
  available: number;
  pending: number;
  schedule: PayoutSchedule | null;
  bank: { name: string | null; last4: string; currency: string } | null;
  payouts: { id: string; amountMinor: number; currency: string; status: string; arrivalAt: Date | null; createdAt: Date; automatic: boolean; failureMessage: string | null }[];
  /** Stripe gerade nicht erreichbar – Seite trotzdem anzeigen */
  unavailable?: boolean;
};

/** Simulierter Testmodus: Guthaben = Netto aller bezahlten Bestellungen minus Auszahlungen. */
async function simulatedBalance(shopId: string) {
  const [rev, out] = await Promise.all([
    shopRevenue(shopId, "alle"),
    db.payoutRecord.aggregate({ where: { shopId, status: { notIn: ["failed", "canceled"] } }, _sum: { amountMinor: true } }),
  ]);
  return Math.max(0, rev.net - (out._sum.amountMinor ?? 0));
}

const SIM_SCHEDULE = new Map<string, PayoutSchedule>();

export async function getPayoutOverview(user: Pick<SessionUser, "id">): Promise<PayoutOverview> {
  const shop = await requireOwnShop(user);
  const mode = paymentsMode();
  const payouts = await db.payoutRecord.findMany({
    where: { shopId: shop.id },
    orderBy: { createdAt: "desc" },
    take: 30,
    select: { id: true, amountMinor: true, currency: true, status: true, arrivalAt: true, createdAt: true, automatic: true, failureMessage: true },
  });
  const base = { mode, connected: !!shop.stripeAccountId, payoutsEnabled: shop.payoutsEnabled, currency: shop.currency, payouts };

  if (mode === "simulated") {
    return {
      ...base,
      connected: true,
      payoutsEnabled: true,
      available: await simulatedBalance(shop.id),
      pending: 0,
      schedule: SIM_SCHEDULE.get(shop.id) ?? { interval: "manual", weeklyAnchor: null, monthlyAnchor: null, delayDays: null },
      bank: { name: "Testbank", last4: "0000", currency: shop.currency },
    };
  }
  if (mode !== "stripe" || !shop.stripeAccountId) return { ...base, available: 0, pending: 0, schedule: null, bank: null };
  try {
    // Guthaben und Auszahlung in der Währung des Bankkontos (DE/AT: EUR, auch wenn der Shop in CHF verkauft –
    // Stripe rechnet Überweisungen in die Kontowährung um)
    const settings = await connectedPayoutSettings(shop.stripeAccountId);
    const currency = settings.bank?.currency ?? shop.currency;
    const bal = await connectedBalance(shop.stripeAccountId, currency);
    return { ...base, currency, available: bal.available, pending: bal.pending, schedule: settings.schedule, bank: settings.bank };
  } catch (e) {
    const { captureError } = await import("@/server/monitoring");
    await captureError(e, { source: "SERVER", path: "/studio/einnahmen", userId: user.id, meta: { stripe: "payout-overview" } });
    return { ...base, available: 0, pending: 0, schedule: null, bank: null, unavailable: true };
  }
}

/* ───────────────────────── Aktionen ───────────────────────── */

const WEEKDAYS = ["monday", "tuesday", "wednesday", "thursday", "friday"] as const;

export const payoutScheduleSchema = z.object({
  interval: z.enum(["manual", "daily", "weekly", "monthly"]),
  weeklyAnchor: z.enum(WEEKDAYS).nullish(),
  monthlyAnchor: z.coerce.number().int().min(1).max(31).nullish(),
});

async function stripeCall<T>(user: Pick<SessionUser, "id">, what: string, fn: () => Promise<T>, friendly: string): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (!isStripeError(e)) throw e;
    const { captureError } = await import("@/server/monitoring");
    await captureError(e, { source: "SERVER", path: "/studio/einnahmen", userId: user.id, meta: { stripe: what, code: e.code ?? null } });
    if (e.code === "balance_insufficient" || /insufficient/i.test(e.message)) throw fail.invalid("Das verfügbare Guthaben reicht für diesen Betrag nicht aus.");
    if (/manual payouts|automatic payouts/i.test(e.message)) throw fail.invalid("Für Auszahlungen auf Anfrage muss der Auszahlungsplan „Auf Anfrage“ eingestellt sein.");
    if (/external account|bank account/i.test(e.message)) throw fail.invalid("Es ist noch kein gültiges Bankkonto hinterlegt.");
    throw fail.unavailable(friendly);
  }
}

export async function setPayoutSchedule(user: Pick<SessionUser, "id">, input: unknown) {
  const data = payoutScheduleSchema.parse(input);
  const shop = await requireOwnShop(user, { writable: true });
  await rateLimit(`payout-schedule:${shop.id}`, 20, 3600);
  const schedule: PayoutSchedule = { interval: data.interval, weeklyAnchor: data.interval === "weekly" ? (data.weeklyAnchor ?? "monday") : null, monthlyAnchor: data.interval === "monthly" ? (data.monthlyAnchor ?? 1) : null, delayDays: null };
  const mode = paymentsMode();
  if (mode === "simulated") {
    SIM_SCHEDULE.set(shop.id, schedule);
    return schedule;
  }
  if (mode !== "stripe" || !shop.stripeAccountId) throw fail.invalid("Es ist noch kein Auszahlungskonto verbunden.");
  await stripeCall(user, "payout-schedule", () => updatePayoutSchedule(shop.stripeAccountId!, schedule), "Der Auszahlungsplan konnte gerade nicht geändert werden. Bitte versuche es später erneut.");
  return schedule;
}

export const payoutRequestSchema = z.object({
  amountMinor: z.coerce.number().int().min(100, "Mindestens 1.00").optional(),
  /** Plan in einem Schritt auf „Auf Anfrage“ umstellen */
  switchToManual: z.boolean().optional(),
});

export async function requestPayout(user: Pick<SessionUser, "id">, input: unknown) {
  const data = payoutRequestSchema.parse(input ?? {});
  const shop = await requireOwnShop(user, { writable: true });
  await rateLimit(`payout-request:${shop.id}`, 10, 3600);
  const mode = paymentsMode();

  if (mode === "simulated") {
    const available = await simulatedBalance(shop.id);
    const amount = data.amountMinor ?? available;
    if (amount < 100) throw fail.invalid("Es ist kein auszahlbares Guthaben vorhanden.");
    if (amount > available) throw fail.invalid("Der Betrag ist höher als dein verfügbares Guthaben.");
    if (data.switchToManual) SIM_SCHEDULE.set(shop.id, { interval: "manual", weeklyAnchor: null, monthlyAnchor: null, delayDays: null });
    const id = `sim_po_${Date.now().toString(36)}`;
    await db.payoutRecord.create({ data: { shopId: shop.id, providerRef: id, amountMinor: amount, currency: shop.currency, status: "in_transit", automatic: false, arrivalAt: new Date(Date.now() + 2 * 86400_000), notified: ["in_transit"] } });
    return { amountMinor: amount, currency: shop.currency, arrivalAt: new Date(Date.now() + 2 * 86400_000) };
  }
  if (mode !== "stripe" || !shop.stripeAccountId) throw fail.invalid("Es ist noch kein Auszahlungskonto verbunden.");
  if (!shop.payoutsEnabled) throw fail.invalid("Auszahlungen sind bei Stripe noch nicht freigeschaltet. Schau unter „Shopverwaltung“, ob noch Angaben fehlen.");
  const acct = shop.stripeAccountId;

  const settings = await stripeCall(user, "payout-settings", () => connectedPayoutSettings(acct), "Stripe ist gerade nicht erreichbar. Bitte versuche es später erneut.");
  if (settings.schedule && settings.schedule.interval !== "manual") {
    if (!data.switchToManual) throw fail.conflict("Dein Auszahlungsplan ist automatisch. Stelle auf „Auf Anfrage“ um, um selbst auszuzahlen.");
    await stripeCall(user, "payout-schedule", () => updatePayoutSchedule(acct, { interval: "manual" }), "Der Auszahlungsplan konnte gerade nicht geändert werden.");
  }
  const currency = settings.bank?.currency ?? shop.currency;
  const bal = await stripeCall(user, "balance", () => connectedBalance(acct, currency), "Dein Guthaben konnte gerade nicht abgefragt werden.");
  const amount = data.amountMinor ?? bal.available;
  if (amount < 100) throw fail.invalid("Es ist kein auszahlbares Guthaben vorhanden.");
  if (amount > bal.available) throw fail.invalid("Der Betrag ist höher als dein verfügbares Guthaben.");

  const p = await stripeCall(
    user,
    "payout-create",
    () => createConnectedPayout(acct, { amountMinor: amount, currency, idempotencyKey: `payout:${shop.id}:${amount}:${Math.floor(Date.now() / 60_000)}` }),
    "Die Auszahlung konnte gerade nicht ausgelöst werden. Bitte versuche es in ein paar Minuten erneut.",
  );
  // Selbst ausgelöst: „unterwegs“ nicht zusätzlich melden
  await db.payoutRecord.upsert({
    where: { providerRef: p.id },
    create: { shopId: shop.id, providerRef: p.id, amountMinor: p.amount, currency: p.currency.toUpperCase(), status: p.status, automatic: false, arrivalAt: p.arrival_date ? new Date(p.arrival_date * 1000) : null, notified: ["in_transit"] },
    update: { automatic: false },
  });
  return { amountMinor: p.amount, currency: p.currency.toUpperCase(), arrivalAt: p.arrival_date ? new Date(p.arrival_date * 1000) : null };
}

/** Bankkonto ändern: Stripe-Formular (Identität/IBAN dürfen nur dort erfasst werden). */
export async function bankUpdateLink(user: Pick<SessionUser, "id">) {
  const shop = await requireOwnShop(user, { writable: true });
  if (paymentsMode() !== "stripe" || !shop.stripeAccountId) throw fail.invalid("Es ist noch kein Auszahlungskonto verbunden.");
  return stripeCall(user, "account-update-link", () => createAccountUpdateLink(shop.stripeAccountId!), "Stripe ist gerade nicht erreichbar. Bitte versuche es später erneut.");
}
