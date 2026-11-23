import { expect, test } from "@playwright/test";
import { loginAs, one, sql, userId } from "./helpers";

/** Inhaltskalender (Creator Pro): Wochenansicht mit sieben Tagen, Einträgen nach Uhrzeit, Wechsel Woche/Monat. */
test.describe.serial("Inhaltskalender – Wochenansicht", () => {
  let mattia = "";
  let hadSub = false;
  const tag = Date.now().toString(36);

  test.beforeAll(async () => {
    mattia = await userId("mattia");
    hadSub = !!(await one(`SELECT 1 FROM "Subscription" WHERE "userId" = $1`, [mattia]));
    if (!hadSub) await sql(`INSERT INTO "Subscription" (id, "userId", interval, status, provider, "updatedAt") VALUES ($1, $2, 'comp', 'active', 'comp', now())`, [`e2e_cal_${tag}`, mattia]);
  });
  test.afterAll(async () => {
    if (!hadSub) await sql(`DELETE FROM "Subscription" WHERE id = $1`, [`e2e_cal_${tag}`]);
  });

  test("Woche mit Einträgen, Blättern und Wechsel zur Monatsansicht", async ({ browser }) => {
    // Woche eines veröffentlichten Projekts (ISO-Woche wie im Kalender, Zeitzone Zürich)
    const pr = await one<{ title: string; week: string; next: string }>(
      `SELECT title, to_char(("publishedAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Zurich', 'IYYY-"W"IW') AS week, to_char((("publishedAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Zurich') + interval '7 days', 'IYYY-"W"IW') AS next
         FROM "Project" WHERE "ownerId" = $1 AND state = 'PUBLISHED' AND "publishedAt" IS NOT NULL ORDER BY "publishedAt" DESC LIMIT 1`,
      [mattia],
    );
    const page = await loginAs(browser, "mattia", { viewport: { width: 1280, height: 900 } });
    await page.goto(`/studio/kalender?ansicht=woche&woche=${pr!.week}`);
    const grid = page.getByTestId("kalender-woche");
    await expect(grid).toBeVisible();
    await expect(grid.locator("section")).toHaveCount(7);
    await expect(page.getByRole("heading", { level: 2 }).first()).toContainText(`KW ${Number(pr!.week.slice(6))}`);
    await expect(grid).toContainText(pr!.title);
    await expect(page.getByRole("link", { name: "Woche", exact: true })).toHaveAttribute("aria-current", "page");

    // Nächste Woche
    await page.getByRole("link", { name: "Nächste Woche" }).click();
    await expect(page).toHaveURL(new RegExp(`ansicht=woche&woche=${pr!.next}$`));

    // Zurück zur Monatsansicht
    await page.getByRole("link", { name: "Monat", exact: true }).click();
    await expect(page).toHaveURL(/monat=\d{4}-\d{2}/);
    await expect(page.getByRole("link", { name: "Monat", exact: true })).toHaveAttribute("aria-current", "page");
  });
});
