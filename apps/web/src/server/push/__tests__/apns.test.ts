import { describe, expect, it, vi } from "vitest";
import { generateKeyPairSync, verify } from "node:crypto";

vi.mock("server-only", () => ({}));
const { buildProviderToken, apnsConfigured } = await import("../apns");

describe("APNs-Provider-Token", () => {
  const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
  const pem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();

  it("ist ein gültiges ES256-JWT mit kid/iss/iat", () => {
    const t = buildProviderToken("KEY123", "TEAM456", pem, 1_800_000_000);
    const [h, c, s] = t.split(".");
    expect(JSON.parse(Buffer.from(h!, "base64url").toString())).toEqual({ alg: "ES256", kid: "KEY123" });
    expect(JSON.parse(Buffer.from(c!, "base64url").toString())).toEqual({ iss: "TEAM456", iat: 1_800_000_000 });
    const ok = verify("sha256", Buffer.from(`${h}.${c}`), { key: publicKey, dsaEncoding: "ieee-p1363" }, Buffer.from(s!, "base64url"));
    expect(ok).toBe(true);
  });

  it("akzeptiert Schlüssel mit maskierten Zeilenumbrüchen (Railway-Variablen)", () => {
    const escaped = pem.replace(/\n/g, "\\n");
    expect(() => buildProviderToken("K", "T", escaped)).not.toThrow();
  });

  it("ist ohne Konfiguration deaktiviert", () => {
    expect(apnsConfigured()).toBe(false);
  });
});
