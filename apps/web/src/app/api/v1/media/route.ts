import { api, body } from "@/server/api";
import { requireUser } from "@/server/auth/session";
import { requestUpload } from "@/server/media/service";

export const POST = api(async (req) => {
  const user = await requireUser();
  const b = await body<{ mime: string; bytes: number; purpose?: "public" | "private"; durationSec?: number }>(req);
  return requestUpload(user, { mime: String(b.mime ?? ""), bytes: Number(b.bytes), purpose: b.purpose === "private" ? "private" : "public", durationSec: typeof b.durationSec === "number" ? b.durationSec : null });
});
