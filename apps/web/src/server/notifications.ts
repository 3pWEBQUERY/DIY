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
 * Erzeugt oder bündelt eine Benachrichtigung. Gleiche ungelesene Ereignisse eines Ziels
 * (z.B. 12 Likes auf einem Projekt) werden zu einem Eintrag zusammengefasst.
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
      select: { id: true },
    });
    if (existing) {
      live(input.recipientId);
      return c.notification.update({
        where: { id: existing.id },
        data: { count: { increment: 1 }, actorId: input.actorId ?? undefined, data: (input.data ?? {}) as object, pushedAt: null },
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
