import { describe, expect, it } from "vitest";
import { bundleSchema, couponCodeSchema, couponSchema } from "@werkraum/shared";
import { MIN_CHARGE_MINOR, applyBundles, bundlePrice, clampDiscount, couponAmount, couponProblem, fitRows, grandTotal, groupByShop, type CouponRule } from "../rules";

const fmt = (m: number) => `CHF ${(m / 100).toFixed(2)}`;
const now = new Date("2026-11-20T10:00:00Z");
const base: CouponRule = { code: "HERBST10", kind: "PERCENT", value: 10, minSubtotalMinor: 0, startsAt: null, endsAt: null, maxUses: null, usedCount: 0, onePerBuyer: true, active: true };

describe("Gutscheine", () => {
  it("normalisiert Codes und prüft die Form", () => {
    expect(couponCodeSchema.parse(" herbst 10 ")).toBe("HERBST10");
    expect(couponCodeSchema.safeParse("ab").success).toBe(false);
    expect(couponCodeSchema.safeParse("ÄRGER").success).toBe(false);
    expect(couponSchema.safeParse({ code: "X100", kind: "PERCENT", value: 95 }).success).toBe(false);
    expect(couponSchema.safeParse({ code: "X100", kind: "FIXED", value: 500, startsAt: "2026-12-01", endsAt: "2026-11-01" }).success).toBe(false);
    expect(couponSchema.parse({ code: "x100", kind: "FIXED", value: 500 })).toMatchObject({ code: "X100", onePerBuyer: true, active: true, minSubtotalMinor: 0 });
  });

  it("nennt den Grund, warum ein Code nicht gilt", () => {
    const ctx = { now, subtotal: 5000, buyerUses: 0, fmt };
    expect(couponProblem(base, ctx)).toBeNull();
    expect(couponProblem({ ...base, active: false }, ctx)).toMatch(/nicht mehr gültig/);
    expect(couponProblem({ ...base, startsAt: new Date("2026-12-01T00:00:00Z") }, ctx)).toMatch(/erst ab/);
    expect(couponProblem({ ...base, endsAt: new Date("2026-11-19T00:00:00Z") }, ctx)).toMatch(/abgelaufen/);
    expect(couponProblem({ ...base, maxUses: 3, usedCount: 3 }, ctx)).toMatch(/vergeben/);
    expect(couponProblem(base, { ...ctx, buyerUses: 1 })).toMatch(/bereits eingelöst/);
    expect(couponProblem({ ...base, onePerBuyer: false }, { ...ctx, buyerUses: 4 })).toBeNull();
    expect(couponProblem({ ...base, minSubtotalMinor: 8000 }, ctx)).toBe("Gilt ab einem Warenwert von CHF 80.00 in diesem Shop.");
  });

  it("berechnet Prozent- und Betragsrabatt, nie über dem Warenwert", () => {
    expect(couponAmount(base, 4590)).toBe(459);
    expect(couponAmount({ kind: "FIXED", value: 500 }, 4590)).toBe(500);
    expect(couponAmount({ kind: "FIXED", value: 9000 }, 4590)).toBe(4590);
    expect(couponAmount(base, 0)).toBe(0);
  });

  it("begrenzt den Rabatt so, dass der Mindestbetrag bezahlt wird", () => {
    expect(clampDiscount(500, 4000, 900)).toBe(500);
    expect(clampDiscount(5000, 4000, 900)).toBe(4000); // nie mehr als der Warenwert
    expect(clampDiscount(1000, 1000, 0)).toBe(1000 - MIN_CHARGE_MINOR); // digital, ohne Versand
    expect(clampDiscount(-3, 1000, 0)).toBe(0);
  });
});

describe("Sets", () => {
  const bundle = { id: "b1", title: "Vogelhaus", discountPct: 10, items: [{ productId: "holz", quantity: 1 }, { productId: "schrauben", quantity: 2 }] };

  it("Set-Rabatt nur, wenn alle Teile in der Set-Menge im Warenkorb liegen", () => {
    const lines = [
      { productId: "holz", unitMinor: 3000, quantity: 1 },
      { productId: "schrauben", unitMinor: 500, quantity: 2 },
    ];
    expect(applyBundles(lines, [bundle]).applied).toEqual([{ id: "b1", title: "Vogelhaus", valueMinor: 4000, amountMinor: 400 }]);
    const r = applyBundles([lines[0]!, { ...lines[1]!, quantity: 1 }], [bundle]);
    expect(r.applied).toEqual([]);
    expect(r.incomplete).toEqual([{ id: "b1", title: "Vogelhaus", missing: ["schrauben"] }]);
  });

  it("jede Einheit zählt nur für ein Set; Varianten zählen nicht", () => {
    const lines = [
      { productId: "holz", unitMinor: 3000, quantity: 1 },
      { productId: "schrauben", unitMinor: 500, quantity: 2 },
    ];
    const second = { ...bundle, id: "b2", title: "Nochmals" };
    expect(applyBundles(lines, [bundle, second]).applied.map((a) => a.id)).toEqual(["b1"]);
    expect(applyBundles([{ ...lines[0]!, variantId: "v1" }, lines[1]!], [bundle]).applied).toEqual([]);
  });

  it("Set-Preis und Schema", () => {
    expect(bundlePrice([{ unitMinor: 3000, quantity: 1 }, { unitMinor: 500, quantity: 2 }], 15)).toEqual({ fullMinor: 4000, discountMinor: 600, priceMinor: 3400 });
    expect(bundleSchema.safeParse({ title: "Set", discountPct: 10, items: [{ productId: "a", quantity: 1 }] }).success).toBe(false);
    expect(bundleSchema.safeParse({ title: "Set", discountPct: 10, items: [{ productId: "a", quantity: 1 }, { productId: "a", quantity: 2 }] }).success).toBe(false);
    expect(bundleSchema.safeParse({ title: "Set", discountPct: 60, items: [{ productId: "a", quantity: 1 }, { productId: "b", quantity: 2 }] }).success).toBe(false);
  });
});

describe("Rabatt in der Bestellung", () => {
  it("Provision auf den Warenwert nach Rabatt, Gesamtbetrag = Warenwert − Rabatt + Versand", () => {
    const lines = [
      { shopId: "s1", unitMinor: 4000, quantity: 1, shippingMinor: 900, isDigital: false },
      { shopId: "s2", unitMinor: 2000, quantity: 1, shippingMinor: 0, isDigital: true },
    ];
    const groups = groupByShop(lines, 1000, (shopId, _ls, subtotal) => (shopId === "s1" ? Math.round(subtotal * 0.25) : 0));
    const s1 = groups.find((g) => g.shopId === "s1")!;
    expect(s1).toMatchObject({ subtotal: 4000, discount: 1000 });
    expect(s1.fees).toMatchObject({ subtotal: 3000, shipping: 900, total: 3900, platformFee: 300 });
    expect(grandTotal(groups)).toEqual({ subtotal: 6000, discount: 1000, shipping: 900, total: 5900 });
  });

  it("Rabattzeilen werden von hinten gekürzt (zuerst der Gutschein)", () => {
    const rows = [
      { kind: "bundle" as const, label: "Set „A“", amountMinor: 400 },
      { kind: "coupon" as const, label: "Gutschein X", amountMinor: 300 },
    ];
    expect(fitRows(rows, 700)).toEqual(rows);
    expect(fitRows(rows, 500)).toEqual([rows[0], { ...rows[1], amountMinor: 100 }]);
    expect(fitRows(rows, 350)).toEqual([{ ...rows[0], amountMinor: 350 }]);
  });
});
