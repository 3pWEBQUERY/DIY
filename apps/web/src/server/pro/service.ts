import "server-only";
import { cache } from "react";
import type Stripe from "stripe";
import { z } from "zod";
import { formatMoney } from "@werkraum/shared";
import { db } from "@/server/db";
import { fail } from "@/server/errors";
import { notify } from "@/server/notifications";
import { rateLimit } from "@/server/ratelimit";
import { getSetting } from "@/server/settings";
import { requireFlag } from "@/server/flags";
import { audit } from "@/server/audit";
import { hasRole } from "@/server/authz";
import { appUrl, isStripeError, paymentsMode, stripe } from "@/server/commerce/stripe";
import type { SessionUser } from "@/server/auth/session";

/**
 * Creator Pro (PRD §22.3) – optionales Abo für Menschen, die mit ihren Projekten wachsen wollen.
 * Grundfunktionen bleiben kostenlos (§22.5): Pro ergänzt, schränkt aber nichts ein und kauft
 * keine Reichweite im Feed.
 *
 * Abrechnung über Stripe Billing (Checkout im Abo-Modus). Status kommt per Webhook
 * (customer.subscription.*) und zusätzlich beim Zurückkehren aus dem Checkout sowie täglich
 * im Worker. Die Administration kann Pro auch schenken (z. B. für Partner:innen).
 */

export const PRO_NAME = "Creator Pro";
const PRODUCT_ID = "werkuno_creator_pro";
const ACTIVE = new Set(["active", "trialing", "past_due"]);

export type ProInterval = "month" | "year";
export type ProStatus = {
  active: boolean;
  interval: "month" | "year" | "comp" | null;
  status: string | null;
  provider: "stripe" | "simulated" | "comp" | null;
  periodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  priceMinor: number | null;
  currency: string;
  /** Zahlung fehlgeschlagen – Pro läuft während der Mahnphase weiter */
  pastDue: boolean;
};

type SubRow = { status: string; provider: string; interval: string; currentPeriodEnd: Date | null; cancelAtPeriodEnd: boolean; priceMinor: number | null; currency: string };

export function isActiveSubscription(s: Pick<SubRow, "status" | "provider" | "currentPeriodEnd"> | null | undefined, now = new Date()) {
  if (!s) return false;
  if (s.provider === "comp") return s.status === "active" && (!s.currentPeriodEnd || s.currentPeriodEnd > now);
  if (s.provider === "simulated") return ACTIVE.has(s.status) && (!s.currentPeriodEnd || s.currentPeriodEnd > now);
  return ACTIVE.has(s.status);
}

function toStatus(s: SubRow | null): ProStatus {
  return {
    active: isActiveSubscription(s),
    interval: (s?.interval as ProStatus["interval"]) ?? null,
    status: s?.status ?? null,
    provider: (s?.provider as ProStatus["provider"]) ?? null,
    periodEnd: s?.currentPeriodEnd ?? null,
    cancelAtPeriodEnd: !!s?.cancelAtPeriodEnd,
    priceMinor: s?.priceMinor ?? null,
    currency: s?.currency ?? "CHF",
    pastDue: s?.status === "past_due",
  };
}

/** Pro-Status einer Person (pro Anfrage zwischengespeichert). */
export const getProStatus = cache(async (userId: string): Promise<ProStatus> => {
  const s = await db.subscription.findUnique({ where: { userId } }).catch(() => null);
  return toStatus(s);
});

export async function isPro(userId: string | null | undefined) {
  if (!userId) return false;
  return (await getProStatus(userId)).active;
}

/** Pro-Status mehrerer Personen auf einmal (z. B. Shop-Inhaber:innen im Warenkorb). */
export async function proUserIds(userIds: string[]) {
  if (!userIds.length) return new Set<string>();
  const rows = await db.subscription.findMany({ where: { userId: { in: [...new Set(userIds)] } } });
  return new Set(rows.filter((r) => isActiveSubscription(r)).map((r) => r.userId));
}

export async function proPrices() {
  const [month, year] = await Promise.all([getSetting("pro.priceMonthMinor"), getSetting("pro.priceYearMinor")]);
  return { month, year, currency: "CHF" as const, yearSavingMinor: Math.max(0, month * 12 - year) };
}

/** Profil-Kennzeichen (isCreatorPro, z. B. für die App) mit dem Abo-Status abgleichen. */
async function syncProFlag(userId: string) {
  const s = await db.subscription.findUnique({ where: { userId } });
  await db.userProfile.updateMany({ where: { userId }, data: { isCreatorPro: isActiveSubscription(s) } });
}

/* ───────────────────────── Benachrichtigungen ───────────────────────── */

async function tell(userId: string, message: string) {
  await notify({ recipientId: userId, type: "SECURITY", bundle: false, data: { kind: "PRO", message, href: "/studio/pro" } }).catch(() => {});
}

/* ───────────────────────── Stripe ───────────────────────── */

async function ensureProduct() {
  try {
    return await stripe().products.retrieve(PRODUCT_ID);
  } catch {
    return stripe().products.create({ id: PRODUCT_ID, name: PRO_NAME, description: "Werkzeuge für Creator auf Werkuno", metadata: { kind: "pro" } });
  }
}

function periodEndOf(sub: Stripe.Subscription): Date | null {
  const itemEnd = sub.items?.data?.[0]?.current_period_end;
  const legacy = (sub as unknown as { current_period_end?: number }).current_period_end;
  const t = itemEnd ?? legacy;
  return t ? new Date(t * 1000) : null;
}

/** Stripe-Abo übernehmen (Webhook, Rückkehr aus dem Checkout, Abgleich). */
export async function syncStripeSubscription(sub: Stripe.Subscription) {
  const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
  const metaUser = sub.metadata?.userId;
  const existing =
    (await db.subscription.findUnique({ where: { subscriptionId: sub.id } })) ??
    (metaUser ? await db.subscription.findUnique({ where: { userId: metaUser } }) : null) ??
    (await db.subscription.findFirst({ where: { customerId } }));
  const userId = existing?.userId ?? metaUser;
  if (!userId) return null;
  // Zweites Abo derselben Person (z. B. zwei Checkout-Tabs bezahlt): ein beendetes zweites Abo darf das
  // laufende nicht überschreiben; zwei laufende Abos → zur manuellen Erstattung melden
  if (existing?.subscriptionId && existing.subscriptionId !== sub.id && existing.provider === "stripe" && isActiveSubscription(existing)) {
    const incomingActive = ["active", "trialing", "past_due"].includes(sub.status);
    if (!incomingActive) return existing;
    const { captureError } = await import("@/server/monitoring");
    await captureError(new Error(`Zweites laufendes ${PRO_NAME}-Abo für dieselbe Person – bitte eines kündigen und erstatten`), { source: "SERVER", path: "pro.duplicate_subscription", userId, meta: { kept: existing.subscriptionId, duplicate: sub.id } });
    return existing;
  }
  const item = sub.items?.data?.[0];
  const interval = item?.price?.recurring?.interval === "year" ? "year" : "month";
  const before = existing ? isActiveSubscription(existing) : false;
  const data = {
    interval,
    status: sub.status,
    provider: "stripe",
    customerId,
    subscriptionId: sub.id,
    priceMinor: item?.price?.unit_amount ?? existing?.priceMinor ?? null,
    currency: (item?.price?.currency ?? "chf").toUpperCase(),
    currentPeriodEnd: periodEndOf(sub),
    cancelAtPeriodEnd: !!sub.cancel_at_period_end,
  };
  // Ein geschenkter Zugang wird durch ein bezahltes Abo ersetzt – nicht umgekehrt
  const row = await db.subscription.upsert({ where: { userId }, create: { userId, ...data }, update: data });
  const after = isActiveSubscription(row);
  if (before !== after) await syncProFlag(userId);
  if (!before && after) await tell(userId, `Willkommen bei ${PRO_NAME}! Deine Pro-Werkzeuge sind jetzt freigeschaltet.`);
  if (before && !after && sub.status === "canceled") await tell(userId, `Dein ${PRO_NAME}-Abo ist beendet. Deine Inhalte bleiben selbstverständlich erhalten.`);
  return row;
}

/* ───────────────────────── Abschliessen ───────────────────────── */

const intervalSchema = z.enum(["month", "year"]);

export async function startProCheckout(user: Pick<SessionUser, "id" | "email">, rawInterval: unknown) {
  const interval = intervalSchema.parse(rawInterval);
  await requireFlag("pro", user.id);
  await rateLimit(`pro-checkout:${user.id}`, 10, 3600);
  const current = await db.subscription.findUnique({ where: { userId: user.id } });
  if (current && isActiveSubscription(current) && current.provider !== "comp") throw fail.conflict(`Du hast ${PRO_NAME} bereits.`);
  const prices = await proPrices();
  const amount = interval === "year" ? prices.year : prices.month;
  const mode = paymentsMode();

  if (mode === "simulated") {
    const end = new Date();
    if (interval === "year") end.setFullYear(end.getFullYear() + 1);
    else end.setMonth(end.getMonth() + 1);
    const data = { interval, status: "active", provider: "simulated", priceMinor: amount, currency: "CHF", currentPeriodEnd: end, cancelAtPeriodEnd: false, subscriptionId: null, grantedById: null };
    await db.subscription.upsert({ where: { userId: user.id }, create: { userId: user.id, ...data }, update: data });
    await syncProFlag(user.id);
    await tell(user.id, `Willkommen bei ${PRO_NAME}! (Testmodus – es wurde nichts abgebucht.)`);
    return "/studio/pro?abo=erfolg";
  }
  if (mode !== "stripe") throw fail.unavailable("Zahlungen sind noch nicht aktiviert.");

  try {
    await ensureProduct();
    let customerId = current?.customerId ?? null;
    if (!customerId) {
      const c = await stripe().customers.create({ email: user.email, metadata: { userId: user.id } }, { idempotencyKey: `pro-customer:${user.id}` });
      customerId = c.id;
      if (current) await db.subscription.update({ where: { userId: user.id }, data: { customerId } });
      else await db.subscription.create({ data: { userId: user.id, interval, status: "incomplete", provider: "stripe", customerId, priceMinor: amount } });
    }
    // Kein zweites Abo: läuft bei Stripe bereits eines (Webhook evtl. noch unterwegs), übernehmen statt
    // neu abschliessen; offene Checkout-Sessions (anderer Tab) beenden, damit nur eine bezahlt werden kann
    const subs = await stripe().subscriptions.list({ customer: customerId, status: "all", limit: 10 });
    const running = subs.data.find((x) => ["active", "trialing", "past_due", "incomplete"].includes(x.status));
    if (running) {
      if (running.status !== "incomplete") {
        await syncStripeSubscription(running);
        throw fail.conflict(`Du hast ${PRO_NAME} bereits.`);
      }
      throw fail.conflict("Dein Abo wird gerade abgeschlossen. Bitte warte einen Moment und lade die Seite neu.");
    }
    const open = await stripe().checkout.sessions.list({ customer: customerId, status: "open", limit: 10 });
    for (const o of open.data) if (o.mode === "subscription") await stripe().checkout.sessions.expire(o.id).catch(() => {});
    const session = await stripe().checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      client_reference_id: user.id,
      line_items: [{ quantity: 1, price_data: { currency: "chf", unit_amount: amount, product: PRODUCT_ID, recurring: { interval } } }],
      subscription_data: { metadata: { userId: user.id, kind: "pro" } },
      metadata: { userId: user.id, kind: "pro" },
      allow_promotion_codes: true,
      locale: "de",
      success_url: appUrl("/studio/pro?abo=erfolg&session_id={CHECKOUT_SESSION_ID}"),
      cancel_url: appUrl("/studio/pro?abo=abgebrochen"),
    });
    if (!session.url) throw new Error("Checkout ohne URL");
    return session.url;
  } catch (e) {
    if (!isStripeError(e)) throw e;
    const { captureError } = await import("@/server/monitoring");
    await captureError(e, { source: "SERVER", path: "/studio/pro", userId: user.id, meta: { stripe: "pro-checkout", code: e.code ?? null } });
    throw fail.unavailable("Der Checkout konnte gerade nicht geöffnet werden. Bitte versuche es in ein paar Minuten erneut.");
  }
}

/** Rückkehr aus dem Checkout: Abo sofort übernehmen (Webhook kann ein paar Sekunden dauern). */
export async function confirmProCheckout(userId: string, sessionId: string) {
  if (paymentsMode() !== "stripe" || !/^cs_[\w]+$/.test(sessionId)) return null;
  try {
    const s = await stripe().checkout.sessions.retrieve(sessionId, { expand: ["subscription"] });
    if (s.client_reference_id !== userId || s.mode !== "subscription" || !s.subscription || typeof s.subscription === "string") return null;
    return await syncStripeSubscription(s.subscription);
  } catch {
    return null;
  }
}

/* ───────────────────────── Verwalten ───────────────────────── */

export async function setProCancel(user: Pick<SessionUser, "id">, cancel: boolean) {
  const s = await db.subscription.findUnique({ where: { userId: user.id } });
  if (!s || !isActiveSubscription(s)) throw fail.invalid(`Du hast kein aktives ${PRO_NAME}-Abo.`);
  if (s.provider === "comp") throw fail.invalid("Dein Zugang wurde dir von Werkuno geschenkt und läuft ohne Abo.");
  await rateLimit(`pro-cancel:${user.id}`, 20, 3600);
  if (s.provider === "stripe" && s.subscriptionId) {
    try {
      const sub = await stripe().subscriptions.update(s.subscriptionId, { cancel_at_period_end: cancel });
      await syncStripeSubscription(sub);
    } catch (e) {
      if (!isStripeError(e)) throw e;
      throw fail.unavailable("Das Abo konnte gerade nicht geändert werden. Bitte versuche es später erneut.");
    }
  } else {
    await db.subscription.update({ where: { userId: user.id }, data: { cancelAtPeriodEnd: cancel } });
  }
  return { cancelAtPeriodEnd: cancel };
}

/** Zahlungsmittel ändern: Stripe-Kundenportal (Karte/TWINT nur dort erfassbar). */
export async function proPaymentMethodLink(user: Pick<SessionUser, "id">) {
  const s = await db.subscription.findUnique({ where: { userId: user.id } });
  if (paymentsMode() !== "stripe" || !s?.customerId) throw fail.invalid("Kein Zahlungsmittel hinterlegt.");
  try {
    const p = await stripe().billingPortal.sessions.create({ customer: s.customerId, return_url: appUrl("/studio/pro"), locale: "de" });
    return p.url;
  } catch (e) {
    if (!isStripeError(e)) throw e;
    const { captureError } = await import("@/server/monitoring");
    await captureError(e, { source: "SERVER", path: "/studio/pro", userId: user.id, meta: { stripe: "billing-portal", code: e.code ?? null } });
    throw fail.unavailable("Das Zahlungsmittel kann gerade nicht geändert werden. Schreib uns, wir helfen gerne.");
  }
}

export type ProInvoice = { id: string; date: Date; amountMinor: number; currency: string; status: string; url: string | null };

export async function listProInvoices(userId: string): Promise<ProInvoice[]> {
  const s = await db.subscription.findUnique({ where: { userId } });
  if (paymentsMode() !== "stripe" || !s?.customerId) return [];
  try {
    const r = await stripe().invoices.list({ customer: s.customerId, limit: 12 });
    return r.data.map((i) => ({ id: i.id ?? i.number ?? "", date: new Date(i.created * 1000), amountMinor: i.amount_paid || i.amount_due, currency: i.currency.toUpperCase(), status: i.status ?? "open", url: i.hosted_invoice_url ?? null }));
  } catch {
    return [];
  }
}

/* ───────────────────────── Webhooks ───────────────────────── */

export async function handleProStripeEvent(event: Stripe.Event) {
  switch (event.type) {
    case "checkout.session.completed": {
      const s = event.data.object;
      if (s.mode !== "subscription" || !s.subscription) return false;
      const sub = await stripe().subscriptions.retrieve(typeof s.subscription === "string" ? s.subscription : s.subscription.id);
      await syncStripeSubscription(sub);
      return true;
    }
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted":
    case "customer.subscription.paused":
    case "customer.subscription.resumed": {
      // Stripe garantiert keine Reihenfolge der Webhooks – deshalb immer den aktuellen Stand laden,
      // sonst könnte ein verspätetes „updated (active)“ ein bereits beendetes Abo wieder aktivieren.
      const sub = await stripe().subscriptions.retrieve(event.data.object.id).catch(() => event.data.object);
      await syncStripeSubscription(sub);
      return true;
    }
    case "invoice.payment_failed": {
      const inv = event.data.object;
      const customer = typeof inv.customer === "string" ? inv.customer : inv.customer?.id;
      const s = customer ? await db.subscription.findFirst({ where: { customerId: customer } }) : null;
      if (s) await tell(s.userId, `Die Zahlung für ${PRO_NAME} (${formatMoney(inv.amount_due, "CHF")}) ist fehlgeschlagen. Bitte prüfe dein Zahlungsmittel – Pro bleibt solange aktiv.`);
      return !!s;
    }
    default:
      return false;
  }
}

/** Worker (täglich): Stripe-Abos abgleichen, abgelaufene Test-/Geschenk-Zugänge beenden. */
export async function syncProSubscriptions() {
  const now = new Date();
  // Testmodus: Verlängern oder beenden
  const sims = await db.subscription.findMany({ where: { provider: "simulated", status: "active", currentPeriodEnd: { lt: now } } });
  for (const s of sims) {
    if (s.cancelAtPeriodEnd) {
      await db.subscription.update({ where: { id: s.id }, data: { status: "canceled" } });
      await syncProFlag(s.userId);
      await tell(s.userId, `Dein ${PRO_NAME}-Abo ist beendet.`);
    } else {
      const end = new Date(s.currentPeriodEnd!);
      if (s.interval === "year") end.setFullYear(end.getFullYear() + 1);
      else end.setMonth(end.getMonth() + 1);
      await db.subscription.update({ where: { id: s.id }, data: { currentPeriodEnd: end } });
    }
  }
  const comps = await db.subscription.findMany({ where: { provider: "comp", status: "active", currentPeriodEnd: { lt: now } } });
  for (const s of comps) {
    await db.subscription.update({ where: { id: s.id }, data: { status: "canceled" } });
    await syncProFlag(s.userId);
    await tell(s.userId, `Dein geschenkter ${PRO_NAME}-Zugang ist abgelaufen.`);
  }
  if (paymentsMode() !== "stripe") return;
  // Gelöschte Konten mit noch laufendem Stripe-Abo (Kündigung beim Löschen nicht möglich gewesen) nachholen
  const orphaned = await db.subscription.findMany({ where: { provider: "stripe", subscriptionId: { not: null }, status: { not: "canceled" }, user: { status: "DELETED" } }, select: { userId: true }, take: 200 });
  for (const s of orphaned) {
    try {
      await endProForDeletedAccount(s.userId);
    } catch (e) {
      const { captureError } = await import("@/server/monitoring");
      await captureError(e, { source: "WORKER", path: "pro.cancel_deleted" });
    }
  }
  const due = await db.subscription.findMany({ where: { provider: "stripe", subscriptionId: { not: null }, OR: [{ currentPeriodEnd: { lt: new Date(now.getTime() + 86400_000) } }, { status: { in: ["incomplete", "past_due"] } }] }, take: 200 });
  for (const s of due) {
    try {
      await syncStripeSubscription(await stripe().subscriptions.retrieve(s.subscriptionId!));
    } catch (e) {
      const { captureError } = await import("@/server/monitoring");
      await captureError(e, { source: "WORKER", path: "pro.sync" });
    }
  }
}

/** Konto gelöscht: laufendes Abo sofort beenden, damit nicht weiter abgebucht wird. */
export async function endProForDeletedAccount(userId: string) {
  const s = await db.subscription.findUnique({ where: { userId } });
  if (!s || s.status === "canceled") return false;
  if (s.provider === "stripe" && s.subscriptionId) {
    // Ohne Stripe-Schlüssel (z. B. im Worker vergessen) kann das Abo nicht gekündigt werden. Dann NICHT
    // lokal als beendet markieren – sonst bucht Stripe weiter ab, während Werkuno es für beendet hält.
    // `syncProSubscriptions` holt die Kündigung nach, sobald der Schlüssel gesetzt ist.
    if (paymentsMode() !== "stripe") {
      const { captureError } = await import("@/server/monitoring");
      await captureError(new Error("Pro-Abo eines gelöschten Kontos konnte nicht gekündigt werden: STRIPE_SECRET_KEY fehlt"), { source: "WORKER", path: "pro.cancel_deleted", meta: { subscriptionId: s.subscriptionId } });
      return false;
    }
    try {
      await stripe().subscriptions.cancel(s.subscriptionId, { invoice_now: false, prorate: false });
    } catch (e) {
      // Bereits beendet → in Ordnung; alles andere soll der Job erneut versuchen
      if (!/No such subscription|canceled/i.test((e as Error).message ?? "")) throw e;
    }
  }
  await db.subscription.update({ where: { userId }, data: { status: "canceled", cancelAtPeriodEnd: false } });
  await syncProFlag(userId);
  return true;
}

/* ───────────────────────── Administration ───────────────────────── */

const grantSchema = z.object({ days: z.coerce.number().int().min(0).max(3650).default(0), note: z.string().trim().max(200).default("") });

/** Pro schenken (days = 0: unbefristet). Bezahlte Abos werden nicht überschrieben. */
export async function grantPro(actor: Pick<SessionUser, "id" | "role">, userId: string, input: unknown) {
  if (!hasRole(actor, "ADMIN")) throw fail.forbidden();
  if (userId === actor.id) throw fail.forbidden("Pro kann man sich nicht selbst schenken – das macht eine andere Person aus der Administration.");
  const { days, note } = grantSchema.parse(input ?? {});
  // Gesperrte oder gelöschte Konten werden nicht begünstigt
  const u = await db.user.findUnique({ where: { id: userId }, select: { status: true } });
  if (!u) throw fail.notFound();
  if (u.status !== "ACTIVE") throw fail.conflict("Gesperrte oder gelöschte Konten erhalten kein geschenktes Pro.");
  const s = await db.subscription.findUnique({ where: { userId } });
  if (s && s.provider === "stripe" && isActiveSubscription(s)) throw fail.conflict("Diese Person hat bereits ein bezahltes Abo.");
  const data = { interval: "comp", status: "active", provider: "comp", currentPeriodEnd: days ? new Date(Date.now() + days * 86400_000) : null, cancelAtPeriodEnd: false, grantedById: actor.id, note: note || null, priceMinor: null };
  await db.subscription.upsert({ where: { userId }, create: { userId, ...data }, update: data });
  await syncProFlag(userId);
  await audit({ action: "pro.grant", actorId: actor.id, targetType: "USER", targetId: userId, meta: { days, note } });
  await tell(userId, `Werkuno hat dir ${PRO_NAME} geschenkt${days ? ` – für ${days} Tage` : ""}. Viel Freude damit!`);
  return { granted: true };
}

export async function revokePro(actor: Pick<SessionUser, "id" | "role">, userId: string) {
  if (!hasRole(actor, "ADMIN")) throw fail.forbidden();
  const s = await db.subscription.findUnique({ where: { userId } });
  if (!s || s.provider !== "comp") throw fail.invalid("Nur geschenkte Zugänge können hier entzogen werden.");
  await db.subscription.update({ where: { userId }, data: { status: "canceled", currentPeriodEnd: new Date() } });
  await syncProFlag(userId);
  await audit({ action: "pro.revoke", actorId: actor.id, targetType: "USER", targetId: userId });
  return { revoked: true };
}
