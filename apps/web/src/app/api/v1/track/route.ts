import { trackEventSchema } from "@werkraum/shared";
import { api, body } from "@/server/api";
import { currentUser } from "@/server/auth/session";
import { recordView } from "@/server/analytics/service";

/**
 * Client-Tracking für Aufrufe (Web & iOS). Rate-limitiert, dedupliziert je
 * Betrachter + Ziel für 30 Minuten, ohne PII. Antwortet immer mit 202-Semantik.
 */
export const POST = api(async (req) => {
  const input = trackEventSchema.parse(await body(req));
  const user = await currentUser();
  const r = await recordView({ viewerId: user?.id ?? null, targetType: input.targetType, targetId: input.targetId, ref: input.ref });
  return { counted: r.counted };
});
