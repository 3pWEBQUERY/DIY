import { z } from "zod";
import { api, body } from "@/server/api";
import { requireUser } from "@/server/auth/session";
import { setLike } from "@/server/social/interactions";

const schema = z.object({ type: z.enum(["POST", "PROJECT", "TUTORIAL", "COMMENT", "ARTICLE"]), id: z.string().min(1), liked: z.boolean() });

export const POST = api(async (req) => {
  const b = schema.parse(await body(req));
  return setLike(await requireUser(), b.type, b.id, b.liked);
});
