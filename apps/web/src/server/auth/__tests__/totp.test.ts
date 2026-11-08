import { describe, expect, it } from "vitest";
import { base32Decode, base32Encode, decryptSecret, encryptSecret, generateRecoveryCodes, hashRecoveryCode, hotp, verifyTotp } from "../totp";

// RFC 6238 Anhang B: Geheimnis "12345678901234567890" (ASCII), SHA-1, 8 Stellen
const RFC_SECRET = base32Encode(Buffer.from("12345678901234567890"));

describe("TOTP (RFC 6238)", () => {
  it("entspricht den offiziellen Testvektoren", () => {
    const cases: [number, string][] = [
      [59, "94287082"],
      [1111111109, "07081804"],
      [1111111111, "14050471"],
      [1234567890, "89005924"],
      [2000000000, "69279037"],
    ];
    for (const [t, code] of cases) expect(hotp(RFC_SECRET, Math.floor(t / 30), 8)).toBe(code);
  });

  it("Base32 hin und zurück", () => {
    const b = Buffer.from("werkuno-2fa");
    expect(base32Decode(base32Encode(b)).toString()).toBe("werkuno-2fa");
  });

  it("akzeptiert ±1 Schritt und verhindert Wiederverwendung", () => {
    const now = 1_800_000_000_000;
    const step = Math.floor(now / 30000);
    const code = hotp(RFC_SECRET, step);
    expect(verifyTotp(RFC_SECRET, code, null, now)).toBe(step);
    expect(verifyTotp(RFC_SECRET, hotp(RFC_SECRET, step - 1), null, now)).toBe(step - 1);
    expect(verifyTotp(RFC_SECRET, hotp(RFC_SECRET, step - 2), null, now)).toBeNull();
    // gleicher Code nach erfolgreicher Anmeldung → abgelehnt
    expect(verifyTotp(RFC_SECRET, code, step, now)).toBeNull();
    expect(verifyTotp(RFC_SECRET, "12ab56", null, now)).toBeNull();
  });

  it("verschlüsselt das Geheimnis und erkennt Manipulation", () => {
    process.env.SESSION_SECRET ??= "test-secret-test-secret-test-secret-000";
    const enc = encryptSecret("JBSWY3DPEHPK3PXP");
    expect(enc).not.toContain("JBSWY3DPEHPK3PXP");
    expect(decryptSecret(enc)).toBe("JBSWY3DPEHPK3PXP");
    const parts = enc.split(".");
    parts[3] = parts[3]!.slice(0, -2) + (parts[3]!.endsWith("A") ? "B" : "A") + parts[3]!.slice(-1);
    expect(() => decryptSecret(parts.join("."))).toThrow();
  });

  it("Wiederherstellungscodes sind eindeutig und formatunabhängig", () => {
    const codes = generateRecoveryCodes();
    expect(new Set(codes).size).toBe(10);
    expect(codes[0]).toMatch(/^[a-z0-9]{5}-[a-z0-9]{5}$/);
    expect(hashRecoveryCode(codes[0]!.toUpperCase().replace("-", " "))).toBe(hashRecoveryCode(codes[0]!));
  });
});
