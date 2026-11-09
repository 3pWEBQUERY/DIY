import { expect, test } from "@playwright/test";
import { loginAs, one, runServer, sql, userId } from "./helpers";

/**
 * Materialien: Preisvergleich (Preis je Einheit, Partnerlink-Kennzeichnung, Klickzählung),
 * eigener Bestand und dessen Wirkung auf Projekt-Materiallisten und Einkaufslisten.
 */
test.describe.serial("Materialien", () => {
  const SLUG = "merinowolle";
  let materialId = "";
  let mattiaId = "";

  test.beforeAll(async () => {
    materialId = (await one<{ id: string }>(`SELECT id FROM "Material" WHERE slug = $1`, [SLUG]))!.id;
    mattiaId = await userId("mattia");
    const admin = (await one<{ id: string }>(`SELECT id FROM "User" WHERE role = 'SUPERADMIN' LIMIT 1`))!.id;
    await sql(`DELETE FROM "MaterialOffer" WHERE "materialId" = $1`, [materialId]);
    await sql(`DELETE FROM "MaterialStock" WHERE "userId" = $1`, [mattiaId]);
    // Über die Serverfunktion anlegen (prüft Validierung + Audit): A ist je 100 g günstiger, B als Paket billiger
    runServer(`import("./src/server/materials/offers").then(async (o) => {
      await o.upsertOffer({ id: "${admin}" } as never, "${materialId}", null, { retailer: "Wollladen A", title: "Merino fein", url: "https://example.com/merino-a", price: "12.90", packAmount: 100, packLabel: "Strang 100 g" });
      await o.upsertOffer({ id: "${admin}" } as never, "${materialId}", null, { retailer: "Shop B", url: "https://example.com/merino-b?ref=werkuno", price: 4.9, packAmount: 25, packLabel: "Knäuel 25 g", isAffiliate: true });
    })`);
  });

  test("Preisvergleich: Preis je Einheit, Partnerlink gekennzeichnet, Klick gezählt", async ({ page, request }) => {
    await page.goto(`/materialien/${SLUG}`);
    const rows = page.locator("#h-kaufen").locator("xpath=ancestor::section").locator("li");
    await expect(rows).toHaveCount(2);
    await expect(rows.nth(0)).toContainText("Wollladen A");
    await expect(rows.nth(0)).toContainText("Günstigster");
    await expect(rows.nth(0)).toContainText(/12[.,]90\s*\/\s*100 g/);
    await expect(rows.nth(1)).toContainText("Partnerlink");
    await expect(rows.nth(1)).toContainText(/19[.,]60\s*\/\s*100 g/);
    const link = rows.nth(1).getByRole("link", { name: /Zum Shop/ });
    expect(await link.getAttribute("rel")).toContain("sponsored");
    const href = (await link.getAttribute("href"))!;
    expect(href).toMatch(/^\/go\//);
    await expect(page.getByText(/Partnerlink.*sind Werbung/)).toBeVisible();

    const res = await request.get(href, { maxRedirects: 0 });
    expect(res.status()).toBe(302);
    expect(res.headers().location).toBe("https://example.com/merino-b?ref=werkuno");
    const clicks = await one<{ clickCount: number }>(`SELECT "clickCount" FROM "MaterialOffer" WHERE id = $1`, [href.split("/").pop()]);
    expect(clicks!.clickCount).toBe(1);
  });

  test("Bestand: „Habe ich schon“, eigene Einträge, Projekt und Einkaufsliste", async ({ browser }) => {
    const mattia = await loginAs(browser, "mattia");
    await mattia.goto(`/materialien/${SLUG}`);
    const toggle = mattia.getByRole("button", { name: "Habe ich schon" });
    await toggle.click();
    await expect(mattia.getByRole("button", { name: "Habe ich", exact: true }).first()).toHaveAttribute("aria-pressed", "true");
    await expect.poll(async () => (await one<{ n: number }>(`SELECT count(*)::int n FROM "MaterialStock" WHERE "userId" = $1 AND "materialId" = $2`, [mattiaId, materialId]))!.n).toBe(1);

    // Eigener Eintrag ohne Datenbank-Material
    await mattia.goto("/materialien/bestand");
    await expect(mattia.getByRole("link", { name: "Merinowolle" })).toBeVisible();
    await mattia.getByRole("combobox", { name: "Material zum Bestand hinzufügen" }).fill("Restwolle blau");
    await mattia.getByRole("textbox", { name: "Menge" }).first().fill("3 Knäuel");
    await mattia.getByRole("button", { name: "Hinzufügen" }).click();
    await expect(mattia.getByText("Restwolle blau")).toBeVisible();
    await expect(mattia.getByRole("textbox", { name: "Menge von Restwolle blau" })).toHaveValue("3 Knäuel");

    // Projekt von Lena verwendet Merinowolle → bei Mattia als vorhanden markiert
    const proj = (await one<{ id: string; slug: string }>(
      `SELECT p.id, p.slug FROM "Project" p WHERE p."ownerId" = $1 AND p.state = 'PUBLISHED' AND p.visibility = 'PUBLIC' AND EXISTS (SELECT 1 FROM "ProjectMaterial" pm WHERE pm."projectId" = p.id) ORDER BY p."publishedAt" DESC LIMIT 1`,
      [await userId("lena")],
    ))!;
    const pm = (await one<{ id: string; materialId: string | null }>(`SELECT id, "materialId" FROM "ProjectMaterial" WHERE "projectId" = $1 ORDER BY position LIMIT 1`, [proj.id]))!;
    await sql(`UPDATE "ProjectMaterial" SET "materialId" = $1 WHERE id = $2`, [materialId, pm.id]);
    try {
      const total = (await one<{ n: number }>(`SELECT count(*)::int n FROM "ProjectMaterial" WHERE "projectId" = $1`, [proj.id]))!.n;
      await mattia.goto(`/u/lena.haekelt/${proj.slug}`);
      const material = mattia.locator("#material");
      await expect(material).toContainText(total === 1 ? "alles in deinem Bestand" : `1 hast du schon, ${total - 1} fehlen`);

      // Übernehmen in eine neue Einkaufsliste: Merinowolle ist schon abgehakt
      await material.getByRole("button", { name: "Auf Einkaufsliste" }).click();
      const dlg = mattia.getByRole("dialog", { name: "Materialliste übernehmen" });
      await dlg.getByText("Neue Liste anlegen").click();
      await dlg.getByRole("button", { name: "Übernehmen" }).click();
      await expect(dlg).toContainText("im Bestand – sie sind als „Habe ich“ markiert");
      const item = await one<{ haveIt: boolean }>(
        `SELECT i."haveIt" FROM "ShoppingListItem" i JOIN "ShoppingList" l ON l.id = i."listId" WHERE l."ownerId" = $1 AND i."materialId" = $2 ORDER BY i."createdAt" DESC LIMIT 1`,
        [mattiaId, materialId],
      );
      expect(item!.haveIt).toBe(true);
    } finally {
      await sql(`UPDATE "ProjectMaterial" SET "materialId" = $1 WHERE id = $2`, [pm.materialId, pm.id]);
    }
  });

  test("Materialliste verlinkt Detailseite, zeigt Preis „ab“ je Einheit", async ({ page }) => {
    await page.goto("/materialien?q=merino");
    const row = page.locator("tr", { has: page.getByRole("link", { name: "Merinowolle" }) });
    // Wie auf der Materialseite: günstigster Preis je Einheit (12.90 je 100 g), nicht der kleinste Packungspreis (4.90 für 25 g)
    await expect(row).toContainText(/12[.,]90/);
    await expect(row).toContainText("je 100 g");
    await row.getByRole("link", { name: "Merinowolle" }).click();
    await expect(page).toHaveURL(/\/materialien\/merinowolle$/);
  });
});
