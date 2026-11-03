import { api } from "@/server/api";
import { requireUser } from "@/server/auth/session";
import { completeUpload } from "@/server/media/service";

export const POST = api(async (_req, ctx: { params: Promise<{ id: string }> }) => {
  const user = await requireUser();
  const { id } = await ctx.params;
  return completeUpload(user, id);
});
