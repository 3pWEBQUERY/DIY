import "server-only";
import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { env } from "@/server/env";
import { db } from "@/server/db";
import { fail, uniqueViolation } from "@/server/errors";
import { audit } from "@/server/audit";
import { hmac } from "@/server/crypto";
import { slugify } from "@/lib/utils";
import { requireFlag } from "@/server/flags";
import { limit } from "@/server/ratelimit";
import { clientIpHash, createSession } from "@/server/auth/session";
import { isHandleAvailable, sendVerification } from "./service";

/**
 * Anmelden mit Pinterest (OAuth 2.0, Pinterest API v5).
 *
 * Pinterest gibt KEINE E-Mail-Adresse heraus (nur Kennung, Benutzername, Profilbild). Deshalb:
 * - Bereits verknüpft → anmelden.
 * - Angemeldet und „verbinden“ → mit dem eigenen Konto verknüpfen (Einstellungen → Konto).
 * - Neu → kurzlebiges, signiertes Cookie mit der Pinterest-Kennung; auf /registrieren/pinterest gibt die
 *   Person ihre E-Mail-Adresse an (Bestätigungslink wie bei der normalen Registrierung). Mit einem
 *   bestehenden Konto wird NIE automatisch über die E-Mail verknüpft (Pinterest hat sie nicht bestätigt →
 *   Kontoübernahme), sondern nur nach Anmeldung über „Pinterest verbinden“.
 *
 * Zugriffstokens werden nicht gespeichert – wir brauchen nur die Kennung.
 */
export const PINTEREST_PROVIDER = "pinterest";
const AUTHORIZE_URL = "https://www.pinterest.com/oauth/";
const TOKEN_URL = "https://api.pinterest.com/v5/oauth/token";
const ACCOUNT_URL = "https://api.pinterest.com/v5/user_account";
export const PINTEREST_PENDING_COOKIE = "wr_pinterest_signup";
const PENDING_TTL_MS = 30 * 60_000;

export const pinterestRedirectUri = () => `${env().APP_URL}/api/auth/pinterest/callback`;

export function pinterestAuthorizeUrl(state: string) {
  const url = new URL(AUTHORIZE_URL);
  url.searchParams.set("client_id", env().PINTEREST_CLIENT_ID!);
  url.searchParams.set("redirect_uri", pinterestRedirectUri());
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "user_accounts:read");
  url.searchParams.set("state", state);
  return url;
}

export type PinterestAccount = { sub: string; username: string };

/** Code gegen ein Zugriffstoken tauschen und die Kontokennung abrufen. */
export async function fetchPinterestAccount(code: string): Promise<PinterestAccount> {
  const e = env();
  const basic = Buffer.from(`${e.PINTEREST_CLIENT_ID}:${e.PINTEREST_CLIENT_SECRET}`).toString("base64");
  const tokenRes = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: pinterestRedirectUri() }),
    signal: AbortSignal.timeout(15_000),
  });
  const tokenJson = (await tokenRes.json().catch(() => ({}))) as { access_token?: string; message?: string };
  if (!tokenRes.ok || !tokenJson.access_token) throw new Error(`pinterest_token_${tokenRes.status}: ${tokenJson.message ?? "kein Token"}`);
  const accRes = await fetch(ACCOUNT_URL, { headers: { Authorization: `Bearer ${tokenJson.access_token}`, Accept: "application/json" }, signal: AbortSignal.timeout(15_000) });
  const acc = (await accRes.json().catch(() => ({}))) as { id?: string; username?: string; message?: string };
  if (!accRes.ok || !(acc.id || acc.username)) throw new Error(`pinterest_account_${accRes.status}: ${acc.message ?? "keine Kennung"}`);
  // Die numerische Kennung bleibt gleich, auch wenn der Benutzername geändert wird
  return { sub: String(acc.id ?? acc.username), username: String(acc.username ?? "") };
}

// ───────────── Signiertes Cookie für die Registrierung ─────────────

const pendingSchema = z.object({ sub: z.string().min(1).max(120), username: z.string().max(120), exp: z.number() });
export type PinterestPending = z.infer<typeof pendingSchema>;

const sign = (payload: string) => hmac(env().SESSION_SECRET, `pinterest-signup:${payload}`);

export function encodePending(a: PinterestAccount) {
  const payload = Buffer.from(JSON.stringify({ sub: a.sub, username: a.username, exp: Date.now() + PENDING_TTL_MS })).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function decodePending(raw: string | undefined | null): PinterestPending | null {
  if (!raw) return null;
  const [payload, sig] = raw.split(".");
  if (!payload || !sig) return null;
  const expected = Buffer.from(sign(payload));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const p = pendingSchema.parse(JSON.parse(Buffer.from(payload, "base64url").toString("utf8")));
    return p.exp > Date.now() ? p : null;
  } catch {
    return null;
  }
}

// ───────────── Anmelden / Verknüpfen ─────────────

export type PinterestResolution =
  | { kind: "signed_in"; userId: string }
  | { kind: "linked"; userId: string }
  | { kind: "taken" }
  | { kind: "signup" };

/** Kennung zuordnen: anmelden, mit dem angemeldeten Konto verknüpfen oder Registrierung beginnen. */
export async function resolvePinterest(a: PinterestAccount, currentUserId: string | null): Promise<PinterestResolution> {
  const linked = await db.authAccount.findUnique({ where: { provider_providerAccountId: { provider: PINTEREST_PROVIDER, providerAccountId: a.sub } }, select: { userId: true } });
  if (currentUserId) {
    if (linked) return linked.userId === currentUserId ? { kind: "linked", userId: currentUserId } : { kind: "taken" };
    // Höchstens ein Pinterest-Konto je Werkuno-Konto
    await db.authAccount.deleteMany({ where: { userId: currentUserId, provider: PINTEREST_PROVIDER } });
    try {
      await db.authAccount.create({ data: { userId: currentUserId, provider: PINTEREST_PROVIDER, providerAccountId: a.sub } });
    } catch (e) {
      if (uniqueViolation(e) !== null) return { kind: "taken" };
      throw e;
    }
    await audit({ actorId: currentUserId, action: "account.pinterest_linked", targetType: "USER", targetId: currentUserId });
    return { kind: "linked", userId: currentUserId };
  }
  if (linked) return { kind: "signed_in", userId: linked.userId };
  return { kind: "signup" };
}

/** Verknüpfung lösen – nur, wenn danach noch eine Anmeldemöglichkeit bleibt (Passwort oder Apple). */
export async function unlinkPinterest(userId: string) {
  const u = await db.user.findUniqueOrThrow({ where: { id: userId }, select: { passwordHash: true, authAccounts: { select: { provider: true } } } });
  if (!u.authAccounts.some((x) => x.provider === PINTEREST_PROVIDER)) return;
  if (!u.passwordHash && !u.authAccounts.some((x) => x.provider === "apple")) {
    throw fail.invalid("Lege zuerst ein Passwort fest – sonst könntest du dich nicht mehr anmelden.");
  }
  await db.authAccount.deleteMany({ where: { userId, provider: PINTEREST_PROVIDER } });
  await audit({ actorId: userId, action: "account.pinterest_unlinked", targetType: "USER", targetId: userId });
}

// ───────────── Registrierung mit Pinterest ─────────────

export const pinterestSignUpSchema = z.object({
  email: z.email("Ungültige E-Mail-Adresse").trim().toLowerCase().max(254),
  displayName: z.string().trim().min(1, "Bitte gib einen Namen an").max(60),
  adult: z.literal(true, { error: "Die Teilnahme ist ab 18 Jahren möglich" }),
  terms: z.literal(true, { error: "Bitte akzeptiere die Nutzungsbedingungen" }),
});

async function freeHandle(base: string) {
  const handle = slugify(base, 16).replace(/-/g, ".") || "mitglied";
  for (let i = 0; i < 8; i++) {
    const cand = i === 0 ? handle : `${handle}${Math.floor(Math.random() * 900 + 100)}`;
    const r = await isHandleAvailable(cand);
    if (r.ok) return r.handle;
  }
  return `${handle}${Date.now().toString(36).slice(-5)}`;
}

/** Konto aus der Pinterest-Kennung + angegebener E-Mail-Adresse anlegen und anmelden. */
export async function completePinterestSignUp(pending: PinterestPending, input: unknown) {
  await requireFlag("signup");
  const data = pinterestSignUpSchema.parse(input);
  await limit("signUp", await clientIpHash());
  const already = await db.authAccount.findUnique({ where: { provider_providerAccountId: { provider: PINTEREST_PROVIDER, providerAccountId: pending.sub } }, select: { userId: true } });
  if (already) throw fail.conflict("Dieses Pinterest-Konto ist bereits verknüpft – melde dich mit Pinterest an.");
  const exists = await db.user.findUnique({ where: { email: data.email }, select: { id: true } });
  if (exists) {
    throw fail.invalid("Mit dieser E-Mail-Adresse besteht bereits ein Konto. Melde dich damit an und verbinde Pinterest unter Einstellungen → Konto.", {
      email: "Bereits registriert – melde dich an und verbinde Pinterest in den Einstellungen.",
    });
  }
  const handle = await freeHandle(pending.username || data.displayName);
  const now = new Date();
  const user = await db.user
    .create({
      data: {
        email: data.email,
        signupMethod: "PINTEREST",
        adultConfirmedAt: now,
        termsAcceptedAt: now,
        profile: { create: { handle, displayName: data.displayName } },
        preference: { create: {} },
        authAccounts: { create: { provider: PINTEREST_PROVIDER, providerAccountId: pending.sub } },
      },
      select: { id: true, email: true },
    })
    .catch((e: unknown) => {
      const target = uniqueViolation(e);
      if (target?.includes("email")) throw fail.invalid("Mit dieser E-Mail-Adresse besteht bereits ein Konto.", { email: "Bereits registriert – melde dich an." });
      if (target !== null) throw fail.conflict("Dieses Pinterest-Konto ist bereits verknüpft – melde dich mit Pinterest an.");
      throw e;
    });
  await sendVerification(user.id, user.email);
  await createSession(user.id);
  return { userId: user.id };
}
