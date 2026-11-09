import "server-only";
import webpush from "web-push";
import { z } from "zod";
import { db } from "@/server/db";
import { fail } from "@/server/errors";
import { rateLimit } from "@/server/ratelimit";

/**
 * Browser-Push (Web Push mit VAPID). Die VAPID-Schlüssel kommen aus VAPID_PUBLIC_KEY /
 * VAPID_PRIVATE_KEY oder werden beim ersten Bedarf erzeugt und in der Datenbank abgelegt –
 * so funktioniert Push ohne manuelle Einrichtung und bleibt über Deploys stabil.
 */

const SETTING_KEY = "push.vapid";
const SUBJECT = "mailto:hallo@werkuno.ch";

type Vapid = { publicKey: string; privateKey: string };
let cached: Vapid | null = null;

export async function vapidKeys(): Promise<Vapid> {
  if (cached) return cached;
  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) return (cached = { publicKey: process.env.VAPID_PUBLIC_KEY, privateKey: process.env.VAPID_PRIVATE_KEY });
  const row = await db.systemSetting.findUnique({ where: { key: SETTING_KEY } });
  const v = row?.value as Vapid | undefined;
  if (v?.publicKey && v.privateKey) return (cached = v);
  const fresh = webpush.generateVAPIDKeys();
  // Gleichzeitige erste Aufrufe: nur der erste Datensatz gewinnt, alle lesen danach denselben
  await db.systemSetting.upsert({ where: { key: SETTING_KEY }, create: { key: SETTING_KEY, value: { publicKey: fresh.publicKey, privateKey: fresh.privateKey } }, update: {} });
  const saved = (await db.systemSetting.findUnique({ where: { key: SETTING_KEY } }))!.value as Vapid;
  return (cached = saved);
}

export async function vapidPublicKey() {
  return (await vapidKeys()).publicKey;
}

/**
 * Nur echte Push-Dienste der Browser (Chrome/Edge/Opera, Firefox, Safari, Windows) – sonst könnte
 * jedes Konto den Worker beliebige Adressen aufrufen lassen (SSRF) oder ihn mit hängenden
 * Verbindungen blockieren.
 */
const PUSH_HOSTS = [/^fcm\.googleapis\.com$/, /^android\.googleapis\.com$/, /^([a-z0-9-]+\.)*push\.services\.mozilla\.com$/, /^([a-z0-9-]+\.)*push\.apple\.com$/, /^([a-z0-9-]+\.)*notify\.windows\.com$/];

export function isAllowedPushEndpoint(endpoint: string) {
  try {
    const u = new URL(endpoint);
    return u.protocol === "https:" && (u.port === "" || u.port === "443") && !u.username && !u.password && PUSH_HOSTS.some((re) => re.test(u.hostname.toLowerCase()));
  } catch {
    return false;
  }
}

const subscriptionSchema = z.object({
  endpoint: z.string().url().max(2000).refine(isAllowedPushEndpoint, "Dieser Push-Dienst wird nicht unterstützt."),
  keys: z.object({ p256dh: z.string().min(10).max(200), auth: z.string().min(8).max(100) }),
});

export async function registerWebPush(userId: string, sessionId: string, input: unknown, userAgent: string | null) {
  const sub = subscriptionSchema.parse(input);
  await rateLimit(`webpush:${userId}`, 30, 3600);
  await db.pushDevice.upsert({
    where: { token: sub.endpoint },
    create: { token: sub.endpoint, userId, sessionId, platform: "WEB", p256dh: sub.keys.p256dh, auth: sub.keys.auth, userAgent: userAgent?.slice(0, 300) ?? null },
    update: { userId, sessionId, platform: "WEB", p256dh: sub.keys.p256dh, auth: sub.keys.auth, userAgent: userAgent?.slice(0, 300) ?? null, disabledAt: null, lastError: null, lastSeenAt: new Date() },
  });
  return { ok: true };
}

export async function unregisterWebPush(userId: string, endpoint: string) {
  if (!endpoint) throw fail.invalid("Kein Abo angegeben.");
  await db.pushDevice.deleteMany({ where: { userId, token: endpoint, platform: "WEB" } });
  return { ok: true };
}

export type WebPushPayload = { title: string; body: string; href: string; tag: string; badge?: number };

/** Eine Nachricht an ein Browser-Abo. `gone` = Abo existiert nicht mehr (abmelden). */
export async function sendWebPush(device: { token: string; p256dh: string | null; auth: string | null }, payload: WebPushPayload) {
  if (!device.p256dh || !device.auth) return { ok: false as const, gone: true, error: "Schlüssel fehlen" };
  if (!isAllowedPushEndpoint(device.token)) return { ok: false as const, gone: true, error: "Push-Dienst nicht erlaubt" };
  const v = await vapidKeys();
  try {
    await webpush.sendNotification({ endpoint: device.token, keys: { p256dh: device.p256dh, auth: device.auth } }, JSON.stringify(payload), {
      vapidDetails: { subject: SUBJECT, publicKey: v.publicKey, privateKey: v.privateKey },
      TTL: 6 * 3600,
      // Ohne Zeitlimit könnte ein hängender Dienst den ganzen Versand blockieren
      timeout: 10_000,
      urgency: "normal",
      topic: payload.tag.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 32) || undefined,
    });
    return { ok: true as const };
  } catch (e) {
    const status = (e as { statusCode?: number }).statusCode ?? 0;
    return { ok: false as const, gone: status === 404 || status === 410, error: `${status} ${(e as Error).message}`.slice(0, 200) };
  }
}
