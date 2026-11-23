import { expect, test } from "@playwright/test";
import { formatMoney, salePrice } from "@werkraum/shared";
import { loginAs, one, sql, userId } from "./helpers";

/**
 * Creator Pro: Shop-Aktion mit Countdown – im Studio anlegen, Produktseite zeigt Rabatt, Restzeit und
 * Aktionspreis, Warenkorb und Kasse rechnen mit dem Aktionspreis, die Bestellung hält ihn fest.
 */
test.describe.serial("Shop-Aktionen", () => {
  let mattia = "";
  let elias = "";
  let hadSub = false;
  let product: { id: string; slug: string; priceMinor: number; shopId: string } | undefined;
  const tag = Date.now().toString(36);

  test.beforeAll(async () => {
    mattia = await userId("mattia");
    elias = await userId("elias");
    hadSub = !!(await one(`SELECT 1 FROM "Subscription" WHERE "userId" = $1`, [mattia]));
    if (!hadSub) await sql(`INSERT INTO "Subscription" (id, "userId", interval, status, provider, "updatedAt") VALUES ($1, $2, 'comp', 'active', 'comp', now())`, [`e2e_sub_${tag}`, mattia]);
    product = await one(
      `SELECT p.id, p.slug, p."priceMinor", p."shopId" FROM "Product" p JOIN "Shop" s ON s.id = p."shopId" WHERE s."ownerId" = $1 AND s.currency = 'CHF' AND p.kind IN ('SMALL_BATCH', 'KIT', 'MADE_TO_ORDER') AND p.status IN ('ACTIVE', 'SOLD_OUT') AND NOT EXISTS (SELECT 1 FROM "ProductVariant" v WHERE v."productId" = p.id) ORDER BY p."createdAt" LIMIT 1`,
      [mattia],
    );
    await sql(`UPDATE "InventoryItem" SET "onHand" = GREATEST("onHand", 20), reserved = 0 WHERE "productId" = $1`, [product!.id]);
    await sql(`UPDATE "Product" SET status = 'ACTIVE' WHERE id = $1`, [product!.id]);
    await sql(`DELETE FROM "ShopSale" WHERE "shopId" = $1`, [product!.shopId]);
    await sql(`DELETE FROM "CartItem" WHERE "cartId" IN (SELECT id FROM "Cart" WHERE "userId" = $1)`, [elias]);
    await sql(`DELETE FROM "CartCoupon" WHERE "cartId" IN (SELECT id FROM "Cart" WHERE "userId" = $1)`, [elias]);
    await sql(
      `INSERT INTO "CustomerDetails" ("userId", "firstName", "lastName", line1, "postalCode", city, country, "updatedAt") VALUES ($1, 'Elias', 'Frei-Aktion', 'Seestrasse 5', '3600', 'Thun', 'CH', now()) ON CONFLICT ("userId") DO NOTHING`,
      [elias],
    );
  });

  test.afterAll(async () => {
    if (product) await sql(`DELETE FROM "ShopSale" WHERE "shopId" = $1`, [product.shopId]);
    await sql(`DELETE FROM "CartItem" WHERE "cartId" IN (SELECT id FROM "Cart" WHERE "userId" = $1)`, [elias]);
    await sql(`DELETE FROM "CustomerDetails" WHERE "userId" = $1 AND "lastName" = 'Frei-Aktion'`, [elias]);
    if (!hadSub) await sql(`DELETE FROM "Subscription" WHERE "userId" = $1 AND provider = 'comp' AND id = $2`, [mattia, `e2e_sub_${tag}`]);
  });

  test("anlegen, Countdown und Aktionspreis bis in die Bestellung", async ({ browser }) => {
    const p = product!;
    const expected = salePrice(p.priceMinor, 25);
    const money = (m: number) => formatMoney(m, "CHF").replace(/\s/g, "\\s");

    // ── Studio: Aktion für ein Produkt anlegen ──
    const shop = await loginAs(browser, "mattia");
    await shop.goto("/studio/aktionen");
    await shop.getByRole("button", { name: /Neue Aktion/ }).first().click();
    const dlg = shop.getByRole("dialog", { name: "Neue Aktion" });
    await dlg.getByLabel("Titel").fill(`E2E Aktion ${tag}`);
    await dlg.getByLabel("Rabatt in %").fill("25");
    await dlg.getByLabel(/Den ganzen Shop/).uncheck();
    const row = dlg.locator("li").filter({ has: shop.locator(`text=${(await one<{ title: string }>(`SELECT title FROM "Product" WHERE id = $1`, [p.id]))!.title}`) }).first();
    await row.getByRole("checkbox").check();
    await expect(dlg.getByText("Vorschau")).toBeVisible();
    await dlg.getByRole("button", { name: "Aktion anlegen" }).click();
    await expect(dlg).toHaveCount(0);
    await expect(shop.getByText(`E2E Aktion ${tag}`)).toBeVisible();
    await expect(shop.getByText("Läuft")).toBeVisible();

    // Überschneidung wird abgelehnt (Server)
    const overlap = await shop.request.post("/api/v1/app/studio/sales", {
      data: { title: "E2E doppelt", percent: 10, startsAt: new Date().toISOString(), endsAt: new Date(Date.now() + 86_400_000).toISOString(), productIds: [p.id] },
    });
    expect(overlap.status()).toBe(422);
    expect(await overlap.text()).toContain("Überschneidet sich");

    // ── Käufer:in: Produktseite ──
    const buyer = await loginAs(browser, "elias");
    const shopSlug = (await one<{ slug: string }>(`SELECT slug FROM "Shop" WHERE id = $1`, [p.shopId]))!.slug;
    await buyer.goto(`/markt/${shopSlug}/${p.slug}`);
    const main = buyer.locator("main");
    await expect(main.getByText("−25 %").first()).toBeVisible();
    await expect(main.getByText(new RegExp(`^noch `)).first()).toBeVisible();
    await expect(main).toContainText(new RegExp(money(expected)));
    await expect(main).toContainText(new RegExp(`statt\\s*${money(p.priceMinor)}`));
    // Shopseite: Banner
    await buyer.goto(`/markt/${shopSlug}`);
    await expect(buyer.getByRole("region", { name: "Aktion" })).toContainText(`E2E Aktion ${tag}`);

    // ── Warenkorb und App-API ──
    const r = await buyer.request.post("/api/v1/app/cart/items", { data: { productId: p.id, quantity: 2 } });
    expect(r.status(), await r.text()).toBe(200);
    const cartJson = await (await buyer.request.get("/api/v1/app/cart")).json();
    const cart = cartJson.data ?? cartJson;
    const line = cart.groups.flatMap((g: { lines: { productId: string; unitMinor: number; sale: { percent: number } | null }[] }) => g.lines).find((l: { productId: string }) => l.productId === p.id);
    expect(line.unitMinor).toBe(expected);
    expect(line.sale.percent).toBe(25);
    await buyer.goto("/warenkorb");
    await expect(buyer.locator("main")).toContainText(`E2E Aktion ${tag}`);

    // ── Kasse: Bestellung mit Aktionspreis ──
    await buyer.goto("/kasse");
    await buyer.getByRole("button", { name: /Zahlungspflichtig bestellen/ }).click();
    await expect(buyer).toHaveURL(/kasse\/simulation|bestellungen/, { timeout: 20_000 });
    const order = await one<{ unitMinor: number; quantity: number; note: string }>(
      `SELECT i."unitMinor", i.quantity, (SELECT note FROM "OrderEvent" e WHERE e."orderId" = o.id ORDER BY e."createdAt" LIMIT 1) AS note
         FROM "Order" o JOIN "OrderItem" i ON i."orderId" = o.id WHERE o."buyerId" = $1 AND i."productId" = $2 ORDER BY o."createdAt" DESC LIMIT 1`,
      [elias, p.id],
    );
    expect(order!.unitMinor).toBe(expected);
    expect(order!.note).toContain(`Aktion: „E2E Aktion ${tag}“ −25 %`);
  });

  test("ohne Creator Pro keine neuen Aktionen", async ({ browser }) => {
    test.skip(hadSub, "Konto hat ein echtes Abo – nicht entziehen");
    await sql(`DELETE FROM "Subscription" WHERE "userId" = $1 AND id = $2`, [mattia, `e2e_sub_${tag}`]);
    const shop = await loginAs(browser, "mattia");
    const res = await shop.request.post("/api/v1/app/studio/sales", {
      data: { title: "E2E ohne Pro", percent: 10, startsAt: new Date().toISOString(), endsAt: new Date(Date.now() + 86_400_000).toISOString(), productIds: [] },
    });
    expect(res.status()).toBe(403);
    expect(await res.text()).toContain("Creator Pro");
  });
});
