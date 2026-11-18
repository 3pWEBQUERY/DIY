import "server-only";
import { db, type Tx } from "@/server/db";
import { notify } from "@/server/notifications";
import { formatDate } from "@/lib/utils";

/**
 * Sicherheits-Reset nach Passwort-Reset/-Änderung, „alle anderen Sitzungen beenden“ und dem Aktivieren
 * der Zwei-Faktor-Anmeldung: alle anderen Sitzungen widerrufen und offene Links entwerten, die das
 * Konto übernehmen könnten (Passwort-Reset, E-Mail-Wechsel). Wer eine Sitzung gestohlen und damit
 * einen Link angefordert hat, verliert so beides.
 *
 * Nachträglich verbundene Pinterest-Konten bleiben eine Anmeldemöglichkeit, die das alles überdauert –
 * die Person wird darauf hingewiesen und kann die Verbindung unter Einstellungen → Konto lösen.
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
  await warnLinkedPinterest(userId, c);
  return { revokedSessions: sessions.count, removedTokens: tokens.count };
}

async function warnLinkedPinterest(userId: string, c: Tx | typeof db) {
  const u = await c.user.findUnique({ where: { id: userId }, select: { createdAt: true, authAccounts: { where: { provider: "pinterest" }, select: { createdAt: true } } } });
  // Bei der Registrierung mit Pinterest angelegt (gleiche Minute wie das Konto) → die eigene Anmeldung
  const later = u?.authAccounts.find((a) => a.createdAt.getTime() - u.createdAt.getTime() > 60_000);
  if (!later) return;
  await notify(
    {
      recipientId: userId,
      type: "SECURITY",
      bundle: false,
      data: {
        kind: "login_linked",
        message: `Mit deinem Konto ist seit dem ${formatDate(later.createdAt)} ein Pinterest-Konto verbunden – darüber ist eine Anmeldung weiterhin möglich. Warst du das nicht, löse die Verbindung unter Einstellungen → Konto.`,
        href: "/einstellungen/konto",
      },
    },
    c,
  );
}
