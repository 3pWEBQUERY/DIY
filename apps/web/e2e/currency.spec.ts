import { expect, test } from "@playwright/test";
import { failOnNativeDialogs, loginAs, one, sql, userId } from "./helpers";

/**
 * Land und Währung: Pflichtangabe bei der Registrierung, einmalige Abfrage für bestehende Mitglieder,
 * Preise in Euro für Deutschland/Österreich (Warenkorb, Kasse, App-API), Gäste wählen selbst.
 */
test.describe.serial("Land und Währung", () => {
  test("Registrierung verlangt das Land; Mitglied aus Deutschland sieht Euro", async ({ browser }) => {
    const ctx = await browser.newContext();
    const p = await ctx.newPage();
    failOnNativeDialogs(p);
    const tag = Date.now().toString(36);
    await p.goto("/registrieren");
    await p.getByLabel("Anzeigename").fill(`E2E Euro ${tag}`);
    await p.getByLabel("E-Mail").fill(`e2e-euro-${tag}@example.com`);
    await p.getByLabel("Passwort").fill("Sehr-sicher-2026!");
    await p.getByLabel("Ich bin mindestens 18 Jahre alt.").check();
    await p.getByLabel(/Ich akzeptiere die/).check();
    await p.getByRole("button", { name: "Konto erstellen" }).click();
    await expect(p.getByText("Bitte wähle dein Land")).toBeVisible();

    await p.getByText("Deutschland", { exact: true }).click();
    await expect(p.getByRole("radio", { name: /Deutschland/ })).toBeChecked();
    await Promise.all([p.waitForURL(/\/willkommen/, { timeout: 30_000 }), p.getByRole("button", { name: "Konto erstellen" }).click()]);
    const row = await one<{ country: string; confirmed: Date | null }>(`SELECT country, "countryConfirmedAt" AS confirmed FROM "UserProfile" WHERE "displayName" = $1`, [`E2E Euro ${tag}`]);
    expect(row).toMatchObject({ country: "DE" });
    expect(row!.confirmed).not.toBeNull();

    // Bereits bestätigt: kein Dialog, Preise in Euro
    await p.goto("/markt");
    await expect(p.getByRole("dialog", { name: "Woher kommst du?" })).toHaveCount(0);
    await expect(p.getByText("Preise in Euro")).toBeVisible();
    await expect(p.locator("main")).toContainText("€");
    await ctx.close();
  });

  test("Bestehendes Mitglied wird einmal gefragt; danach Warenkorb und Kasse in Euro", async ({ browser }) => {
    const elias = await userId("elias");
    await sql(`UPDATE "UserProfile" SET "countryConfirmedAt" = NULL, country = 'CH' WHERE "userId" = $1`, [elias]);
    try {
      const page = await loginAs(browser, "elias");
      const dlg = page.getByRole("dialog", { name: "Woher kommst du?" });
      await expect(dlg).toBeVisible();
      // Vorausgefüllt aus dem Profil, nicht mit Esc wegzuklicken
      await expect(dlg.getByRole("radio", { name: /Schweiz/ })).toBeChecked();
      await page.keyboard.press("Escape");
      await expect(dlg).toBeVisible();
      await dlg.getByText("Österreich", { exact: true }).click();
      await dlg.getByRole("button", { name: "Weiter mit Preisen in Euro" }).click();
      await expect(dlg).toHaveCount(0);
      await expect(page.getByText(/du siehst Preise jetzt in Euro/)).toBeVisible();
      expect(await one(`SELECT country FROM "UserProfile" WHERE "userId" = $1`, [elias])).toMatchObject({ country: "AT" });

      // Ein CHF-Produkt in den Warenkorb: umgerechnet, mit Kurs-Hinweis
      const product = await one<{ id: string; priceMinor: number }>(
        `SELECT p.id, p."priceMinor" FROM "Product" p JOIN "Shop" s ON s.id = p."shopId" WHERE s.slug = 'lenas-maschen' AND s.currency = 'CHF' AND p.kind IN ('SMALL_BATCH', 'KIT') AND NOT EXISTS (SELECT 1 FROM "ProductVariant" v WHERE v."productId" = p.id) ORDER BY p."createdAt" LIMIT 1`,
      );
      await sql(`UPDATE "InventoryItem" SET "onHand" = GREATEST("onHand", 20), reserved = 0 WHERE "productId" = $1`, [product!.id]);
      await sql(`UPDATE "Product" SET status = 'ACTIVE' WHERE id = $1`, [product!.id]);
      await sql(`DELETE FROM "CartItem" WHERE "cartId" IN (SELECT id FROM "Cart" WHERE "userId" = $1)`, [elias]);
      const r = await page.request.post("/api/v1/app/cart/items", { data: { productId: product!.id, quantity: 1 } });
      expect(r.status(), await r.text()).toBe(200);

      await page.goto("/warenkorb");
      const main = page.locator("main");
      await expect(main).toContainText("€");
      await expect(main).not.toContainText(/CHF\s\d/);
      await expect(main.getByText(/Preise aus CHF umgerechnet zum Referenzkurs der EZB/)).toBeVisible();

      // App-API: Warenkorb und Bootstrap in Euro
      const cart = await (await page.request.get("/api/v1/app/cart")).json();
      expect(cart.data?.currency ?? cart.currency).toBe("EUR");
      const boot = await (await page.request.get("/api/v1/app/bootstrap")).json();
      const b = boot.data ?? boot;
      expect(b.me.currency).toBe("EUR");
      expect(b.me.countryPrompt).toBeNull();
      expect(b.price.currency).toBe("EUR");

      await page.goto("/kasse");
      await expect(page.getByText("Endpreis in Euro.")).toBeVisible();
      await expect(page.getByRole("button", { name: /Zahlungspflichtig bestellen · €/ })).toBeVisible();
    } finally {
      await sql(`UPDATE "UserProfile" SET country = 'CH', "countryConfirmedAt" = now() WHERE "userId" = $1`, [elias]);
      await sql(`DELETE FROM "CartItem" WHERE "cartId" IN (SELECT id FROM "Cart" WHERE "userId" = $1)`, [elias]);
    }
  });

  test("Gäste wählen die Währung selbst", async ({ browser }) => {
    const ctx = await browser.newContext({ locale: "de-CH" });
    const p = await ctx.newPage();
    await p.goto("/markt");
    const group = p.getByRole("group", { name: "Währung der Preise" });
    await expect(group.getByRole("button", { name: "CHF" })).toHaveAttribute("aria-pressed", "true");
    await group.getByRole("button", { name: "€ EUR" }).click();
    await expect(group.getByRole("button", { name: "€ EUR" })).toHaveAttribute("aria-pressed", "true");
    await expect(p.locator("main")).toContainText("€");
    await ctx.close();
  });
});
