import { z } from "zod";
import { api, body } from "@/server/api";
import { requireUser } from "@/server/auth/session";
import { setFollow } from "@/server/social/interactions";

export const POST = api(async (req) => {
  const b = z.object({ userId: z.string(), follow: z.boolean() }).parse(await body(req));
  return setFollow(await requireUser(), b.userId, b.follow);
});
