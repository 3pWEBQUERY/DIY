import "server-only";
import { timingSafeEqual } from "node:crypto";
import { env } from "@/server/env";
import { hmac } from "@/server/crypto";

/**
 * Einspruch ohne Anmeldung (§24.1 Nr. 7, DSA Art. 20): Dauerhaft gesperrte Konten können sich nicht mehr
 * anmelden, müssen eine Entscheidung aber anfechten können. Der Link in der Moderationsmail trägt deshalb
 * eine HMAC-Signatur über Fall und Konto – sie erlaubt ausschliesslich, DIESEN Fall einzusehen und
 * dagegen Einspruch zu erheben.
 */
const sign = (caseId: string, userId: string) => hmac(env().SESSION_SECRET, `appeal:${caseId}:${userId}`).slice(0, 40);

export function appealToken(caseId: string, userId: string) {
  return `${userId}.${sign(caseId, userId)}`;
}

/** Konto-ID aus einem gültigen Token für diesen Fall, sonst null. */
export function verifyAppealToken(caseId: string, t: string | null | undefined) {
  if (!t || t.length > 200) return null;
  const [userId, sig] = t.split(".");
  if (!userId || !sig) return null;
  const want = Buffer.from(sign(caseId, userId));
  const got = Buffer.from(sig);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
  return userId;
}
