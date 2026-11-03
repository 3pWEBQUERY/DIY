import { api } from "@/server/api";
import { currentUser } from "@/server/auth/session";
import { listTutorials } from "@/server/tutorials/service";

export const GET = api(async (req) => {
  const sp = req.nextUrl.searchParams;
  const u = await currentUser();
  return listTutorials({ category: sp.get("kategorie") ?? undefined }, u?.id ?? null, { cursor: sp.get("cursor"), take: 24 });
});
