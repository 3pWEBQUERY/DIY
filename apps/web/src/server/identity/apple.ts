import "server-only";
import { Apple, decodeIdToken } from "arctic";
import { env } from "@/server/env";
import { db } from "@/server/db";
import { slugify } from "@/lib/utils";
import { isHandleAvailable } from "./service";

export function appleClient() {
  const e = env();
  const pkcs8 = new TextEncoder().encode(e.APPLE_PRIVATE_KEY!.replace(/\\n/g, "\n"));
  return new Apple(e.APPLE_CLIENT_ID!, e.APPLE_TEAM_ID!, e.APPLE_KEY_ID!, pkcs8, `${e.APP_URL}/api/auth/apple/callback`);
}

/** Verknüpft oder erstellt ein Konto anhand der Apple-ID. Gibt userId + isNew zurück. */
export async function resolveAppleUser(code: string, rawUser: string | null) {
  const tokens = await appleClient().validateAuthorizationCode(code);
  const claims = decodeIdToken(tokens.idToken()) as { sub: string; email?: string; email_verified?: boolean | string };
  const linked = await db.authAccount.findUnique({ where: { provider_providerAccountId: { provider: "apple", providerAccountId: claims.sub } } });
  if (linked) return { userId: linked.userId, isNew: false };

  const email = claims.email?.toLowerCase();
  if (email) {
    const existing = await db.user.findUnique({ where: { email }, select: { id: true } });
    if (existing) {
      await db.authAccount.create({ data: { userId: existing.id, provider: "apple", providerAccountId: claims.sub } });
      return { userId: existing.id, isNew: false };
    }
  }

  let name = "Neues Mitglied";
  try {
    const u = rawUser ? (JSON.parse(rawUser) as { name?: { firstName?: string; lastName?: string } }) : null;
    if (u?.name) name = [u.name.firstName, u.name.lastName].filter(Boolean).join(" ") || name;
  } catch {
    /* Apple sendet den Namen nur beim ersten Login */
  }
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
      email: email ?? `apple-${claims.sub.slice(0, 12)}@privaterelay.invalid`,
      emailVerifiedAt: claims.email_verified === true || claims.email_verified === "true" ? new Date() : null,
      termsAcceptedAt: new Date(),
      profile: { create: { handle, displayName: name } },
      preference: { create: {} },
      authAccounts: { create: { provider: "apple", providerAccountId: claims.sub } },
    },
  });
  return { userId: user.id, isNew: true };
}
