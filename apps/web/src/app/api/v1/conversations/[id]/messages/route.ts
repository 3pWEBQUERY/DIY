import { api, body } from "@/server/api";
import { requireUser } from "@/server/auth/session";
import { messagesSince, sendMessage } from "@/server/messaging/service";

type Ctx = { params: Promise<{ id: string }> };

/** GET /api/v1/conversations/:id/messages?after=ISO – neue Nachrichten (Polling, iOS). */
export const GET = api(async (req, ctx: Ctx) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  return messagesSince(user, id, req.nextUrl.searchParams.get("after"));
});

/** POST /api/v1/conversations/:id/messages – Nachricht senden ({ body, media[] }). */
export const POST = api(async (req, ctx: Ctx) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  return sendMessage(user, id, await body(req));
});
