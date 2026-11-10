import { expect, test } from "@playwright/test";
import { loginAs, one, sql, userId } from "./helpers";

/**
 * Marktplatz Ende-zu-Ende im Testmodus: Kauf mit Pflichtangaben, Zahlung, Verkäuferin sieht
 * echte Angaben, Auszahlung über Werkuno, Bewertungen im Profil.
 */
test.describe.serial("Marktplatz", () => {
  let orderId = "";

  test("Erstkauf verlangt Name und Adresse, speichert sie und verbucht die Zahlung", async ({ browser }) => {
    const elias = await loginAs(browser, "elias");
    // Ein physisches Produkt von Lena, sicher an Lager (frühere Testkäufe können es ausverkauft haben)
    const product = await one<{ id: string }>(`SELECT p.id FROM "Product" p JOIN "Shop" s ON s.id = p."shopId" WHERE s.slug = 'lenas-maschen' AND p.kind IN ('SMALL_BATCH', 'KIT') AND p.status IN ('ACTIVE', 'SOLD_OUT') AND NOT EXISTS (SELECT 1 FROM "ProductVariant" v WHERE v."productId" = p.id) ORDER BY p."createdAt" LIMIT 1`);
    await sql(`UPDATE "InventoryItem" SET "onHand" = GREATEST("onHand", 20), reserved = 0 WHERE "productId" = $1`, [product!.id]);
    await sql(`UPDATE "Product" SET status = 'ACTIVE' WHERE id = $1`, [product!.id]);
    const r = await elias.request.post("/api/v1/app/cart/items", { data: { productId: product!.id, quantity: 1 } });
    expect(r.status(), await r.text()).toBe(200);
    await elias.goto("/kasse");
    await expect(elias.getByText("Einmalig: Name und Adresse")).toBeVisible();
    await expect(elias.getByLabel("Vorname")).toHaveValue("");
    await elias.getByRole("button", { name: /Zahlungspflichtig bestellen/ }).click();
    await expect(elias.getByText("Pflichtfeld").first()).toBeVisible();
    await elias.getByLabel("Vorname").fill("Elias");
    await elias.getByLabel("Nachname").fill("Frei-Tester");
    await elias.getByLabel("Strasse und Hausnummer").fill("Seestrasse 5");
    await elias.getByLabel("PLZ").fill("360");
    await elias.getByLabel("Ort", { exact: true }).fill("Thun");
    await elias.getByRole("button", { name: /Zahlungspflichtig bestellen/ }).click();
    await expect(elias.getByText(/4-stellige PLZ/)).toBeVisible();
    await elias.getByLabel("PLZ").fill("3600");
    await elias.getByRole("button", { name: /Zahlungspflichtig bestellen/ }).click();
    await expect(elias).toHaveURL(/kasse\/simulation/, { timeout: 20_000 });

    const order = await one<{ id: string; number: string; name: string }>(`SELECT id, number, "buyerDetails"->>'name' AS name FROM "Order" WHERE "buyerId" = $1 ORDER BY "createdAt" DESC LIMIT 1`, [await userId("elias")]);
    expect(order!.name).toBe("Elias Frei-Tester");
    orderId = order!.id;
    // Die Testzahlungsseite muss im Build wirklich erreichbar sein (kein 404) und die Zahlung über die Oberfläche verbuchen
    await expect(elias.getByRole("heading", { name: "Testzahlung" })).toBeVisible();
    await expect(elias.locator("main")).toContainText("Testmodus · keine echte Zahlung");
    await expect(elias.locator("main")).toContainText(order!.number);
    await elias.getByRole("button", { name: "Zahlung simulieren – erfolgreich" }).click();
    await expect(elias).toHaveURL(/kasse\/erfolg\?bestellung=/, { timeout: 20_000 });
    await expect(elias.getByRole("heading", { name: /deine Bestellung ist bestätigt/ })).toBeVisible();
    const paid = await one<{ status: string; payment: string }>(`SELECT o.status, p.status AS payment FROM "Order" o JOIN "Payment" p ON p."orderId" = o.id WHERE o.id = $1`, [orderId]);
    expect(paid!.status).toBe("NEW");
    expect(paid!.payment).toBe("SUCCEEDED");
  });

  test("Verkäuferin sieht echten Namen und Adresse", async ({ browser }) => {
    const lena = await loginAs(browser, "lena");
    await lena.goto(`/studio/bestellungen/${orderId}`);
    const aside = lena.locator("aside").last();
    await expect(aside).toContainText("Elias Frei-Tester");
    await expect(aside).toContainText("Seestrasse 5");
    await expect(aside).toContainText("@elias.garten");
  });

  test("Auszahlung über Werkuno beantragen (Testmodus)", async ({ browser }) => {
    const lena = await loginAs(browser, "lena");
    await lena.goto("/studio/einnahmen");
    const panel = lena.locator("#auszahlungen");
    await expect(panel).toContainText("Verfügbares Guthaben");
    await expect(lena.locator("main")).not.toContainText("Stripe-Dashboard");
    await lena.getByRole("button", { name: "Auszahlung beantragen" }).click();
    const dlg = lena.getByRole("dialog", { name: "Auszahlung beantragen" });
    await dlg.getByRole("textbox").fill("1.00");
    await dlg.getByRole("button", { name: /auszahlen/ }).click();
    await expect(lena.locator("main")).toContainText("Beantragt");
  });

  test("Bewertungen erscheinen im Profil – bei Shops immer, bei Käufer:innen erst mit Bewertung", async ({ page }) => {
    await page.goto("/u/elias.garten");
    await expect(page.getByRole("navigation", { name: "Profilbereiche" })).not.toContainText("Bewertungen");
    const item = await one<{ id: string; productId: string }>(`SELECT id, "productId" FROM "OrderItem" WHERE "orderId" = $1 LIMIT 1`, [orderId]);
    await sql(
      `INSERT INTO "Review" (id, "orderId", "orderItemId", "productId", "authorId", "productRating", "sellerRating", body, "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, $5, 5, 5, 'E2E: Wunderschön gearbeitet.', now(), now()) ON CONFLICT DO NOTHING`,
      [`e2e_${orderId}`, orderId, item!.id, item!.productId, await userId("elias")],
    );
    await page.goto("/u/elias.garten?tab=bewertungen");
    await expect(page.locator("main")).toContainText("E2E: Wunderschön gearbeitet.");
    await page.goto("/u/lena.haekelt?tab=bewertungen");
    await expect(page.locator("main")).toContainText("E2E: Wunderschön gearbeitet.");
    await page.goto("/u/mattia.holz");
    await expect(page.getByRole("navigation", { name: "Profilbereiche" })).toContainText("Bewertungen");
  });
});
