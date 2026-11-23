import { describe, expect, it } from "vitest";
import { saleCountdownLabel, saleForProduct, salePrice, salesOverlap, shopSaleSchema, isSaleRunning } from "@werkraum/shared";
import { applyBundles } from "../rules";

const at = (s: string) => new Date(s);
const base = { id: "s1", percent: 20, startsAt: at("2026-11-20T08:00:00Z"), endsAt: at("2026-11-23T22:00:00Z"), productIds: [] as string[], active: true };

describe("Aktionspreis", () => {
  it("rechnet Prozent ab und rundet auf 10 Rappen", () => {
    expect(salePrice(8500, 20)).toBe(6800);
    expect(salePrice(1990, 15)).toBe(1690); // 16.915 → 16.90
    expect(salePrice(1995, 10)).toBe(1800); // 17.955 → auf 10 Rappen 18.00
    expect(salePrice(50, 70)).toBe(20);
    expect(salePrice(10, 70)).toBe(10); // nie unter 10 Rappen
    expect(salePrice(5000, 0)).toBe(5000);
  });

  it("findet die laufende Aktion eines Produkts (höchster Rabatt gewinnt)", () => {
    const now = at("2026-11-21T12:00:00Z");
    const shop = { ...base };
    const pick = { ...base, id: "s2", percent: 30, productIds: ["p2"] };
    expect(saleForProduct([shop, pick], "p1", now)?.id).toBe("s1");
    expect(saleForProduct([shop, pick], "p2", now)?.id).toBe("s2");
    expect(saleForProduct([{ ...base, active: false }], "p1", now)).toBeNull();
    expect(saleForProduct([shop], "p1", at("2026-11-24T00:00:00Z"))).toBeNull();
    expect(saleForProduct([shop], "p1", at("2026-11-20T07:59:00Z"))).toBeNull();
    expect(isSaleRunning(shop, at("2026-11-23T21:59:59Z"))).toBe(true);
    expect(isSaleRunning(shop, at("2026-11-23T22:00:00Z"))).toBe(false);
  });

  it("erkennt Überschneidungen nach Zeit und Produkten", () => {
    const a = { startsAt: base.startsAt, endsAt: base.endsAt, productIds: ["p1", "p2"] };
    expect(salesOverlap(a, { startsAt: at("2026-11-22T00:00:00Z"), endsAt: at("2026-11-25T00:00:00Z"), productIds: ["p2"] })).toBe(true);
    expect(salesOverlap(a, { startsAt: at("2026-11-22T00:00:00Z"), endsAt: at("2026-11-25T00:00:00Z"), productIds: ["p3"] })).toBe(false);
    expect(salesOverlap(a, { startsAt: at("2026-11-23T22:00:00Z"), endsAt: at("2026-11-25T00:00:00Z"), productIds: [] })).toBe(false); // direkt danach
    expect(salesOverlap({ ...a, productIds: [] }, { startsAt: at("2026-11-21T00:00:00Z"), endsAt: at("2026-11-22T00:00:00Z"), productIds: ["p9"] })).toBe(true); // ganzer Shop
  });

  it("prüft Eingaben", () => {
    const ok = { title: "Herbst", percent: 20, startsAt: "2026-11-20T08:00:00Z", endsAt: "2026-11-23T08:00:00Z" };
    expect(shopSaleSchema.safeParse(ok).success).toBe(true);
    expect(shopSaleSchema.safeParse({ ...ok, percent: 4 }).success).toBe(false);
    expect(shopSaleSchema.safeParse({ ...ok, percent: 71 }).success).toBe(false);
    expect(shopSaleSchema.safeParse({ ...ok, endsAt: ok.startsAt }).success).toBe(false);
    expect(shopSaleSchema.safeParse({ ...ok, endsAt: "2026-12-25T08:00:00Z" }).success).toBe(false); // > 30 Tage
    expect(shopSaleSchema.safeParse({ ...ok, productIds: ["a", "a"] }).success).toBe(false);
    expect(shopSaleSchema.safeParse({ ...ok, title: "x" }).success).toBe(false);
  });

  it("zeigt die Restzeit ruhig an", () => {
    const now = at("2026-11-21T12:00:00Z");
    expect(saleCountdownLabel(at("2026-11-23T16:30:00Z"), now)).toBe("2 T 4 Std");
    expect(saleCountdownLabel(at("2026-11-21T15:12:00Z"), now)).toBe("3 Std 12 Min");
    expect(saleCountdownLabel(at("2026-11-21T12:00:20Z"), now)).toBe("1 Min");
  });

  it("Sets rechnen nur mit Artikeln ausserhalb der Aktion", () => {
    const bundles = [{ id: "b", title: "Set", discountPct: 10, items: [{ productId: "p1", quantity: 1 }, { productId: "p2", quantity: 1 }] }];
    const lines = [{ productId: "p1", unitMinor: 1000, quantity: 1 }, { productId: "p2", unitMinor: 1000, quantity: 1 }];
    expect(applyBundles(lines, bundles).applied[0]?.amountMinor).toBe(200);
    // p2 in einer Aktion → aus der Berechnung genommen → Set gilt nicht
    expect(applyBundles(lines.filter((l) => l.productId !== "p2"), bundles).applied).toHaveLength(0);
  });
});
