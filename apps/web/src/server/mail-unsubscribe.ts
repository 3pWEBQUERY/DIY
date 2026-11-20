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
/** `weekly`: nur der Wochenrückblick; sonst Benachrichtigungs-Mails. Getrennt signiert. */
export type UnsubscribeList = "notifications" | "weekly";
const sign = (userId: string, list: UnsubscribeList = "notifications") => hmac(env().SESSION_SECRET, `${list === "weekly" ? "mail-unsubscribe-weekly" : "mail-unsubscribe"}:${userId}`).slice(0, 40);

export function unsubscribeUrl(userId: string, list: UnsubscribeList = "notifications") {
  return `${env().APP_URL.replace(/\/$/, "")}/api/mail/abbestellen?t=${userId}.${sign(userId, list)}${list === "weekly" ? "&liste=wochenrueckblick" : ""}`;
}

export function listFromParam(v: string | null | undefined): UnsubscribeList {
  return v === "wochenrueckblick" ? "weekly" : "notifications";
}

/** Konto-ID aus einem gültigen Token, sonst null. */
export function verifyUnsubscribeToken(t: string | null | undefined, list: UnsubscribeList = "notifications") {
  if (!t || t.length > 200) return null;
  const [userId, sig] = t.split(".");
  if (!userId || !sig) return null;
  const want = Buffer.from(sign(userId, list));
  const got = Buffer.from(sig);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
  return userId;
}

export async function unsubscribeByToken(t: string | null | undefined, list: UnsubscribeList = "notifications") {
  const userId = verifyUnsubscribeToken(t, list);
  if (!userId) return false;
  const u = await db.user.findUnique({ where: { id: userId }, select: { id: true } });
  if (!u) return false;
  const data = list === "weekly" ? { weeklyDigest: false } : { emailDigest: "OFF" };
  await db.userPreference.upsert({ where: { userId }, create: { userId, ...data }, update: data });
  return true;
}
