import { z } from "zod";
import { api, body } from "@/server/api";
import { requireUser } from "@/server/auth/session";
import { markNotificationsRead } from "@/server/notifications-inbox";

const schema = z.union([z.object({ all: z.literal(true) }), z.object({ ids: z.array(z.string().min(1)).min(1).max(200) })]);

/** POST /api/v1/notifications/read  { ids: [...] } | { all: true } */
export const POST = api(async (req) => {
  const user = await requireUser({ allowSuspended: true });
  const input = schema.parse(await body(req));
  return markNotificationsRead(user.id, "all" in input ? "all" : input.ids);
});
