import "server-only";
import { db } from "@/server/db";

/** Wie oft ein offener Live-Stream die Sitzung erneut prüft. */
export const SESSION_RECHECK_MS = 60_000;

/**
 * Ist die Sitzung noch gültig? Eine einzige, schlanke Abfrage über den Primärschlüssel: nicht widerrufen,
 * nicht abgelaufen, zweiter Faktor nicht offen, Konto weder gesperrt (BANNED) noch gelöscht.
 */
export async function isSessionActive(sessionId: string, userId: string) {
  const s = await db.session.findFirst({
    where: { id: sessionId, userId, revokedAt: null, mfaPending: false, expiresAt: { gt: new Date() }, user: { status: { notIn: ["BANNED", "DELETED"] } } },
    select: { id: true },
  });
  return !!s;
}

/**
 * Prüft periodisch mit `check` und ruft `onEnd` genau einmal auf, sobald die Sitzung nicht mehr gilt
 * (A-15: ein offener SSE-Stream lieferte sonst nach Abmelden/Widerruf/Sperre weiter Ereignisse).
 * Datenbankfehler beenden den Stream nicht – die nächste Prüfung entscheidet. Gibt eine Stopp-Funktion zurück.
 */
export function watchSession(check: () => Promise<boolean>, onEnd: () => void, intervalMs = SESSION_RECHECK_MS) {
  let stopped = false;
  let running = false;
  const stop = () => {
    stopped = true;
    clearInterval(timer);
  };
  const timer = setInterval(async () => {
    if (stopped || running) return;
    running = true;
    try {
      const ok = await check().catch(() => true);
      if (!ok && !stopped) {
        stop();
        onEnd();
      }
    } finally {
      running = false;
    }
  }, intervalMs);
  return stop;
}
