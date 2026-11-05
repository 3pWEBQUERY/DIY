import "server-only";
import { db } from "@/server/db";
import { fail } from "@/server/errors";
import { notificationHref, notificationText } from "@/server/notifications-format";
import { apnsConfigured, sendApns, type ApnsEnvironment } from "./apns";

/** APNs-Gerätetoken: 64 Hex-Zeichen (heute), Apple kann längere ausgeben. */
const TOKEN = /^[0-9a-f]{64,200}$/i;
/** Nur frische Ereignisse pushen – nach langer Pause kein Nachrichten-Schwall. */
const MAX_AGE_MS = 30 * 60_000;

export async function registerPushDevice(userId: string, sessionId: string, input: { token?: unknown; environment?: unknown }) {
  const token = String(input.token ?? "").trim();
  if (!TOKEN.test(token)) throw fail.invalid("Ungültiges Gerätetoken.");
  const environment: ApnsEnvironment = input.environment === "sandbox" ? "sandbox" : "production";
  await db.pushDevice.upsert({
    where: { token },
    create: { token, userId, sessionId, environment },
    update: { userId, sessionId, environment, disabledAt: null, lastError: null, lastSeenAt: new Date() },
  });
  return { ok: true, delivery: apnsConfigured() ? "active" : "pending-apns-configuration" };
}

export async function unregisterPushDevice(userId: string, token: string) {
  await db.pushDevice.deleteMany({ where: { userId, token: String(token ?? "").trim() } });
  return { ok: true };
}

/**
 * Worker-Job: neue, ungelesene In-App-Benachrichtigungen als iOS-Push zustellen.
 * Nur an Geräte mit gültiger Sitzung; ungültige Tokens werden deaktiviert.
 */
export async function deliverPendingPushes(limit = 200) {
  if (!apnsConfigured()) return { sent: 0, skipped: "not-configured" as const };
  const since = new Date(Date.now() - MAX_AGE_MS);
  const pending = await db.notification.findMany({
    where: { pushedAt: null, readAt: null, updatedAt: { gte: since } },
    orderBy: { updatedAt: "asc" },
    take: limit,
    include: { actor: { select: { profile: { select: { displayName: true, handle: true } } } } },
  });
  if (!pending.length) return { sent: 0 };
  const recipients = [...new Set(pending.map((n) => n.recipientId))];
  const now = new Date();
  const devices = await db.pushDevice.findMany({ where: { userId: { in: recipients }, disabledAt: null } });
  const sessionIds = devices.map((d) => d.sessionId).filter((x): x is string => !!x);
  const valid = new Set(
    (await db.session.findMany({ where: { id: { in: sessionIds }, revokedAt: null, expiresAt: { gt: now } }, select: { id: true } })).map((s) => s.id),
  );
  const unread = new Map(
    (await db.notification.groupBy({ by: ["recipientId"], where: { recipientId: { in: recipients }, readAt: null }, _count: { _all: true } })).map((r) => [r.recipientId, r._count._all]),
  );
  let sent = 0;
  for (const n of pending) {
    const data = (n.data ?? {}) as Record<string, unknown>;
    if (data._inApp === false) continue;
    const targets = devices.filter((d) => d.userId === n.recipientId && (!d.sessionId || valid.has(d.sessionId)));
    for (const d of targets) {
      const r = await sendApns(
        d.token,
        {
          aps: { alert: { title: "WERKRAUM", body: notificationText(n).slice(0, 240) }, badge: unread.get(n.recipientId) ?? 1, sound: "default", "thread-id": n.type },
          href: notificationHref(n),
          notificationId: n.id,
        },
        d.environment === "sandbox" ? "sandbox" : "production",
        { collapseId: n.groupKey ?? n.id },
      );
      if (r.ok) sent++;
      else await db.pushDevice.update({ where: { id: d.id }, data: { lastError: `${r.status} ${r.reason}`.slice(0, 200), ...(r.invalidToken ? { disabledAt: now } : {}) } });
    }
  }
  await db.notification.updateMany({ where: { id: { in: pending.map((n) => n.id) } }, data: { pushedAt: now } });
  return { sent };
}
