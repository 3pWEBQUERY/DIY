import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/server/auth/session", () => ({ currentUser: async () => null, getSession: async () => null, requireUser: async () => null }));
vi.mock("@/server/flags", () => ({ requireFlag: async () => undefined }));

const { DELETE, GET, POST, dispatch, zBool } = await import("../router");

const routes = [
  GET("/things/:id", async (c) => ({ id: c.p.id })),
  DELETE("/things/:id", async () => ({ ok: true })),
  POST("/things/:id/flag", async (c) => {
    const { on } = await c.body({ on: zBool });
    return { on: !!on };
  }),
  POST("/raw", async (c) => {
    const { a } = await c.json<{ a?: string }>();
    return { a: a ?? null };
  }),
  GET("/gone", async () => {
    throw Object.assign(new Error("No record was found"), { name: "PrismaClientKnownRequestError", code: "P2025" });
  }),
];

function call(method: string, path: string, body?: string) {
  const req = new NextRequest(`http://localhost/api/v1/app${path}`, { method, body, headers: { authorization: "Bearer x" } });
  return dispatch(routes, req, path.split("/").filter(Boolean));
}

describe("Mobile-Dispatcher", () => {
  it("unbekannte Methode auf bekanntem Pfad → 405 mit Allow", async () => {
    const r = await call("PUT", "/things/1");
    expect(r.status).toBe(405);
    expect(r.headers.get("Allow")).toBe("GET, HEAD, DELETE");
  });
  it("unbekannter Pfad → 404", async () => {
    expect((await call("GET", "/nope")).status).toBe(404);
  });
  it("kaputtes JSON → 400", async () => {
    const r = await call("POST", "/raw", "{oops");
    expect(r.status).toBe(400);
    expect((await r.json()).error.code).toBe("VALIDATION");
  });
  it("JSON, das kein Objekt ist → 400 statt 500", async () => {
    for (const b of ["null", "[]", "42", '"x"']) expect((await call("POST", "/raw", b)).status).toBe(400);
  });
  it("falsche Feldtypen → 422 mit Feldern", async () => {
    const r = await call("POST", "/things/1/flag", JSON.stringify({ on: "yes" }));
    expect(r.status).toBe(422);
    expect((await r.json()).error.fields).toHaveProperty("on");
  });
  it("gültiger Body und leerer Body funktionieren", async () => {
    expect(await (await call("POST", "/things/1/flag", JSON.stringify({ on: true }))).json()).toEqual({ data: { on: true } });
    expect(await (await call("POST", "/things/1/flag")).json()).toEqual({ data: { on: false } });
  });
  it("Prisma „nicht gefunden“ → 404", async () => {
    expect((await call("GET", "/gone")).status).toBe(404);
  });
  it("ungültige Origin ohne Bearer → 403 statt 500", async () => {
    const req = new NextRequest("http://localhost/api/v1/app/raw", { method: "POST", body: "{}", headers: { origin: "null", host: "localhost" } });
    expect((await dispatch(routes, req, ["raw"])).status).toBe(403);
  });
});
