import { api } from "@/server/api";
import { requireUser } from "@/server/auth/session";
import { limit } from "@/server/ratelimit";
import { uploadViaServer } from "@/server/media/service";

export const maxDuration = 300;

/** PUT /api/v1/media/[id]/upload – Fallback-Upload über den Server (gleiche Domain, Session-Cookie). */
export const PUT = api(async (req, ctx: { params: Promise<{ id: string }> }) => {
  const user = await requireUser();
  await limit("upload", user.id);
  const { id } = await ctx.params;
  return uploadViaServer(user, id, req.body, Number(req.headers.get("content-length") ?? 0));
});
