import { api, body } from "@/server/api";
import { requireUser } from "@/server/auth/session";
import { requestUpload } from "@/server/media/service";

export const POST = api(async (req) => {
  const user = await requireUser();
  const b = await body<{ mime: string; bytes: number; purpose?: "public" | "private" }>(req);
  return requestUpload(user, b);
});
