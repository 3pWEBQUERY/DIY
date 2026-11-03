import { api } from "@/server/api";
import { requireUser } from "@/server/auth/session";
import { markRead } from "@/server/messaging/service";

/** POST /api/v1/conversations/:id/read – Unterhaltung als gelesen markieren. */
export const POST = api(async (_req, ctx: { params: Promise<{ id: string }> }) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  return markRead(user, id);
});
