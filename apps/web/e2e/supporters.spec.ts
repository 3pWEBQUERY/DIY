import { expect, test } from "@playwright/test";
import { confirmDialog, loginAs, one, sql, userId } from "./helpers";

/**
 * Unterstützer-Abo im Testmodus: Creator schaltet es im Studio ein, eine exklusive Anleitung ist ohne
 * Unterstützung gesperrt (auch Werkstatt-Modus und Druckfassung), nach dem Unterstützen frei;
 * die Unterstützung lässt sich in den Einstellungen kündigen.
 */
test("Unterstützer-Abo: einschalten, exklusive Anleitung freischalten, kündigen", async ({ browser }) => {
  const lena = await userId("lena");
  const elias = await userId("elias");
  const t = await one<{ id: string; slug: string; title: string }>(
    `SELECT id, slug, title FROM "Tutorial" WHERE "authorId" = $1 AND state = 'PUBLISHED' ORDER BY "createdAt" LIMIT 1`,
    [lena],
  );
  expect(t, "Seed enthält eine Anleitung von Lena").toBeTruthy();
  await sql(`DELETE FROM "Supporter" WHERE "creatorId" = $1`, [lena]);
  await sql(`DELETE FROM "SupportPlan" WHERE "userId" = $1`, [lena]);

  try {
    // Creator: einschalten
    const creator = await loginAs(browser, "lena");
    await creator.goto("/studio/unterstuetzer");
    await creator.getByRole("checkbox", { name: "Unterstützungen annehmen" }).check();
    await creator.getByText("CHF 5.00", { exact: true }).click();
    await creator.getByLabel(/Was Unterstützer:innen bekommen/).fill("Exklusive Häkelanleitungen und Vorlagen.");
    await creator.getByRole("button", { name: "Speichern" }).click();
    await expect.poll(async () => (await one<{ enabled: boolean; price: number }>(`SELECT enabled, "priceMinor" AS price FROM "SupportPlan" WHERE "userId" = $1`, [lena])) ?? null).toEqual({ enabled: true, price: 500 });
    await sql(`UPDATE "Tutorial" SET "supportersOnly" = true WHERE id = $1`, [t!.id]);

    // Fan: gesperrt
    const fan = await loginAs(browser, "elias");
    await fan.goto(`/anleitungen/${t!.slug}`);
    await expect(fan.getByRole("heading", { name: /Unterstütze .* um diese Anleitung zu öffnen/ })).toBeVisible();
    await expect(fan.locator("#schritte")).toHaveCount(0);
    await expect(fan.getByRole("link", { name: /Werkstatt-Modus/ })).toHaveCount(0);
    await fan.goto(`/anleitungen/${t!.slug}/werkstatt`);
    await expect(fan).toHaveURL(new RegExp(`/anleitungen/${t!.slug}$`));

    // Unterstützen (Testmodus) → Dank auf dem Profil, Anleitung frei
    await fan.getByRole("button", { name: /Unterstützen · CHF 5.00\/Monat/ }).click();
    await expect(fan.getByText("Danke für deine Unterstützung!")).toBeVisible({ timeout: 20_000 });
    const row = await one<{ status: string; provider: string }>(`SELECT status, provider FROM "Supporter" WHERE "creatorId" = $1 AND "supporterId" = $2`, [lena, elias]);
    expect(row).toEqual({ status: "active", provider: "simulated" });
    await fan.goto(`/anleitungen/${t!.slug}`);
    await expect(fan.locator("#schritte")).toBeVisible();
    await expect(fan.getByRole("link", { name: /Werkstatt-Modus/ })).toBeVisible();

    // Studio zeigt die Person
    await creator.goto("/studio/unterstuetzer");
    await expect(creator.getByRole("listitem").filter({ hasText: "Elias" })).toContainText("Aktiv");

    // Kündigen in den Einstellungen
    await fan.goto("/einstellungen/unterstuetzungen");
    const item = fan.getByRole("listitem").filter({ hasText: "Lena" });
    await item.getByRole("button", { name: "Kündigen" }).click();
    await confirmDialog(fan).getByRole("button", { name: "Kündigen" }).click();
    await expect(item).toContainText("Gekündigt");
    await expect(item.getByRole("button", { name: "Fortsetzen" })).toBeVisible();
  } finally {
    await sql(`UPDATE "Tutorial" SET "supportersOnly" = false WHERE id = $1`, [t!.id]);
    await sql(`DELETE FROM "Supporter" WHERE "creatorId" = $1`, [lena]);
    await sql(`UPDATE "SupportPlan" SET enabled = false WHERE "userId" = $1`, [lena]);
  }
});
