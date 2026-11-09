import "server-only";
import {
  LOCKED_IN_APP_NOTIFICATIONS,
  NOTIFICATION_TYPES,
  SUPPORT_TOPIC_LABEL,
  feedPrefsSchema,
  notificationPrefsSchema,
  privacyPrefsSchema,
  profileUpdateSchema,
  supportTicketSchema,
  type NotificationType,
} from "@werkraum/shared";
import { db, type Prisma } from "@/server/db";
import { fail } from "@/server/errors";
import { audit } from "@/server/audit";
import { notify, prefFor } from "@/server/notifications";
import { rateLimit } from "@/server/ratelimit";
import { sendMail } from "@/server/mail";
import { attachMedia } from "@/server/media/service";
import { changePassword, isHandleAvailable, sendVerification } from "@/server/identity/service";
import { env } from "@/server/env";
import { BRAND } from "@/config/brand";
import type { SessionUser } from "@/server/auth/session";
import { browserFromUserAgent } from "@/lib/user-agent";

/**
 * Konto- und Profileinstellungen (PRD §7, §8.3, §19.3, §21.3, §23.1).
 * Ergänzt den Identity-Layer, ohne ihn zu verändern.
 */

type U = Pick<SessionUser, "id">;

export async function ensurePreference(userId: string) {
  return db.userPreference.upsert({ where: { userId }, create: { userId }, update: {} });
}

/* ───────────── Profil ───────────── */

export async function getProfileSettings(userId: string) {
  const p = await db.userProfile.findUniqueOrThrow({ where: { userId } });
  return { ...p, links: (Array.isArray(p.links) ? p.links : []) as { label: string; url: string }[] };
}

export async function checkHandle(raw: string, userId: string) {
  const r = await isHandleAvailable(raw, userId);
  return r.ok ? { ok: true as const, handle: r.handle } : { ok: false as const, reason: r.reason };
}

async function readyImage(userId: string, mediaId: string, variant: "md" | "lg") {
  const m = await db.media.findUnique({ where: { id: mediaId }, select: { ownerId: true, kind: true, state: true, variants: true } });
  if (!m || m.ownerId !== userId) throw fail.forbidden("Ungültiges Bild.");
  if (m.kind !== "IMAGE") throw fail.invalid("Bitte wähle ein Bild.");
  if (m.state !== "READY") throw fail.invalid("Das Bild wird noch verarbeitet. Bitte versuche es gleich noch einmal.");
  const v = (m.variants ?? {}) as Record<string, string>;
  const url = v[variant] ?? v.lg ?? v.md ?? v.sm;
  if (!url) throw fail.invalid("Für dieses Bild fehlen Vorschaugrössen.");
  return url;
}

export async function updateProfile(user: U, input: unknown) {
  const d = profileUpdateSchema.parse(input);
  const current = await db.userProfile.findUniqueOrThrow({ where: { userId: user.id }, select: { handle: true } });
  const handleChanged = d.handle !== current.handle;
  if (handleChanged) {
    const avail = await isHandleAvailable(d.handle, user.id);
    if (!avail.ok) throw fail.invalid(avail.reason, { handle: avail.reason });
    await rateLimit(`handle-change:${user.id}`, 3, 30 * 86_400).catch(() => {
      throw fail.invalid("Du kannst deinen Benutzernamen höchstens dreimal in 30 Tagen ändern.", { handle: "Limit erreicht" });
    });
  }
  const avatarUrl = d.avatarMediaId ? await readyImage(user.id, d.avatarMediaId, "md") : undefined;
  const coverUrl = d.coverMediaId ? await readyImage(user.id, d.coverMediaId, "lg") : undefined;

  await db.$transaction(async (tx) => {
    const media = [d.avatarMediaId, d.coverMediaId].filter((x): x is string => !!x);
    if (media.length) await attachMedia(tx, user.id, media);
    if (handleChanged) {
      // Eigener alter Handle darf zurückgeholt werden → Weiterleitung entfernen
      await tx.handleRedirect.deleteMany({ where: { oldHandle: d.handle, userId: user.id } });
      await tx.handleRedirect.upsert({ where: { oldHandle: current.handle }, create: { oldHandle: current.handle, userId: user.id }, update: { userId: user.id } });
    }
    await tx.userProfile.update({
      where: { userId: user.id },
      data: {
        displayName: d.displayName,
        handle: d.handle,
        bio: d.bio,
        region: d.region || null,
        country: d.country,
        website: d.website || null,
        pronouns: d.pronouns || null,
        links: d.links as Prisma.InputJsonValue,
        categories: d.categories,
        ...(avatarUrl ? { avatarUrl } : d.removeAvatar ? { avatarUrl: null } : {}),
        ...(coverUrl ? { coverUrl } : d.removeCover ? { coverUrl: null } : {}),
      },
    });
    // Interessen (Feed) und kreative Kategorien (Profil) bleiben synchron
    await tx.userPreference.upsert({ where: { userId: user.id }, create: { userId: user.id, interests: d.categories }, update: { interests: d.categories } });
    if (handleChanged) await audit({ actorId: user.id, action: "account.handle_changed", targetType: "USER", targetId: user.id, meta: { from: current.handle, to: d.handle } }, tx);
  });
  return { handle: d.handle, handleChanged };
}

/* ───────────── Konto & Sicherheit ───────────── */

export async function resendVerification(user: Pick<SessionUser, "id" | "email" | "emailVerifiedAt">) {
  if (user.emailVerifiedAt) throw fail.conflict("Deine E-Mail-Adresse ist bereits bestätigt.");
  await rateLimit(`verify-resend:${user.id}`, 3, 3600);
  await sendVerification(user.id, user.email);
}

/** Passwort ändern und alle anderen Sitzungen beenden (§25.5 Sessionwiderruf). */
export async function changePasswordEverywhere(user: U, currentSessionId: string, current: string, next: string) {
  await rateLimit(`password-change:${user.id}`, 5, 3600);
  await changePassword(user.id, current, next);
  const r = await db.session.updateMany({ where: { userId: user.id, revokedAt: null, id: { not: currentSessionId } }, data: { revokedAt: new Date() } });
  await notify({ recipientId: user.id, type: "SECURITY", bundle: false, data: { message: `Dein Passwort wurde geändert${r.count ? ` und ${r.count} andere Sitzung${r.count === 1 ? "" : "en"} beendet` : ""}.`, href: "/einstellungen/sicherheit" } });
  return { revoked: r.count };
}

export async function listSessions(userId: string, currentSessionId: string) {
  const rows = await db.session.findMany({
    where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { lastUsedAt: "desc" },
    select: { id: true, deviceLabel: true, userAgent: true, lastUsedAt: true, createdAt: true, expiresAt: true },
  });
  // Session-IDs sind Token-Hashes – nach aussen nur ein kurzer, nicht verwertbarer Schlüssel
  return rows.map((s) => ({
    key: s.id.slice(0, 16),
    device: s.deviceLabel ?? "Unbekanntes Gerät",
    isApp: /Werk(raum|uno)App/.test(s.userAgent ?? ""),
    browser: browserFromUserAgent(s.userAgent),
    lastUsedAt: s.lastUsedAt,
    createdAt: s.createdAt,
    expiresAt: s.expiresAt,
    current: s.id === currentSessionId,
  }));
}

export async function revokeSession(user: U, key: string, currentSessionId: string) {
  if (!/^[a-f0-9]{16}$/.test(key)) throw fail.invalid("Ungültige Sitzung.");
  if (currentSessionId.startsWith(key)) throw fail.invalid("Die aktuelle Sitzung beendest du über „Abmelden“.");
  const r = await db.session.updateMany({ where: { userId: user.id, id: { startsWith: key }, revokedAt: null }, data: { revokedAt: new Date() } });
  if (!r.count) throw fail.notFound("Sitzung nicht gefunden.");
  await audit({ actorId: user.id, action: "auth.session_revoked", targetType: "USER", targetId: user.id, meta: { count: r.count } });
}

export async function revokeOtherSessions(user: U, currentSessionId: string) {
  const r = await db.session.updateMany({ where: { userId: user.id, revokedAt: null, id: { not: currentSessionId } }, data: { revokedAt: new Date() } });
  if (r.count) await audit({ actorId: user.id, action: "auth.sessions_revoked_others", targetType: "USER", targetId: user.id, meta: { count: r.count } });
  return { count: r.count };
}

export async function securityEvents(userId: string) {
  return db.notification.findMany({
    where: { recipientId: userId, type: "SECURITY" },
    orderBy: { createdAt: "desc" },
    take: 12,
    select: { id: true, data: true, createdAt: true, readAt: true },
  });
}

/* ───────────── Benachrichtigungen ───────────── */

export async function getNotificationSettings(userId: string) {
  const p = await ensurePreference(userId);
  const prefs = (p.notificationPrefs ?? {}) as Partial<Record<NotificationType, { inApp?: boolean; email?: boolean }>>;
  return {
    matrix: NOTIFICATION_TYPES.map((t) => ({ type: t, ...prefFor(prefs, t), locked: (LOCKED_IN_APP_NOTIFICATIONS as readonly string[]).includes(t) })),
    emailDigest: p.emailDigest,
  };
}

export async function updateNotificationSettings(user: U, input: unknown) {
  const d = notificationPrefsSchema.parse(input);
  const prefs: Record<string, { inApp: boolean; email: boolean }> = {};
  for (const t of NOTIFICATION_TYPES) {
    const v = d.prefs[t] ?? prefFor(null, t);
    prefs[t] = { inApp: (LOCKED_IN_APP_NOTIFICATIONS as readonly string[]).includes(t) ? true : v.inApp, email: v.email };
  }
  await db.userPreference.upsert({
    where: { userId: user.id },
    create: { userId: user.id, notificationPrefs: prefs, emailDigest: d.emailDigest },
    update: { notificationPrefs: prefs, emailDigest: d.emailDigest },
  });
}

/* ───────────── Feed ───────────── */

export async function getFeedSettings(userId: string) {
  const [pref, profile, muted, hiddenCount] = await Promise.all([
    ensurePreference(userId),
    db.userProfile.findUnique({ where: { userId }, select: { categories: true } }),
    db.userMute.findMany({
      where: { muterId: userId },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true, muted: { select: { id: true, profile: { select: { handle: true, displayName: true, avatarUrl: true } } } } },
    }),
    db.hiddenContent.count({ where: { userId } }),
  ]);
  const interests = pref.interests.length ? pref.interests : (profile?.categories ?? []);
  return { interests, hiddenCategories: pref.hiddenCategories, feedDefault: pref.feedDefault, muted, hiddenCount };
}

export async function updateFeedSettings(user: U, input: unknown) {
  const d = feedPrefsSchema.parse(input);
  const hidden = d.hiddenCategories.filter((c) => !d.interests.includes(c));
  await db.$transaction([
    db.userPreference.upsert({
      where: { userId: user.id },
      create: { userId: user.id, interests: d.interests, hiddenCategories: hidden, feedDefault: d.feedDefault },
      update: { interests: d.interests, hiddenCategories: hidden, feedDefault: d.feedDefault },
    }),
    db.userProfile.update({ where: { userId: user.id }, data: { categories: d.interests } }),
  ]);
}

export async function resetHiddenContent(user: U) {
  const r = await db.hiddenContent.deleteMany({ where: { userId: user.id } });
  return { count: r.count };
}

/* ───────────── Privatsphäre ───────────── */

export async function getPrivacySettings(userId: string) {
  const [pref, profile, blocked] = await Promise.all([
    ensurePreference(userId),
    db.userProfile.findUnique({ where: { userId }, select: { dmPolicy: true } }),
    db.userBlock.findMany({
      where: { blockerId: userId },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true, blocked: { select: { id: true, profile: { select: { handle: true, displayName: true, avatarUrl: true } } } } },
    }),
  ]);
  return { dmPolicy: profile?.dmPolicy ?? "FOLLOWING", reduceMotion: pref.reduceMotion, blocked };
}

export async function updatePrivacySettings(user: U, input: unknown) {
  const d = privacyPrefsSchema.parse(input);
  await db.$transaction([
    db.userProfile.update({ where: { userId: user.id }, data: { dmPolicy: d.dmPolicy } }),
    db.userPreference.upsert({ where: { userId: user.id }, create: { userId: user.id, reduceMotion: d.reduceMotion }, update: { reduceMotion: d.reduceMotion } }),
  ]);
}

/* ───────────── Support ───────────── */

export async function createSupportTicket(user: Pick<SessionUser, "id" | "email"> & { profile: { displayName: string } }, input: unknown) {
  const d = supportTicketSchema.parse(input);
  await rateLimit(`support:${user.id}`, 5, 86_400);
  const t = await db.supportTicket.create({ data: { userId: user.id, email: user.email, subject: d.subject, body: d.body, topic: d.topic } });
  const ref = t.id.slice(-6).toUpperCase();
  await sendMail(
    user.email,
    `Wir haben deine Anfrage erhalten (#${ref})`,
    `Hallo ${user.profile.displayName}\n\nDanke für deine Nachricht zum Thema „${SUPPORT_TOPIC_LABEL[d.topic]}“. Wir melden uns in der Regel innerhalb von zwei Werktagen per E-Mail.\n\nBetreff: ${d.subject}\nReferenz: #${ref}\n\nBei dringenden Sicherheitsproblemen (z. B. Betrugsversuch, Konto übernommen) ändere bitte sofort dein Passwort und beende alle Sitzungen in den Einstellungen.\n\nDein ${BRAND.name}-Team`,
    { eyebrow: "Support", heading: "Wir haben deine Anfrage erhalten", cta: { label: "Zur Hilfe", url: `${env().APP_URL}/hilfe` } },
  ).catch((e) => console.warn(JSON.stringify({ level: "warn", msg: "support_mail_failed", err: String(e) })));
  return { id: t.id, ref };
}

export async function listOwnTickets(userId: string) {
  return db.supportTicket.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 10, select: { id: true, subject: true, topic: true, status: true, createdAt: true } });
}

export async function accountOverview(userId: string) {
  const u = await db.user.findUniqueOrThrow({
    where: { id: userId },
    select: { email: true, emailVerifiedAt: true, passwordHash: true, createdAt: true, authAccounts: { select: { provider: true } }, shop: { select: { id: true } }, _count: { select: { orders: true } } },
  });
  return {
    email: u.email,
    emailVerifiedAt: u.emailVerifiedAt,
    hasPassword: !!u.passwordHash,
    createdAt: u.createdAt,
    providers: u.authAccounts.map((a) => a.provider),
    hasShop: !!u.shop,
    orderCount: u._count.orders,
  };
}
