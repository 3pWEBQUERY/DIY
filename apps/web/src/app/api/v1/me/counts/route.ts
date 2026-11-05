import { api } from "@/server/api";
import { requireUser } from "@/server/auth/session";
import { shellCounts } from "@/server/shell/counts";

export const dynamic = "force-dynamic";

/** Live-Zähler für Badges (Web-Shell pollt diesen Endpunkt, ebenso die iOS-App). */
export const GET = api(async () => {
  const u = await requireUser();
  return shellCounts(u.id);
});
