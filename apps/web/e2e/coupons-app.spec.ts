import { expect, test } from "@playwright/test";
import { loginAs, sql } from "./helpers";

/** App-Schnittstelle für Shop-Gutscheine (Studio in der iOS-App): anlegen, Feldfehler, pausieren, löschen. */
test("Studio-Gutscheine über die App verwalten", async ({ browser }) => {
  const lena = await loginAs(browser, "lena");
  const code = `APP${Date.now().toString(36).toUpperCase().slice(-6)}`;
  await sql(`DELETE FROM "ShopCoupon" WHERE code LIKE 'APP%'`);

  // Feldfehler wie im Web (Code-Format, Prozent-Grenze)
  const bad = await lena.request.post("/api/v1/app/studio/coupons", { data: { code: "x", kind: "PERCENT", value: 95 } });
  expect(bad.status()).toBe(422);
  const err = (await bad.json()).error;
  expect(err.fields.code).toBeTruthy();
  expect(err.fields.value).toContain("90");

  // Anlegen (Code wird normalisiert)
  const created = await lena.request.post("/api/v1/app/studio/coupons", {
    data: { code: ` ${code.toLowerCase()} `, kind: "FIXED", value: 500, minSubtotalMinor: 4000, maxUses: 10, onePerBuyer: true, active: true },
  });
  expect(created.status(), await created.text()).toBe(200);
  const id = (await created.json()).data.id as string;

  // Doppelter Code → Feldfehler
  const dup = await lena.request.post("/api/v1/app/studio/coupons", { data: { code, kind: "PERCENT", value: 10 } });
  expect(dup.status()).toBe(422);
  expect((await dup.json()).error.fields.code).toBeTruthy();

  // Liste mit Shop-Währung und Statistik
  const list = (await (await lena.request.get("/api/v1/app/studio/coupons")).json()).data;
  expect(list.shop.currency).toBeTruthy();
  const row = list.coupons.find((c: { id: string }) => c.id === id);
  expect(row).toMatchObject({ code, kind: "FIXED", value: 500, minSubtotalMinor: 4000, maxUses: 10, active: true, stats: { orders: 0, discountMinor: 0 } });

  // Bearbeiten, pausieren, löschen
  const upd = await lena.request.put(`/api/v1/app/studio/coupons/${id}`, { data: { code, kind: "PERCENT", value: 15, active: true } });
  expect(upd.status(), await upd.text()).toBe(200);
  const paused = await lena.request.post(`/api/v1/app/studio/coupons/${id}/active`, { data: { active: false } });
  expect((await paused.json()).data.active).toBe(false);
  const del = await lena.request.delete(`/api/v1/app/studio/coupons/${id}`);
  expect(del.status(), await del.text()).toBe(200);
  const after = (await (await lena.request.get("/api/v1/app/studio/coupons")).json()).data;
  expect(after.coupons.some((c: { id: string }) => c.id === id)).toBe(false);

  // Ohne eigenen Shop: kein Zugriff
  const elias = await loginAs(browser, "elias");
  const none = await elias.request.get("/api/v1/app/studio/coupons");
  expect(none.ok()).toBe(false);
});
