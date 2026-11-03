import { api } from "@/server/api";
import { currentUser } from "@/server/auth/session";
import { quickSearch, search, SEARCH_TYPES, type SearchType } from "@/server/discovery/search";

/** GET /api/v1/search?q=…&types=project,tutorial&limit=… (Befehlspalette & iOS). */
export const GET = api(async (req) => {
  const sp = req.nextUrl.searchParams;
  const q = sp.get("q") ?? "";
  const u = await currentUser();
  const types = (sp.get("types")?.split(",").filter((t) => SEARCH_TYPES.includes(t as SearchType)) ?? []) as SearchType[];
  if (!types.length) return quickSearch(q, u?.id ?? null, Number(sp.get("limit") ?? 3));
  return search({ q, types, limit: Number(sp.get("limit") ?? 10), category: sp.get("kategorie") ?? undefined }, u?.id ?? null);
});
