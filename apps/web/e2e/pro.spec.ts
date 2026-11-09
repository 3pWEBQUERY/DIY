import { expect, test } from "@playwright/test";
import { confirmDialog, loginAs } from "./helpers";

test.describe.serial("Creator Pro (Testmodus)", () => {
  test("Abschliessen, Schaufenster, Medienkit, Jahresstatistik, Kündigen/Zurücknehmen", async ({ browser }) => {
    const lena = await loginAs(browser, "lena");
    await lena.goto("/studio/pro");
    const main = lena.locator("main");
    for (const t of ["Schaufenster", "Medienkit", "12 Monate", "Längere Videos", "Tiefere Provision"]) await expect(main).toContainText(t);
    await lena.getByRole("button", { name: "Creator Pro starten" }).click();
    await expect(lena).toHaveURL(/abo=erfolg/);
    await expect(main).toContainText("Willkommen bei Creator Pro");

    const boxes = lena.locator('[role="checkbox"]');
    await boxes.first().click();
    await lena.getByRole("button", { name: "Speichern" }).click();
    await expect(lena.getByText("Hervorgehobene Projekte gespeichert.")).toBeVisible();
    await lena.getByRole("switch", { name: "Medienkit öffentlich" }).click();
    await expect(lena.getByRole("switch", { name: "Medienkit öffentlich" })).toHaveAttribute("aria-checked", "true");

    const anon = await browser.newPage();
    await anon.goto("/u/lena.haekelt");
    await expect(anon.locator("main")).toContainText("Schaufenster");
    const kit = await anon.goto("/u/lena.haekelt/medienkit");
    expect(kit?.status()).toBe(200);
    await expect(anon.locator("main")).toContainText("Aufrufe · 90 Tage");
    expect((await anon.goto("/u/mattia.holz/medienkit"))?.status()).toBe(404);

    await lena.goto("/studio/statistiken?zeitraum=jahr");
    await expect(lena.locator("main")).toContainText("12 Monate");
    const [dl] = await Promise.all([lena.waitForEvent("download"), lena.getByRole("link", { name: /Als CSV exportieren/ }).click()]);
    expect(dl.suggestedFilename()).toMatch(/^werkuno-statistik-lena\.haekelt-.*\.csv$/);

    await lena.goto("/studio/pro");
    await lena.getByRole("button", { name: "Abo kündigen" }).click();
    await confirmDialog(lena).getByRole("button", { name: "Kündigen" }).click();
    await expect(main).toContainText("gekündigt, aktiv bis");
    await lena.getByRole("button", { name: "Kündigung zurücknehmen" }).click();
    await expect(main).toContainText("nächste Abrechnung am");
  });
});
