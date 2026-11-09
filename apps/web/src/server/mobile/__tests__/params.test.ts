import { describe, expect, it } from "vitest";
import { clampInt, decodeFollowCursor, encodeFollowCursor, optInt, parseJsonObject } from "../params";

describe("clampInt", () => {
  const o = { def: 24, min: 1, max: 50 };
  it("nutzt den Standard bei fehlendem, leerem oder ungültigem Wert", () => {
    expect(clampInt(null, o)).toBe(24);
    expect(clampInt(undefined, o)).toBe(24);
    expect(clampInt("", o)).toBe(24);
    expect(clampInt("  ", o)).toBe(24);
    expect(clampInt("abc", o)).toBe(24);
    expect(clampInt("NaN", o)).toBe(24);
    expect(clampInt("Infinity", o)).toBe(24);
  });
  it("klemmt negative, null und zu grosse Werte", () => {
    expect(clampInt("-5", o)).toBe(1);
    expect(clampInt("0", o)).toBe(1);
    expect(clampInt("1000000", o)).toBe(50);
    expect(clampInt("1e9", o)).toBe(50);
  });
  it("schneidet Nachkommastellen ab", () => {
    expect(clampInt("12.9", o)).toBe(12);
    expect(clampInt("12", o)).toBe(12);
  });
  it("klemmt auch den Standard", () => {
    expect(clampInt(null, { def: 100, min: 1, max: 50 })).toBe(50);
  });
});

describe("optInt", () => {
  it("fehlend/ungültig → undefined, sonst geklemmt", () => {
    expect(optInt(null, { min: 0, max: 5 })).toBeUndefined();
    expect(optInt("x", { min: 0, max: 5 })).toBeUndefined();
    expect(optInt("-3", { min: 0, max: 5 })).toBe(0);
    expect(optInt("9", { min: 0, max: 5 })).toBe(5);
    expect(optInt("3", { min: 0, max: 5 })).toBe(3);
  });
});

describe("Follow-Cursor", () => {
  it("Hin- und Rückweg", () => {
    const c = { followerId: "u1", followeeId: "u2" };
    expect(decodeFollowCursor(encodeFollowCursor(c))).toEqual(c);
  });
  it("manipulierte Cursor → null statt Ausnahme", () => {
    const b64 = (s: string) => Buffer.from(s).toString("base64url");
    expect(decodeFollowCursor(undefined)).toBeNull();
    expect(decodeFollowCursor("")).toBeNull();
    expect(decodeFollowCursor("%%%")).toBeNull();
    expect(decodeFollowCursor("not-json")).toBeNull();
    expect(decodeFollowCursor(b64("null"))).toBeNull();
    expect(decodeFollowCursor(b64("[1,2]"))).toBeNull();
    expect(decodeFollowCursor(b64('{"followerId":1,"followeeId":"x"}'))).toBeNull();
    expect(decodeFollowCursor(b64('{"followerId":"a"}'))).toBeNull();
    expect(decodeFollowCursor(b64('{"followerId":{"in":["a"]},"followeeId":"b"}'))).toBeNull();
    expect(decodeFollowCursor("a".repeat(2000))).toBeNull();
  });
});

describe("parseJsonObject", () => {
  it("leer → {}", () => {
    expect(parseJsonObject("")).toEqual({ ok: true, value: {} });
    expect(parseJsonObject("  \n")).toEqual({ ok: true, value: {} });
  });
  it("Objekt → ok", () => {
    expect(parseJsonObject('{"a":1}')).toEqual({ ok: true, value: { a: 1 } });
  });
  it("kaputtes JSON → syntax", () => {
    expect(parseJsonObject("{a:1")).toEqual({ ok: false, reason: "syntax" });
  });
  it("kein Objekt → type", () => {
    for (const t of ["null", "[]", "1", '"x"', "true"]) expect(parseJsonObject(t)).toEqual({ ok: false, reason: "type" });
  });
});
