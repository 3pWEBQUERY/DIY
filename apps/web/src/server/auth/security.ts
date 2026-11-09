import "server-only";
import { db, type Tx } from "@/server/db";

/**
 * Sicherheits-Reset nach Passwort-Reset/-Änderung, „alle anderen Sitzungen beenden“ und dem Aktivieren
 * der Zwei-Faktor-Anmeldung: alle anderen Sitzungen widerrufen und offene Links entwerten, die das
 * Konto übernehmen könnten (Passwort-Reset, E-Mail-Wechsel). Wer eine Sitzung gestohlen und damit
 * einen Link angefordert hat, verliert so beides.
 *
 * - `keepSessionId`: diese Sitzung bleibt (die eigene, aktuelle).
 * - `exceptTokenId`: dieser Link bleibt unangetastet (z. B. der gerade eingelöste Reset-Link).
 */
export async function securityReset(userId: string, opts: { keepSessionId?: string | null; exceptTokenId?: string | null; tx?: Tx } = {}) {
  const c = opts.tx ?? db;
  const sessions = await c.session.updateMany({
    where: { userId, revokedAt: null, ...(opts.keepSessionId ? { id: { not: opts.keepSessionId } } : {}) },
    data: { revokedAt: new Date() },
  });
  const tokens = await c.verificationToken.deleteMany({
    where: { userId, usedAt: null, purpose: { in: ["PASSWORD_RESET", "EMAIL_CHANGE"] }, ...(opts.exceptTokenId ? { id: { not: opts.exceptTokenId } } : {}) },
  });
  return { revokedSessions: sessions.count, removedTokens: tokens.count };
}
