import { currentUser } from "@/server/auth/session";
import { contentStats } from "@/server/analytics/studio";
import { parseStatsRange, statsCsv, statsCsvFilename, statsWeeks } from "@/server/analytics/stats-export";
import { isPro } from "@/server/pro/service";

export const dynamic = "force-dynamic";

/** Creator Pro: Statistik je Inhalt als CSV (Excel-tauglich: UTF-8 mit BOM, Semikolon). */
export async function GET(req: Request) {
  const user = await currentUser();
  if (!user?.profile) return new Response("Bitte melde dich an.", { status: 401 });
  if (!(await isPro(user.id))) return new Response("Der CSV-Export ist Teil von Creator Pro.", { status: 403 });
  const range = parseStatsRange(new URL(req.url).searchParams.get("zeitraum"));
  const s = await contentStats(user.id, statsWeeks(range));
  const csv = statsCsv(s, range);
  const name = statsCsvFilename(user.profile.handle);
  return new Response(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${name}"`, "Cache-Control": "no-store" } });
}
