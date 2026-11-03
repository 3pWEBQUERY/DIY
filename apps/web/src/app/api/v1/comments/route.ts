import { z } from "zod";
import { api, body } from "@/server/api";
import { currentUser, requireUser } from "@/server/auth/session";
import { createComment, listComments } from "@/server/social/interactions";
import { fail } from "@/server/errors";

const type = z.enum(["POST", "PROJECT", "TUTORIAL", "ARTICLE"]);

export const GET = api(async (req) => {
  const sp = req.nextUrl.searchParams;
  const t = type.safeParse(sp.get("type"));
  const id = sp.get("id");
  if (!t.success || !id) throw fail.invalid("type und id erforderlich");
  const u = await currentUser();
  return listComments(t.data, id, u?.id ?? null);
});

export const POST = api(async (req) => {
  const b = z.object({ type, id: z.string(), body: z.string(), parentId: z.string().optional() }).parse(await body(req));
  const c = await createComment(await requireUser(), b.type, b.id, { body: b.body, parentId: b.parentId });
  return { id: c.id };
});
