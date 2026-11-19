import { expect, test } from "@playwright/test";
import { one } from "./helpers";

/**
 * Arbeiten an der Werkbank: Druckfassung einer Anleitung, Werkstatt-Modus (Schritt für Schritt,
 * Fortschritt bleibt beim Neuladen) und der Zuschnittrechner (Liste einfügen, Ergebnis, Teilen-Link).
 */

async function tutorialSlug() {
  const t = await one<{ slug: string; title: string }>(
    `SELECT t.slug, t.title FROM "Tutorial" t WHERE t.state = 'PUBLISHED' AND t."currentVersionId" IS NOT NULL
       AND (SELECT count(*) FROM "TutorialStep" s WHERE s."versionId" = t."currentVersionId") >= 3 ORDER BY t."createdAt" LIMIT 1`,
  );
  expect(t, "Seed enthält eine veröffentlichte Anleitung mit Schritten").toBeTruthy();
  return t!;
}

test("Druckfassung: Titel, QR-Code, alle Schritte, ohne App-Navigation", async ({ page }) => {
  const t = await tutorialSlug();
  await page.goto(`/anleitungen/${t.slug}`);
  await page.getByRole("link", { name: /Drucken \/ PDF/ }).click();
  await expect(page).toHaveURL(new RegExp(`/anleitungen/${t.slug}/drucken$`));
  await expect(page.getByRole("heading", { level: 1, name: t.title })).toBeVisible();
  await expect(page.getByRole("img", { name: /QR-Code zur Online-Fassung/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Schritt für Schritt" })).toBeVisible();
  // Keine Seitenleiste der App
  await expect(page.getByRole("navigation", { name: "Navigation" })).toHaveCount(0);
  // Ohne Bilder umschalten
  await page.getByRole("link", { name: /Ohne Bilder/ }).click();
  await expect(page).toHaveURL(/\?bilder=0$/);
  await expect(page.getByRole("button", { name: /Drucken oder als PDF sichern/ })).toBeVisible();
});

test("Werkstatt-Modus: Schritt für Schritt mit Tastatur, Stelle bleibt nach dem Neuladen", async ({ page }) => {
  const t = await tutorialSlug();
  await page.goto(`/anleitungen/${t.slug}/werkstatt`);
  // Erste Seite: Bereitlegen (falls Material) oder Schritt 1
  const first = page.getByRole("heading", { level: 1 });
  await expect(first).toBeVisible();
  if ((await first.innerText()).includes("bereitlegen")) {
    await page.getByRole("checkbox").first().click();
    await expect(page.getByRole("checkbox").first()).toHaveAttribute("aria-checked", "true");
    await page.getByRole("button", { name: /Los geht/ }).click();
  }
  await expect(page.getByRole("main").getByText(/^Schritt 1 von \d+/)).toBeVisible();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("main").getByText(/^Schritt 2 von \d+/)).toBeVisible();
  await expect(page.getByText(/01 \/ \d+ erledigt/)).toBeVisible();
  await page.reload();
  await expect(page.getByRole("main").getByText(/^Schritt 2 von \d+/)).toBeVisible();
  await page.keyboard.press("ArrowLeft");
  await expect(page.getByRole("main").getByText(/^Schritt 1 von \d+.*erledigt$/)).toBeVisible();
  // Timer starten und stoppen
  await page.getByRole("button", { name: "Timer", exact: true }).click();
  await page.getByRole("button", { name: "5 min", exact: true }).click();
  await expect(page.getByRole("button", { name: /Timer 5 min: noch 0[45]:/ })).toBeVisible();
  // Beenden führt zur Anleitung
  await page.getByRole("link", { name: "Werkstatt-Modus beenden" }).click();
  await expect(page).toHaveURL(new RegExp(`/anleitungen/${t.slug}$`));
});

test("Zuschnittrechner: Liste einfügen, Platten und Plan, Teilen-Link stellt die Liste wieder her", async ({ page, browser }) => {
  await page.goto("/werkzeuge/zuschnitt");
  await page.getByRole("button", { name: "Liste einfügen" }).click();
  await page.locator("#zs-paste").fill("Seite; 2140; 600; 2\nBoden; 1962; 600; 1\nFront; 397; 160; 4\nZu gross; 3000; 700; 1");
  await page.getByRole("button", { name: "Übernehmen" }).click();
  await expect(page.getByRole("textbox", { name: "Bezeichnung Teil 1" })).toHaveValue("Seite");
  await expect(page.getByText(/^Platte 1 von 1$/)).toBeVisible();
  await expect(page.getByRole("img", { name: "Schnittplan Platte 1" })).toBeVisible();
  await expect(page.getByRole("alert").filter({ hasText: "Passt auf keine Platte" })).toContainText("Zu gross (3000 × 700)");

  // Preis → Kosten
  await page.getByRole("spinbutton", { name: "Preis je Platte" }).fill("190");
  await expect(page.getByText(/Material ca\. CHF 190\.00/)).toBeVisible();

  // Gespeichert im Browser
  await page.reload();
  await expect(page.getByRole("textbox", { name: "Bezeichnung Teil 2" })).toHaveValue("Boden");

  // Teilen-Link in einem frischen Browser
  const ctx = await browser.newContext();
  await ctx.grantPermissions(["clipboard-read", "clipboard-write"]);
  const shareFrom = await ctx.newPage();
  await shareFrom.goto("/werkzeuge/zuschnitt");
  await shareFrom.getByRole("button", { name: "Beispiel" }).click();
  await shareFrom.getByRole("button", { name: "Link teilen" }).click();
  const link = await shareFrom.evaluate(() => navigator.clipboard.readText());
  expect(link).toMatch(/\/werkzeuge\/zuschnitt#d=/);
  const other = await browser.newContext();
  const p2 = await other.newPage();
  await p2.goto(link);
  await expect(p2.getByRole("textbox", { name: "Bezeichnung Teil 1" })).toHaveValue("Seite");
  await expect(p2).toHaveURL(/\/werkzeuge\/zuschnitt$/);
  await ctx.close();
  await other.close();
});
