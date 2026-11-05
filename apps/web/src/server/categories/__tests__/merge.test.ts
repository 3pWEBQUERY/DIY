import { describe, expect, it } from "vitest";
import { CATEGORIES } from "@werkraum/shared";
import { mergeCategories, type CategorySettingLike } from "../merge";

const row = (p: Partial<CategorySettingLike>): CategorySettingLike => ({ name: null, short: null, description: null, isActive: true, isFocus: null, sortOrder: null, ...p });

describe("mergeCategories", () => {
  it("liefert ohne Overrides die Standardliste in Originalreihenfolge", () => {
    const r = mergeCategories(new Map());
    expect(r.map((c) => c.slug)).toEqual(CATEGORIES.map((c) => c.slug));
    expect(r.every((c) => c.isActive && !c.overridden)).toBe(true);
    expect(r[0]!.position).toBe(1);
  });

  it("wendet Name, Kurzname, Fokus und Aktiv-Status an", () => {
    const r = mergeCategories(new Map([["holz", row({ name: "Holz & Werkstatt", short: "Werkstatt", isFocus: true, isActive: false })]]));
    const holz = r.find((c) => c.slug === "holz")!;
    expect(holz).toMatchObject({ name: "Holz & Werkstatt", short: "Werkstatt", focus: true, isActive: false, overridden: true });
    expect(holz.defaults.name).toBe("Holzarbeiten");
  });

  it("ignoriert leere Overrides und sortiert nach sortOrder", () => {
    const r = mergeCategories(new Map([["weitere", row({ name: "  ", sortOrder: 1 })]]));
    expect(r[0]!.slug).toBe("weitere");
    expect(r[0]!.name).toBe("Weitere kreative Arbeiten");
    // Gleichstand mit der Standardposition 1 → explizite Reihenfolge gewinnt
    expect(r[1]!.slug).toBe(CATEGORIES[0].slug);
    expect(r.map((c) => c.position)).toEqual(r.map((_, i) => i + 1));
  });
});
