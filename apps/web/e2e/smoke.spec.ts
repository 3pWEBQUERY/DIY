import { expect, test } from "@playwright/test";
import { failOnNativeDialogs } from "./helpers";

/** Öffentliche Seiten laden ohne Fehler. */
const PAGES = ["/", "/entdecken", "/projekte", "/anleitungen", "/markt", "/communities", "/events", "/wettbewerbe", "/blogs", "/u/lena.haekelt", "/c/werkbank-holz", "/markt/lenas-maschen", "/hilfe", "/rechtliches/impressum"];

for (const path of PAGES) {
  test(`öffentlich: ${path}`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    failOnNativeDialogs(page);
    const r = await page.goto(path);
    expect(r?.status(), path).toBe(200);
    await expect(page.locator("main")).toBeVisible();
    expect(errors, "JavaScript-Fehler").toEqual([]);
  });
}

test("unbekannte Seite → 404 mit Hinweis", async ({ page }) => {
  const r = await page.goto("/gibt-es-nicht-123");
  expect(r?.status()).toBe(404);
  await expect(page.getByText("Hier ist der Faden gerissen.")).toBeVisible();
});

test("Version für die Erkennung neuer Deploys", async ({ request }) => {
  const r = await request.get("/api/v1/version");
  expect(r.status()).toBe(200);
  expect(await r.json()).toHaveProperty("release");
});
