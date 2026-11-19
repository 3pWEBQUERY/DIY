import { describe, expect, it } from "vitest";
import { materialLineSchema, materialsCostEstimate } from "@werkraum/shared";
import { formatCostInput, parseCost } from "@/components/materials/line-editor";

describe("Materialkosten", () => {
  it("summiert Richtpreise und erkennt unvollständige Listen", () => {
    expect(materialsCostEstimate([])).toBeNull();
    expect(materialsCostEstimate([{ costMinor: null }, {}])).toBeNull();
    expect(materialsCostEstimate([{ costMinor: 1250 }, { costMinor: 750 }])).toEqual({ totalMinor: 2000, complete: true, priced: 2 });
    expect(materialsCostEstimate([{ costMinor: 1250 }, {}])).toEqual({ totalMinor: 1250, complete: false, priced: 1 });
  });

  it("liest Preise wie in der Schweiz und in Deutschland geschrieben", () => {
    expect(parseCost("12.50")).toBe(1250);
    expect(parseCost("12,5")).toBe(1250);
    expect(parseCost("1'200")).toBe(120000);
    expect(parseCost("")).toBeNull();
    expect(parseCost("abc")).toBeNull();
    expect(formatCostInput(1250)).toBe("12.50");
    expect(formatCostInput(null)).toBe("");
  });

  it("Schema: optional, ganze Rappen, nicht negativ", () => {
    expect(materialLineSchema.parse({ name: "Leim" }).costMinor).toBeUndefined();
    expect(materialLineSchema.parse({ name: "Leim", costMinor: null }).costMinor).toBeNull();
    expect(materialLineSchema.parse({ name: "Leim", costMinor: 990 }).costMinor).toBe(990);
    expect(materialLineSchema.safeParse({ name: "Leim", costMinor: -1 }).success).toBe(false);
  });
});
