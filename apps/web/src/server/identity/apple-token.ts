import "server-only";
import { createHash, createPrivateKey, createPublicKey, createVerify, sign, timingSafeEqual } from "node:crypto";
import { env } from "@/server/env";
import { db } from "@/server/db";
import { fail } from "@/server/errors";
import { decryptSecret, encryptSecret } from "@/server/auth/totp";
import { splitJwt } from "./jwt";

/**
 * Sign in with Apple – Token-Handling ohne Kontologik: identityToken prüfen (Signatur, Aussteller,
 * Audience, Ablauf, optional Nonce), authorizationCode gegen ein Refresh-Token tauschen und dieses bei
 * der Kontolöschung widerrufen (App Store Review Guideline 5.1.1(v)).
 */

const APPLE_ISSUER = "https://appleid.apple.com";
const TOKEN_URL = "https://appleid.apple.com/auth/token";
const REVOKE_URL = "https://appleid.apple.com/auth/revoke";
/** Zwischenstand bei der Kontolöschung: Verknüpfung gelöst, Token wird im Aufräumjob widerrufen. */
export const APPLE_REVOKE_PROVIDER = "apple-revoke";

export type AppleIdClaims = { sub: string; email?: string; email_verified?: boolean | string; iat?: number; exp: number; nonce?: string };

type Jwk = JsonWebKey & { kid?: string };
let jwksCache: { at: number; keys: Jwk[] } | null = null;

async function appleKeys(force = false) {
  if (!force && jwksCache && Date.now() - jwksCache.at < 6 * 3600_000) return jwksCache.keys;
  const res = await fetch("https://appleid.apple.com/auth/keys", { cache: "no-store" });
  if (!res.ok) throw fail.unavailable("Apple ist derzeit nicht erreichbar.");
  const { keys } = (await res.json()) as { keys: Jwk[] };
  jwksCache = { at: Date.now(), keys };
  return keys;
}

const sha256Hex = (s: string) => createHash("sha256").update(s, "utf8").digest("hex");

/**
 * Nonce-Prüfung (Replay-Schutz): Die App erzeugt eine zufällige Nonce, gibt Apple deren SHA-256 (hex)
 * mit und schickt uns die Roh-Nonce. Das Token muss genau diesen Hash als `nonce`-Claim tragen.
 */
export function nonceMatches(rawNonce: string, claim: unknown) {
  if (typeof claim !== "string" || !rawNonce) return false;
  const a = Buffer.from(sha256Hex(rawNonce));
  const b = Buffer.from(claim.toLowerCase());
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Prüft ein identityToken von Apple (RS256, Aussteller Apple, Audience, nicht abgelaufen) und gibt die
 * Claims zurück. Mit `nonce` (Roh-Nonce der App) muss der `nonce`-Claim deren SHA-256 sein.
 */
export async function verifyAppleIdentityToken(idToken: string, opts: { audience: string; nonce?: string | null }) {
  // Kaputte Struktur (kein JWT, kein Base64url, kein JSON-Objekt) → 400 statt 500
  const jwt = splitJwt(idToken);
  if (!jwt) throw fail.badRequest("Ungültiges Apple-Token.");
  const { header } = jwt;
  if (header.alg !== "RS256" || typeof header.kid !== "string") throw fail.badRequest("Ungültiges Apple-Token.");
  let jwk = (await appleKeys()).find((k) => k.kid === header.kid);
  if (!jwk) jwk = (await appleKeys(true)).find((k) => k.kid === header.kid);
  if (!jwk) throw fail.invalid("Unbekannter Apple-Schlüssel.");
  const key = createPublicKey({ key: jwk as never, format: "jwk" });
  const ok = createVerify("RSA-SHA256").update(jwt.signingInput).verify(key, jwt.signature);
  if (!ok) throw fail.invalid("Apple-Token konnte nicht verifiziert werden.");
  const claims = jwt.claims as Partial<AppleIdClaims> & { iss?: unknown; aud?: unknown; exp?: unknown };
  if (claims.iss !== APPLE_ISSUER || claims.aud !== opts.audience || typeof claims.exp !== "number" || claims.exp * 1000 < Date.now()) {
    throw fail.invalid("Apple-Token ist abgelaufen oder nicht für diese App ausgestellt.");
  }
  if (typeof claims.sub !== "string" || !claims.sub || (claims.email != null && typeof claims.email !== "string")) throw fail.badRequest("Ungültiges Apple-Token.");
  if (opts.nonce != null && opts.nonce !== "" && !nonceMatches(opts.nonce, claims.nonce)) {
    throw fail.invalid("Apple-Token passt nicht zu dieser Anmeldung (Nonce). Bitte versuche es erneut.");
  }
  return claims as AppleIdClaims;
}

// ───────────── Client-Secret, Code-Tausch, Widerruf ─────────────

function signingConfig() {
  const e = env();
  if (!e.APPLE_TEAM_ID || !e.APPLE_KEY_ID || !e.APPLE_PRIVATE_KEY) return null;
  return { teamId: e.APPLE_TEAM_ID, keyId: e.APPLE_KEY_ID, privateKey: e.APPLE_PRIVATE_KEY.replace(/\\n/g, "\n") };
}

/** Client-Secret für Apples Token-Endpunkte: ES256-JWT (5 Minuten gültig), `sub` = Client-ID. */
export function appleClientSecret(clientId: string, cfg = signingConfig(), now = Math.floor(Date.now() / 1000)) {
  if (!cfg) throw fail.unavailable("Sign in with Apple ist auf dem Server nicht vollständig eingerichtet.");
  const b64 = (v: unknown) => Buffer.from(JSON.stringify(v)).toString("base64url");
  const input = `${b64({ alg: "ES256", kid: cfg.keyId, typ: "JWT" })}.${b64({ iss: cfg.teamId, iat: now, exp: now + 300, aud: APPLE_ISSUER, sub: clientId })}`;
  // .p8-Schlüssel als PEM oder (ohne Kopfzeilen) als Base64-DER
  const key = cfg.privateKey.includes("BEGIN") ? createPrivateKey(cfg.privateKey) : createPrivateKey({ key: Buffer.from(cfg.privateKey, "base64"), format: "der", type: "pkcs8" });
  const sig = sign("sha256", Buffer.from(input), { key, dsaEncoding: "ieee-p1363" });
  return `${input}.${sig.toString("base64url")}`;
}

async function postForm(url: string, body: Record<string, string>) {
  return fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams(body),
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
}

function logWarn(msg: string, extra: Record<string, unknown> = {}) {
  console.warn(JSON.stringify({ level: "warn", msg, ...extra }));
}

/**
 * Native App: authorizationCode gegen Tokens tauschen (ohne redirect_uri). Gibt das Refresh-Token
 * zurück, wenn das mitgelieferte id_token zum selben Apple-Konto gehört – sonst null (best effort).
 */
export async function exchangeAppleCode(code: string, clientId: string, expectedSub: string) {
  if (!signingConfig()) return null;
  try {
    const res = await postForm(TOKEN_URL, { client_id: clientId, client_secret: appleClientSecret(clientId), code, grant_type: "authorization_code" });
    if (!res.ok) {
      logWarn("apple_code_exchange_failed", { status: res.status });
      return null;
    }
    const j = (await res.json()) as { refresh_token?: unknown; id_token?: unknown };
    const sub = typeof j.id_token === "string" ? splitJwt(j.id_token)?.claims.sub : null;
    if (typeof j.refresh_token !== "string" || sub !== expectedSub) {
      logWarn("apple_code_exchange_mismatch");
      return null;
    }
    return j.refresh_token;
  } catch (e) {
    logWarn("apple_code_exchange_failed", { err: e instanceof Error ? e.message : String(e) });
    return null;
  }
}

/** Refresh-Token verschlüsselt an der Apple-Verknüpfung speichern (für den späteren Widerruf). */
export async function storeAppleRefreshToken(sub: string, refreshToken: string, clientId: string) {
  await db.authAccount.updateMany({
    where: { provider: "apple", providerAccountId: sub },
    data: { refreshToken: encryptSecret(refreshToken), tokenClientId: clientId },
  });
}

/** Ein Refresh-Token bei Apple widerrufen. true = widerrufen (oder bereits ungültig). */
export async function revokeAppleToken(refreshToken: string, clientId: string) {
  const res = await postForm(REVOKE_URL, { client_id: clientId, client_secret: appleClientSecret(clientId), token: refreshToken, token_type_hint: "refresh_token" });
  if (res.ok) return true;
  // invalid_grant: Token schon widerrufen/abgelaufen – nichts mehr zu tun
  const j = (await res.json().catch(() => null)) as { error?: string } | null;
  if (j?.error === "invalid_grant") return true;
  throw new Error(`Apple-Widerruf fehlgeschlagen (HTTP ${res.status}${j?.error ? `, ${j.error}` : ""})`);
}

/**
 * Kontolöschung: alle gespeicherten Apple-Tokens des Kontos widerrufen und die Verknüpfungen entfernen.
 * Best effort – Fehler werden protokolliert, die Löschung läuft weiter. Idempotent.
 */
export async function revokeAppleTokensForUser(userId: string) {
  const rows = await db.authAccount.findMany({
    where: { userId, provider: { in: ["apple", APPLE_REVOKE_PROVIDER] }, refreshToken: { not: null } },
    select: { id: true, refreshToken: true, tokenClientId: true },
  });
  let revoked = 0;
  for (const r of rows) {
    const clientId = r.tokenClientId ?? env().APPLE_CLIENT_ID;
    try {
      if (!clientId) throw new Error("Client-ID unbekannt");
      if (await revokeAppleToken(decryptSecret(r.refreshToken!), clientId)) revoked++;
    } catch (e) {
      logWarn("apple_revoke_failed", { authAccountId: r.id, err: e instanceof Error ? e.message : String(e) });
    }
  }
  await db.authAccount.deleteMany({ where: { userId, provider: { in: ["apple", APPLE_REVOKE_PROVIDER] } } });
  return { revoked, total: rows.length };
}
