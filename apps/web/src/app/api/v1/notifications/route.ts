import { api } from "@/server/api";
import { requireUser } from "@/server/auth/session";
import { listNotifications, unreadByFilter } from "@/server/notifications-inbox";

/**
 * GET /api/v1/notifications?filter=all|mentions|projects|shop|system&cursor=…&limit=…&unread=1
 * Cursor-Pagination für Web & iOS. Antwort: { items, nextCursor, unread }.
 */
export const GET = api(async (req) => {
  const user = await requireUser({ allowSuspended: true });
  const p = req.nextUrl.searchParams;
  const [page, unread] = await Promise.all([
    listNotifications(user.id, {
      filter: p.get("filter"),
      cursor: p.get("cursor"),
      limit: Number(p.get("limit")) || 30,
      unreadOnly: p.get("unread") === "1",
    }),
    unreadByFilter(user.id),
  ]);
  return { ...page, unread };
});
