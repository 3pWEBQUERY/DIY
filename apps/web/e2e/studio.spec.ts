import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import { confirmDialog, loginAs, one } from "./helpers";

test.describe.serial("Werkuno Studio", () => {
  test("Produkt: mehrere Materialien, Höhe/Breite/Tiefe, „Unbearbeiteter Artikel“", async ({ browser }) => {
    const p = await loginAs(browser, "lena");
    await p.goto("/studio/produkte/neu");
    await p.getByLabel("Titel").fill("E2E Alter Bauernstuhl");
    await p.getByLabel("Unbearbeiteter Artikel").check();
    await expect(p.getByText(/Rohmaterial, Fundstück oder Möbel mit Potenzial/)).toBeVisible();
    await p.getByLabel("Beschreibung").fill("Aus einer Scheune im Engadin. Sitzfläche wackelt, Lack blättert – ideal zum Aufarbeiten.");
    await p.locator('input[type="file"]').first().setInputFiles(path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures/foto.jpg"));
    await p.waitForTimeout(2500);
    await p.getByLabel("Preis in CHF").fill("85.00");
    await p.getByRole("textbox", { name: "Material 1", exact: true }).fill("Arvenholz, massiv");
    await p.getByRole("textbox", { name: "Material 1", exact: true }).press("Enter");
    await p.getByRole("textbox", { name: "Material 2", exact: true }).fill("Alter Leinöl-Anstrich");
    await p.getByRole("button", { name: "Weiteres Material" }).click();
    await p.getByRole("textbox", { name: "Material 3", exact: true }).fill("Eisennägel");
    await p.getByRole("textbox", { name: "Höhe", exact: true }).fill("82");
    await p.getByRole("textbox", { name: "Breite", exact: true }).fill("42,5");
    await p.getByRole("textbox", { name: "Tiefe", exact: true }).fill("40");
    await p.getByLabel("Weitere Angaben").fill("Sitzhöhe 45 cm");
    await p.getByRole("button", { name: "Veröffentlichen" }).click();
    await expect.poll(async () => (await one(`SELECT 1 FROM "Product" WHERE title = 'E2E Alter Bauernstuhl'`)) != null, { timeout: 15_000 }).toBe(true);
    const row = await one<{ kind: string; materialList: string[]; heightMm: number; widthMm: number; depthMm: number; slug: string }>(`SELECT kind, "materialList", "heightMm", "widthMm", "depthMm", slug FROM "Product" WHERE title = 'E2E Alter Bauernstuhl' ORDER BY "createdAt" DESC LIMIT 1`);
    expect(row).toMatchObject({ kind: "RAW", materialList: ["Arvenholz, massiv", "Alter Leinöl-Anstrich", "Eisennägel"], heightMm: 820, widthMm: 425, depthMm: 400 });
    await p.goto(`/markt/lenas-maschen/${row!.slug}`);
    const sheet = p.locator("dl").first();
    await expect(sheet).toContainText("H 82 × B 42.5 × T 40 cm");
    await expect(sheet).toContainText("Eisennägel");
  });

  test("Medienbibliothek: Karten, Alt-Text unten, eigener Lösch-Dialog", async ({ browser }) => {
    const p = await loginAs(browser, "lena");
    await p.goto("/studio/medien");
    const cards = p.locator("main ul > li");
    await expect(cards.first()).toBeVisible();
    const gaps = await p.$$eval("main ul > li", (lis) => lis.filter((li) => li.querySelector("form")).slice(0, 6).map((li) => Math.round(li.getBoundingClientRect().bottom - li.querySelector("form")!.getBoundingClientRect().bottom)));
    expect(new Set(gaps).size, "Alt-Text überall gleich weit vom Kartenende").toBeLessThanOrEqual(1);
    const del = p.getByRole("button", { name: "Datei löschen" }).first();
    if (await del.count()) {
      await del.click();
      await expect(confirmDialog(p)).toContainText("Datei endgültig löschen?");
      await confirmDialog(p).getByRole("button", { name: "Abbrechen" }).click();
      await expect(confirmDialog(p)).toBeHidden();
    }
  });

  test("Statistik ohne Pro: 12 Wochen und Hinweis auf Creator Pro", async ({ browser }) => {
    const p = await loginAs(browser, "mattia");
    await p.goto("/studio/statistiken");
    await expect(p.locator("main")).toContainText("12 Wochen");
    await expect(p.getByRole("link", { name: /mit Creator Pro/ })).toBeVisible();
  });
});
