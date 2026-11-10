import "server-only";
import type { NotificationType } from "@werkraum/shared";
import { db, type Tx, type TargetType } from "@/server/db";
import { publish } from "@/server/realtime/bus";

type Prefs = Partial<Record<NotificationType, { inApp?: boolean; email?: boolean }>>;

/** Standard: alles In-App; E-Mail nur für wirklich wichtige Ereignisse (§19.3, Bündelung). */
export const DEFAULT_EMAIL: NotificationType[] = ["MESSAGE", "ORDER_NEW", "ORDER_STATUS", "MODERATION", "SECURITY", "COMMUNITY_INVITE"];

export function prefFor(prefs: Prefs | null | undefined, type: NotificationType) {
  const p = prefs?.[type];
  return {
    inApp: p?.inApp ?? true,
    email: p?.email ?? DEFAULT_EMAIL.includes(type),
  };
}

/**
 * Gebündelte Ereignisse lösen nicht jedes Mal einen neuen Push aus: Wurde der offene Eintrag in den
 * letzten 30 Minuten bereits gepusht, wird er nur still in der App hochgezählt (kein Push mit Ton alle
 * paar Sekunden bei einem viralen Beitrag). Danach darf ein neues Ereignis wieder pushen.
 */
export const REPUSH_AFTER_MS = 30 * 60_000;
export function shouldRepush(pushedAt: Date | null | undefined, now = new Date()) {
  return !pushedAt || now.getTime() - pushedAt.getTime() >= REPUSH_AFTER_MS;
}

/**
 * Erzeugt oder bündelt eine Benachrichtigung. Gleiche ungelesene Ereignisse eines Ziels
 * (z. B. 12 Likes auf einem Projekt) werden zu einem Eintrag zusammengefasst.
 */
/** Zähler der Person live aktualisieren – kurz verzögert, damit eine laufende Transaktion zuerst committet. */
function live(userId: string) {
  setTimeout(() => void publish([userId], { t: "counts" }), 400);
}

export async function notify(
  input: {
    recipientId: string;
    type: NotificationType;
    actorId?: string | null;
    targetType?: TargetType;
    targetId?: string;
    data?: Record<string, unknown>;
    bundle?: boolean;
  },
  tx?: Tx,
) {
  const c = tx ?? db;
  if (input.actorId && input.actorId === input.recipientId) return null;
  if (input.actorId) {
    const blocked = await c.userBlock.findFirst({
      where: {
        OR: [
          { blockerId: input.recipientId, blockedId: input.actorId },
          { blockerId: input.actorId, blockedId: input.recipientId },
        ],
      },
      select: { blockerId: true },
    });
    if (blocked) return null;
    const muted = await c.userMute.findUnique({
      where: { muterId_mutedId: { muterId: input.recipientId, mutedId: input.actorId } },
      select: { muterId: true },
    });
    if (muted && input.type !== "MESSAGE") return null;
  }
  const pref = await c.userPreference.findUnique({ where: { userId: input.recipientId }, select: { notificationPrefs: true } });
  const p = prefFor(pref?.notificationPrefs as Prefs, input.type);
  if (!p.inApp && !p.email) return null;

  const groupKey = input.bundle !== false && input.targetId ? `${input.type}:${input.targetType}:${input.targetId}` : null;
  if (groupKey) {
    const existing = await c.notification.findFirst({
      where: { recipientId: input.recipientId, groupKey, readAt: null },
      select: { id: true, pushedAt: true },
    });
    if (existing) {
      live(input.recipientId);
      return c.notification.update({
        where: { id: existing.id },
        data: { count: { increment: 1 }, actorId: input.actorId ?? undefined, data: (input.data ?? {}) as object, ...(shouldRepush(existing.pushedAt) ? { pushedAt: null } : {}) },
      });
    }
  }
  live(input.recipientId);
  return c.notification.create({
    data: {
      recipientId: input.recipientId,
      actorId: input.actorId ?? null,
      type: input.type,
      targetType: input.targetType,
      targetId: input.targetId,
      groupKey,
      data: { ...(input.data ?? {}), _email: p.email, _inApp: p.inApp } as object,
      // Wenn kein E-Mail-Kanal gewünscht ist, gilt die Mail als "erledigt"
      emailedAt: p.email ? null : new Date(),
      readAt: p.inApp ? null : new Date(),
    },
  });
}

export async function unreadCount(userId: string) {
  return db.notification.count({ where: { recipientId: userId, readAt: null } });
}

/**
 * Dieselbe Benachrichtigung an viele Personen (Fan-out: neue Beiträge, Wettbewerbe, Events).
 * Gleiche Regeln wie `notify` (Blockieren, Stummschalten, Einstellungen, Bündelung), aber mit
 * wenigen Sammelabfragen je 500 Empfänger:innen statt 5–6 Abfragen pro Person.
 */
export async function notifyMany(
  recipientIds: string[],
  input: { type: NotificationType; actorId?: string | null; targetType?: TargetType; targetId?: string; data?: Record<string, unknown>; bundle?: boolean },
) {
  const all = [...new Set(recipientIds)].filter((id) => id !== input.actorId);
  let created = 0;
  for (let i = 0; i < all.length; i += 500) {
    const chunk = all.slice(i, i + 500);
    let ids = chunk;
    if (input.actorId) {
      const actor = input.actorId;
      const [blocks, mutes] = await Promise.all([
        db.userBlock.findMany({ where: { OR: [{ blockerId: { in: ids }, blockedId: actor }, { blockerId: actor, blockedId: { in: ids } }] }, select: { blockerId: true, blockedId: true } }),
        input.type === "MESSAGE" ? Promise.resolve([]) : db.userMute.findMany({ where: { muterId: { in: ids }, mutedId: actor }, select: { muterId: true } }),
      ]);
      const out = new Set([...blocks.flatMap((b) => [b.blockerId, b.blockedId]), ...mutes.map((m) => m.muterId)]);
      ids = ids.filter((id) => !out.has(id));
    }
    if (!ids.length) continue;
    const prefs = new Map((await db.userPreference.findMany({ where: { userId: { in: ids } }, select: { userId: true, notificationPrefs: true } })).map((p) => [p.userId, p.notificationPrefs as Prefs]));
    const wanted = ids.map((id) => ({ id, p: prefFor(prefs.get(id), input.type) })).filter((x) => x.p.inApp || x.p.email);
    if (!wanted.length) continue;
    const groupKey = input.bundle !== false && input.targetId ? `${input.type}:${input.targetType}:${input.targetId}` : null;
    let fresh = wanted;
    if (groupKey) {
      // Ungelesene Einträge desselben Ziels hochzählen statt neue anlegen
      const open = await db.notification.findMany({ where: { recipientId: { in: wanted.map((w) => w.id) }, groupKey, readAt: null }, select: { id: true, recipientId: true } });
      if (open.length) {
        const openIds = open.map((o) => o.id);
        await db.notification.updateMany({ where: { id: { in: openIds } }, data: { count: { increment: 1 }, actorId: input.actorId ?? undefined, data: (input.data ?? {}) as object } });
        // Nur Einträge, deren letzter Push länger her ist, erneut zum Pushen freigeben (siehe `shouldRepush`)
        await db.notification.updateMany({ where: { id: { in: openIds }, pushedAt: { lt: new Date(Date.now() - REPUSH_AFTER_MS) } }, data: { pushedAt: null } });
        const bundled = new Set(open.map((o) => o.recipientId));
        fresh = wanted.filter((w) => !bundled.has(w.id));
      }
    }
    if (fresh.length) {
      const now = new Date();
      await db.notification.createMany({
        data: fresh.map((w) => ({
          recipientId: w.id,
          actorId: input.actorId ?? null,
          type: input.type,
          targetType: input.targetType,
          targetId: input.targetId,
          groupKey,
          data: { ...(input.data ?? {}), _email: w.p.email, _inApp: w.p.inApp } as object,
          emailedAt: w.p.email ? null : now,
          readAt: w.p.inApp ? null : now,
        })),
      });
      created += fresh.length;
    }
    const targets = wanted.map((w) => w.id);
    setTimeout(() => void publish(targets, { t: "counts" }), 400);
  }
  return { created };
}
