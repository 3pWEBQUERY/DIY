import { describe, expect, it, vi } from "vitest";
import { isUniqueViolation, withSlugRetry } from "../unique-retry";

const p2002 = (fields: string[]) => Object.assign(new Error("Unique constraint failed on the constraint: `Tutorial_slug_key`"), { code: "P2002", meta: { modelName: "Tutorial", driverAdapterError: { cause: { constraint: { fields } } } } });

describe("Slug-Kollisionen", () => {
  it("erkennt P2002 auf dem Slug", () => {
    expect(isUniqueViolation(p2002(["slug"]), "slug")).toBe(true);
    expect(isUniqueViolation({ code: "P2002", meta: { target: ["ownerId", "slug"] } }, "slug")).toBe(true);
    expect(isUniqueViolation({ code: "P2002", meta: { target: ["email"] }, message: "x" }, "slug")).toBe(false);
    expect(isUniqueViolation(new Error("x"), "slug")).toBe(false);
  });

  it("wiederholt bei Kollision mit neuem Versuch, andere Fehler sofort", async () => {
    const fn = vi.fn(async (attempt: number) => {
      if (attempt === 0) throw p2002(["slug"]);
      return attempt;
    });
    expect(await withSlugRetry(fn)).toBe(1);
    await expect(withSlugRetry(async () => Promise.reject(new Error("anders")))).rejects.toThrow("anders");
    const always = vi.fn(async () => Promise.reject(p2002(["slug"])));
    await expect(withSlugRetry(always, 3)).rejects.toMatchObject({ code: "P2002" });
    expect(always).toHaveBeenCalledTimes(3);
  });
});
