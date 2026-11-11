import { api } from "@/server/api";
import { getSession } from "@/server/auth/session";
import { setOffline, touchPresence } from "@/server/presence";

export const dynamic = "force-dynamic";

/**
 * Herzschlag für den Online-Status. `?state=offline` (bzw. Body `offline`) beendet ihn sofort – der Browser
 * sendet das per sendBeacon beim Verbergen/Schliessen des Tabs, die App beim Wechsel in den Hintergrund.
 */
export const POST = api(async (req: Request) => {
  const s = await getSession();
  if (!s) return { online: false };
  const offline = new URL(req.url).searchParams.get("state") === "offline" || (await req.text().catch(() => "")).trim() === "offline";
  if (offline) await setOffline(s.user.id);
  else await touchPresence(s.user.id);
  return { online: !offline };
});
