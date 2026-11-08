import { api } from "@/server/api";
import { requireUser } from "@/server/auth/session";
import { mediaStatus } from "@/server/media/service";

/** GET /api/v1/media/:id/status → { state, error, variants } */
export const GET = api(async (_req, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  return mediaStatus(await requireUser(), id);
});
