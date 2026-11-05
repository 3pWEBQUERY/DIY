/** Wird einmal beim Serverstart ausgeführt (Next.js Instrumentation). */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  // CORS-Regel für Direkt-Uploads in den Railway Bucket sicherstellen
  const { ensureBucketCors } = await import("@/server/storage");
  await ensureBucketCors().catch(() => {});
  // Kategorie-Overrides (Admin) prozessweit laden und regelmässig auffrischen
  const { refreshCategoryRegistry } = await import("@/server/categories/settings");
  await refreshCategoryRegistry().catch(() => {});
  setInterval(() => void refreshCategoryRegistry().catch(() => {}), 60_000).unref?.();
}
