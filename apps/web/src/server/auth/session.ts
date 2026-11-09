import "server-only";
import { clientIp } from "@/server/client-ip";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { db } from "@/server/db";
import { sha256, token } from "@/server/crypto";
import { fail } from "@/server/errors";

export const SESSION_COOKIE = "wr_session";
const SESSION_DAYS = 30;
const TOUCH_INTERVAL_MS = 1000 * 60 * 30;

export function deviceLabel(ua: string | null) {
  if (!ua) return "Unbekanntes Gerät";
  const os = /iPhone|iPad/.test(ua) ? "iOS" : /Android/.test(ua) ? "Android" : /Mac OS X/.test(ua) ? "macOS" : /Windows/.test(ua) ? "Windows" : /Linux/.test(ua) ? "Linux" : "Gerät";
  const br = /Edg\//.test(ua) ? "Edge" : /Firefox\//.test(ua) ? "Firefox" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : /Werk(raum|uno)App/.test(ua) ? "Werkuno App" : "Browser";
  return `${br} auf ${os}`;
}

export async function clientIpHash() {
  const h = await headers();
  const ip = clientIp(h);
  return sha256(`${process.env.SESSION_SECRET}:${ip}`).slice(0, 32);
}

/**
 * Legt eine Session an und setzt das httpOnly-Cookie. Gibt `isNewDevice` für Sicherheitswarnungen zurück.
 * Hat das Konto die Zwei-Faktor-Anmeldung aktiv, ist die Session zunächst „ausstehend“
 * (`mfaRequired`) und gilt erst nach dem zweiten Faktor als angemeldet.
 */
export async function createSession(userId: string) {
  const raw = token(32);
  const mfa = await db.user.findUnique({ where: { id: userId }, select: { totpEnabledAt: true } });
  const mfaPending = !!mfa?.totpEnabledAt;
  const h = await headers();
  const ua = h.get("user-agent");
  const label = deviceLabel(ua);
  const ipHash = await clientIpHash();
  const known = await db.session.findFirst({ where: { userId, OR: [{ deviceLabel: label }, { ipHash }] }, select: { id: true } });
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86400_000);
  await db.session.create({
    data: { id: sha256(raw), userId, userAgent: ua?.slice(0, 300), ipHash, deviceLabel: label, expiresAt, mfaPending },
  });
  const jar = await cookies();
  jar.set(SESSION_COOKIE, raw, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
  return { isNewDevice: !known, deviceLabel: label, rawToken: raw, mfaRequired: mfaPending };
}

export async function destroySession() {
  const jar = await cookies();
  const raw = jar.get(SESSION_COOKIE)?.value;
  if (raw) await db.session.updateMany({ where: { id: sha256(raw) }, data: { revokedAt: new Date() } });
  jar.delete(SESSION_COOKIE);
}

async function tokenFromRequest() {
  const jar = await cookies();
  const c = jar.get(SESSION_COOKIE)?.value;
  if (c) return c;
  // iOS-App / API: Bearer-Token
  const h = await headers();
  const auth = h.get("authorization");
  if (auth?.startsWith("Bearer ")) return auth.slice(7);
  return null;
}

const userSelect = {
  id: true,
  email: true,
  role: true,
  status: true,
  suspendedUntil: true,
  messagingRestrictedUntil: true,
  emailVerifiedAt: true,
  totpEnabledAt: true,
  onboardedAt: true,
  createdAt: true,
  profile: {
    select: { handle: true, displayName: true, avatarUrl: true, bio: true, categories: true, isCreatorPro: true },
  },
  shop: { select: { id: true, slug: true, status: true, name: true } },
} as const;

export const getSession = cache(async () => {
  const raw = await tokenFromRequest();
  if (!raw) return null;
  const session = await db.session.findUnique({
    where: { id: sha256(raw) },
    select: { id: true, expiresAt: true, revokedAt: true, lastUsedAt: true, mfaPending: true, user: { select: userSelect } },
  });
  if (!session || session.revokedAt || session.expiresAt < new Date()) return null;
  // Zweiter Faktor noch offen → wie nicht angemeldet behandeln
  if (session.mfaPending) return null;
  const u = session.user;
  if (u.status === "BANNED" || u.status === "DELETED") return null;
  if (u.status === "SUSPENDED" && u.suspendedUntil && u.suspendedUntil <= new Date()) {
    // Sperre abgelaufen → sofort wieder aktiv (der Worker erledigt das sonst innerhalb einer Minute)
    const { liftExpiredSuspension } = await import("@/server/moderation/expiry");
    if (await liftExpiredSuspension(u.id).catch(() => false)) Object.assign(u, { status: "ACTIVE", suspendedUntil: null });
  }
  if (Date.now() - session.lastUsedAt.getTime() > TOUCH_INTERVAL_MS) {
    await db.session.update({ where: { id: session.id }, data: { lastUsedAt: new Date() } }).catch(() => {});
    await db.user.update({ where: { id: u.id }, data: { lastSeenAt: new Date() } }).catch(() => {});
  }
  return { sessionId: session.id, user: u };
});

export type SessionUser = NonNullable<Awaited<ReturnType<typeof getSession>>>["user"];

export async function currentUser() {
  return (await getSession())?.user ?? null;
}

/** Erzwingt einen angemeldeten, nicht gesperrten Nutzer (serverseitig, §7.3). */
export async function requireUser(opts: { allowSuspended?: boolean } = {}) {
  const s = await getSession();
  if (!s) throw fail.auth();
  const u = s.user;
  if (!opts.allowSuspended && u.status === "SUSPENDED" && (!u.suspendedUntil || u.suspendedUntil > new Date())) {
    throw fail.forbidden("Dein Konto ist derzeit gesperrt. Details findest du in deinen Benachrichtigungen.");
  }
  if (!u.profile) throw fail.forbidden("Bitte schliesse zuerst die Profileinrichtung ab.");
  return u as SessionUser & { profile: NonNullable<SessionUser["profile"]> };
}

/**
 * Für Seiten (Server Components): Wie requireUser, leitet aber nicht angemeldete
 * Besucher:innen zur Anmeldung weiter statt einen Fehler zu werfen.
 */
export async function requirePageUser(returnTo?: string, opts?: Parameters<typeof requireUser>[0]) {
  const s = await getSession();
  if (!s?.user.profile) {
    const { redirect } = await import("next/navigation");
    const q = returnTo ? `?weiter=${encodeURIComponent(returnTo)}` : "";
    // Passwort bestätigt, zweiter Faktor fehlt → direkt zur Code-Eingabe
    if (!s && (await getPendingMfaSession())) redirect(`/anmelden/zwei-faktor${q}`);
    redirect(`/anmelden${q}`);
  }
  return requireUser(opts);
}

/**
 * Session, deren Passwort-Schritt erfolgreich war, die aber noch auf den zweiten Faktor wartet
 * (Seite /anmelden/zwei-faktor bzw. API /auth/session/mfa).
 */
export async function getPendingMfaSession() {
  const raw = await tokenFromRequest();
  if (!raw) return null;
  const s = await db.session.findUnique({
    where: { id: sha256(raw) },
    select: { id: true, mfaPending: true, revokedAt: true, expiresAt: true, user: { select: { id: true, email: true, status: true, totpSecret: true, totpEnabledAt: true, totpLastStep: true } } },
  });
  if (!s || !s.mfaPending || s.revokedAt || s.expiresAt < new Date()) return null;
  if (s.user.status === "BANNED" || s.user.status === "DELETED" || !s.user.totpEnabledAt) return null;
  return s;
}
