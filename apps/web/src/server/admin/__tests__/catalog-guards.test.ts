import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/server/db", () => ({ db: {}, Prisma: {} }));
const { materialUsageText } = await import("../catalog");
const { combineStockText } = await import("../catalog-settings");

describe("Materialdatenbank: Löschen und Zusammenführen", () => {
  it("nennt alle Verweise, die ein Löschen verhindern", () => {
    expect(materialUsageText({ projects: 0, stock: 0, offers: 0 })).toBe("");
    expect(materialUsageText({ projects: 1, stock: 2, offers: 1 })).toBe("1 Projekt, 2 Bestandseinträge, 1 Bezugsquelle");
    expect(materialUsageText({ projects: 3, stock: 0, offers: 0 })).toBe("3 Projekte");
  });

  it("fasst Mengen und Notizen doppelter Bestandseinträge zusammen", () => {
    expect(combineStockText("50 cm", "2 m")).toBe("50 cm + 2 m");
    expect(combineStockText("", "2 m")).toBe("2 m");
    expect(combineStockText("2 m", "")).toBe("2 m");
    expect(combineStockText("2 m", "2 m")).toBe("2 m");
    expect(combineStockText("Keller", "Garage", " · ")).toBe("Keller · Garage");
  });
});
