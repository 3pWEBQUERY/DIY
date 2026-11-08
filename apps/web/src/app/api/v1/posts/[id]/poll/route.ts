import { api, body } from "@/server/api";
import { requireUser } from "@/server/auth/session";
import { votePoll } from "@/server/social/posts";

/** POST /api/v1/posts/:id/poll  { optionIds: string[] } → Umfrage mit Ergebnissen */
export const POST = api(async (req, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  const b = await body<{ optionIds?: unknown }>(req);
  return votePoll(await requireUser(), id, Array.isArray(b.optionIds) ? b.optionIds.map(String) : []);
});
