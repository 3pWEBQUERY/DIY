import "server-only";
import { db } from "@/server/db";
import { ONLINE_WINDOW_MS, type Presence } from "@/lib/presence";

/** Herzschlag höchstens alle 30 s in die Datenbank schreiben (Zähler werden oft abgefragt). */
const WRITE_THROTTLE_MS = 30_000;

/** Online markieren bzw. verlängern (Web: sichtbarer Tab, App: Vordergrund). */
export async function touchPresence(userId: string, now = new Date()) {
  const until = new Date(now.getTime() + ONLINE_WINDOW_MS);
  const threshold = new Date(now.getTime() + ONLINE_WINDOW_MS - WRITE_THROTTLE_MS);
  await db.$executeRaw`
    UPDATE "User" SET "onlineUntil" = ${until}, "lastOnlineAt" = ${now}
    WHERE id = ${userId} AND ("onlineUntil" IS NULL OR "onlineUntil" < ${threshold})`;
}

/** Sofort offline (Tab geschlossen bzw. verborgen, App im Hintergrund, Abmelden). */
export async function setOffline(userId: string, now = new Date()) {
  await db.user.updateMany({ where: { id: userId, onlineUntil: { gt: now } }, data: { onlineUntil: now, lastOnlineAt: now } });
}

export function presenceOf(u: { onlineUntil: Date | null; lastOnlineAt: Date | null }, now = new Date()): Presence {
  return { online: !!u.onlineUntil && u.onlineUntil > now, lastOnlineAt: u.lastOnlineAt?.toISOString() ?? null };
}

/** Wer hat „Online-Status zeigen“ ausgeschaltet? */
export async function presenceHidden(userIds: string[]) {
  if (!userIds.length) return new Set<string>();
  const rows = await db.userPreference.findMany({ where: { userId: { in: [...new Set(userIds)] }, showOnline: false }, select: { userId: true } });
  return new Set(rows.map((r) => r.userId));
}

/**
 * Online-Status anderer Mitglieder für `viewerId` – gegenseitig wie bei WhatsApp: Wer ihn ausschaltet,
 * zeigt den eigenen nicht und sieht den der anderen nicht.
 */
export async function presenceFor(viewerId: string, users: { id: string; onlineUntil: Date | null; lastOnlineAt: Date | null }[]) {
  const hidden = await presenceHidden([viewerId, ...users.map((u) => u.id)]);
  const map = new Map<string, Presence>();
  if (hidden.has(viewerId)) return map;
  for (const u of users) if (!hidden.has(u.id)) map.set(u.id, presenceOf(u));
  return map;
}

/** Admin: wie viele sind gerade online, und wer (neueste zuerst). */
export async function onlineNow(take = 30) {
  const now = new Date();
  const where = { onlineUntil: { gt: now }, status: { not: "DELETED" as const } };
  const [count, users] = await Promise.all([
    db.user.count({ where }),
    db.user.findMany({
      where,
      orderBy: { lastOnlineAt: "desc" },
      take,
      select: { id: true, role: true, signupMethod: true, lastOnlineAt: true, profile: { select: { handle: true, displayName: true, avatarUrl: true } } },
    }),
  ]);
  return { count, users };
}
