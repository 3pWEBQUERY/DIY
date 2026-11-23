import { describe, expect, it, vi } from "vitest";

vi.mock("@/server/db", () => ({ db: {}, Prisma: { DbNull: null } }));
vi.mock("@/server/media/service", () => ({ attachMedia: vi.fn() }));
vi.mock("@/server/pro/service", () => ({ isPro: vi.fn(), PRO_NAME: "Creator Pro" }));
const { parsePdfBrand, pdfBrandSchema } = await import("../pdf-brand");

describe("PDF-Branding", () => {
  it("verlangt einen Namen und erlaubt nur https-Links", () => {
    expect(pdfBrandSchema.safeParse({ name: "Atelier Holz", link: "https://atelier.example" }).success).toBe(true);
    expect(pdfBrandSchema.safeParse({ name: "Atelier Holz", link: "" }).success).toBe(true);
    expect(pdfBrandSchema.safeParse({ name: "Atelier Holz" }).success).toBe(true);
    expect(pdfBrandSchema.safeParse({ name: "", link: "https://atelier.example" }).success).toBe(false);
    expect(pdfBrandSchema.safeParse({ name: "Atelier", link: "http://atelier.example" }).success).toBe(false);
    expect(pdfBrandSchema.safeParse({ name: "Atelier", link: "javascript:alert(1)" }).success).toBe(false);
    expect(pdfBrandSchema.safeParse({ name: "Atelier", link: "https://localhost" }).success).toBe(false);
  });

  it("liest gespeichertes Branding robust", () => {
    expect(parsePdfBrand(null)).toBeNull();
    expect(parsePdfBrand({ name: "" })).toBeNull();
    expect(parsePdfBrand({ name: "Atelier", link: "https://a.example", logoUrl: "https://cdn/x.webp", logoMediaId: "m1" })).toEqual({ name: "Atelier", link: "https://a.example", logoUrl: "https://cdn/x.webp", logoMediaId: "m1" });
    expect(parsePdfBrand({ name: "Atelier", link: "" })).toEqual({ name: "Atelier", link: null, logoUrl: null, logoMediaId: null });
  });
});
