import type { Instrumentation } from "next";

/** Wird einmal beim Serverstart ausgeführt (Next.js Instrumentation). */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
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
