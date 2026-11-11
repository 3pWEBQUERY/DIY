import "server-only";
import { db } from "@/server/db";
import { AppError, fail } from "@/server/errors";
import { verifyPassword } from "@/server/crypto";
import { rateLimit } from "@/server/ratelimit";

/**
 * Erneute Bestätigung für sicherheitskritische Schritte (2FA ein/aus, erstes Passwort festlegen,
 * Konto löschen). Eine gestohlene Sitzung allein reicht dafür nie:
 *
 * - Konto mit Passwort → aktuelles Passwort.
 * - Konto ohne Passwort (nur „Mit Apple anmelden“) → frische Anmeldung mit Apple: entweder ein
 *   aktuelles identityToken derselben Apple-ID (iOS: `appleIdentityToken`) oder eine Sitzung, die vor
 *   höchstens REAUTH_MINUTES Minuten neu angemeldet wurde (Web: „Mit Apple bestätigen“ → zurück hierher).
 */
export const REAUTH_MINUTES = 10;
const WINDOW_MS = REAUTH_MINUTES * 60_000;

export type ReauthProof = { password?: string | null; appleIdentityToken?: string | null };

/** Fehler „bitte erneut mit Apple anmelden“ – `fields.reauth` signalisiert den Clients den Ablauf. */
export const reauthRequired = () =>
  // `reauth: "apple"` bleibt als Signal für die iOS-App (dort gibt es nur Apple); im Web wählt /api/auth/reauth den Anbieter
  new AppError("FORBIDDEN", `Bitte bestätige diesen Schritt, indem du dich erneut anmeldest (mit Apple bzw. Pinterest). Danach hast du ${REAUTH_MINUTES} Minuten Zeit.`, { reauth: "apple" });

/** Wurde die Sitzung gerade eben (innerhalb des Fensters) angemeldet? */
export const isFreshLogin = (sessionCreatedAt: Date, now = Date.now()) => now - sessionCreatedAt.getTime() <= WINDOW_MS;

/**
 * Prüft den Nachweis und wirft sonst. `field` ist das Formularfeld für ein falsches Passwort.
 * Gibt zurück, womit bestätigt wurde.
 */
export async function assertReauthenticated(userId: string, sessionId: string, proof: ReauthProof, field = "password"): Promise<"password" | "apple" | "recent"> {
  // Gegen das Durchprobieren von Passwörtern mit einer gestohlenen Sitzung
  await rateLimit(`reauth:${userId}`, 10, 900);
  const u = await db.user.findUniqueOrThrow({ where: { id: userId }, select: { passwordHash: true } });
  if (u.passwordHash) {
    if (!(await verifyPassword(proof.password ?? "", u.passwordHash))) throw fail.invalid("Das Passwort ist nicht korrekt.", { [field]: "Passwort nicht korrekt" });
    return "password";
  }
  if (proof.appleIdentityToken) {
    const audience = process.env.APPLE_IOS_CLIENT_ID;
    if (!audience) throw reauthRequired();
    const { verifyAppleIdentityToken } = await import("@/server/identity/apple-token");
    const claims = await verifyAppleIdentityToken(proof.appleIdentityToken, { audience });
    const linked = await db.authAccount.findUnique({ where: { provider_providerAccountId: { provider: "apple", providerAccountId: claims.sub } }, select: { userId: true } });
    if (linked?.userId !== userId) throw fail.forbidden("Diese Apple-ID gehört nicht zu deinem Konto.");
    // Nur ein frisch ausgestelltes Token zählt als erneute Anmeldung
    if (typeof claims.iat !== "number" || Date.now() - claims.iat * 1000 > WINDOW_MS) throw reauthRequired();
    return "apple";
  }
  const s = await db.session.findUnique({ where: { id: sessionId }, select: { userId: true, createdAt: true } });
  if (s?.userId === userId && isFreshLogin(s.createdAt)) return "recent";
  throw reauthRequired();
}
