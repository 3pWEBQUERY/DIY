import "server-only";
import { Apple, decodeIdToken } from "arctic";
import { env } from "@/server/env";
import { db } from "@/server/db";
import { slugify } from "@/lib/utils";
import { isHandleAvailable } from "./service";
import { createPublicKey, createVerify } from "node:crypto";
import { fail } from "@/server/errors";
import { createSession } from "@/server/auth/session";

export function appleClient() {
  const e = env();
  const pkcs8 = new TextEncoder().encode(e.APPLE_PRIVATE_KEY!.replace(/\\n/g, "\n"));
  return new Apple(e.APPLE_CLIENT_ID!, e.APPLE_TEAM_ID!, e.APPLE_KEY_ID!, pkcs8, `${e.APP_URL}/api/auth/apple/callback`);
}

type AppleClaims = { sub: string; email?: string; email_verified?: boolean | string };

/** Verknüpft oder erstellt ein Konto anhand der Apple-ID. Gibt userId + isNew zurück. */
export async function resolveAppleUser(code: string, rawUser: string | null) {
  const tokens = await appleClient().validateAuthorizationCode(code);
  const claims = decodeIdToken(tokens.idToken()) as AppleClaims;
  let name: string | null = null;
  try {
    const u = rawUser ? (JSON.parse(rawUser) as { name?: { firstName?: string; lastName?: string } }) : null;
    if (u?.name) name = [u.name.firstName, u.name.lastName].filter(Boolean).join(" ") || null;
  } catch {
    /* Apple sendet den Namen nur beim ersten Login */
  }
  return linkAppleClaims(claims, name);
}

async function linkAppleClaims(claims: AppleClaims, displayName: string | null) {
  const linked = await db.authAccount.findUnique({ where: { provider_providerAccountId: { provider: "apple", providerAccountId: claims.sub } } });
  if (linked) return { userId: linked.userId, isNew: false };

  const email = claims.email?.toLowerCase();
  const verified = claims.email_verified === true || claims.email_verified === "true";
  // Mit bestehendem Konto nur verknüpfen, wenn Apple die Adresse bestätigt hat (Kontoübernahme verhindern)
  if (email && verified) {
    const existing = await db.user.findUnique({ where: { email }, select: { id: true } });
    if (existing) {
      await db.authAccount.create({ data: { userId: existing.id, provider: "apple", providerAccountId: claims.sub } });
      return { userId: existing.id, isNew: false };
    }
  }

  const name = displayName?.trim().slice(0, 60) || "Neues Mitglied";
  let handle = slugify(name, 16).replace(/-/g, ".");
  for (let i = 0; i < 8; i++) {
    const cand = i === 0 ? handle : `${handle}${Math.floor(Math.random() * 900 + 100)}`;
    if ((await isHandleAvailable(cand)).ok) {
      handle = cand;
      break;
    }
  }
  const user = await db.user.create({
    data: {
      // Unbestätigte Adresse, die schon ein anderes Konto nutzt → Platzhalter statt Konflikt/Übernahme
      email: email && (verified || !(await db.user.findUnique({ where: { email }, select: { id: true } }))) ? email : `apple-${claims.sub.slice(0, 12)}@privaterelay.invalid`,
      emailVerifiedAt: claims.email_verified === true || claims.email_verified === "true" ? new Date() : null,
      termsAcceptedAt: new Date(),
      profile: { create: { handle, displayName: name } },
      preference: { create: {} },
      authAccounts: { create: { provider: "apple", providerAccountId: claims.sub } },
    },
  });
  return { userId: user.id, isNew: true };
}

// ───────────── Native Anmeldung mit Apple (iOS, AuthenticationServices) ─────────────

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

function b64url(s: string) {
  return Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

/**
 * Prüft das identityToken der App (RS256, Aussteller Apple, Audience = Bundle-ID aus
 * APPLE_IOS_CLIENT_ID, nicht abgelaufen) und meldet an. Gibt ein Bearer-Token zurück.
 */
export async function signInWithAppleIdToken(idToken: string, displayName: string | null) {
  const audience = process.env.APPLE_IOS_CLIENT_ID;
  if (!audience) throw fail.unavailable("Anmelden mit Apple ist in der App noch nicht aktiviert.");
  const [h, p, sig] = idToken.split(".");
  if (!h || !p || !sig) throw fail.invalid("Ungültiges Apple-Token.");
  const header = JSON.parse(b64url(h).toString("utf8")) as { kid?: string; alg?: string };
  if (header.alg !== "RS256") throw fail.invalid("Ungültiges Apple-Token.");
  let jwk = (await appleKeys()).find((k) => k.kid === header.kid);
  if (!jwk) jwk = (await appleKeys(true)).find((k) => k.kid === header.kid);
  if (!jwk) throw fail.invalid("Unbekannter Apple-Schlüssel.");
  const key = createPublicKey({ key: jwk as never, format: "jwk" });
  const ok = createVerify("RSA-SHA256").update(`${h}.${p}`).verify(key, b64url(sig));
  if (!ok) throw fail.invalid("Apple-Token konnte nicht verifiziert werden.");
  const claims = JSON.parse(b64url(p).toString("utf8")) as AppleClaims & { iss?: string; aud?: string; exp?: number };
  if (claims.iss !== "https://appleid.apple.com" || claims.aud !== audience || !claims.exp || claims.exp * 1000 < Date.now()) {
    throw fail.invalid("Apple-Token ist abgelaufen oder nicht für diese App ausgestellt.");
  }
  const { userId, isNew } = await linkAppleClaims(claims, displayName);
  const u = await db.user.findUniqueOrThrow({ where: { id: userId }, select: { status: true } });
  if (u.status === "BANNED") throw fail.forbidden("Dieses Konto wurde dauerhaft gesperrt.");
  if (u.status === "DELETED") throw fail.forbidden("Dieses Konto wurde gelöscht.");
  const s = await createSession(userId);
  return { userId, isNew, token: s.rawToken, mfaRequired: s.mfaRequired };
}
