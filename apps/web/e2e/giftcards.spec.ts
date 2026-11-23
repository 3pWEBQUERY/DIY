import { expect, test } from "@playwright/test";
import { loginAs, one, sql, userId } from "./helpers";

/**
 * Geschenkgutscheine (Testmodus): Shop bietet an → Mira kauft für Elias → Elias erhält ihn →
 * erste Bestellung ganz mit Gutschein (ohne Zahlung) → zweite Bestellung teilweise → Guthaben aufgebraucht.
 * Storno einer Bestellung bucht das Guthaben zurück.
 */
test.describe.serial("Geschenkgutscheine", () => {
  let shopId = "";
  let productId = "";
  let price = 0;
  let shipping = 0;
  let giftCardId = "";
  let code = "";
  let firstOrderId = "";

  test.beforeAll(async () => {
    const shop = await one<{ id: string }>(`SELECT id FROM "Shop" WHERE slug = 'lenas-maschen'`);
    shopId = shop!.id;
    const p = await one<{ id: string; priceMinor: number; shippingMinor: number }>(
      `SELECT p.id, p."priceMinor", p."shippingMinor" FROM "Product" p WHERE p."shopId" = $1 AND p.kind IN ('SMALL_BATCH','KIT') AND p.status IN ('ACTIVE','SOLD_OUT')
         AND NOT EXISTS (SELECT 1 FROM "ProductVariant" v WHERE v."productId" = p.id) AND p.currency = 'CHF' ORDER BY p."createdAt" LIMIT 1`,
      [shopId],
    );
    productId = p!.id;
    price = p!.priceMinor;
    shipping = p!.shippingMinor;
    await sql(`UPDATE "Product" SET status = 'ACTIVE' WHERE id = $1`, [productId]);
    await sql(`UPDATE "InventoryItem" SET "onHand" = GREATEST("onHand", 20), reserved = 0 WHERE "productId" = $1`, [productId]);
    await sql(`DELETE FROM "ShopSale" WHERE "shopId" = $1`, [shopId]).catch(() => {});
    await sql(`DELETE FROM "ShopGiftCardSettings" WHERE "shopId" = $1`, [shopId]);
    const elias = await userId("elias");
    await sql(`DELETE FROM "CartItem" WHERE "cartId" IN (SELECT id FROM "Cart" WHERE "userId" = $1)`, [elias]);
    await sql(`DELETE FROM "CartCoupon" WHERE "cartId" IN (SELECT id FROM "Cart" WHERE "userId" = $1)`, [elias]);
    await sql(`DELETE FROM "CartGiftCard" WHERE "cartId" IN (SELECT id FROM "Cart" WHERE "userId" = $1)`, [elias]);
  });

  test("Shop bietet Geschenkgutscheine an", async ({ browser }) => {
    const lena = await loginAs(browser, "lena");
    await lena.goto("/studio/geschenkgutscheine");
    await lena.getByLabel("Geschenkgutscheine verkaufen").check();
    await lena.getByRole("button", { name: "Speichern" }).click();
    await expect(lena.getByText("Gespeichert.")).toBeVisible();
    expect(await one(`SELECT enabled, "customEnabled" FROM "ShopGiftCardSettings" WHERE "shopId" = $1`, [shopId])).toMatchObject({ enabled: true, customEnabled: true });
    await lena.goto("/markt/lenas-maschen");
    // Eigener Shop: kein Kaufhinweis
    await expect(lena.getByRole("link", { name: "Gutschein verschenken" })).toHaveCount(0);
  });

  test("Mira verschenkt einen Gutschein an Elias (Testmodus: sofort zugestellt)", async ({ browser }) => {
    const mira = await loginAs(browser, "mira");
    await mira.goto("/markt/lenas-maschen");
    await mira.getByRole("link", { name: "Gutschein verschenken" }).click();
    await expect(mira).toHaveURL(/\/markt\/lenas-maschen\/geschenkgutschein$/);
    // Betrag: Preis + Versand der ersten Bestellung + 5.– Rest für die zweite
    const value = Math.ceil((price + shipping) / 100) + 5;
    await mira.getByLabel("Eigener Betrag").fill(String(value));
    await mira.getByLabel("Für", { exact: true }).fill("Elias");
    await mira.getByLabel("E-Mail der beschenkten Person").fill("elias-garten@demo.werkraum.local");
    await mira.getByLabel("Persönliche Nachricht").fill("E2E Alles Gute!");
    await mira.getByRole("button", { name: /Gutschein kaufen/ }).click();
    await expect(mira).toHaveURL(/\/geschenkgutscheine\?gekauft=/, { timeout: 20_000 });
    await expect(mira.getByText("Danke – dein Gutschein ist gekauft")).toBeVisible();
    giftCardId = new URL(mira.url()).searchParams.get("gekauft")!;
    const card = await one<{ status: string; code: string; initialMinor: number; deliveredAt: Date | null; currency: string; paidCurrency: string }>(
      `SELECT status, code, "initialMinor", "deliveredAt", currency, "paidCurrency" FROM "GiftCard" WHERE id = $1`,
      [giftCardId],
    );
    expect(card).toMatchObject({ status: "ACTIVE", initialMinor: value * 100, currency: "CHF", paidCurrency: "EUR" });
    expect(card!.deliveredAt).not.toBeNull();
    code = card!.code;
  });

  test("Elias sieht den Gutschein und bezahlt die erste Bestellung ganz damit", async ({ browser }) => {
    const elias = await loginAs(browser, "elias");
    await elias.goto("/geschenkgutscheine");
    await expect(elias.locator("main")).toContainText("E2E Alles Gute!");
    const r = await elias.request.post("/api/v1/app/cart/items", { data: { productId, quantity: 1 } });
    expect(r.status(), await r.text()).toBe(200);
    await elias.goto("/warenkorb");
    await elias.getByRole("button", { name: "Geschenkgutschein einlösen" }).click();
    await elias.getByLabel("Code des Geschenkgutscheins").fill(code.toLowerCase().replace(/(.{4})/g, "$1-"));
    await elias.getByRole("button", { name: "Einlösen", exact: true }).click();
    await expect(elias.locator("main")).toContainText("Restguthaben");

    await elias.goto("/kasse");
    if (await elias.getByLabel("Vorname").isVisible().catch(() => false)) {
      await elias.getByLabel("Vorname").fill("Elias");
      await elias.getByLabel("Nachname").fill("Frei-Tester");
      await elias.getByLabel("Strasse und Hausnummer").fill("Seestrasse 5");
      await elias.getByLabel("PLZ").fill("3600");
      await elias.getByLabel("Ort", { exact: true }).fill("Thun");
    }
    await elias.getByRole("button", { name: "Mit Geschenkgutschein bestellen" }).click();
    // Keine Zahlung nötig → direkt bestätigt
    await expect(elias).toHaveURL(/kasse\/erfolg\?bestellung=/, { timeout: 20_000 });
    firstOrderId = new URL(elias.url()).searchParams.get("bestellung")!;
    const o = await one<{ status: string; totalMinor: number; giftCardMinor: number; platformFeeMinor: number; provider: string; payment: string }>(
      `SELECT o.status, o."totalMinor", o."giftCardMinor", o."platformFeeMinor", p.provider, p.status AS payment FROM "Order" o JOIN "Payment" p ON p."orderId" = o.id WHERE o.id = $1`,
      [firstOrderId],
    );
    expect(o).toMatchObject({ status: "NEW", totalMinor: 0, giftCardMinor: price + shipping, platformFeeMinor: 0, provider: "giftcard", payment: "SUCCEEDED" });
    expect(await one(`SELECT "balanceMinor" FROM "GiftCard" WHERE id = $1`, [giftCardId])).toMatchObject({ balanceMinor: Math.ceil((price + shipping) / 100) * 100 + 500 - (price + shipping) });
  });

  test("Zweite Bestellung: Restguthaben wird angerechnet, der Rest über die Zahlung", async ({ browser }) => {
    const elias = await loginAs(browser, "elias");
    const before = (await one<{ balanceMinor: number }>(`SELECT "balanceMinor" FROM "GiftCard" WHERE id = $1`, [giftCardId]))!.balanceMinor;
    await elias.request.post("/api/v1/app/cart/items", { data: { productId, quantity: 1 } });
    const g = await elias.request.post("/api/v1/app/cart/giftcard", { data: { code } });
    expect(g.status(), await g.text()).toBe(200);
    const cart = await (await elias.request.get("/api/v1/app/cart")).json();
    const group = (cart.data ?? cart).groups.find((x: { shop: { id: string } }) => x.shop.id === shopId);
    expect(group.giftCard.appliedMinor).toBe(before);
    await elias.goto("/kasse");
    await elias.getByRole("button", { name: /Zahlungspflichtig bestellen/ }).click();
    await expect(elias).toHaveURL(/kasse\/simulation/, { timeout: 20_000 });
    await elias.getByRole("button", { name: "Zahlung simulieren – erfolgreich" }).click();
    await expect(elias).toHaveURL(/kasse\/erfolg\?bestellung=/, { timeout: 20_000 });
    const id = new URL(elias.url()).searchParams.get("bestellung")!;
    const o = await one<{ totalMinor: number; giftCardMinor: number }>(`SELECT "totalMinor", "giftCardMinor" FROM "Order" WHERE id = $1`, [id]);
    expect(o).toMatchObject({ giftCardMinor: before, totalMinor: price + shipping - before });
    expect(await one(`SELECT "balanceMinor" FROM "GiftCard" WHERE id = $1`, [giftCardId])).toMatchObject({ balanceMinor: 0 });
    // Gutschein ist nach dem Kauf nicht mehr im Warenkorb hinterlegt
    expect(await one(`SELECT count(*)::int AS n FROM "CartGiftCard" WHERE "giftCardId" = $1`, [giftCardId])).toMatchObject({ n: 0 });
  });

  test("Storno durch den Shop bucht das Guthaben zurück", async ({ browser }) => {
    const lena = await loginAs(browser, "lena");
    await lena.goto(`/studio/bestellungen/${firstOrderId}`);
    await expect(lena.locator("main")).toContainText("Geschenkgutschein");
    const r = await lena.request.post(`/api/v1/app/studio/orders/${firstOrderId}/cancel`, { data: { reason: "E2E Storno Gutschein" } });
    expect(r.status(), await r.text()).toBe(200);
    await expect
      .poll(async () => (await one<{ balanceMinor: number }>(`SELECT "balanceMinor" FROM "GiftCard" WHERE id = $1`, [giftCardId]))!.balanceMinor, { timeout: 15_000 })
      .toBe(price + shipping);
    expect(await one(`SELECT status FROM "Order" WHERE id = $1`, [firstOrderId])).toMatchObject({ status: "CANCELLED" });
  });
});
