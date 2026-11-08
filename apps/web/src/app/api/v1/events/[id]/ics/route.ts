import { currentUser } from "@/server/auth/session";
import { env } from "@/server/env";
import { eventIcs, getEvent } from "@/server/communities/events";

export const dynamic = "force-dynamic";

/** GET /api/v1/events/:id/ics – Kalenderdatei (nur für Personen, die das Event sehen dürfen). */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const e = await getEvent(id, await currentUser());
  if (!e) return new Response("Nicht gefunden", { status: 404 });
  const name = e.title.toLowerCase().replace(/[^a-z0-9äöü]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "event";
  return new Response(eventIcs(e, env().APP_URL), {
    headers: { "Content-Type": "text/calendar; charset=utf-8", "Content-Disposition": `attachment; filename="${name}.ics"`, "Cache-Control": "private, no-store" },
  });
}
