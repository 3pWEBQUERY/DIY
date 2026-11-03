import { api } from "@/server/api";
import { searchMaterials } from "@/server/materials/service";

/** Material-Autocomplete: GET /api/v1/materials?q=wolle (öffentlich, nur Katalogdaten). */
export const GET = api(async (req) => {
  const q = req.nextUrl.searchParams.get("q") ?? "";
  const take = Number(req.nextUrl.searchParams.get("limit") ?? 10) || 10;
  return searchMaterials(q, take);
});
