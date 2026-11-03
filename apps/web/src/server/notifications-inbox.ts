import "server-only";
import type { NotificationType } from "@werkraum/shared";
import { db, type Prisma } from "@/server/db";
import { NOTIFICATION_FILTERS, NOTIFICATION_ICON, notificationGroup, notificationHref, notificationParts, notificationText } from "@/server/notifications-format";

/**
 * Posteingang der Benachrichtigungen (PRD §19): Cursor-Pagination nach
 * `updatedAt` (gebündelte Einträge rutschen bei neuer Aktivität nach oben),
 * gelesen/ungelesen, Filter.
 */

const INCLUDE = {
  actor: { select: { id: true, profile: { select: { handle: true, displayName: true, avatarUrl: true } } } },
} as const;

export type InboxFilter = (typeof NOTIFICATION_FILTERS)[number]["key"];

function encodeCursor(d: Date, id: string) {
  return Buffer.from(`${d.toISOString()}|${id}`).toString("base64url");
}
function decodeCursor(c: string | null | undefined) {
  if (!c) return null;
  try {
    const [iso, id] = Buffer.from(c, "base64url").toString("utf8").split("|");
    const d = new Date(iso ?? "");
    if (!id || Number.isNaN(d.getTime())) return null;
    return { d, id };
  } catch {
    return null;
  }
}

export async function listNotifications(userId: string, opts: { filter?: string | null; cursor?: string | null; limit?: number; unreadOnly?: boolean } = {}) {
  const take = Math.min(100, Math.max(1, opts.limit ?? 40));
  const f = NOTIFICATION_FILTERS.find((x) => x.key === opts.filter) ?? NOTIFICATION_FILTERS[0]!;
  const cur = decodeCursor(opts.cursor);
  const rows = await db.notification.findMany({
    where: {
      recipientId: userId,
      ...(f.types ? { type: { in: f.types } } : {}),
      ...(opts.unreadOnly ? { readAt: null } : {}),
      ...(cur ? { OR: [{ updatedAt: { lt: cur.d } }, { updatedAt: cur.d, id: { lt: cur.id } }] } : {}),
    },
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    take: take + 1,
    include: INCLUDE,
  });
  const page = rows.slice(0, take);
  const last = page[page.length - 1];
  return {
    // In-App deaktivierte Ereignisse werden als „gelesen“ angelegt und hier nicht angezeigt.
    items: page.filter((n) => (n.data as Record<string, unknown> | null)?._inApp !== false).map(toView),
    nextCursor: rows.length > take && last ? encodeCursor(last.updatedAt, last.id) : null,
  };
}

type Row = Prisma.NotificationGetPayload<{ include: typeof INCLUDE }>;

export function toView(n: Row) {
  const parts = notificationParts(n);
  return {
    id: n.id,
    type: n.type,
    group: notificationGroup(n.type),
    icon: NOTIFICATION_ICON[n.type as NotificationType] ?? "bell",
    count: n.count,
    read: !!n.readAt,
    createdAt: n.createdAt.toISOString(),
    updatedAt: n.updatedAt.toISOString(),
    href: notificationHref(n),
    text: notificationText(n),
    lead: parts.lead,
    body: parts.text,
    excerpt: parts.excerpt,
    actor: n.actor?.profile
      ? { id: n.actor.id, handle: n.actor.profile.handle, displayName: n.actor.profile.displayName, avatarUrl: n.actor.profile.avatarUrl }
      : null,
  };
}
export type NotificationView = ReturnType<typeof toView>;

export async function markNotificationsRead(userId: string, ids: string[] | "all") {
  const now = new Date();
  const res = await db.notification.updateMany({
    where: { recipientId: userId, readAt: null, ...(ids === "all" ? {} : { id: { in: ids.slice(0, 200) } }) },
    data: { readAt: now },
  });
  return { updated: res.count };
}

export async function unreadByFilter(userId: string) {
  const rows = await db.notification.groupBy({ by: ["type"], where: { recipientId: userId, readAt: null }, _count: { _all: true } });
  const out: Record<string, number> = { all: 0 };
  for (const r of rows) {
    out.all = (out.all ?? 0) + r._count._all;
    const g = notificationGroup(r.type);
    if (g) out[g] = (out[g] ?? 0) + r._count._all;
  }
  return out;
}
