import { api } from "@/server/api";
import { currentUser } from "@/server/auth/session";
import { quickSearch, search, SEARCH_TYPES, type SearchType } from "@/server/discovery/search";
import { clampInt } from "@/server/mobile/params";

/** GET /api/v1/search?q=…&types=project,tutorial&limit=… (Befehlspalette & iOS). */
export const GET = api(async (req) => {
  const sp = req.nextUrl.searchParams;
  const q = sp.get("q") ?? "";
  const u = await currentUser();
  const types = (sp.get("types")?.split(",").filter((t) => SEARCH_TYPES.includes(t as SearchType)) ?? []) as SearchType[];
  // Wie die Mobile-API klemmen: NaN oder negative Werte landeten sonst im SQL-LIMIT (500)
  if (!types.length) return quickSearch(q, u?.id ?? null, clampInt(sp.get("limit"), { def: 3, min: 1, max: 10 }));
  return search({ q, types, limit: clampInt(sp.get("limit"), { def: 10, min: 1, max: 40 }), category: sp.get("kategorie") ?? undefined }, u?.id ?? null);
});
