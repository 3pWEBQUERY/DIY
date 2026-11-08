import { api, body } from "@/server/api";
import { signIn } from "@/server/identity/service";
import { destroySession, getSession } from "@/server/auth/session";
import { db } from "@/server/db";
import { sha256 } from "@/server/crypto";
import { fail } from "@/server/errors";

/**
 * Token-Anmeldung für die iOS-App (§25.5). Das zurückgegebene Token wird im Keychain
 * gespeichert und als `Authorization: Bearer …` gesendet. Sessions sind widerrufbar.
 */
export const POST = api(async (req) => {
  const b = await body<{ email: string; password: string }>(req);
  const r = await signIn(b);
  // mfaRequired: Token ist erst nach POST /api/v1/auth/session/mfa gültig
  return { token: r.token, userId: r.userId, mfaRequired: r.mfaRequired };
});

export const DELETE = api(async (req) => {
  const auth = req.headers.get("authorization");
  if (auth?.startsWith("Bearer ")) {
    await db.session.updateMany({ where: { id: sha256(auth.slice(7)) }, data: { revokedAt: new Date() } });
    return { ok: true };
  }
  if (!(await getSession())) throw fail.auth();
  await destroySession();
  return { ok: true };
});
