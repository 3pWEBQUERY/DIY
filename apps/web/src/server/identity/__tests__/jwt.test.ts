import { describe, expect, it } from "vitest";
import { b64urlDecode, decodeJwtSegment, splitJwt } from "../jwt";

const seg = (v: unknown) => Buffer.from(typeof v === "string" ? v : JSON.stringify(v)).toString("base64url");

describe("splitJwt", () => {
  it("zerlegt ein wohlgeformtes Token", () => {
    const t = `${seg({ alg: "RS256", kid: "k1" })}.${seg({ sub: "abc", aud: "app" })}.${seg("signature")}`;
    const r = splitJwt(t);
    expect(r?.header).toEqual({ alg: "RS256", kid: "k1" });
    expect(r?.claims).toEqual({ sub: "abc", aud: "app" });
    expect(r?.signature.toString()).toBe("signature");
    expect(r?.signingInput).toBe(t.split(".").slice(0, 2).join("."));
  });

  it("liefert null für kaputte Tokens statt zu werfen", () => {
    const ok = seg({ alg: "RS256" });
    for (const t of [
      "",
      "abc",
      "a.b",
      "a.b.c.d",
      `${ok}.${ok}.`,
      `!!!.${ok}.${seg("s")}`,
      `${seg("not json")}.${ok}.${seg("s")}`,
      `${seg("null")}.${ok}.${seg("s")}`,
      `${ok}.${seg("[1,2]")}.${seg("s")}`,
      `${ok}.${seg("42")}.${seg("s")}`,
    ]) {
      expect(splitJwt(t)).toBeNull();
    }
    expect(splitJwt(123 as unknown as string)).toBeNull();
    expect(splitJwt("a".repeat(20_000))).toBeNull();
  });
});

describe("decodeJwtSegment / b64urlDecode", () => {
  it("akzeptiert Padding, lehnt Fremdzeichen ab", () => {
    expect(b64urlDecode("YQ==")?.toString()).toBe("a");
    expect(b64urlDecode("a+b/")).toBeNull();
    expect(decodeJwtSegment(seg({ x: 1 }))).toEqual({ x: 1 });
    expect(decodeJwtSegment("")).toBeNull();
  });
});
