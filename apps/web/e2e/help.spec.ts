import { expect, test } from "@playwright/test";

/** Hilfe-Center: Suche im Browser, Bereichsseiten mit Ankern, alte Anker leiten weiter. */
test.describe("Hilfe-Center", () => {
  test("Suche findet Antworten über alle Bereiche und führt zur Antwort", async ({ page }) => {
    await page.goto("/hilfe");
    await expect(page.getByRole("heading", { name: "Wie können wir helfen?" })).toBeVisible();
    // Alle Bereiche als Kacheln
    await expect(page.getByRole("link", { name: /Verkaufen im Studio/ })).toBeVisible();
    await expect(page.getByRole("link", { name: /Nachrichten & Benachrichtigungen/ })).toBeVisible();

    await page.getByRole("searchbox", { name: "Hilfe durchsuchen" }).fill("Gutschein");
    await expect(page.getByRole("status").filter({ hasText: /gefunden/ })).toContainText(/Antworten? gefunden/);
    await expect(page.getByRole("link", { name: /Wie erstelle ich Gutscheine\?/ })).toBeVisible();
    await expect(page.getByRole("link", { name: /Wie löse ich einen Gutschein ein\?/ })).toBeVisible();
    await expect(page).toHaveURL(/\?q=Gutschein/);

    await page.getByRole("link", { name: /Wie erstelle ich Gutscheine\?/ }).click();
    await expect(page).toHaveURL(/\/hilfe\/verkaufen#gutscheine-erstellen$/);
    const item = page.locator("details#gutscheine-erstellen");
    await expect(item).toHaveAttribute("open", "");
    await expect(item.getByRole("link", { name: "Gutscheine & Sets" })).toHaveAttribute("href", "/studio/rabatte");

    await page.goto("/hilfe?q=xyzzy");
    await expect(page.getByText("Dazu haben wir noch keine Antwort.")).toBeVisible();
  });

  test("Bereichsseite: Fragen aufklappen, Werte aus den Einstellungen, Navigation", async ({ page }) => {
    await page.goto("/hilfe/kaufen");
    await expect(page.getByRole("heading", { level: 1, name: "Kaufen" })).toBeVisible();
    const q = page.getByText("In welcher Währung bezahle ich?");
    await q.click();
    await expect(page.locator("details#waehrung")).toContainText("Europäischen Zentralbank");
    await page.getByText("Wie läuft die Bezahlung ab?").click();
    // Platzhalter ersetzt (Reservierung in Minuten aus den Systemeinstellungen)
    await expect(page.locator("details#kasse")).toContainText(/\d+ Minuten für dich reserviert/);
    await expect(page.locator("details#kasse")).not.toContainText("{");
    await expect(page.getByRole("navigation", { name: "Alle Bereiche" }).getByRole("link", { name: "Kaufen", exact: true })).toHaveAttribute("aria-current", "page");
  });

  test("Alte Anker und unbekannte Bereiche", async ({ page }) => {
    await page.goto("/hilfe#verkaufen");
    await expect(page).toHaveURL(/\/hilfe\/verkaufen$/);
    const res = await page.goto("/hilfe/gibt-es-nicht");
    expect(res?.status()).toBe(404);
  });
});
