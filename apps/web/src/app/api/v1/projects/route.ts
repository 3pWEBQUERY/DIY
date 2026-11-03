import { api } from "@/server/api";
import { currentUser } from "@/server/auth/session";
import { listProjects, type ProjectSort } from "@/server/projects/service";

/** GET /api/v1/projects?kategorie=&sort=new|popular|completed&cursor= */
export const GET = api(async (req) => {
  const sp = req.nextUrl.searchParams;
  const u = await currentUser();
  return listProjects(
    { category: sp.get("kategorie") ?? undefined, sort: (sp.get("sort") as ProjectSort) ?? "new", q: sp.get("q") ?? undefined, difficulty: sp.get("stufe") ? Number(sp.get("stufe")) : undefined },
    u?.id ?? null,
    { cursor: sp.get("cursor"), take: 24 },
  );
});
