import { api } from "@/server/api";
import { requireUser } from "@/server/auth/session";
import { searchOwnEmbeds } from "@/server/blog/service";

/** GET /api/v1/embeds?type=project|tutorial|product&q= – eigene Inhalte für Einbettungskarten. */
export const GET = api(async (req) => {
  const user = await requireUser();
  const sp = req.nextUrl.searchParams;
  return searchOwnEmbeds(user, sp.get("type") ?? "", sp.get("q") ?? "");
});
