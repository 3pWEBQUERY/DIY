import { expect, test } from "@playwright/test";
import { formatMoney, salePrice } from "@werkraum/shared";
import { one, runServer, sql, userId } from "./helpers";

/**
 * Merkliste mit Preisalarm (Aktion begonnen, wieder erhältlich, Preis gesenkt) und Erinnerung an den
 * Warenkorb – Worker-Läufe direkt ausgeführt, jede Nachricht genau einmal.
 */
test.describe.serial("Preisalarm und Warenkorb-Erinnerung", () => {
  let elias = "";
  let mira = "";
  let product: { id: string; title: string; priceMinor: number; shopId: string } | undefined;
  const tag = Date.now().toString(36);
  const countAlerts = async (kind: string) =>
    Number((await one<{ n: string }>(`SELECT count(*)::text AS n FROM "Notification" WHERE "recipientId" = $1 AND "targetId" = $2 AND data->>'kind' = $3`, [elias, product!.id, kind]))!.n);

  test.beforeAll(async () => {
    elias = await userId("elias");
    mira = await userId("mira");
    const lena = await userId("lena");
    product = await one(
      `SELECT p.id, p.title, p."priceMinor", p."shopId" FROM "Product" p JOIN "Shop" s ON s.id = p."shopId" WHERE s."ownerId" = $1 AND s.currency = 'CHF' AND p.kind IN ('SMALL_BATCH', 'KIT') AND NOT EXISTS (SELECT 1 FROM "ProductVariant" v WHERE v."productId" = p.id) ORDER BY p."createdAt" DESC LIMIT 1`,
      [lena],
    );
    await sql(`UPDATE "InventoryItem" SET "onHand" = GREATEST("onHand", 20), reserved = 0 WHERE "productId" = $1`, [product!.id]);
    await sql(`UPDATE "Product" SET status = 'ACTIVE' WHERE id = $1`, [product!.id]);
    await sql(`DELETE FROM "ShopSale" WHERE "shopId" = $1 AND title LIKE 'E2E Preisalarm%'`, [product!.shopId]);
    await sql(`DELETE FROM "PriceAlertSent" WHERE "productId" = $1`, [product!.id]);
    await sql(`DELETE FROM "RestockRequest" WHERE "productId" = $1 AND "userId" = $2`, [product!.id, elias]);
    await sql(`DELETE FROM "Notification" WHERE "recipientId" IN ($1, $2) AND data->>'kind' IN ('price_sale', 'price_drop', 'price_back', 'cart')`, [elias, mira]);
    await sql(`INSERT INTO "Bookmark" ("userId", "targetType", "targetId") VALUES ($1, 'PRODUCT', $2) ON CONFLICT DO NOTHING`, [elias, product!.id]);
    await sql(`UPDATE "UserPreference" SET "notificationPrefs" = "notificationPrefs" - 'priceAlerts' - 'cartReminders' WHERE "userId" IN ($1, $2)`, [elias, mira]);
  });

  test.afterAll(async () => {
    if (!product) return;
    await sql(`DELETE FROM "ShopSale" WHERE "shopId" = $1 AND title LIKE 'E2E Preisalarm%'`, [product.shopId]);
    await sql(`DELETE FROM "Bookmark" WHERE "userId" = $1 AND "targetType" = 'PRODUCT' AND "targetId" = $2`, [elias, product.id]);
    await sql(`UPDATE "Product" SET status = 'ACTIVE' WHERE id = $1`, [product.id]);
    await sql(`DELETE FROM "CartItem" WHERE "cartId" IN (SELECT id FROM "Cart" WHERE "userId" = $1)`, [mira]);
  });

  test("Aktion beginnt: gemerktes Produkt meldet sich einmal, mit Aktionspreis", async () => {
    const p = product!;
    await sql(
      `INSERT INTO "ShopSale" (id, "shopId", title, percent, "startsAt", "endsAt", "productIds", active, "updatedAt") VALUES ($1, $2, $3, 20, now() - interval '1 minute', now() + interval '2 days', ARRAY[$4]::text[], true, now())`,
      [`e2e_sale_${tag}`, p.shopId, `E2E Preisalarm ${tag}`, p.id],
    );
    runServer(`import("./src/server/commerce/price-alerts").then((m) => m.runSaleAlerts())`);
    const n = await one<{ message: string; href: string }>(`SELECT data->>'message' AS message, data->>'href' AS href FROM "Notification" WHERE "recipientId" = $1 AND "targetId" = $2 AND data->>'kind' = 'price_sale'`, [elias, p.id]);
    expect(n?.message).toContain("ist jetzt in Aktion");
    expect(n?.message.replace(/\s/g, " ")).toContain(formatMoney(salePrice(p.priceMinor, 20), "CHF").replace(/\s/g, " "));
    expect(n?.href).toMatch(/^\/markt\//);
    // Zweiter Lauf: nichts Neues
    runServer(`import("./src/server/commerce/price-alerts").then((m) => m.runSaleAlerts())`);
    expect(await countAlerts("price_sale")).toBe(1);
    await sql(`DELETE FROM "ShopSale" WHERE id = $1`, [`e2e_sale_${tag}`]);
  });

  test("ausverkauft → wieder erhältlich: einmal Bescheid", async () => {
    const p = product!;
    await sql(`UPDATE "Product" SET status = 'SOLD_OUT' WHERE id = $1`, [p.id]);
    runServer(`import("./src/server/commerce/price-alerts").then((m) => m.runRestockAlerts())`);
    expect(await one(`SELECT 1 FROM "PriceAlertSent" WHERE "userId" = $1 AND "productId" = $2 AND kind = 'ARMED'`, [elias, p.id])).toBeTruthy();
    expect(await countAlerts("price_back")).toBe(0);
    await sql(`UPDATE "Product" SET status = 'ACTIVE' WHERE id = $1`, [p.id]);
    runServer(`import("./src/server/commerce/price-alerts").then((m) => m.runRestockAlerts())`);
    expect(await countAlerts("price_back")).toBe(1);
    runServer(`import("./src/server/commerce/price-alerts").then((m) => m.runRestockAlerts())`);
    expect(await countAlerts("price_back")).toBe(1);
  });

  test("Preis gesenkt: ab 5 % einmal, ausgeschaltet nie", async () => {
    const p = product!;
    const lower = Math.round(p.priceMinor * 0.8);
    runServer(`import("./src/server/commerce/price-alerts").then((m) => m.notifyPriceDrop("${p.id}", ${p.priceMinor}, ${Math.round(p.priceMinor * 0.98)}))`);
    expect(await countAlerts("price_drop")).toBe(0);
    runServer(`import("./src/server/commerce/price-alerts").then((m) => m.notifyPriceDrop("${p.id}", ${p.priceMinor}, ${lower}))`);
    runServer(`import("./src/server/commerce/price-alerts").then((m) => m.notifyPriceDrop("${p.id}", ${p.priceMinor}, ${lower}))`);
    expect(await countAlerts("price_drop")).toBe(1);
    // Preisalarm ausgeschaltet → keine weitere Meldung
    await sql(`UPDATE "UserPreference" SET "notificationPrefs" = COALESCE("notificationPrefs", '{}'::jsonb) || '{"priceAlerts": false}'::jsonb WHERE "userId" = $1`, [elias]);
    runServer(`import("./src/server/commerce/price-alerts").then((m) => m.notifyPriceDrop("${p.id}", ${p.priceMinor}, ${Math.round(p.priceMinor * 0.7)}))`);
    expect(await countAlerts("price_drop")).toBe(1);
    await sql(`UPDATE "UserPreference" SET "notificationPrefs" = "notificationPrefs" - 'priceAlerts' WHERE "userId" = $1`, [elias]);
  });

  test("Warenkorb-Erinnerung nach einem Tag, genau einmal", async () => {
    const p = product!;
    await sql(`INSERT INTO "Cart" (id, "userId", "updatedAt") VALUES ($1, $2, now()) ON CONFLICT ("userId") DO NOTHING`, [`e2e_cart_${tag}`, mira]);
    const cart = (await one<{ id: string }>(`SELECT id FROM "Cart" WHERE "userId" = $1`, [mira]))!;
    await sql(`DELETE FROM "CartItem" WHERE "cartId" = $1`, [cart.id]);
    await sql(`INSERT INTO "CartItem" (id, "cartId", "productId", quantity) VALUES ($1, $2, $3, 1)`, [`e2e_ci_${tag}`, cart.id, p.id]);
    // Zu früh: keine Erinnerung
    await sql(`UPDATE "Cart" SET "updatedAt" = now() - interval '2 hours', "remindedAt" = NULL WHERE id = $1`, [cart.id]);
    runServer(`import("./src/server/commerce/cart-reminders").then((m) => m.sendCartReminders())`);
    const count = async () => Number((await one<{ n: string }>(`SELECT count(*)::text AS n FROM "Notification" WHERE "recipientId" = $1 AND data->>'kind' = 'cart'`, [mira]))!.n);
    expect(await count()).toBe(0);
    // Einen Tag liegen gelassen (und seither nicht bestellt)
    const hasNewerOrder = await one(`SELECT 1 FROM "Order" WHERE "buyerId" = $1 AND "createdAt" > now() - interval '26 hours'`, [mira]);
    test.skip(!!hasNewerOrder, "Mira hat in diesem Lauf bestellt");
    await sql(`UPDATE "Cart" SET "updatedAt" = now() - interval '26 hours', "remindedAt" = NULL WHERE id = $1`, [cart.id]);
    runServer(`import("./src/server/commerce/cart-reminders").then((m) => m.sendCartReminders())`);
    expect(await count()).toBe(1);
    const n = await one<{ message: string; href: string }>(`SELECT data->>'message' AS message, data->>'href' AS href FROM "Notification" WHERE "recipientId" = $1 AND data->>'kind' = 'cart'`, [mira]);
    expect(n?.message).toContain("Dein Warenkorb wartet");
    expect(n?.href).toBe("/warenkorb");
    expect((await one<{ r: string | null }>(`SELECT "remindedAt"::text AS r FROM "Cart" WHERE id = $1`, [cart.id]))?.r).toBeTruthy();
    // Zweiter Lauf, auch nach erneutem Zurücksetzen: höchstens eine pro Woche
    runServer(`import("./src/server/commerce/cart-reminders").then((m) => m.sendCartReminders())`);
    await sql(`UPDATE "Cart" SET "remindedAt" = NULL WHERE id = $1`, [cart.id]);
    runServer(`import("./src/server/commerce/cart-reminders").then((m) => m.sendCartReminders())`);
    expect(await count()).toBe(1);
  });
});
