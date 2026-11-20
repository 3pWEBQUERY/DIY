import { expect, test } from "@playwright/test";

/** Installierbare Web-App: Manifest (Icons, Kurzbefehle), Service Worker und Offline-Seite. */
test("Web-App: Manifest, Service Worker und Offline-Seite ohne Verbindung", async ({ browser }) => {
  const ctx = await browser.newContext({ serviceWorkers: "allow" });
  const page = await ctx.newPage();
  const res = await page.request.get("/manifest.webmanifest");
  expect(res.ok()).toBe(true);
  const m = await res.json();
  expect(m.display).toBe("standalone");
  expect(m.icons.some((i: { purpose?: string; sizes: string }) => i.purpose === "maskable" && i.sizes === "512x512")).toBe(true);
  expect(m.shortcuts.map((s: { url: string }) => s.url)).toEqual(expect.arrayContaining(["/entdecken", "/markt"]));
  for (const i of m.icons) expect((await page.request.get(i.src)).ok(), i.src).toBe(true);

  await page.goto("/entdecken");
  // Service Worker ist aktiv und kontrolliert die Seite
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) await new Promise((r) => navigator.serviceWorker.addEventListener("controllerchange", r, { once: true }));
  });
  await ctx.setOffline(true);
  await page.goto("/markt").catch(() => {});
  await expect(page.getByRole("heading", { name: "Du bist gerade offline" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Erneut versuchen" })).toBeVisible();
  // Wieder online → die Offline-Seite lädt die gewünschte Seite von selbst neu
  await ctx.setOffline(false);
  await expect(page).toHaveURL(/\/markt$/);
  await expect(page.getByRole("heading", { name: "Du bist gerade offline" })).toHaveCount(0);
  await ctx.close();
});
