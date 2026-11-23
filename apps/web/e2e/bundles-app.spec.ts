import { expect, test } from "@playwright/test";
import { loginAs, sql } from "./helpers";

type Opt = { id: string; title: string; kind: string; status: string; priceMinor: number; hasVariants: boolean };
type Row = { id: string; title: string; discountPct: number; active: boolean; items: { productId: string; quantity: number }[]; fullMinor: number; priceMinor: number };

/** App-Schnittstelle für Sets (Studio in der iOS-App): anlegen, Feldfehler, deaktivieren, löschen. */
test("Studio-Sets über die App verwalten", async ({ browser }) => {
  const lena = await loginAs(browser, "lena");
  await sql(`DELETE FROM "ProductBundle" WHERE title LIKE 'App-Set%'`);

  const start = (await (await lena.request.get("/api/v1/app/studio/bundles")).json()).data;
  expect(start.currency).toBeTruthy();
  const usable = (start.options.products as Opt[]).filter((p) => !p.hasVariants && p.kind !== "DIGITAL").slice(0, 2);
  expect(usable.length).toBe(2);

  // Feldfehler wie im Web (zu wenige Produkte, Rabatt über 50 %)
  const bad = await lena.request.post("/api/v1/app/studio/bundles", { data: { title: "App-Set", discountPct: 80, items: [{ productId: usable[0]!.id, quantity: 1 }] } });
  expect(bad.status()).toBe(422);
  const err = (await bad.json()).error;
  expect(err.fields.items).toBeTruthy();
  expect(err.fields.discountPct).toContain("50");

  // Anlegen
  const items = [
    { productId: usable[0]!.id, quantity: 2 },
    { productId: usable[1]!.id, quantity: 1 },
  ];
  const created = await lena.request.post("/api/v1/app/studio/bundles", { data: { title: "App-Set Probe", description: "Aus der App", discountPct: 10, active: true, items } });
  expect(created.status(), await created.text()).toBe(200);
  const id = (await created.json()).data.id as string;

  // Liste mit Preisen in Shop-Währung
  const list = (await (await lena.request.get("/api/v1/app/studio/bundles")).json()).data;
  const row = (list.bundles as Row[]).find((b) => b.id === id)!;
  const full = usable[0]!.priceMinor * 2 + usable[1]!.priceMinor;
  expect(row).toMatchObject({ title: "App-Set Probe", discountPct: 10, active: true, fullMinor: full, priceMinor: full - Math.round(full * 0.1) });
  expect(row.items.map((i) => i.quantity)).toEqual([2, 1]);

  // Bearbeiten, deaktivieren (Inhalt bleibt), löschen
  const upd = await lena.request.put(`/api/v1/app/studio/bundles/${id}`, { data: { title: "App-Set Probe 2", discountPct: 15, active: true, items } });
  expect(upd.status(), await upd.text()).toBe(200);
  const off = await lena.request.post(`/api/v1/app/studio/bundles/${id}/active`, { data: { active: false } });
  expect((await off.json()).data.active).toBe(false);
  const mid = (await (await lena.request.get("/api/v1/app/studio/bundles")).json()).data;
  expect((mid.bundles as Row[]).find((b) => b.id === id)).toMatchObject({ title: "App-Set Probe 2", discountPct: 15, active: false });
  const del = await lena.request.delete(`/api/v1/app/studio/bundles/${id}`);
  expect(del.status(), await del.text()).toBe(200);
  const after = (await (await lena.request.get("/api/v1/app/studio/bundles")).json()).data;
  expect((after.bundles as Row[]).some((b) => b.id === id)).toBe(false);

  // Ohne eigenen Shop: kein Zugriff
  const elias = await loginAs(browser, "elias");
  const none = await elias.request.get("/api/v1/app/studio/bundles");
  expect(none.ok()).toBe(false);
});
