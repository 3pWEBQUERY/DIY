import "server-only";
import { timingSafeEqual } from "node:crypto";
import { db, Prisma } from "@/server/db";
import { env, features } from "@/server/env";
import { fail } from "@/server/errors";
import { hmac } from "@/server/crypto";
import { rateLimit } from "@/server/ratelimit";
import { getSetting } from "@/server/settings";
import { sendMail, type MailCard, type MailOptions } from "@/server/mail";
import { detectSuspiciousPayment } from "@/server/messaging/suspicious";
import { publicProductWhere } from "@/server/commerce/restock";
import { isPro, PRO_NAME } from "@/server/pro/service";
import type { SessionUser } from "@/server/auth/session";
import {
  NEWSLETTER_CARDS_MAX,
  SCHEDULE_MAX_DAYS,
  extractCardRefs,
  newsletterInputSchema,
  safeClickTarget,
  scheduleSchema,
  stripCardRefs,
  type CardRef,
  type NewsletterStatus,
} from "@/lib/newsletter";

/**
 * Creator Pro: Newsletter an Follower:innen.
 *
 * Empfänger:innen sind Personen, die der Creatorin folgen – aktiv, mit bestätigter E-Mail-Adresse,
 * ohne Blockierung in eine Richtung, nicht von diesem Newsletter abgemeldet (NewsletterOptOut) und
 * ohne globales Abschalten („Newsletter von Creator:innen“ in den Benachrichtigungen).
 * Versand im Worker in Teilen; NewsletterDelivery (eindeutig je Person) verhindert Doppelversand.
 */

type U = Pick<SessionUser, "id">;
const DAY = 86_400_000;
const BATCH = 100;

const appUrl = () => env().APP_URL.replace(/\/$/, "");
const abs = (u: string | null | undefined) => (!u ? null : /^https?:\/\//.test(u) ? u : `${appUrl()}${u.startsWith("/") ? "" : "/"}${u}`);

/* ───────────────────────── Empfänger:innen ───────────────────────── */

/** SQL-Bedingung für Empfänger:innen (Alias u = User), ohne Follow-Join */
function recipientConditions(creatorId: string) {
  return Prisma.sql`
    u.status = 'ACTIVE'
    AND u."emailVerifiedAt" IS NOT NULL
    AND u.email NOT LIKE '%.invalid'
    AND u.id <> ${creatorId}
    AND COALESCE((SELECT (p."notificationPrefs"->>'creatorNewsletters')::boolean FROM "UserPreference" p WHERE p."userId" = u.id), true)
    AND NOT EXISTS (SELECT 1 FROM "NewsletterOptOut" o WHERE o."userId" = u.id AND o."creatorId" = ${creatorId})
    AND NOT EXISTS (SELECT 1 FROM "UserBlock" b WHERE (b."blockerId" = u.id AND b."blockedId" = ${creatorId}) OR (b."blockerId" = ${creatorId} AND b."blockedId" = u.id))`;
}

/** Anzahl Personen, die einen Newsletter jetzt bekämen */
export async function countRecipients(creatorId: string) {
  const [r] = await db.$queryRaw<{ n: bigint }[]>`
    SELECT count(*)::bigint AS n FROM "Follow" f JOIN "User" u ON u.id = f."followerId"
    WHERE f."followeeId" = ${creatorId} AND ${recipientConditions(creatorId)}`;
  return Number(r?.n ?? 0);
}

/** Momentaufnahme beim Start des Versands: eine Zustellung je Empfänger:in (doppelte werden übersprungen) */
async function snapshotRecipients(newsletterId: string, creatorId: string) {
  return db.$executeRaw`
    INSERT INTO "NewsletterDelivery" (id, "newsletterId", "userId")
    SELECT 'nld_' || md5(${newsletterId} || u.id), ${newsletterId}, u.id
    FROM "Follow" f JOIN "User" u ON u.id = f."followerId"
    WHERE f."followeeId" = ${creatorId} AND ${recipientConditions(creatorId)}
    ON CONFLICT ("newsletterId", "userId") DO NOTHING`;
}

/* ───────────────────────── Tokens ───────────────────────── */

const sig = (payload: string) => hmac(env().SESSION_SECRET, payload).slice(0, 32);

function safeEqual(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Token je Zustellung für Öffnungs-Pixel und Klick-Links */
export function deliveryToken(deliveryId: string) {
  return `${deliveryId}.${sig(`newsletter-track:${deliveryId}`)}`;
}

export function verifyDeliveryToken(t: string | null | undefined) {
  if (!t || t.length > 120) return null;
  const [id, s] = t.split(".");
  if (!id || !s) return null;
  return safeEqual(s, sig(`newsletter-track:${id}`)) ? id : null;
}

/** Abmelden vom Newsletter genau einer Creatorin (ohne Anmeldung, nur dieses Abo) */
export function unsubscribeToken(userId: string, creatorId: string) {
  return `${userId}.${creatorId}.${sig(`newsletter-unsub:${userId}:${creatorId}`)}`;
}

export function verifyUnsubscribeToken(t: string | null | undefined) {
  if (!t || t.length > 160) return null;
  const [userId, creatorId, s] = t.split(".");
  if (!userId || !creatorId || !s) return null;
  return safeEqual(s, sig(`newsletter-unsub:${userId}:${creatorId}`)) ? { userId, creatorId } : null;
}

export const unsubscribeLink = (userId: string, creatorId: string) => `${appUrl()}/api/newsletter/abbestellen?t=${unsubscribeToken(userId, creatorId)}`;
const openPixel = (deliveryId: string) => `${appUrl()}/api/newsletter/geoeffnet?t=${deliveryToken(deliveryId)}`;
const clickLink = (deliveryId: string, url: string) => `${appUrl()}/api/newsletter/klick?t=${deliveryToken(deliveryId)}&u=${encodeURIComponent(url)}`;

/* ───────────────────────── Karten ───────────────────────── */

type ResolvedCard = MailCard & { ref: CardRef };

/** Karten zu eigenen, öffentlichen Inhalten der Creatorin (fremde oder private IDs fallen weg) */
export async function resolveCards(creatorId: string, refs: CardRef[]): Promise<ResolvedCard[]> {
  const ids = (k: CardRef["kind"]) => refs.filter((r) => r.kind === k).map((r) => r.id);
  const [projects, tutorials, products] = await Promise.all([
    ids("projekt").length
      ? db.project.findMany({ where: { id: { in: ids("projekt") }, ownerId: creatorId, state: "PUBLISHED", visibility: "PUBLIC" }, select: { id: true, title: true, slug: true, coverUrl: true, owner: { select: { profile: { select: { handle: true } } } } } })
      : [],
    ids("anleitung").length ? db.tutorial.findMany({ where: { id: { in: ids("anleitung") }, authorId: creatorId, state: "PUBLISHED" }, select: { id: true, title: true, slug: true, coverUrl: true, supportersOnly: true } }) : [],
    ids("produkt").length
      ? db.product.findMany({ where: { id: { in: ids("produkt") }, shop: { ownerId: creatorId, status: "ACTIVE" }, ...publicProductWhere }, select: { id: true, title: true, slug: true, coverUrl: true, shop: { select: { slug: true, name: true } } } })
      : [],
  ]);
  const out: ResolvedCard[] = [];
  for (const ref of refs) {
    if (ref.kind === "projekt") {
      const p = projects.find((x) => x.id === ref.id);
      if (p) out.push({ ref, title: p.title, meta: "Projekt", url: `${appUrl()}/u/${p.owner.profile?.handle ?? ""}/${p.slug}`, imageUrl: abs(p.coverUrl) });
    } else if (ref.kind === "anleitung") {
      const t = tutorials.find((x) => x.id === ref.id);
      if (t) out.push({ ref, title: t.title, meta: t.supportersOnly ? "Anleitung · für Unterstützer:innen" : "Anleitung", url: `${appUrl()}/anleitungen/${t.slug}`, imageUrl: abs(t.coverUrl) });
    } else {
      const p = products.find((x) => x.id === ref.id);
      if (p) out.push({ ref, title: p.title, meta: `Im Shop ${p.shop.name}`, url: `${appUrl()}/markt/${p.shop.slug}/${p.slug}`, imageUrl: abs(p.coverUrl) });
    }
  }
  return out.slice(0, NEWSLETTER_CARDS_MAX);
}

/** Eigene Inhalte für die Kartenauswahl im Editor */
export async function cardOptions(user: U) {
  const [projects, tutorials, products] = await Promise.all([
    db.project.findMany({ where: { ownerId: user.id, state: "PUBLISHED", visibility: "PUBLIC" }, orderBy: { publishedAt: "desc" }, take: 30, select: { id: true, title: true, coverUrl: true } }),
    db.tutorial.findMany({ where: { authorId: user.id, state: "PUBLISHED" }, orderBy: { publishedAt: "desc" }, take: 30, select: { id: true, title: true, coverUrl: true } }),
    db.product.findMany({ where: { shop: { ownerId: user.id, status: "ACTIVE" }, ...publicProductWhere }, orderBy: { createdAt: "desc" }, take: 30, select: { id: true, title: true, coverUrl: true } }),
  ]);
  return {
    projekt: projects.map((p) => ({ id: p.id, title: p.title, coverUrl: p.coverUrl })),
    anleitung: tutorials.map((t) => ({ id: t.id, title: t.title, coverUrl: t.coverUrl })),
    produkt: products.map((p) => ({ id: p.id, title: p.title, coverUrl: p.coverUrl })),
  };
}
export type NewsletterCardOptions = Awaited<ReturnType<typeof cardOptions>>;

/* ───────────────────────── Mail ───────────────────────── */

type Creator = { id: string; displayName: string; handle: string };

async function creatorOf(userId: string): Promise<Creator> {
  const p = await db.userProfile.findUnique({ where: { userId }, select: { displayName: true, handle: true } });
  if (!p) throw fail.notFound("Profil nicht gefunden.");
  return { id: userId, displayName: p.displayName, handle: p.handle };
}

/**
 * Inhalt einer Newsletter-Mail. Ohne `deliveryId` (Vorschau) ohne Tracking; mit `recipientId` mit
 * persönlichem Abmeldelink.
 */
export async function buildNewsletterMail(n: { subject: string; body: string }, creator: Creator, opts: { deliveryId?: string; recipientId?: string; cards?: ResolvedCard[] } = {}) {
  const cards = opts.cards ?? (await resolveCards(creator.id, extractCardRefs(n.body)));
  const track = (url: string) => (opts.deliveryId ? clickLink(opts.deliveryId, url) : url);
  const profileUrl = `${appUrl()}/u/${creator.handle}`;
  const first = creator.displayName.split(" ")[0] || creator.displayName;
  const mail: MailOptions = {
    eyebrow: `Newsletter von ${creator.displayName}`,
    heading: n.subject,
    preheader: stripCardRefs(n.body).replace(/\s+/g, " ").slice(0, 140),
    sections: cards.length ? [{ title: `Neu von ${first}`, cards: cards.map(({ ref: _ref, ...c }) => ({ ...c, url: track(c.url) })) }] : undefined,
    cta: { label: `Profil von ${first} ansehen`, url: track(profileUrl) },
    footerNote: `Du erhältst diesen Newsletter, weil du ${creator.displayName} auf Werkuno folgst.`,
    ...(opts.recipientId ? { unsubscribeUrl: unsubscribeLink(opts.recipientId, creator.id), unsubscribeLabel: `Newsletter von ${first} abbestellen` } : {}),
    ...(opts.deliveryId ? { trackingPixelUrl: openPixel(opts.deliveryId) } : {}),
  };
  return { subject: n.subject, text: stripCardRefs(n.body), mail };
}

/* ───────────────────────── Studio ───────────────────────── */

async function requirePro(user: U) {
  if (!(await isPro(user.id))) throw fail.forbidden(`Newsletter gehören zu ${PRO_NAME}. Mit Pro kannst du deinen Follower:innen schreiben.`);
}

async function ownNewsletter(user: U, id: string) {
  const n = await db.creatorNewsletter.findUnique({ where: { id } });
  if (!n || n.authorId !== user.id) throw fail.notFound("Newsletter nicht gefunden.");
  return n;
}

/** Wie viele Newsletter in 30 Tagen (geplant, im Versand oder verschickt) */
export async function usedInWindow(userId: string, now = new Date()) {
  const since = new Date(now.getTime() - 30 * DAY);
  return db.creatorNewsletter.count({
    where: { authorId: userId, OR: [{ status: "SENT", sentAt: { gte: since } }, { status: { in: ["SCHEDULED", "SENDING"] } }] },
  });
}

export async function newsletterQuota(userId: string) {
  const [limit, used] = await Promise.all([getSetting("pro.newslettersPer30Days"), usedInWindow(userId)]);
  return { limit, used, left: Math.max(0, limit - used) };
}

export async function listMyNewsletters(user: U) {
  const [pro, items, recipients, quota] = await Promise.all([
    isPro(user.id),
    db.creatorNewsletter.findMany({ where: { authorId: user.id }, orderBy: { createdAt: "desc" }, take: 100 }),
    countRecipients(user.id),
    newsletterQuota(user.id),
  ]);
  return {
    pro,
    recipients,
    quota,
    items: items.map((n) => ({
      id: n.id,
      subject: n.subject,
      status: n.status as NewsletterStatus,
      scheduledAt: n.scheduledAt?.toISOString() ?? null,
      sentAt: n.sentAt?.toISOString() ?? null,
      createdAt: n.createdAt.toISOString(),
      updatedAt: n.updatedAt.toISOString(),
      recipientCount: n.recipientCount,
      openCount: n.openCount,
      clickCount: n.clickCount,
    })),
  };
}
export type NewsletterListItem = Awaited<ReturnType<typeof listMyNewsletters>>["items"][number];

export async function getMyNewsletter(user: U, id: string) {
  const n = await ownNewsletter(user, id);
  return { id: n.id, subject: n.subject, body: n.body, status: n.status as NewsletterStatus, scheduledAt: n.scheduledAt?.toISOString() ?? null, sentAt: n.sentAt?.toISOString() ?? null, recipientCount: n.recipientCount, openCount: n.openCount, clickCount: n.clickCount };
}

function checkContent(body: string) {
  if (detectSuspiciousPayment(body)) {
    throw fail.invalid("Zahlungsaufforderungen und Links zu fremden Bezahldiensten sind im Newsletter nicht erlaubt. Verkaufe über deinen Werkuno-Shop.", { body: "Bitte ohne Zahlungslinks" });
  }
}

/** Entwurf anlegen oder speichern (geplante bleiben geplant; verschickte sind nicht mehr änderbar) */
export async function saveNewsletter(user: U, id: string | null, input: unknown) {
  await requirePro(user);
  const d = newsletterInputSchema.parse(input);
  checkContent(d.body);
  if (!id) {
    await rateLimit(`newsletter-create:${user.id}`, 30, 86_400);
    const n = await db.creatorNewsletter.create({ data: { authorId: user.id, subject: d.subject, body: d.body } });
    return { id: n.id };
  }
  const n = await ownNewsletter(user, id);
  if (n.status === "SENDING" || n.status === "SENT") throw fail.conflict("Ein verschickter Newsletter lässt sich nicht mehr ändern.");
  await db.creatorNewsletter.update({ where: { id }, data: { subject: d.subject, body: d.body } });
  return { id };
}

export async function deleteNewsletter(user: U, id: string) {
  const n = await ownNewsletter(user, id);
  if (n.status === "SENDING") throw fail.conflict("Der Newsletter wird gerade verschickt.");
  if (n.status === "SENT") throw fail.conflict("Verschickte Newsletter bleiben für deine Statistik erhalten.");
  await db.creatorNewsletter.delete({ where: { id } });
}

/** Jetzt senden (`at` leer) oder planen. Der Worker verschickt innerhalb einer Minute. */
export async function scheduleNewsletter(user: U, id: string, input: unknown, now = new Date()) {
  await requirePro(user);
  const n = await ownNewsletter(user, id);
  if (n.status === "SENDING" || n.status === "SENT") throw fail.conflict("Dieser Newsletter ist schon verschickt.");
  const { at } = scheduleSchema.parse(input ?? {});
  const when = at ?? now;
  if (Number.isNaN(when.getTime())) throw fail.invalid("Ungültiger Zeitpunkt.", { at: "Ungültiger Zeitpunkt" });
  if (when.getTime() < now.getTime() - 60_000) throw fail.invalid("Der Zeitpunkt liegt in der Vergangenheit.", { at: "Bitte einen Zeitpunkt in der Zukunft wählen" });
  if (when.getTime() > now.getTime() + SCHEDULE_MAX_DAYS * DAY) throw fail.invalid(`Höchstens ${SCHEDULE_MAX_DAYS} Tage im Voraus.`, { at: `Höchstens ${SCHEDULE_MAX_DAYS} Tage im Voraus` });
  newsletterInputSchema.parse({ subject: n.subject, body: n.body });
  checkContent(n.body);
  if (n.status !== "SCHEDULED") {
    const q = await newsletterQuota(user.id);
    if (q.left <= 0) throw fail.invalid(`Du kannst höchstens ${q.limit} Newsletter in 30 Tagen verschicken – so bleibt jede Ausgabe willkommen.`);
  }
  const recipients = await countRecipients(user.id);
  if (recipients === 0) throw fail.invalid("Noch niemand kann deinen Newsletter empfangen. Sobald dir Menschen folgen, kannst du ihnen schreiben.");
  await db.creatorNewsletter.update({ where: { id }, data: { status: "SCHEDULED", scheduledAt: when } });
  return { scheduledAt: when.toISOString(), recipients, immediate: !at };
}

export async function unscheduleNewsletter(user: U, id: string) {
  const n = await ownNewsletter(user, id);
  if (n.status !== "SCHEDULED") throw fail.conflict("Nur geplante Newsletter lassen sich zurückziehen.");
  const r = await db.creatorNewsletter.updateMany({ where: { id, status: "SCHEDULED" }, data: { status: "DRAFT", scheduledAt: null } });
  if (!r.count) throw fail.conflict("Der Versand hat gerade begonnen.");
}

/** Vorschau an die eigene Adresse (mit gültigen Links, ohne Tracking) */
export async function sendNewsletterPreview(user: Pick<SessionUser, "id" | "email">, input: unknown) {
  await requirePro(user);
  const d = newsletterInputSchema.parse(input);
  checkContent(d.body);
  await rateLimit(`newsletter-preview:${user.id}`, 10, 86_400);
  const creator = await creatorOf(user.id);
  const m = await buildNewsletterMail(d, creator);
  const r = await sendMail(user.email, `[Vorschau] ${m.subject}`, m.text, m.mail);
  if ("failed" in r && r.failed) throw fail.unavailable("Die Vorschau konnte gerade nicht verschickt werden. Bitte versuche es später erneut.");
  return { to: user.email };
}

/* ───────────────────────── Versand (Worker) ───────────────────────── */

const warn = (msg: string, extra: Record<string, unknown> = {}) => console.warn(JSON.stringify({ level: "warn", svc: "worker", msg, ...extra }));

/**
 * Fällige Newsletter verschicken: geplante übernehmen (Momentaufnahme der Empfänger:innen), dann
 * offene Zustellungen in Teilen senden. Bricht der Worker ab, setzt der nächste Lauf fort.
 */
export async function processDueNewsletters(opts: { now?: Date; maxMails?: number } = {}) {
  const now = opts.now ?? new Date();
  const max = opts.maxMails ?? 1_000;
  let sent = 0;
  const due = await db.creatorNewsletter.findMany({ where: { status: "SCHEDULED", scheduledAt: { lte: now } }, orderBy: { scheduledAt: "asc" }, take: 20, select: { id: true, authorId: true } });
  for (const n of due) {
    // Inzwischen kein Pro mehr: zurück zum Entwurf statt verschicken
    if (!(await isPro(n.authorId))) {
      await db.creatorNewsletter.updateMany({ where: { id: n.id, status: "SCHEDULED" }, data: { status: "DRAFT", scheduledAt: null } });
      warn("newsletter_not_pro", { id: n.id });
      continue;
    }
    const claimed = await db.creatorNewsletter.updateMany({ where: { id: n.id, status: "SCHEDULED" }, data: { status: "SENDING" } });
    if (!claimed.count) continue;
    await snapshotRecipients(n.id, n.authorId);
    const total = await db.newsletterDelivery.count({ where: { newsletterId: n.id } });
    await db.creatorNewsletter.update({ where: { id: n.id }, data: { recipientCount: total } });
  }

  const sending = await db.creatorNewsletter.findMany({ where: { status: "SENDING" }, orderBy: { updatedAt: "asc" }, take: 20 });
  for (const n of sending) {
    const creator = await creatorOf(n.authorId).catch(() => null);
    if (!creator) {
      await db.creatorNewsletter.update({ where: { id: n.id }, data: { status: "SENT", sentAt: now } });
      continue;
    }
    const cards = await resolveCards(n.authorId, extractCardRefs(n.body));
    for (;;) {
      if (sent >= max) return { sent };
      const batch = await db.newsletterDelivery.findMany({
        where: { newsletterId: n.id, sentAt: null },
        take: Math.min(BATCH, max - sent),
        select: { id: true, userId: true, user: { select: { email: true, status: true } } },
      });
      if (!batch.length) {
        await db.creatorNewsletter.update({ where: { id: n.id }, data: { status: "SENT", sentAt: n.sentAt ?? now } });
        break;
      }
      for (const d of batch) {
        // Inzwischen gesperrt/gelöscht oder abgemeldet: als erledigt markieren, nichts senden
        const optedOut = await db.newsletterOptOut.findUnique({ where: { userId_creatorId: { userId: d.userId, creatorId: n.authorId } }, select: { userId: true } });
        if (d.user.status === "ACTIVE" && !optedOut) {
          const m = await buildNewsletterMail(n, creator, { deliveryId: d.id, recipientId: d.userId, cards });
          const r = await sendMail(d.user.email, m.subject, m.text, m.mail);
          if ("failed" in r && r.failed) {
            warn("newsletter_mail_failed", { id: n.id, delivery: d.id });
            // Später erneut versuchen – den Lauf hier beenden, damit ein Ausfall nicht alle Zustellungen durchläuft
            return { sent };
          }
          sent++;
        }
        await db.newsletterDelivery.update({ where: { id: d.id }, data: { sentAt: new Date() } });
      }
    }
  }
  return { sent };
}

/* ───────────────────────── Öffnungen, Klicks, Abmeldung ───────────────────────── */

/** Öffnung zählen (einmal je Empfänger:in) */
export async function recordOpen(token: string | null | undefined) {
  const id = verifyDeliveryToken(token);
  if (!id) return false;
  const r = await db.newsletterDelivery.updateMany({ where: { id, openedAt: null }, data: { openedAt: new Date() } });
  if (r.count) {
    const d = await db.newsletterDelivery.findUnique({ where: { id }, select: { newsletterId: true } });
    if (d) await db.creatorNewsletter.update({ where: { id: d.newsletterId }, data: { openCount: { increment: 1 } } });
  }
  return true;
}

/** Klick zählen (einmal je Empfänger:in; ein Klick gilt auch als Öffnung) und Ziel zurückgeben */
export async function recordClick(token: string | null | undefined, url: string | null | undefined) {
  const target = safeClickTarget(url, appUrl());
  const id = verifyDeliveryToken(token);
  if (!target) return `${appUrl()}/`;
  if (!id) return target;
  const d = await db.newsletterDelivery.findUnique({ where: { id }, select: { newsletterId: true, openedAt: true, clickedAt: true } });
  if (d && !d.clickedAt) {
    const r = await db.newsletterDelivery.updateMany({ where: { id, clickedAt: null }, data: { clickedAt: new Date(), ...(d.openedAt ? {} : { openedAt: new Date() }) } });
    if (r.count) await db.creatorNewsletter.update({ where: { id: d.newsletterId }, data: { clickCount: { increment: 1 }, ...(d.openedAt ? {} : { openCount: { increment: 1 } }) } });
  }
  return target;
}

export async function unsubscribeByToken(t: string | null | undefined) {
  const v = verifyUnsubscribeToken(t);
  if (!v) return null;
  const [u, c] = await Promise.all([db.user.findUnique({ where: { id: v.userId }, select: { id: true } }), db.userProfile.findUnique({ where: { userId: v.creatorId }, select: { displayName: true } })]);
  if (!u || !c) return null;
  await db.newsletterOptOut.upsert({ where: { userId_creatorId: { userId: v.userId, creatorId: v.creatorId } }, create: { userId: v.userId, creatorId: v.creatorId }, update: {} });
  return { creatorName: c.displayName };
}

/** Name der Creatorin zu einem gültigen Abmelde-Token (für die Bestätigungsseite) */
export async function unsubscribeContext(t: string | null | undefined) {
  const v = verifyUnsubscribeToken(t);
  if (!v) return null;
  const c = await db.userProfile.findUnique({ where: { userId: v.creatorId }, select: { displayName: true, handle: true } });
  return c ? { creatorName: c.displayName, handle: c.handle } : null;
}

/* ───────────────────────── Follower:innen ───────────────────────── */

/** Newsletter-Zustand auf einem Profil: nur für Follower:innen von Pro-Creator:innen relevant */
export async function newsletterState(viewerId: string | null | undefined, creatorId: string) {
  if (!viewerId || viewerId === creatorId) return null;
  const [follows, pro] = await Promise.all([db.follow.findUnique({ where: { followerId_followeeId: { followerId: viewerId, followeeId: creatorId } }, select: { followerId: true } }), isPro(creatorId)]);
  if (!follows || !pro) return null;
  const [optOut, pref] = await Promise.all([
    db.newsletterOptOut.findUnique({ where: { userId_creatorId: { userId: viewerId, creatorId } }, select: { userId: true } }),
    db.userPreference.findUnique({ where: { userId: viewerId }, select: { notificationPrefs: true } }),
  ]);
  const globalOn = (pref?.notificationPrefs as { creatorNewsletters?: unknown } | null)?.creatorNewsletters !== false;
  return { subscribed: !optOut, globalOn };
}

export async function setNewsletterSubscribed(user: U, creatorId: string, subscribed: boolean) {
  if (user.id === creatorId) throw fail.invalid("Das ist dein eigener Newsletter.");
  const exists = await db.user.findUnique({ where: { id: creatorId }, select: { id: true } });
  if (!exists) throw fail.notFound("Profil nicht gefunden.");
  if (subscribed) await db.newsletterOptOut.deleteMany({ where: { userId: user.id, creatorId } });
  else await db.newsletterOptOut.upsert({ where: { userId_creatorId: { userId: user.id, creatorId } }, create: { userId: user.id, creatorId }, update: {} });
  return { subscribed };
}

/** E-Mail-Versand nur mit Schlüssel – lokal wird geloggt (Studio zeigt einen Hinweis) */
export const newsletterMailConfigured = () => features.email();
