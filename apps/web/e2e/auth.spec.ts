import { expect, test } from "@playwright/test";
import { PASSWORD, USERS, loginAs } from "./helpers";

test("Anmeldung mit falschem Passwort wird abgelehnt", async ({ page }) => {
  await page.goto("/anmelden");
  await page.fill('input[name="email"]', USERS.elias.email);
  await page.fill('input[name="password"]', `${PASSWORD}x`);
  await page.click('button[type="submit"]');
  await expect(page).toHaveURL(/\/anmelden/);
  await expect(page.locator("main")).toContainText("E-Mail oder Passwort ist nicht korrekt.");
});

test("Anmelden, Werkuno Studio, Abmelden über die Seitenleiste → Startseite", async ({ browser }) => {
  const page = await loginAs(browser, "elias");
  await page.goto("/studio");
  await expect(page.locator("header").first()).toContainText(/Werkuno Studio/i);
  await page.goto("/feed");
  await page.getByRole("button", { name: "Abmelden" }).first().click();
  await expect(page).toHaveURL((u) => u.pathname === "/");
  await page.goto("/studio");
  await expect(page).toHaveURL(/\/anmelden/);
});

test("Mobil: Abmelden im Menü „Mehr“", async ({ browser }) => {
  const page = await loginAs(browser, "elias", { viewport: { width: 390, height: 844 } });
  await page.goto("/feed");
  await page.getByRole("button", { name: "Mehr", exact: true }).click();
  await expect(page.getByRole("button", { name: "Abmelden" })).toBeVisible();
});

test("Unbestätigte E-Mail-Adresse: Hinweis mit „Link erneut senden“", async ({ browser }) => {
  const { sql, userId } = await import("./helpers");
  const id = await userId("elias");
  const [{ v }] = await sql<{ v: Date | null }>(`SELECT "emailVerifiedAt" AS v FROM "User" WHERE id = $1`, [id]);
  await sql(`UPDATE "User" SET "emailVerifiedAt" = NULL WHERE id = $1`, [id]);
  try {
    const page = await loginAs(browser, "elias");
    await page.goto("/entdecken");
    await expect(page.getByText(/Bitte bestätige deine E-Mail-Adresse/)).toBeVisible();
    await page.getByRole("button", { name: "Link erneut senden" }).click();
    await expect(page.getByText(/neuen Link an/)).toBeVisible();
    await page.getByRole("button", { name: "Hinweis ausblenden" }).click();
    await page.goto("/projekte");
    await expect(page.getByText(/Bitte bestätige deine E-Mail-Adresse/)).toBeHidden();
  } finally {
    await sql(`UPDATE "User" SET "emailVerifiedAt" = $2 WHERE id = $1`, [id, v ?? new Date()]);
  }
});
