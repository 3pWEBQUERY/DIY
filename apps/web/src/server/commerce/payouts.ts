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
import { heldAmount, payableFrom } from "./escrow";
import { isPayoutDue } from "./escrow-rules";
import { getSetting } from "@/server/settings";
import { zurichDayKey } from "@/lib/tz";

/**
 * Auszahlungen über Werkuno (statt im Stripe-Dashboard):
 * - Guthaben (auszahlbar / in der Haltefrist / bei Stripe ausstehend) und Bankkonto anzeigen
 * - Auszahlungsplan wählen: auf Anfrage, täglich, wöchentlich, monatlich – Werkuno führt ihn aus;
 *   bei Stripe steht jedes Konto auf „manuell“, damit nur freigegebenes Guthaben ausgezahlt wird
 * - Auszahlung beantragen (höchstens das freigegebene Guthaben)
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

/**
 * Worker: Auszahlungen aller verbundenen Shops abgleichen (falls ein Webhook fehlt). Reihum nach dem
 * letzten Abgleich (`payoutsSyncAt`, auch bei Fehlern gesetzt) – bei mehr Shops als `limitShops` kommen
 * alle der Reihe nach dran, statt dass immer dieselben (z. B. dauerhaft fehlerhafte) gewählt werden.
 */
export async function syncPayouts(limitShops = 200) {
  if (paymentsMode() !== "stripe") return 0;
  const shops = await db.shop.findMany({
    where: { stripeAccountId: { not: null }, payoutsEnabled: true },
    orderBy: [{ payoutsSyncAt: { sort: "asc", nulls: "first" } }, { id: "asc" }],
    take: limitShops,
    select: { id: true, ownerId: true, stripeAccountId: true },
  });
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
    // Per Roh-SQL: updatedAt („zuletzt bearbeitet“) bleibt unberührt
    await db.$executeRaw`UPDATE "Shop" SET "payoutsSyncAt" = now() WHERE "id" = ${s.id}`.catch(() => {});
  }
  return n;
}

/* ───────────────────────── Übersicht ───────────────────────── */

export type PayoutOverview = {
  mode: "stripe" | "simulated" | "disabled";
  connected: boolean;
  payoutsEnabled: boolean;
  currency: string;
  /** Jetzt auszahlbar (Guthaben minus Haltefrist) */
  available: number;
  /** Bei Stripe noch ausstehend (Zahlungseingang der letzten Tage) */
  pending: number;
  /** Erlöse in der Haltefrist (Bestellung noch nicht abgeschlossen bzw. Frist läuft) */
  held: number;
  /** Nächster voraussichtlicher Freigabetermin */
  nextReleaseAt: Date | null;
  holdDays: number;
  holdWaived: boolean;
  schedule: PayoutSchedule | null;
  bank: { name: string | null; last4: string; currency: string } | null;
  payouts: { id: string; amountMinor: number; currency: string; status: string; arrivalAt: Date | null; createdAt: Date; automatic: boolean; failureMessage: string | null }[];
  /** Stripe gerade nicht erreichbar – Seite trotzdem anzeigen */
  unavailable?: boolean;
};

type PayoutShop = { id: string; ownerId: string; status: string; currency: string; stripeAccountId: string | null; payoutsEnabled: boolean; payoutHoldWaived: boolean; payoutInterval: string; payoutWeeklyAnchor: string | null; payoutMonthlyAnchor: number | null };

const planOf = (s: PayoutShop): PayoutSchedule => ({ interval: s.payoutInterval as PayoutSchedule["interval"], weeklyAnchor: s.payoutWeeklyAnchor, monthlyAnchor: s.payoutMonthlyAnchor, delayDays: null });

/** Simulierter Testmodus: Guthaben = Netto aller bezahlten Bestellungen minus Auszahlungen. */
async function simulatedBalance(shopId: string) {
  const [rev, out] = await Promise.all([
    shopRevenue(shopId, "alle"),
    db.payoutRecord.aggregate({ where: { shopId, status: { notIn: ["failed", "canceled"] } }, _sum: { amountMinor: true } }),
  ]);
  return Math.max(0, rev.net - (out._sum.amountMinor ?? 0));
}

/** Guthaben, Haltefrist und auszahlbarer Betrag eines Shops (Stripe oder Testmodus). */
async function balanceOf(shop: PayoutShop) {
  const mode = paymentsMode();
  if (mode === "simulated") {
    const total = await simulatedBalance(shop.id);
    const held = await heldAmount(shop, shop.currency);
    return { currency: shop.currency, available: payableFrom(total, 0, held), pending: 0, held: held.heldMinor, nextReleaseAt: held.nextReleaseAt, settings: null };
  }
  const settings = await connectedPayoutSettings(shop.stripeAccountId!);
  // Guthaben und Auszahlung in der Währung des Bankkontos (DE/AT: EUR, auch wenn der Shop in CHF verkauft)
  const currency = settings.bank?.currency ?? shop.currency;
  const bal = await connectedBalance(shop.stripeAccountId!, currency);
  const held = await heldAmount(shop, currency);
  const total = bal.available + bal.pending;
  return { currency, available: payableFrom(bal.available, bal.pending, held), pending: bal.pending, held: held.unknown ? total : Math.min(total, held.heldMinor), nextReleaseAt: held.nextReleaseAt, settings };
}

export async function getPayoutOverview(user: Pick<SessionUser, "id">): Promise<PayoutOverview> {
  const shop = await requireOwnShop(user);
  const mode = paymentsMode();
  const payouts = await db.payoutRecord.findMany({
    where: { shopId: shop.id },
    orderBy: { createdAt: "desc" },
    take: 30,
    select: { id: true, amountMinor: true, currency: true, status: true, arrivalAt: true, createdAt: true, automatic: true, failureMessage: true },
  });
  const holdDays = await getSetting("commerce.payoutHoldDays");
  const base = { mode, connected: !!shop.stripeAccountId, payoutsEnabled: shop.payoutsEnabled, currency: shop.currency, payouts, holdDays, holdWaived: shop.payoutHoldWaived, schedule: planOf(shop) };
  const empty = { available: 0, pending: 0, held: 0, nextReleaseAt: null, bank: null };

  if (mode === "simulated") {
    const b = await balanceOf(shop);
    return { ...base, connected: true, payoutsEnabled: true, available: b.available, pending: 0, held: b.held, nextReleaseAt: b.nextReleaseAt, bank: { name: "Testbank", last4: "0000", currency: shop.currency } };
  }
  if (mode !== "stripe" || !shop.stripeAccountId) return { ...base, ...empty, schedule: null };
  try {
    const b = await balanceOf(shop);
    return { ...base, currency: b.currency, available: b.available, pending: b.pending, held: b.held, nextReleaseAt: b.nextReleaseAt, bank: b.settings?.bank ?? null };
  } catch (e) {
    const { captureError } = await import("@/server/monitoring");
    await captureError(e, { source: "SERVER", path: "/studio/einnahmen", userId: user.id, meta: { stripe: "payout-overview" } });
    return { ...base, ...empty, unavailable: true };
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
    if (/external account|bank account/i.test(e.message)) throw fail.invalid("Es ist noch kein gültiges Bankkonto hinterlegt.");
    throw fail.unavailable(friendly);
  }
}

/**
 * Auszahlungsplan speichern. Werkuno führt ihn selbst aus (Worker `payouts.run`) und zahlt dabei nur
 * freigegebenes Guthaben aus; bei Stripe bleibt das Konto auf „manuell“.
 */
export async function setPayoutSchedule(user: Pick<SessionUser, "id">, input: unknown) {
  const data = payoutScheduleSchema.parse(input);
  const shop = await requireOwnShop(user, { writable: true });
  await rateLimit(`payout-schedule:${shop.id}`, 20, 3600);
  const schedule: PayoutSchedule = { interval: data.interval, weeklyAnchor: data.interval === "weekly" ? (data.weeklyAnchor ?? "monday") : null, monthlyAnchor: data.interval === "monthly" ? (data.monthlyAnchor ?? 1) : null, delayDays: null };
  const mode = paymentsMode();
  if (mode !== "simulated" && (mode !== "stripe" || !shop.stripeAccountId)) throw fail.invalid("Es ist noch kein Auszahlungskonto verbunden.");
  if (mode === "stripe") await stripeCall(user, "payout-schedule", () => updatePayoutSchedule(shop.stripeAccountId!, { interval: "manual" }), "Der Auszahlungsplan konnte gerade nicht geändert werden. Bitte versuche es später erneut.");
  await db.shop.update({ where: { id: shop.id }, data: { payoutInterval: schedule.interval, payoutWeeklyAnchor: schedule.weeklyAnchor, payoutMonthlyAnchor: schedule.monthlyAnchor, payoutScheduleMigratedAt: new Date() } });
  return schedule;
}

export const payoutRequestSchema = z.object({
  amountMinor: z.coerce.number().int().min(100, "Mindestens 1.00").optional(),
  /** Ältere Clients: Plan auf „Auf Anfrage“ umstellen – nicht mehr nötig, Auszahlen geht jederzeit */
  switchToManual: z.boolean().optional(),
});

function holdMessage(b: { held: number; nextReleaseAt: Date | null; currency: string }) {
  if (b.held <= 0) return "Es ist kein auszahlbares Guthaben vorhanden.";
  const when = b.nextReleaseAt ? ` Der nächste Betrag wird voraussichtlich am ${b.nextReleaseAt.toLocaleDateString("de-CH", { timeZone: "Europe/Zurich", day: "numeric", month: "long" })} frei.` : "";
  return `${formatMoney(b.held, b.currency as Currency)} sind noch in der Haltefrist – Erlöse werden nach Abschluss der Bestellung frei.${when}`;
}

/** Auszahlung beantragen – höchstens das freigegebene Guthaben (Haltefrist). */
export async function requestPayout(user: Pick<SessionUser, "id">, input: unknown) {
  const data = payoutRequestSchema.parse(input ?? {});
  const shop = await requireOwnShop(user, { writable: true });
  await rateLimit(`payout-request:${shop.id}`, 10, 3600);
  const mode = paymentsMode();
  if (mode !== "simulated" && (mode !== "stripe" || !shop.stripeAccountId)) throw fail.invalid("Es ist noch kein Auszahlungskonto verbunden.");
  if (mode === "stripe" && !shop.payoutsEnabled) throw fail.invalid("Auszahlungen sind bei Stripe noch nicht freigeschaltet. Schau unter „Shopverwaltung“, ob noch Angaben fehlen.");
  const b = await stripeCall(user, "balance", () => balanceOf(shop), "Dein Guthaben konnte gerade nicht abgefragt werden.");
  const amount = data.amountMinor ?? b.available;
  if (amount < 100) throw fail.invalid(holdMessage(b));
  if (amount > b.available) throw fail.invalid(b.held > 0 ? `Der Betrag ist höher als dein auszahlbares Guthaben (${formatMoney(b.available, b.currency as Currency)}). ${holdMessage(b)}` : "Der Betrag ist höher als dein verfügbares Guthaben.");
  if (mode === "stripe" && b.settings?.schedule && b.settings.schedule.interval !== "manual") {
    await stripeCall(user, "payout-schedule", () => updatePayoutSchedule(shop.stripeAccountId!, { interval: "manual" }), "Der Auszahlungsplan konnte gerade nicht geändert werden.");
  }
  const p = await createPayout(shop, amount, b.currency, `payout:${shop.id}:${amount}:${Math.floor(Date.now() / 60_000)}`, false);
  return { amountMinor: p.amountMinor, currency: p.currency, arrivalAt: p.arrivalAt };
}

/** Auszahlung beim Anbieter auslösen (bzw. im Testmodus simulieren) und verbuchen. */
async function createPayout(shop: PayoutShop, amount: number, currency: string, idempotencyKey: string, automatic: boolean) {
  if (paymentsMode() === "simulated") {
    const arrivalAt = new Date(Date.now() + 2 * 86400_000);
    await db.payoutRecord.create({ data: { shopId: shop.id, providerRef: `sim_po_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, amountMinor: amount, currency, status: "in_transit", automatic, arrivalAt, notified: automatic ? [] : ["in_transit"] } });
    return { amountMinor: amount, currency, arrivalAt };
  }
  const p = await createConnectedPayout(shop.stripeAccountId!, { amountMinor: amount, currency, idempotencyKey });
  const arrivalAt = p.arrival_date ? new Date(p.arrival_date * 1000) : null;
  // Selbst beantragt: „unterwegs“ nicht zusätzlich melden; automatisch (Plan): wie bisher bei Stripe melden
  await db.payoutRecord.upsert({
    where: { providerRef: p.id },
    create: { shopId: shop.id, providerRef: p.id, amountMinor: p.amount, currency: p.currency.toUpperCase(), status: p.status, automatic, arrivalAt, notified: automatic ? [] : ["in_transit"] },
    update: { automatic },
  });
  if (automatic) await savePayout(shop, { ...p, automatic: true });
  return { amountMinor: p.amount, currency: p.currency.toUpperCase(), arrivalAt };
}

/* ───────────────────────── Worker ───────────────────────── */

/**
 * Bisherige Stripe-Auszahlungspläne einmalig übernehmen und Stripe auf „manuell“ stellen – ab dann
 * zahlt Werkuno nach Plan aus, aber nur freigegebenes Guthaben (Haltefrist).
 */
export async function migrateStripePayoutSchedules(limit = 50) {
  if (paymentsMode() !== "stripe") return 0;
  const shops = await db.shop.findMany({ where: { stripeAccountId: { not: null }, payoutScheduleMigratedAt: null }, select: { id: true, stripeAccountId: true }, take: limit });
  let n = 0;
  for (const s of shops) {
    try {
      const settings = await connectedPayoutSettings(s.stripeAccountId!);
      const sch = settings.schedule;
      if (sch && sch.interval !== "manual") await updatePayoutSchedule(s.stripeAccountId!, { interval: "manual" });
      await db.shop.update({
        where: { id: s.id },
        data: { payoutScheduleMigratedAt: new Date(), ...(sch && sch.interval !== "manual" ? { payoutInterval: sch.interval, payoutWeeklyAnchor: sch.weeklyAnchor ?? null, payoutMonthlyAnchor: sch.monthlyAnchor ?? null } : {}) },
      });
      n++;
    } catch (e) {
      const { captureError } = await import("@/server/monitoring");
      await captureError(e, { source: "WORKER", path: "payouts.migrate_schedule", meta: { shopId: s.id } });
    }
  }
  return n;
}

/**
 * Automatische Auszahlungen nach dem Plan des Shops (täglich/wöchentlich/monatlich, Zürcher Kalender) –
 * jeweils das freigegebene Guthaben, höchstens einmal pro Tag. Gesperrte Shops werden übersprungen.
 */
export async function runScheduledPayouts(now: Date = new Date()) {
  const mode = paymentsMode();
  if (mode !== "stripe" && mode !== "simulated") return 0;
  const shops = await db.shop.findMany({
    // Gesperrte Shops nicht – ausser das Konto wurde gelöscht (dann ist der Shop gesperrt, das Restguthaben
    // wird nach Ablauf der Haltefrist trotzdem ausgezahlt)
    where: { payoutInterval: { not: "manual" }, OR: [{ status: { in: ["ACTIVE", "PAUSED"] } }, { owner: { status: "DELETED" } }], ...(mode === "stripe" ? { stripeAccountId: { not: null }, payoutsEnabled: true, payoutScheduleMigratedAt: { not: null } } : {}) },
    select: { id: true, ownerId: true, status: true, currency: true, stripeAccountId: true, payoutsEnabled: true, payoutHoldWaived: true, payoutInterval: true, payoutWeeklyAnchor: true, payoutMonthlyAnchor: true, lastAutoPayoutAt: true },
    take: 500,
  });
  let n = 0;
  for (const s of shops) {
    if (!isPayoutDue({ interval: s.payoutInterval, weeklyAnchor: s.payoutWeeklyAnchor, monthlyAnchor: s.payoutMonthlyAnchor }, s.lastAutoPayoutAt, now)) continue;
    try {
      const b = await balanceOf(s);
      // Tag als erledigt markieren (auch ohne Betrag) – höchstens ein Versuch pro Tag
      await db.$executeRaw`UPDATE "Shop" SET "lastAutoPayoutAt" = ${now} WHERE "id" = ${s.id}`;
      if (b.available < 100) continue;
      await createPayout(s, b.available, b.currency, `auto-payout:${s.id}:${zurichDayKey(now)}`, true);
      n++;
    } catch (e) {
      const { captureError } = await import("@/server/monitoring");
      await captureError(e, { source: "WORKER", path: "payouts.scheduled", meta: { shopId: s.id } });
    }
  }
  return n;
}

/** Bankkonto ändern: Stripe-Formular (Identität/IBAN dürfen nur dort erfasst werden). */
export async function bankUpdateLink(user: Pick<SessionUser, "id">) {
  const shop = await requireOwnShop(user, { writable: true });
  if (paymentsMode() !== "stripe" || !shop.stripeAccountId) throw fail.invalid("Es ist noch kein Auszahlungskonto verbunden.");
  return stripeCall(user, "account-update-link", () => createAccountUpdateLink(shop.stripeAccountId!), "Stripe ist gerade nicht erreichbar. Bitte versuche es später erneut.");
}
