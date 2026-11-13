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

test("Startseite mobil: Willkommen wie in der App, 3D-Faden, Projekte darunter", async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  const welcome = page.getByRole("region", { name: "Willkommen bei Werkuno" });
  await expect(welcome.getByRole("heading", { name: "Ein Faden." })).toBeVisible();
  await expect(welcome.getByRole("link", { name: "Konto erstellen – kostenlos" })).toBeVisible();
  await expect(welcome.getByRole("link", { name: "Anmelden" })).toBeVisible();
  // Gleiche Three.js-Szene wie in der App, als eigener Rahmen derselben Herkunft
  await expect(page.locator('iframe[src="/three/story.html"]')).toBeAttached();
  // Kapitel wechseln über die Punkte
  await welcome.getByRole("button", { name: /Kapitel 3/ }).click();
  await expect(welcome.getByRole("heading", { name: "Zum Nachbauen." })).toBeInViewport();
  // „Erst einmal umsehen“ führt zu den neuesten Projekten
  await welcome.getByRole("link", { name: "Erst einmal umsehen" }).click();
  await expect(page.getByRole("heading", { name: "Neu in der Werkstatt" })).toBeInViewport();
  const { sw, cw } = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
  expect(sw).toBeLessThanOrEqual(cw + 1);
  expect(errors).toEqual([]);
  await ctx.close();
});

test("Startseite Desktop: lädt keine 3D-Szene", async ({ page }) => {
  const three: string[] = [];
  page.on("request", (r) => r.url().includes("/three/") && three.push(r.url()));
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  expect(three).toEqual([]);
});
