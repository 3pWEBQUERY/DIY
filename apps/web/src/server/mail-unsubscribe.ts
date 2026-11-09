import "server-only";
import { timingSafeEqual } from "node:crypto";
import { db } from "@/server/db";
import { env } from "@/server/env";
import { hmac } from "@/server/crypto";

/**
 * Abmelden von Benachrichtigungs-E-Mails ohne Anmeldung (Link in der Fusszeile und
 * List-Unsubscribe-Header, RFC 8058). Das Token ist eine HMAC-Signatur der Konto-ID –
 * es erlaubt ausschliesslich das Abbestellen dieser E-Mails.
 * Sicherheits-, Bestell- und Moderationsmails werden weiterhin verschickt.
 */
const sign = (userId: string) => hmac(env().SESSION_SECRET, `mail-unsubscribe:${userId}`).slice(0, 40);

export function unsubscribeUrl(userId: string) {
  return `${env().APP_URL.replace(/\/$/, "")}/api/mail/abbestellen?t=${userId}.${sign(userId)}`;
}

/** Konto-ID aus einem gültigen Token, sonst null. */
export function verifyUnsubscribeToken(t: string | null | undefined) {
  if (!t || t.length > 200) return null;
  const [userId, sig] = t.split(".");
  if (!userId || !sig) return null;
  const want = Buffer.from(sign(userId));
  const got = Buffer.from(sig);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
  return userId;
}

export async function unsubscribeByToken(t: string | null | undefined) {
  const userId = verifyUnsubscribeToken(t);
  if (!userId) return false;
  const u = await db.user.findUnique({ where: { id: userId }, select: { id: true } });
  if (!u) return false;
  await db.userPreference.upsert({ where: { userId }, create: { userId, emailDigest: "OFF" }, update: { emailDigest: "OFF" } });
  return true;
}
