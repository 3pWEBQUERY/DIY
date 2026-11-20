import "server-only";
import { createHmac } from "node:crypto";
import type Stripe from "stripe";
import { SUPPORT_APPLE_PRODUCTS, SUPPORT_TIERS_MINOR, formatMoney, supportPlanSchema, supportTierForAppleProduct, type SupportTier } from "@werkraum/shared";
import { db, type Prisma } from "@/server/db";
import { env } from "@/server/env";
import { fail } from "@/server/errors";
import { audit } from "@/server/audit";
import { notify } from "@/server/notifications";
import { rateLimit } from "@/server/ratelimit";
import { getSetting } from "@/server/settings";
import { isBlockedBetween } from "@/server/visibility";
import { captureError } from "@/server/monitoring";
import { AppStoreVerificationError, verifyAppStoreJws, type AppStoreTransaction } from "@/server/commerce/appstore-verify";
import { appUrl, createSellerTransfer, isStripeError, paymentsMode, reverseSellerTransfer, stripe } from "@/server/commerce/stripe";
import type { SessionUser } from "@/server/auth/session";
import { BRAND } from "@/config/brand";

/**
 * Unterstützer-Abo: Fans unterstützen eine Person (Creator) monatlich und erhalten Zugang zu deren
 * exklusiven Anleitungen.
 * - Web: Stripe-Abo, verlängert sich monatlich; Zahlung direkt an das Stripe-Konto des Shops
 *   (Destination Charge), Werkuno behält `supporters.feeBps`.
 * - iOS: Apple „Abo ohne automatische Verlängerung“ (1 Monat) je Stufe. Mehrere Creator gleichzeitig sind
 *   möglich (bei Abos mit Verlängerung erlaubt Apple nur eines je Gruppe). Jeder Kauf verlängert um einen
 *   Monat; Werkuno überweist den Creator-Anteil aus dem eigenen Stripe-Guthaben.
 * Auszahlungen setzen einen aktiven Shop mit Stripe-Konto voraus (Verifizierung, Steuerangaben).
 */

const MONTH_DAYS = 30;
const ACTIVE = new Set(["active", "past_due", "trialing"]);
const MAX_TRANSFER_ATTEMPTS = 24;
const log = (level: "info" | "warn" | "error", msg: string, extra: Record<string, unknown> = {}) => console[level === "info" ? "info" : level](JSON.stringify({ level, svc: "supporters", msg, ...extra }));

type SupporterRow = { status: string; provider: string; currentPeriodEnd: Date | null };

/** Läuft die Unterstützung? Stripe: Status; Apple/Test: bezahlter Monat noch nicht abgelaufen. */
export function isSupportActive(r: SupporterRow | null | undefined, now = new Date()) {
  if (!r || !ACTIVE.has(r.status)) return false;
  if (!r.currentPeriodEnd) return r.provider === "stripe";
  // Stripe: kurze Kulanz, bis die Verlängerung per Webhook eintrifft
  const grace = r.provider === "stripe" ? 2 * 86_400_000 : 0;
  return r.currentPeriodEnd.getTime() + grace > now.getTime();
}

export async function supportFeeBps() {
  const v = Number(await getSetting("supporters.feeBps"));
  return Number.isFinite(v) && v >= 0 && v <= 5000 ? v : 1500;
}

export function splitAmount(amountMinor: number, feeBps: number) {
  const fee = Math.round((amountMinor * feeBps) / 10_000);
  return { platformFeeMinor: fee, creatorNetMinor: amountMinor - fee };
}

function addMonth(from: Date) {
  return new Date(from.getTime() + MONTH_DAYS * 86_400_000);
}

async function tell(userId: string, message: string, href: string) {
  await notify({ recipientId: userId, type: "SECURITY", bundle: false, data: { kind: "SUPPORT", message, href } }).catch(() => {});
}

/* ───────────────────────── Creator: Plan und Voraussetzungen ───────────────────────── */

/** Auszahlungskonto des Creators (Shop mit Stripe-Konto). */
async function payoutShop(creatorId: string) {
  return db.shop.findUnique({ where: { ownerId: creatorId }, select: { id: true, name: true, status: true, stripeAccountId: true, chargesEnabled: true } });
}

export async function supportEligibility(creatorId: string) {
  const shop = await payoutShop(creatorId);
  const mode = paymentsMode();
  if (mode === "disabled") return { ok: false as const, reason: "Zahlungen sind auf Werkuno noch nicht aktiviert." };
  if (!shop) return { ok: false as const, reason: "Für Auszahlungen brauchst du einen Shop mit verifiziertem Auszahlungskonto. Eröffne ihn unter „Shopverwaltung“." };
  if (shop.status !== "ACTIVE") return { ok: false as const, reason: "Dein Shop ist noch nicht freigeschaltet. Sobald die Verifizierung abgeschlossen ist, kannst du Unterstützungen annehmen." };
  if (mode === "stripe" && (!shop.stripeAccountId || !shop.chargesEnabled)) return { ok: false as const, reason: "Dein Stripe-Konto kann noch keine Zahlungen annehmen. Schliesse die Angaben unter „Shopverwaltung“ ab." };
  return { ok: true as const, reason: null };
}

const supporterUser = { select: { id: true, profile: { select: { handle: true, displayName: true, avatarUrl: true } } } } as const;

/** Studio: eigener Plan, Voraussetzungen, Zahlen und Liste der Unterstützer:innen. */
export async function getMySupportStudio(userId: string) {
  const now = new Date();
  const [plan, eligibility, rows, exclusive, feeBps, last30] = await Promise.all([
    db.supportPlan.findUnique({ where: { userId } }),
    supportEligibility(userId),
    db.supporter.findMany({ where: { creatorId: userId, status: { not: "incomplete" } }, orderBy: { createdAt: "desc" }, take: 500, include: { supporter: supporterUser } }),
    db.tutorial.count({ where: { authorId: userId, supportersOnly: true, state: { not: "REMOVED" } } }),
    supportFeeBps(),
    db.supportPayment.aggregate({ where: { creatorId: userId, refundedAt: null, createdAt: { gte: new Date(now.getTime() - 30 * 86_400_000) } }, _sum: { creatorNetMinor: true, amountMinor: true } }),
  ]);
  const active = rows.filter((r) => isSupportActive(r, now));
  return {
    plan: { enabled: plan?.enabled ?? false, priceMinor: (plan?.priceMinor ?? 500) as number, perks: plan?.perks ?? "" },
    eligibility,
    feeBps,
    tiers: SUPPORT_TIERS_MINOR,
    exclusiveTutorials: exclusive,
    stats: { active: active.length, last30NetMinor: last30._sum.creatorNetMinor ?? 0, last30GrossMinor: last30._sum.amountMinor ?? 0 },
    supporters: rows.map((r) => ({
      id: r.id,
      handle: r.supporter.profile?.handle ?? "",
      displayName: r.supporter.profile?.displayName ?? "Unbekannt",
      avatarUrl: r.supporter.profile?.avatarUrl ?? null,
      provider: r.provider,
      priceMinor: r.priceMinor,
      since: r.createdAt.toISOString(),
      currentPeriodEnd: r.currentPeriodEnd?.toISOString() ?? null,
      cancelAtPeriodEnd: r.cancelAtPeriodEnd,
      active: isSupportActive(r, now),
    })),
  };
}

export async function saveSupportPlan(user: Pick<SessionUser, "id">, input: unknown) {
  const data = supportPlanSchema.parse(input);
  await rateLimit(`support-plan:${user.id}`, 30, 3600);
  if (data.enabled) {
    const e = await supportEligibility(user.id);
    if (!e.ok) throw fail.invalid(e.reason);
  }
  const before = await db.supportPlan.findUnique({ where: { userId: user.id } });
  await db.supportPlan.upsert({ where: { userId: user.id }, create: { userId: user.id, ...data }, update: data });
  await audit({ actorId: user.id, action: data.enabled ? "support.plan_saved" : "support.plan_disabled", targetType: "USER", targetId: user.id, meta: { priceMinor: data.priceMinor } });
  // Ausgeschaltet: laufende Web-Abos enden zum Periodenende, Unterstützer:innen werden informiert
  if (before?.enabled && !data.enabled) await endStripeSupportsOf(user.id, "Die Person hat ihr Unterstützer-Abo beendet");
  return { enabled: data.enabled };
}

async function endStripeSupportsOf(creatorId: string, reason: string) {
  const rows = await db.supporter.findMany({ where: { creatorId, provider: "stripe", status: { in: [...ACTIVE] }, cancelAtPeriodEnd: false, stripeSubscriptionId: { not: null } }, select: { id: true, supporterId: true, stripeSubscriptionId: true } });
  const creator = await db.userProfile.findUnique({ where: { userId: creatorId }, select: { displayName: true, handle: true } });
  for (const r of rows) {
    try {
      if (paymentsMode() === "stripe") await stripe().subscriptions.update(r.stripeSubscriptionId!, { cancel_at_period_end: true, metadata: { endedReason: reason.slice(0, 200) } });
      await db.supporter.update({ where: { id: r.id }, data: { cancelAtPeriodEnd: true } });
      await tell(r.supporterId, `${creator?.displayName ?? "Eine Person"} nimmt keine Unterstützungen mehr an. Deine Unterstützung endet zum Ende des bezahlten Monats – es wird nichts mehr abgebucht.`, `/u/${creator?.handle ?? ""}`);
    } catch (e) {
      await captureError(e, { source: "SERVER", path: "support.end_on_disable", meta: { supporterRowId: r.id } });
    }
  }
}

/* ───────────────────────── Öffentlich: Angebot und Zugang ───────────────────────── */

/** Unterstützt `viewerId` die Person `creatorId` gerade (oder ist es die Person selbst)? */
export async function canAccessSupporterContent(viewerId: string | null | undefined, creatorId: string) {
  if (!viewerId) return false;
  if (viewerId === creatorId) return true;
  const r = await db.supporter.findUnique({ where: { creatorId_supporterId: { creatorId, supporterId: viewerId } }, select: { status: true, provider: true, currentPeriodEnd: true } });
  return isSupportActive(r);
}

/** Angebot auf Profil, gesperrter Anleitung und in der App. Null, wenn die Person keines anbietet. */
export async function supportOffer(creatorId: string, viewerId: string | null) {
  const plan = await db.supportPlan.findUnique({ where: { userId: creatorId }, include: { user: { select: { status: true, profile: { select: { handle: true, displayName: true, avatarUrl: true } } } } } });
  const mine = viewerId && viewerId !== creatorId ? await db.supporter.findUnique({ where: { creatorId_supporterId: { creatorId, supporterId: viewerId } } }) : null;
  const mineView = mine && mine.status !== "incomplete"
    ? { active: isSupportActive(mine), provider: mine.provider, priceMinor: mine.priceMinor, currentPeriodEnd: mine.currentPeriodEnd?.toISOString() ?? null, cancelAtPeriodEnd: mine.cancelAtPeriodEnd, since: mine.createdAt.toISOString() }
    : null;
  if (!plan || plan.user.status !== "ACTIVE" || !plan.user.profile) return mineView ? { enabled: false, me: mineView, creator: null, priceMinor: mine!.priceMinor, perks: "", exclusiveTutorials: 0, appleProductId: null } : null;
  if (!plan.enabled && !mineView) return null;
  const exclusiveTutorials = await db.tutorial.count({ where: { authorId: creatorId, supportersOnly: true, state: "PUBLISHED" } });
  return {
    enabled: plan.enabled,
    priceMinor: plan.priceMinor,
    perks: plan.perks,
    exclusiveTutorials,
    creator: { id: creatorId, handle: plan.user.profile.handle, displayName: plan.user.profile.displayName, avatarUrl: plan.user.profile.avatarUrl },
    me: mineView,
    appleProductId: SUPPORT_APPLE_PRODUCTS[plan.priceMinor as SupportTier] ?? null,
  };
}
export type SupportOffer = NonNullable<Awaited<ReturnType<typeof supportOffer>>>;

async function assertCanSupport(user: Pick<SessionUser, "id">, creatorId: string) {
  if (user.id === creatorId) throw fail.invalid("Dich selbst kannst du nicht unterstützen.");
  const plan = await db.supportPlan.findUnique({ where: { userId: creatorId }, include: { user: { select: { status: true, profile: { select: { handle: true, displayName: true } } } } } });
  if (!plan?.enabled || plan.user.status !== "ACTIVE" || !plan.user.profile) throw fail.notFound("Diese Person nimmt gerade keine Unterstützungen an.");
  if (await isBlockedBetween(user.id, creatorId)) throw fail.notFound("Diese Person nimmt gerade keine Unterstützungen an.");
  const e = await supportEligibility(creatorId);
  if (!e.ok) throw fail.unavailable("Diese Person kann gerade keine Unterstützungen annehmen.");
  return { plan, profile: plan.user.profile };
}

/* ───────────────────────── Web: Stripe ───────────────────────── */

const SUPPORT_LOCK = (userId: string, creatorId: string) => `support-checkout:${userId}:${creatorId}`;

export async function startSupportCheckout(user: Pick<SessionUser, "id" | "email">, creatorId: string) {
  await rateLimit(`support-checkout:${user.id}`, 10, 3600);
  const { plan, profile } = await assertCanSupport(user, creatorId);
  const existing = await db.supporter.findUnique({ where: { creatorId_supporterId: { creatorId, supporterId: user.id } } });
  if (existing && isSupportActive(existing)) {
    if (existing.provider === "apple") throw fail.conflict(`Du unterstützt ${profile.displayName} bereits über die iOS-App.`);
    throw fail.conflict(`Du unterstützt ${profile.displayName} bereits.`);
  }
  const mode = paymentsMode();
  const back = `/u/${profile.handle}`;

  if (mode === "simulated") {
    const feeBps = await supportFeeBps();
    const end = addMonth(new Date());
    const row = await db.supporter.upsert({
      where: { creatorId_supporterId: { creatorId, supporterId: user.id } },
      create: { creatorId, supporterId: user.id, provider: "simulated", status: "active", priceMinor: plan.priceMinor, currentPeriodEnd: end },
      update: { provider: "simulated", status: "active", priceMinor: plan.priceMinor, currentPeriodEnd: end, cancelAtPeriodEnd: false, stripeSubscriptionId: null },
    });
    await db.supportPayment.create({ data: { supporterRowId: row.id, creatorId, provider: "simulated", amountMinor: plan.priceMinor, ...splitAmount(plan.priceMinor, feeBps), periodStart: new Date(), periodEnd: end } });
    await welcome(row.id);
    return `${back}?unterstuetzt=1`;
  }
  if (mode !== "stripe") throw fail.unavailable("Zahlungen sind noch nicht aktiviert.");

  try {
    return await db.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${SUPPORT_LOCK(user.id, creatorId)}))`;
        return createSupportCheckoutSession(user, creatorId, plan.priceMinor, profile, back);
      },
      { timeout: 45_000, maxWait: 15_000 },
    );
  } catch (e) {
    if (!isStripeError(e)) throw e;
    await captureError(e, { source: "SERVER", path: "support.checkout", userId: user.id, meta: { code: e.code ?? null } });
    throw fail.unavailable("Die Zahlung konnte gerade nicht gestartet werden. Bitte versuche es in ein paar Minuten erneut.");
  }
}

async function supporterCustomer(user: Pick<SessionUser, "id" | "email">) {
  const known = await db.supporter.findFirst({ where: { supporterId: user.id, stripeCustomerId: { not: null } }, select: { stripeCustomerId: true }, orderBy: { updatedAt: "desc" } });
  if (known?.stripeCustomerId) {
    const ok = await stripe()
      .customers.retrieve(known.stripeCustomerId)
      .then((c) => !("deleted" in c && c.deleted), () => false);
    if (ok) return known.stripeCustomerId;
  }
  const c = await stripe().customers.create({ email: user.email, metadata: { userId: user.id, kind: "support" } }, { idempotencyKey: `support-customer:${user.id}:${Date.now() >> 20}` });
  return c.id;
}

async function createSupportCheckoutSession(user: Pick<SessionUser, "id" | "email">, creatorId: string, priceMinor: number, profile: { handle: string; displayName: string }, back: string) {
  const shop = await payoutShop(creatorId);
  if (!shop?.stripeAccountId) throw fail.unavailable("Diese Person kann gerade keine Unterstützungen annehmen.");
  const customer = await supporterCustomer(user);
  // Läuft bei Stripe schon ein Abo für diese Person (Webhook unterwegs)? Übernehmen statt doppelt abschliessen
  const subs = await stripe().subscriptions.list({ customer, status: "all", limit: 20 });
  const running = subs.data.find((s) => s.metadata?.kind === "support" && s.metadata?.creatorId === creatorId && ["active", "trialing", "past_due", "incomplete"].includes(s.status));
  if (running) {
    if (running.status !== "incomplete") {
      await syncSupportStripeSubscription(running);
      throw fail.conflict(`Du unterstützt ${profile.displayName} bereits.`);
    }
    throw fail.conflict("Deine Unterstützung wird gerade abgeschlossen. Bitte warte einen Moment und lade die Seite neu.");
  }
  const open = await stripe().checkout.sessions.list({ customer, status: "open", limit: 20 });
  for (const o of open.data) if (o.metadata?.kind === "support" && o.metadata?.creatorId === creatorId) await stripe().checkout.sessions.expire(o.id).catch(() => {});
  await db.supporter.upsert({
    where: { creatorId_supporterId: { creatorId, supporterId: user.id } },
    create: { creatorId, supporterId: user.id, provider: "stripe", status: "incomplete", priceMinor, stripeCustomerId: customer },
    update: { stripeCustomerId: customer },
  });
  const feeBps = await supportFeeBps();
  const metadata = { kind: "support", creatorId, supporterId: user.id };
  const session = await stripe().checkout.sessions.create({
    mode: "subscription",
    customer,
    client_reference_id: user.id,
    line_items: [{ quantity: 1, price_data: { currency: "chf", unit_amount: priceMinor, recurring: { interval: "month" }, product_data: { name: `Unterstützung für ${profile.displayName}`, metadata } } }],
    subscription_data: { metadata, application_fee_percent: feeBps / 100, transfer_data: { destination: shop.stripeAccountId } },
    metadata,
    locale: "de",
    success_url: appUrl(`${back}?unterstuetzt=1&session_id={CHECKOUT_SESSION_ID}`),
    cancel_url: appUrl(back),
  });
  if (!session.url) throw new Error("Checkout ohne URL");
  return session.url;
}

/** Rückkehr aus dem Checkout: sofort übernehmen (der Webhook kann ein paar Sekunden dauern). */
export async function confirmSupportCheckout(userId: string, sessionId: string | null | undefined) {
  if (paymentsMode() !== "stripe" || !sessionId || !/^cs_[\w]+$/.test(sessionId)) return null;
  try {
    const s = await stripe().checkout.sessions.retrieve(sessionId, { expand: ["subscription"] });
    if (s.client_reference_id !== userId || s.metadata?.kind !== "support" || !s.subscription || typeof s.subscription === "string") return null;
    return await syncSupportStripeSubscription(s.subscription);
  } catch {
    return null;
  }
}

function periodEndOf(sub: Stripe.Subscription) {
  const t = sub.items?.data?.[0]?.current_period_end ?? (sub as unknown as { current_period_end?: number }).current_period_end;
  return t ? new Date(t * 1000) : null;
}

/** Stripe-Abo übernehmen (Webhook, Rückkehr, Abgleich). */
export async function syncSupportStripeSubscription(sub: Stripe.Subscription) {
  const creatorId = sub.metadata?.creatorId;
  const supporterId = sub.metadata?.supporterId;
  if (sub.metadata?.kind !== "support" || !creatorId || !supporterId) return null;
  const existing = await db.supporter.findUnique({ where: { creatorId_supporterId: { creatorId, supporterId } } });
  // Laufende Apple-Unterstützung: ein beendetes Web-Abo überschreibt sie nicht
  if (existing && existing.provider === "apple" && isSupportActive(existing) && existing.stripeSubscriptionId !== sub.id) {
    if (ACTIVE.has(sub.status)) await captureError(new Error("Unterstützung über Web und App gleichzeitig – Web-Abo bitte kündigen und erstatten"), { source: "SERVER", path: "support.duplicate", meta: { creatorId, supporterId, subscription: sub.id } });
    return existing;
  }
  // Zweites Web-Abo derselben Person: nur das bekannte zählt
  if (existing?.stripeSubscriptionId && existing.stripeSubscriptionId !== sub.id && isSupportActive(existing)) return existing;
  const before = existing ? isSupportActive(existing) : false;
  const customer = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
  const data = {
    provider: "stripe",
    status: sub.status === "canceled" || sub.status === "incomplete_expired" || sub.status === "unpaid" ? "canceled" : sub.status === "incomplete" ? "incomplete" : sub.status,
    priceMinor: sub.items?.data?.[0]?.price?.unit_amount ?? existing?.priceMinor ?? 0,
    currency: (sub.items?.data?.[0]?.price?.currency ?? "chf").toUpperCase(),
    currentPeriodEnd: periodEndOf(sub),
    cancelAtPeriodEnd: !!sub.cancel_at_period_end,
    stripeSubscriptionId: sub.id,
    stripeCustomerId: customer,
  };
  const row = await db.supporter.upsert({ where: { creatorId_supporterId: { creatorId, supporterId } }, create: { creatorId, supporterId, ...data }, update: data });
  const after = isSupportActive(row);
  if (!before && after) await welcome(row.id);
  if (before && !after) await ended(row.id);
  return row;
}

/** Bezahlte Rechnung eines Web-Abos als Zahlung erfassen (Einnahmen im Studio). */
async function recordStripeInvoice(invoice: Stripe.Invoice) {
  if (!invoice.id || (invoice.amount_paid ?? 0) <= 0) return;
  const subRef = (invoice as unknown as { subscription?: string | { id: string } | null }).subscription ?? invoice.parent?.subscription_details?.subscription ?? null;
  const subId = typeof subRef === "string" ? subRef : subRef?.id;
  if (!subId) return;
  const row = await db.supporter.findUnique({ where: { stripeSubscriptionId: subId }, select: { id: true, creatorId: true } });
  if (!row) return;
  const feeBps = await supportFeeBps();
  const line = invoice.lines?.data?.[0];
  await db.supportPayment
    .create({
      data: {
        supporterRowId: row.id,
        creatorId: row.creatorId,
        provider: "stripe",
        amountMinor: invoice.amount_paid,
        currency: (invoice.currency ?? "chf").toUpperCase(),
        ...splitAmount(invoice.amount_paid, feeBps),
        stripeInvoiceId: invoice.id,
        periodStart: line?.period?.start ? new Date(line.period.start * 1000) : null,
        periodEnd: line?.period?.end ? new Date(line.period.end * 1000) : null,
      },
    })
    .catch((e) => {
      if ((e as { code?: string }).code !== "P2002") throw e; // doppelt zugestellt
    });
}

/** Stripe-Webhook: true, wenn das Ereignis ein Unterstützer-Abo betraf. */
export async function handleSupportStripeEvent(event: Stripe.Event) {
  switch (event.type) {
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
      if (sub.metadata?.kind !== "support") return false;
      await syncSupportStripeSubscription(sub);
      return true;
    }
    case "checkout.session.completed": {
      const s = event.data.object as Stripe.Checkout.Session;
      if (s.metadata?.kind !== "support") return false;
      if (s.subscription) {
        const sub = typeof s.subscription === "string" ? await stripe().subscriptions.retrieve(s.subscription) : s.subscription;
        await syncSupportStripeSubscription(sub);
      }
      return true;
    }
    case "invoice.paid":
    case "invoice.payment_succeeded": {
      const inv = event.data.object as Stripe.Invoice;
      const meta = inv.parent?.subscription_details?.metadata ?? (inv as unknown as { subscription_details?: { metadata?: Record<string, string> } }).subscription_details?.metadata;
      if (meta?.kind !== "support" && !(await db.supporter.findFirst({ where: { stripeCustomerId: typeof inv.customer === "string" ? inv.customer : (inv.customer?.id ?? "-") }, select: { id: true } }))) return false;
      await recordStripeInvoice(inv);
      return meta?.kind === "support";
    }
    default:
      return false;
  }
}

/** Web-Abo zum Monatsende kündigen bzw. Kündigung zurücknehmen. */
export async function setSupportCancel(user: Pick<SessionUser, "id">, creatorId: string, cancel: boolean) {
  const r = await db.supporter.findUnique({ where: { creatorId_supporterId: { creatorId, supporterId: user.id } } });
  if (!r || !isSupportActive(r)) throw fail.invalid("Du unterstützt diese Person gerade nicht.");
  if (r.provider === "apple") throw fail.invalid("Unterstützungen aus der iOS-App verlängern sich nicht automatisch – sie enden von selbst am angezeigten Datum.");
  await rateLimit(`support-cancel:${user.id}`, 20, 3600);
  if (r.provider === "stripe" && r.stripeSubscriptionId) {
    const sub = await stripe().subscriptions.update(r.stripeSubscriptionId, { cancel_at_period_end: cancel });
    await syncSupportStripeSubscription(sub);
  } else {
    await db.supporter.update({ where: { id: r.id }, data: { cancelAtPeriodEnd: cancel } });
  }
  return { cancelAtPeriodEnd: cancel };
}

/** Eigene Unterstützungen (Einstellungen). */
export async function listMySupporting(userId: string) {
  const rows = await db.supporter.findMany({
    where: { supporterId: userId, status: { not: "incomplete" } },
    orderBy: { updatedAt: "desc" },
    include: { creator: { select: { profile: { select: { handle: true, displayName: true, avatarUrl: true } } } } },
  });
  const now = new Date();
  return rows.map((r) => ({
    creatorId: r.creatorId,
    handle: r.creator.profile?.handle ?? "",
    displayName: r.creator.profile?.displayName ?? "Unbekannt",
    avatarUrl: r.creator.profile?.avatarUrl ?? null,
    provider: r.provider,
    priceMinor: r.priceMinor,
    currency: r.currency,
    active: isSupportActive(r, now),
    cancelAtPeriodEnd: r.cancelAtPeriodEnd,
    currentPeriodEnd: r.currentPeriodEnd?.toISOString() ?? null,
    since: r.createdAt.toISOString(),
  }));
}

/* ───────────────────────── App: Apple ───────────────────────── */

/** Stabiles appAccountToken je Konto und Creator (UUID-Format, nicht umkehrbar). */
export function supportAccountToken(userId: string, creatorId: string) {
  const h = createHmac("sha256", env().SESSION_SECRET).update(`support-apple:${userId}:${creatorId}`).digest("hex");
  const v = ((parseInt(h[16]!, 16) & 0x3) | 0x8).toString(16);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-${v}${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

/** Kaufdaten für die App: Apple-Produkt der Stufe und Konto-Token. */
export async function appleSupportOffer(user: Pick<SessionUser, "id">, creatorId: string) {
  const { plan } = await assertCanSupport(user, creatorId);
  const productId = SUPPORT_APPLE_PRODUCTS[plan.priceMinor as SupportTier];
  if (!productId) throw fail.unavailable("Diese Stufe ist in der App nicht erhältlich.");
  return { productId, appAccountToken: supportAccountToken(user.id, creatorId) };
}

function verify<T>(jws: string): T {
  try {
    return verifyAppStoreJws<T>(jws);
  } catch (e) {
    if (e instanceof AppStoreVerificationError) throw fail.invalid(`Der Beleg von Apple konnte nicht geprüft werden (${e.message}).`);
    throw e;
  }
}

/**
 * Kauf aus der App verbuchen: verlängert die Unterstützung um einen Monat (ab Ende des laufenden
 * Monats). Idempotent über die Apple-Transaktions-ID.
 */
export async function syncAppleSupportFromApp(user: Pick<SessionUser, "id">, creatorId: string, input: { signedTransaction?: unknown }) {
  const signed = typeof input.signedTransaction === "string" ? input.signedTransaction : "";
  if (!signed) throw fail.invalid("Kaufbeleg fehlt.", { signedTransaction: "Pflichtfeld" });
  const t = verify<AppStoreTransaction>(signed);
  if (t.bundleId !== env().APPLE_IAP_BUNDLE_ID) throw fail.invalid("Der Kaufbeleg gehört zu einer anderen App.");
  const tier = supportTierForAppleProduct(t.productId);
  if (!tier) throw fail.invalid("Der Kaufbeleg gehört nicht zu einer Unterstützung.");
  if ((t.appAccountToken ?? "").toLowerCase() !== supportAccountToken(user.id, creatorId)) throw fail.forbidden("Dieser Kauf gehört zu einem anderen Konto oder einer anderen Person.");
  if (t.revocationDate) throw fail.invalid("Dieser Kauf wurde von Apple erstattet.");
  const done = await db.supportPayment.findUnique({ where: { appleTransactionId: t.transactionId }, select: { supporterRowId: true } });
  if (done) return supportStateFor(user.id, creatorId);
  // Kein erneuter Zugriffscheck auf „nimmt an“: bezahlt ist bezahlt (z. B. Plan zwischen Kauf und Meldung ausgeschaltet)
  if (user.id === creatorId) throw fail.invalid("Dich selbst kannst du nicht unterstützen.");
  const feeBps = await supportFeeBps();
  const environment = t.environment;
  const transferStatus = environment === "Production" && paymentsMode() === "stripe" ? "PENDING" : "NONE";
  const now = new Date();

  const paymentId = await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`support-apple:${user.id}:${creatorId}`}))`;
    const again = await tx.supportPayment.findUnique({ where: { appleTransactionId: t.transactionId }, select: { id: true } });
    if (again) return null;
    const existing = await tx.supporter.findUnique({ where: { creatorId_supporterId: { creatorId, supporterId: user.id } } });
    if (existing && existing.provider === "stripe" && isSupportActive(existing)) {
      await captureError(new Error("Unterstützung über App neben laufendem Web-Abo"), { source: "SERVER", path: "support.apple_duplicate", userId: user.id, meta: { creatorId, transactionId: t.transactionId } });
      throw fail.conflict("Du unterstützt diese Person bereits über die Website. Bitte beantrage bei Apple eine Erstattung für diesen Kauf.");
    }
    const startFrom = existing && existing.provider === "apple" && existing.currentPeriodEnd && existing.currentPeriodEnd > now ? existing.currentPeriodEnd : now;
    const end = addMonth(startFrom);
    const row = await tx.supporter.upsert({
      where: { creatorId_supporterId: { creatorId, supporterId: user.id } },
      create: { creatorId, supporterId: user.id, provider: "apple", status: "active", priceMinor: tier, currentPeriodEnd: end },
      update: { provider: "apple", status: "active", priceMinor: tier, currentPeriodEnd: end, cancelAtPeriodEnd: true, stripeSubscriptionId: null, remindedAt: null },
    });
    const p = await tx.supportPayment.create({
      data: {
        supporterRowId: row.id,
        creatorId,
        provider: "apple",
        // Abgerechnet wird auf Basis der Web-Stufe – der App-Preis deckt die Apple-Gebühr
        amountMinor: tier,
        ...splitAmount(tier, feeBps),
        appleTransactionId: t.transactionId,
        appleEnvironment: environment,
        transferStatus,
        periodStart: startFrom,
        periodEnd: end,
      },
    });
    return { paymentId: p.id, rowId: row.id, first: !existing || !isSupportActive(existing, now) };
  });
  if (paymentId) {
    // Apple-Monate verlängern sich nicht selbst: Ende ist immer „zum Periodenende“
    await db.supporter.update({ where: { id: paymentId.rowId }, data: { cancelAtPeriodEnd: true } });
    if (paymentId.first) await welcome(paymentId.rowId);
    if (transferStatus === "PENDING") await sendSupportTransfer(paymentId.paymentId).catch((e) => captureError(e, { source: "SERVER", path: "support.transfer" }));
    await audit({ actorId: user.id, action: "support.apple_purchase", targetType: "USER", targetId: creatorId, meta: { productId: t.productId, environment } });
  }
  return supportStateFor(user.id, creatorId);
}

/**
 * Kauf ohne bekannte Person verbuchen (z. B. offene Transaktion nach Neuinstallation der App): Die
 * Person ergibt sich aus dem Konto-Token, das nur für (Konto, Creator) passt.
 */
export async function syncAppleSupportByToken(user: Pick<SessionUser, "id">, input: { signedTransaction?: unknown }) {
  const signed = typeof input.signedTransaction === "string" ? input.signedTransaction : "";
  if (!signed) throw fail.invalid("Kaufbeleg fehlt.", { signedTransaction: "Pflichtfeld" });
  const t = verify<AppStoreTransaction>(signed);
  const token = (t.appAccountToken ?? "").toLowerCase();
  if (!token) throw fail.invalid("Der Kaufbeleg enthält keine Zuordnung.");
  const known = await db.supportPayment.findUnique({ where: { appleTransactionId: t.transactionId }, select: { creatorId: true } });
  if (known) return { creatorId: known.creatorId, ...(await supportStateFor(user.id, known.creatorId)) };
  const plans = await db.supportPlan.findMany({ select: { userId: true }, take: 50_000 });
  const creatorId = plans.map((p) => p.userId).find((id) => supportAccountToken(user.id, id) === token);
  if (!creatorId) throw fail.forbidden("Dieser Kauf gehört zu einem anderen Konto.");
  return { creatorId, ...(await syncAppleSupportFromApp(user, creatorId, input)) };
}

async function supportStateFor(userId: string, creatorId: string) {
  const r = await db.supporter.findUnique({ where: { creatorId_supporterId: { creatorId, supporterId: userId } } });
  return { active: isSupportActive(r), currentPeriodEnd: r?.currentPeriodEnd?.toISOString() ?? null, provider: r?.provider ?? null };
}

/** Apple: Erstattung bzw. Widerruf einer Unterstützung. True, wenn die Transaktion bekannt war. */
export async function handleAppleSupportRefund(transactionId: string) {
  const p = await db.supportPayment.findUnique({ where: { appleTransactionId: transactionId }, include: { supporterRow: true } });
  if (!p) return false;
  if (p.refundedAt) return true;
  await db.supportPayment.update({ where: { id: p.id }, data: { refundedAt: new Date() } });
  // Zeitraum dieser Zahlung zurücknehmen
  const row = p.supporterRow;
  if (row.provider === "apple" && row.currentPeriodEnd && p.periodStart) {
    const remaining = row.currentPeriodEnd.getTime() - (p.periodEnd?.getTime() ?? row.currentPeriodEnd.getTime());
    const newEnd = new Date(Math.max(Date.now(), p.periodStart.getTime() + Math.max(0, remaining)));
    await db.supporter.update({ where: { id: row.id }, data: { currentPeriodEnd: newEnd, ...(newEnd.getTime() <= Date.now() ? { status: "canceled" } : {}) } });
  }
  if (p.transferStatus === "SENT" && p.transferId) {
    try {
      await reverseSellerTransfer(p.transferId, `support-reversal:${p.id}`);
      await db.supportPayment.update({ where: { id: p.id }, data: { transferStatus: "REVERSED" } });
    } catch (e) {
      await captureError(e, { source: "SERVER", path: "support.reversal", meta: { paymentId: p.id } });
    }
  } else if (p.transferStatus === "PENDING" || p.transferStatus === "FAILED") {
    await db.supportPayment.update({ where: { id: p.id }, data: { transferStatus: "NONE" } });
  }
  return true;
}

/** Creator-Anteil eines Apple-Kaufs überweisen (Stripe Connect, aus dem Werkuno-Guthaben). */
export async function sendSupportTransfer(paymentId: string) {
  const p = await db.supportPayment.findUnique({ where: { id: paymentId } });
  if (!p || (p.transferStatus !== "PENDING" && p.transferStatus !== "FAILED") || p.refundedAt) return "skipped" as const;
  const shop = await db.shop.findUnique({ where: { ownerId: p.creatorId }, select: { stripeAccountId: true, status: true, owner: { select: { status: true } } } });
  if (!shop || shop.status === "SUSPENDED" || shop.owner.status === "BANNED" || shop.owner.status === "DELETED") {
    await db.supportPayment.update({ where: { id: p.id }, data: { transferError: "Zurückgehalten: Shop gesperrt bzw. Konto gesperrt oder gelöscht" } });
    return "held" as const;
  }
  if (!shop.stripeAccountId || p.creatorNetMinor <= 0) {
    await db.supportPayment.update({ where: { id: p.id }, data: { transferStatus: "FAILED", transferAttempts: { increment: 1 }, transferError: "Kein Auszahlungskonto" } });
    return "failed" as const;
  }
  try {
    const tr = await createSellerTransfer({ accountId: shop.stripeAccountId, amountMinor: p.creatorNetMinor, currency: p.currency, orderId: p.id, orderNumber: `SUP-${p.id.slice(-8).toUpperCase()}`, idempotencyKey: `support-transfer:${p.id}` });
    await db.supportPayment.update({ where: { id: p.id }, data: { transferStatus: "SENT", transferId: tr.id, transferError: null, transferAttempts: { increment: 1 } } });
    return "sent" as const;
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await db.supportPayment.update({ where: { id: p.id }, data: { transferStatus: "FAILED", transferAttempts: { increment: 1 }, transferError: message.slice(0, 500) } });
    log("warn", "support_transfer_failed", { paymentId: p.id, err: message });
    return "failed" as const;
  }
}

/** Worker: offene Überweisungen nachholen und vor dem Ende von App-Unterstützungen erinnern. */
export async function supportMaintenance(now = new Date()) {
  const due = await db.supportPayment.findMany({
    where: { transferStatus: { in: ["PENDING", "FAILED"] }, transferAttempts: { lt: MAX_TRANSFER_ATTEMPTS }, refundedAt: null, updatedAt: { lt: new Date(now.getTime() - 30 * 60_000) } },
    orderBy: { updatedAt: "asc" },
    take: 50,
    select: { id: true, transferAttempts: true },
  });
  let sent = 0;
  for (const p of due) {
    const r = await sendSupportTransfer(p.id);
    if (r === "sent") sent++;
    if (r === "failed" && p.transferAttempts + 1 >= MAX_TRANSFER_ATTEMPTS) await captureError(new Error("Überweisung einer Unterstützung nach allen Versuchen fehlgeschlagen"), { source: "WORKER", path: "support.transfer", meta: { paymentId: p.id } });
  }
  // Erinnerung 3 Tage vor dem Ende eines App-Monats
  const soon = await db.supporter.findMany({
    where: { provider: "apple", status: "active", remindedAt: null, currentPeriodEnd: { gt: now, lt: new Date(now.getTime() + 3 * 86_400_000) } },
    take: 200,
    select: { id: true, supporterId: true, currentPeriodEnd: true, creator: { select: { profile: { select: { handle: true, displayName: true } } } } },
  });
  for (const r of soon) {
    const name = r.creator.profile?.displayName ?? "die Person";
    const day = r.currentPeriodEnd!.toLocaleDateString("de-CH", { day: "numeric", month: "long", timeZone: "Europe/Zurich" });
    await tell(r.supporterId, `Deine Unterstützung für ${name} endet am ${day}. Verlängere sie in der App um einen weiteren Monat, wenn du weiterhin dabei sein möchtest.`, `/u/${r.creator.profile?.handle ?? ""}`);
    await db.supporter.update({ where: { id: r.id }, data: { remindedAt: now } });
  }
  // Abgelaufene App-/Test-Unterstützungen beenden
  const expired = await db.supporter.updateMany({ where: { provider: { in: ["apple", "simulated"] }, status: "active", currentPeriodEnd: { lt: now } }, data: { status: "canceled" } });
  return { transfers: due.length, sent, reminded: soon.length, expired: expired.count };
}

/* ───────────────────────── Nachrichten ───────────────────────── */

async function welcome(rowId: string) {
  const r = await db.supporter.findUnique({
    where: { id: rowId },
    include: { creator: { select: { profile: { select: { handle: true, displayName: true } } } }, supporter: { select: { profile: { select: { handle: true, displayName: true } } } } },
  });
  if (!r) return;
  const creatorName = r.creator.profile?.displayName ?? "die Person";
  await tell(r.supporterId, `Danke! Du unterstützt jetzt ${creatorName}. Exklusive Anleitungen sind für dich freigeschaltet.`, `/u/${r.creator.profile?.handle ?? ""}`);
  await tell(r.creatorId, `${r.supporter.profile?.displayName ?? "Jemand"} unterstützt dich jetzt mit ${formatMoney(r.priceMinor)} im Monat.`, "/studio/unterstuetzer");
}

async function ended(rowId: string) {
  const r = await db.supporter.findUnique({ where: { id: rowId }, include: { creator: { select: { profile: { select: { handle: true, displayName: true } } } } } });
  if (!r) return;
  await tell(r.supporterId, `Deine Unterstützung für ${r.creator.profile?.displayName ?? "die Person"} ist beendet. Danke, dass du dabei warst!`, `/u/${r.creator.profile?.handle ?? ""}`);
}

/* ───────────────────────── Hilfen für andere Bereiche ───────────────────────── */

/** Für Konto-Löschung: laufende Web-Abos beenden (als Unterstützer:in und als Creator). */
export async function endSupportsForDeletedAccount(userId: string) {
  const rows = await db.supporter.findMany({ where: { OR: [{ supporterId: userId }, { creatorId: userId }], provider: "stripe", stripeSubscriptionId: { not: null }, status: { in: [...ACTIVE] } }, select: { stripeSubscriptionId: true } });
  for (const r of rows) {
    if (paymentsMode() === "stripe") await stripe().subscriptions.cancel(r.stripeSubscriptionId!).catch((e) => captureError(e, { source: "SERVER", path: "support.end_on_delete" }));
  }
}

export const SUPPORT_NAME = `Unterstützer-Abo auf ${BRAND.name}`;
export type { Prisma };
