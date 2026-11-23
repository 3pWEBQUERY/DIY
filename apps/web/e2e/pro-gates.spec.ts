import { expect, test } from "@playwright/test";
import { loginAs, one, userId } from "./helpers";

/**
 * Ohne Creator Pro führen Pro-Funktionen zur Pro-Seite: die angeklickte Funktion steht zuerst,
 * daneben das Abo, darunter alle Funktionen.
 */
test.describe("Pro-Funktionen ohne Abo", () => {
  test.beforeAll(async () => {
    const elias = await userId("elias");
    const sub = await one(`SELECT 1 AS x FROM "Subscription" WHERE "userId" = $1 AND status <> 'canceled'`, [elias]);
    test.skip(!!sub, "Elias hat ein Abo – Sperren nicht prüfbar");
  });

  test("Newsletter in der Studio-Navigation führt zur Pro-Seite mit allen Funktionen", async ({ browser }) => {
    const page = await loginAs(browser, "elias", { viewport: { width: 1300, height: 900 } });
    await page.goto("/studio");
    await page.getByRole("navigation", { name: "Studio" }).getByRole("link", { name: /Newsletter/ }).click();
    await expect(page).toHaveURL(/\/studio\/pro\?funktion=newsletter/);
    const main = page.locator("main");
    await expect(main.getByRole("heading", { name: /„Newsletter an deine Follower“ gehört zu Creator Pro/ })).toBeVisible();
    await expect(main.getByRole("button", { name: "Creator Pro starten" })).toBeVisible();
    for (const t of ["Profil mit Schaufenster", "Medienkit", "Statistik über 12 Monate", "Längere Videos", "Tiefere Provision", "Shop-Aktionen mit Countdown", "Planen und Inhaltskalender", "Kommentare im Griff", "Eigenes Profil-Design", "Anleitungs-PDF mit deinem Branding"]) {
      await expect(main).toContainText(t);
    }
    await expect(page.locator("#funktion-newsletter")).toHaveAttribute("aria-current", "true");
  });

  test("Pro-Seiten direkt aufgerufen leiten zur Pro-Seite", async ({ browser }) => {
    const page = await loginAs(browser, "elias");
    for (const [path, key] of [
      ["/studio/newsletter/neu", "newsletter"],
      ["/studio/profil-design", "profil-design"],
      ["/studio/kalender", "kalender"],
    ] as const) {
      await page.goto(path);
      await expect(page).toHaveURL(new RegExp(`/studio/pro\\?funktion=${key}`));
    }
  });
});
