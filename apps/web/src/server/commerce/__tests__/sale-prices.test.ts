import { beforeEach, describe, expect, it, vi } from "vitest";
import { isoWeekKey, weekStart } from "@/lib/calendar-weeks";

const findMany = vi.fn();
vi.mock("@/server/db", () => ({ db: { shopSale: { findMany: (...a: unknown[]) => findMany(...a) } } }));
vi.mock("@/server/auth/session", () => ({ currentUser: vi.fn() }));

const { localizeWithSale, salePriceFields, salesForProducts } = await import("../sale-prices");

const now = new Date("2026-11-21T12:00:00Z");
const sale = { id: "s1", shopId: "shop1", title: "Herbst", percent: 20, startsAt: new Date("2026-11-20T00:00:00Z"), endsAt: new Date("2026-11-24T00:00:00Z"), productIds: [] as string[], active: true };
const chf = { currency: "CHF" as const, eurChf: 0.94, fxDate: null };
const eur = { currency: "EUR" as const, eurChf: 0.94, fxDate: null };

describe("Aktionspreise bei eingebetteten Produkten", () => {
  beforeEach(() => findMany.mockReset());

  it("lädt die Aktionen einer ganzen Liste in einer Abfrage und ordnet sie je Produkt zu", async () => {
    findMany.mockResolvedValue([{ ...sale, productIds: ["p1"] }]);
    const m = await salesForProducts(
      [
        { id: "p1", shopId: "shop1" },
        { id: "p2", shopId: "shop1" },
        { id: "p3", shopId: "shop2" },
      ],
      now,
    );
    expect(findMany).toHaveBeenCalledOnce();
    expect(m.get("p1")?.id).toBe("s1");
    expect(m.get("p2")).toBeNull();
    expect(m.get("p3")).toBeNull();
  });

  it("zeigt den Aktionspreis in der Shop-Währung und merkt sich den regulären Preis", () => {
    const x = localizeWithSale(chf, { priceMinor: 8500, currency: "CHF", title: "Hocker" }, sale);
    expect(x).toMatchObject({ priceMinor: 6800, currency: "CHF", original: null, title: "Hocker" });
    expect(x.sale).toMatchObject({ id: "s1", percent: 20, regularMinor: 8500, shopRegularMinor: 8500, endsAt: "2026-11-24T00:00:00.000Z" });
  });

  it("rechnet erst die Aktion, dann die Währung – wie Karte, Warenkorb und Kasse", () => {
    const x = salePriceFields(eur, { priceMinor: 8500, currency: "CHF" }, sale);
    // 85.– −20 % = 68.– CHF → 68 / 0.94 = 72.34 → 72.30 EUR; regulär 85 / 0.94 = 90.43 → 90.40
    expect(x).toEqual({ priceMinor: 7230, currency: "EUR", original: { priceMinor: 6800, currency: "CHF" }, sale: expect.objectContaining({ regularMinor: 9040, shopRegularMinor: 8500 }) });
  });

  it("ohne Aktion: nur Umrechnung, keine Aktionsangaben", () => {
    expect(salePriceFields(eur, { priceMinor: 8500, currency: "CHF" }, null)).toEqual({ priceMinor: 9040, currency: "EUR", original: { priceMinor: 8500, currency: "CHF" }, sale: null });
  });
});

describe("Kalenderwochen", () => {
  it("berechnet ISO-Wochen auch über den Jahreswechsel", () => {
    expect(isoWeekKey("2026-11-23")).toBe("2026-W48");
    expect(isoWeekKey("2026-11-29")).toBe("2026-W48");
    expect(isoWeekKey("2026-11-30")).toBe("2026-W49");
    expect(isoWeekKey("2027-01-01")).toBe("2026-W53");
    expect(isoWeekKey("2025-12-29")).toBe("2026-W01");
  });

  it("findet den Montag einer Woche aus der Adresse", () => {
    expect(weekStart("2026-W48")).toBe("2026-11-23");
    expect(weekStart("2026-W01")).toBe("2025-12-29");
    expect(weekStart("2026-W53")).toBe("2026-12-28");
    expect(isoWeekKey(weekStart(undefined))).toMatch(/^\d{4}-W\d{2}$/);
  });
});
