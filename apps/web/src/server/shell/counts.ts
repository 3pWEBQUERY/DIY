import "server-only";
import { db } from "@/server/db";
import { inboxCounts } from "@/server/messaging/service";

export type ShellCounts = { notifications: number; messages: number; requests: number; cart: number };

/**
 * Zähler für Navigation & Badges: ungelesene Benachrichtigungen, ungelesene Gespräche
 * plus offene Kontaktanfragen (Badge „Nachrichten“) und Artikel im Warenkorb.
 */
export async function shellCounts(userId: string): Promise<ShellCounts> {
  const [notifications, inbox, cart] = await Promise.all([
    db.notification.count({ where: { recipientId: userId, readAt: null } }),
    inboxCounts(userId),
    db.cartItem.aggregate({ where: { cart: { userId } }, _sum: { quantity: true } }).then((r) => r._sum.quantity ?? 0),
  ]);
  return { notifications, messages: inbox.unread + inbox.requests, requests: inbox.requests, cart };
}
