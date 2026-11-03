import { api, body } from "@/server/api";
import { requireUser } from "@/server/auth/session";
import { createPost, getPostForViewer } from "@/server/social/posts";

export const POST = api(async (req) => {
  const u = await requireUser();
  const p = await createPost(u, await body(req));
  return getPostForViewer(p.id, u.id);
});
