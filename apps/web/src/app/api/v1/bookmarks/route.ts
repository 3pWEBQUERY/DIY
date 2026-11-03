import { z } from "zod";
import { api, body } from "@/server/api";
import { requireUser } from "@/server/auth/session";
import { setBookmark } from "@/server/social/interactions";

const schema = z.object({ type: z.enum(["POST", "PROJECT", "TUTORIAL", "PRODUCT", "ARTICLE"]), id: z.string().min(1), saved: z.boolean(), collectionId: z.string().nullish() });

export const POST = api(async (req) => {
  const b = schema.parse(await body(req));
  return setBookmark(await requireUser(), b.type, b.id, b.saved, b.collectionId);
});
