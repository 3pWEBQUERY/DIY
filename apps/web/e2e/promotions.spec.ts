import { expect, test, type Page } from "@playwright/test";
import { loginAs, one, sql, userId } from "./helpers";

/**
 * Gutscheine und Sets im Testmodus: Shop legt im Studio einen Code und ein Materialset an,
 * Käufer löst den Code im Warenkorb ein, bezahlt den reduzierten Betrag, der Code ist danach
 * für dieses Konto verbraucht. Das Set erscheint bei der Anleitung und kommt komplett in den Warenkorb.
 */

const CODE = `E2E${Date.now().toString(36).toUpperCase().slice(-6)}`;
const SHOP = "lenas-maschen";

async function lenaProduct(title: string) {
  const p = await one<{ id: string; priceMinor: number }>(`SELECT p.id, p."priceMinor" FROM "Product" p JOIN "Shop" s ON s.id = p."shopId" WHERE s.slug = $1 AND p.title = $2`, [SHOP, title]);
  expect(p, `Seed enthält „${title}“`).toBeTruthy();
  await sql(`UPDATE "InventoryItem" SET "onHand" = GREATEST("onHand", 20), reserved = 0 WHERE "productId" = $1`, [p!.id]);
  await sql(`UPDATE "Product" SET status = 'ACTIVE' WHERE id = $1`, [p!.id]);
  return p!;
}

async function emptyCart(who: "elias") {
  const id = await userId(who);
  await sql(`DELETE FROM "CartItem" WHERE "cartId" IN (SELECT id FROM "Cart" WHERE "userId" = $1)`, [id]);
  await sql(`DELETE FROM "CartCoupon" WHERE "cartId" IN (SELECT id FROM "Cart" WHERE "userId" = $1)`, [id]);
  await sql(`DELETE FROM "CartBundle" WHERE "cartId" IN (SELECT id FROM "Cart" WHERE "userId" = $1)`, [id]);
  // Offene Bestellungen früherer Läufe verwerfen
  await sql(`UPDATE "Order" SET status = 'CANCELLED', "reservationExpiresAt" = NULL WHERE "buyerId" = $1 AND status = 'PENDING_PAYMENT'`, [id]);
}

async function addToCart(page: Page, productId: string) {
  const r = await page.request.post("/api/v1/app/cart/items", { data: { productId, quantity: 1 } });
  expect(r.status(), await r.text()).toBe(200);
}

test.describe.serial("Gutscheine und Sets", () => {
  test("Shop legt im Studio einen Gutschein an", async ({ browser }) => {
    const lena = await loginAs(browser, "lena");
    await lena.goto("/studio/rabatte");
    await expect(lena.getByRole("heading", { level: 1, name: "Gutscheine & Sets" })).toBeVisible();
    await lena.getByRole("button", { name: "Neuer Gutschein" }).click();
    const dlg = lena.getByRole("dialog", { name: "Neuer Gutschein" });
    await dlg.getByRole("textbox", { name: "Code" }).fill(CODE.toLowerCase());
    await expect(dlg.getByRole("textbox", { name: "Code" })).toHaveValue(CODE);
    await dlg.getByLabel("Rabatt in %").fill("95");
    await dlg.getByRole("button", { name: "Gutschein anlegen" }).click();
    await expect(dlg.getByText("Ganze Prozent von 1 bis 90")).toBeVisible();
    await dlg.getByLabel("Rabatt in %").fill("20");
    await dlg.getByRole("button", { name: "Gutschein anlegen" }).click();
    await expect(dlg).toBeHidden();
    const row = lena.getByRole("listitem").filter({ hasText: CODE });
    await expect(row).toContainText("20 %");
    await expect(row).toContainText("1× je Konto");
    await expect(row).toContainText("Aktiv");

    // Teilen: fertiges Bild mit Code, Beitragstext, öffentliche Gutscheinseite mit Vorschaubild
    await lena.getByRole("button", { name: `Gutschein ${CODE} teilen` }).click();
    const share = lena.getByRole("dialog", { name: `Gutschein ${CODE} teilen` });
    await expect(share.getByLabel("Beitragstext")).toHaveValue(new RegExp(`Mit dem Code ${CODE} bekommst du 20 % Rabatt`));
    const img = share.getByRole("img", { name: `Gutschein ${CODE}` });
    await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth), { timeout: 30_000 }).toBe(1080);
    const caption = await share.getByLabel("Beitragstext").inputValue();
    const pageUrl = caption.match(/https?:\/\/\S+\/gutschein\/\w+/)![0];
    await share.getByRole("button", { name: "Schliessen" }).click();
    const guest = await (await browser.newContext()).newPage();
    await guest.goto(new URL(pageUrl).pathname);
    await expect(guest.getByRole("heading", { level: 1, name: "20 % Rabatt" })).toBeVisible();
    await expect(guest.getByText(CODE, { exact: true })).toBeVisible();
    await expect(guest.locator('meta[property="og:image"]')).toHaveAttribute("content", /\/gutschein\/\w+\/bild$/);
    await guest.context().close();
  });

  test("Käufer löst den Code ein und bezahlt den reduzierten Betrag", async ({ browser }) => {
    const kit = await lenaProduct("Häkelset Markttasche");
    await emptyCart("elias");
    const elias = await loginAs(browser, "elias");
    await addToCart(elias, kit.id);
    await elias.goto("/warenkorb");
    await elias.getByRole("button", { name: /Gutscheincode für/ }).click();
    const input = elias.getByLabel(/Gutscheincode für/);
    await input.fill("FALSCH123");
    await elias.getByRole("button", { name: "Einlösen" }).click();
    await expect(elias.getByRole("alert").filter({ hasText: "nicht gültig" })).toBeVisible();
    await input.fill(CODE.toLowerCase());
    await elias.getByRole("button", { name: "Einlösen" }).click();
    const discount = Math.round(kit.priceMinor * 0.2);
    const chf = (m: number) => (m / 100).toFixed(2);
    const section = elias.locator("section").filter({ has: elias.getByRole("link", { name: /Lenas/ }) }).first();
    await expect(section.getByText(`Gutschein ${CODE}`, { exact: true })).toBeVisible();
    await expect(section).toContainText(`− CHF ${chf(discount)}`);

    await elias.getByRole("link", { name: "Zur Kasse" }).click();
    await expect(elias.locator("aside")).toContainText(`Gutschein ${CODE}`);
    const order = elias.getByRole("button", { name: /Zahlungspflichtig bestellen/ });
    await expect(order).toBeVisible();
    // Gespeicherte Angaben aus dem Marktplatz-Test oder neu erfassen
    if (await elias.getByLabel("Vorname").isVisible().catch(() => false)) {
      await elias.getByLabel("Vorname").fill("Elias");
      await elias.getByLabel("Nachname").fill("Frei");
      await elias.getByLabel("Strasse und Hausnummer").fill("Seestrasse 5");
      await elias.getByLabel("PLZ").fill("3600");
      await elias.getByLabel("Ort", { exact: true }).fill("Thun");
    }
    await order.click();
    await expect(elias).toHaveURL(/kasse\/simulation/, { timeout: 20_000 });
    const o = await one<{ id: string; subtotalMinor: number; discountMinor: number; totalMinor: number; shippingMinor: number; code: string; used: number }>(
      `SELECT o.id, o."subtotalMinor", o."discountMinor", o."totalMinor", o."shippingMinor", c.code, c."usedCount" AS used
         FROM "Order" o JOIN "ShopCoupon" c ON c.id = o."couponId" WHERE o."buyerId" = $1 ORDER BY o."createdAt" DESC LIMIT 1`,
      [await userId("elias")],
    );
    expect(o!.code).toBe(CODE);
    expect(o!.discountMinor).toBe(discount);
    expect(o!.totalMinor).toBe(o!.subtotalMinor - discount + o!.shippingMinor);
    expect(o!.used).toBe(1);
    await elias.getByRole("button", { name: "Zahlung simulieren – erfolgreich" }).click();
    await expect(elias).toHaveURL(/kasse\/erfolg/, { timeout: 20_000 });

    await elias.goto(`/bestellungen/${o!.id}`);
    await expect(elias.getByText(`Gutschein ${CODE}`, { exact: true })).toBeVisible();

    // Einmal je Konto: zweiter Versuch wird abgelehnt
    await addToCart(elias, kit.id);
    await elias.goto("/warenkorb");
    await elias.getByRole("button", { name: /Gutscheincode für/ }).click();
    await elias.getByLabel(/Gutscheincode für/).fill(CODE);
    await elias.getByRole("button", { name: "Einlösen" }).click();
    await expect(elias.getByRole("alert").filter({ hasText: "bereits eingelöst" })).toBeVisible();
  });

  test("Materialset bei der Anleitung: Shop legt es an, Käufer legt es komplett in den Warenkorb", async ({ browser }) => {
    const kissen = await lenaProduct("Granny-Kissen Senf");
    const kit = await lenaProduct("Häkelset Markttasche");
    const tutorial = await one<{ slug: string; title: string }>(
      `SELECT t.slug, t.title FROM "Tutorial" t JOIN "User" u ON u.id = t."authorId" WHERE u.email = 'lena-haekelt@demo.werkraum.local' AND t.state = 'PUBLISHED' ORDER BY t."createdAt" LIMIT 1`,
    );
    expect(tutorial, "Seed enthält eine Anleitung von Lena").toBeTruthy();
    const title = `Set ${CODE}`;

    const lena = await loginAs(browser, "lena");
    await lena.goto("/studio/rabatte");
    await lena.getByRole("button", { name: "Neues Set" }).click();
    const dlg = lena.getByRole("dialog", { name: "Neues Set" });
    await dlg.getByLabel("Name des Sets").fill(title);
    for (const name of ["Häkelset Markttasche", "Granny-Kissen Senf"]) {
      await dlg.getByRole("combobox", { name: "Produkt hinzufügen" }).click();
      await lena.getByRole("option", { name: new RegExp(`^${name}`) }).click();
      await dlg.getByRole("button", { name: "Hinzufügen" }).click();
    }
    await dlg.getByLabel("Set-Rabatt in %").fill("15");
    await dlg.getByRole("combobox", { name: /Materialset zur Anleitung/ }).click();
    await lena.getByRole("option", { name: tutorial!.title }).click();
    const full = kissen.priceMinor + kit.priceMinor;
    const price = full - Math.round(full * 0.15);
    await expect(dlg.getByText(/Set-Preis/)).toContainText(`CHF ${(price / 100).toFixed(2)}`);
    await dlg.getByRole("button", { name: "Set anlegen" }).click();
    await expect(dlg).toBeHidden();
    await expect(lena.getByRole("listitem").filter({ hasText: title })).toContainText("−15 %");

    await emptyCart("elias");
    const elias = await loginAs(browser, "elias");
    await elias.goto(`/anleitungen/${tutorial!.slug}`);
    const card = elias.getByRole("article", { name: title });
    await expect(card).toContainText("Materialset");
    await expect(card).toContainText(`CHF ${(price / 100).toFixed(2)}`);
    await card.getByRole("button", { name: "Set in den Warenkorb" }).click();
    await expect(card.getByRole("link", { name: "Zum Warenkorb" })).toBeVisible();
    await elias.goto("/warenkorb");
    await expect(elias.getByText(`Set „${title}“`, { exact: true })).toBeVisible();
    await expect(elias.locator("main")).toContainText(`− CHF ${((full - price) / 100).toFixed(2)}`);

    // Ein Teil entfernen → Rabatt entfällt, Hinweis erscheint
    await sql(`DELETE FROM "CartItem" WHERE "productId" = $1 AND "cartId" IN (SELECT id FROM "Cart" WHERE "userId" = $2)`, [kissen.id, await userId("elias")]);
    await elias.reload();
    await expect(elias.getByText(/Der Set-Rabatt gilt nur, solange alle Teile/)).toBeVisible();
    await expect(elias.getByText(`Set „${title}“`, { exact: true })).toHaveCount(0);
    await emptyCart("elias");
    // Aufräumen: spätere Tests sollen Lenas Anleitung ohne Testset sehen
    await sql(`UPDATE "ProductBundle" SET active = false WHERE title = $1`, [title]);
    await sql(`UPDATE "ShopCoupon" SET active = false WHERE code = $1`, [CODE]);
  });
});

test("App-Schnittstelle: Gutschein, Sets und Unterstützer-Abo erreichbar", async ({ browser }) => {
  const elias = await loginAs(browser, "elias");
  const kit = await lenaProduct("Häkelset Markttasche");
  const shop = await one<{ id: string }>(`SELECT id FROM "Shop" WHERE slug = $1`, [SHOP]);
  // Unbekannter Code → verständliche Ablehnung
  await emptyCart("elias");
  await addToCart(elias, kit.id);
  const bad = await elias.request.post("/api/v1/app/cart/coupon", { data: { shopId: shop!.id, code: "GIBTESNICHT" } });
  expect(bad.status()).toBe(422);
  expect(JSON.stringify(await bad.json())).toContain("nicht gültig");
  // Sets zu Produkt und Anleitung (Liste, auch leer)
  const forProduct = await elias.request.get(`/api/v1/app/bundles/for-product/${kit.id}`);
  expect(forProduct.ok(), await forProduct.text()).toBe(true);
  expect(Array.isArray((await forProduct.json()).data)).toBe(true);
  const t = await one<{ id: string }>(`SELECT id FROM "Tutorial" WHERE state = 'PUBLISHED' ORDER BY "createdAt" LIMIT 1`);
  const forTutorial = await elias.request.get(`/api/v1/app/tutorials/${t!.id}/bundles`);
  expect(forTutorial.ok(), await forTutorial.text()).toBe(true);
  // Unterstützer-Abo: Angebot (null ohne Plan) und eigene Unterstützungen
  const lena = await userId("lena");
  const offer = await elias.request.get(`/api/v1/app/creators/${lena}/support`);
  expect(offer.ok(), await offer.text()).toBe(true);
  expect(await offer.json()).toHaveProperty("data.offer");
  const mine = await elias.request.get("/api/v1/app/me/supporting");
  expect(mine.ok()).toBe(true);
  await emptyCart("elias");
});
