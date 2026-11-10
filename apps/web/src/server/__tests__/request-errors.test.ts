import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { toResult, uniqueViolation, UNIQUE_CONFLICT_MESSAGE, httpStatus } from "../errors";
import { body } from "../api";

/** Wie Prisma 7 mit Treiberadapter (pg) eine Unique-Verletzung meldet (an echter DB beobachtet). */
function p2002(index: string, legacyTarget?: string[]) {
  return Object.assign(new Error("Unique constraint failed"), {
    name: "PrismaClientKnownRequestError",
    code: "P2002",
    meta: legacyTarget
      ? { target: legacyTarget }
      : { modelName: "User", driverAdapterError: { name: "DriverAdapterError", cause: { originalCode: "23505", kind: "UniqueConstraintViolation", constraint: { index }, table: "User" } } },
  });
}

describe("A-16: Unique-Verletzungen → 409", () => {
  it("erkennt Index bzw. Felder", () => {
    expect(uniqueViolation(p2002("User_email_key"))).toContain("email");
    expect(uniqueViolation(p2002("UserProfile_handle_key"))).toContain("handle");
    expect(uniqueViolation(p2002("", ["providerAccountId", "provider"]))).toContain("provideraccountid");
    expect(uniqueViolation(new Error("x"))).toBeNull();
    expect(uniqueViolation({ code: "P2002" })).toBeNull();
  });
  it("toResult liefert CONFLICT mit neutraler Meldung statt INTERNAL", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const r = toResult(p2002("User_email_key"));
    expect(r).toEqual({ ok: false, code: "CONFLICT", error: UNIQUE_CONFLICT_MESSAGE });
    expect(httpStatus(p2002("x"), "CONFLICT")).toBe(409);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe("A-14: body() nur für JSON-Objekte", () => {
  const req = (text: string) => new NextRequest("http://localhost/api/v1/x", { method: "POST", body: text, headers: { "content-type": "application/json" } });
  afterEach(() => vi.restoreAllMocks());
  it("Objekt → Objekt, leer → {}", async () => {
    await expect(body(req('{"code":"1"}'))).resolves.toEqual({ code: "1" });
    await expect(body(req(""))).resolves.toEqual({});
  });
  it.each(["null", "[]", "42", '"text"', "true"])("%s → 400", async (text) => {
    const e = await body(req(text)).catch((x: unknown) => x);
    expect(e).toMatchObject({ code: "VALIDATION", status: 400, message: "Der Body muss ein JSON-Objekt sein." });
  });
  it("kaputtes JSON → 400", async () => {
    await expect(body(req("{"))).rejects.toMatchObject({ status: 400, message: "Ungültiger JSON-Body." });
  });
});
