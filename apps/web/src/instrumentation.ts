import type { Instrumentation } from "next";

/** Wird einmal beim Serverstart ausgeführt (Next.js Instrumentation). */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  // Konfiguration beim Start prüfen (Next ruft register() während `next build` nicht auf): ungültige
  // Pflichtvariablen lassen den Start scheitern – der Healthcheck schlägt fehl und die alte Version bleibt
  // aktiv, statt dass erst einzelne Anfragen scheitern. Warnungen (configWarnings) loggt env() einmalig.
  const { env } = await import("@/server/env");
  try {
    env();
  } catch (e) {
    console.error(JSON.stringify({ level: "error", svc: "web", msg: "invalid_config", err: e instanceof Error ? e.message : String(e) }));
    throw e;
  }
  // Fehlerüberwachung: unerwartete Fehler aus Server Actions und API-Routen erfassen
  const [{ setUnhandledReporter }, { captureError, requestContext }] = await Promise.all([import("@/server/errors"), import("@/server/monitoring")]);
  setUnhandledReporter((e, req) => void requestContext().then((ctx) => captureError(e, { ...ctx, ...req, source: "SERVER" })));
  // CORS-Regel für Direkt-Uploads in den Railway Bucket sicherstellen
  const { ensureBucketCors } = await import("@/server/storage");
  await ensureBucketCors().catch(() => {});
  // Kategorie-Overrides (Admin) prozessweit laden und regelmässig auffrischen
  const { refreshCategoryRegistry } = await import("@/server/categories/settings");
  await refreshCategoryRegistry().catch(() => {});
  setInterval(() => void refreshCategoryRegistry().catch(() => {}), 60_000).unref?.();
}

/** Fehler beim Rendern von Seiten, Layouts und Route-Handlern (Server Components). */
export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { captureError, userIdFromCookieHeader } = await import("@/server/monitoring");
  await captureError(err, {
    userId: await userIdFromCookieHeader(request.headers.cookie),
    source: "SERVER",
    path: request.path,
    method: request.method,
    userAgent: (request.headers["user-agent"] as string | undefined) ?? null,
    digest: (err as { digest?: string }).digest ?? null,
    meta: { routerKind: context.routerKind, routePath: context.routePath, routeType: context.routeType, renderSource: (context as { renderSource?: string }).renderSource },
  });
};
