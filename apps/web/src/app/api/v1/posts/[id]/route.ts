import { api } from "@/server/api";
import { currentUser, requireUser } from "@/server/auth/session";
import { deletePost, getPostForViewer } from "@/server/social/posts";
import { fail } from "@/server/errors";

export const GET = api(async (_req, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  const u = await currentUser();
  const p = await getPostForViewer(id, u?.id ?? null);
  if (!p) throw fail.notFound();
  return p;
});

export const DELETE = api(async (_req, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  await deletePost(await requireUser(), id);
  return { ok: true };
});
