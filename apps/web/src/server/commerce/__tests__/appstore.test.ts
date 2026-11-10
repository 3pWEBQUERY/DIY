import { describe, expect, it, vi } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createPrivateKey, sign } from "node:crypto";

vi.mock("server-only", () => ({}));
vi.mock("@/server/db", () => ({ db: {} }));
vi.mock("@/server/settings", () => ({ getSetting: async () => null }));
vi.mock("@/server/notifications", () => ({ notify: async () => {} }));
vi.mock("@/server/events", () => ({ emit: async () => {} }));
vi.mock("@/server/audit", () => ({ audit: async () => {} }));
vi.mock("@/server/monitoring", () => ({ captureError: async () => null }));
vi.mock("@/server/visibility", () => ({ isBlockedBetween: async () => false }));
vi.mock("../fees", () => ({ feeForShop: async () => 600 }));
vi.mock("../stripe", () => ({ paymentsMode: () => "simulated", isStripeError: () => false, createSellerTransfer: async () => ({}), reverseSellerTransfer: async () => ({}) }));

const { appPriceFor, webPriceForAppleProduct, APP_STORE_PRODUCT_PREFIX } = await import("../appstore");
const { verifyAppStoreJws, AppStoreVerificationError } = await import("../appstore-verify");

describe("App-Preise", () => {
  it("rundet Web-Preis + 30 % auf die nächste Preisstufe auf", () => {
    expect(appPriceFor(1000, 3000)).toEqual({ priceMinor: 1300, appleProductId: `${APP_STORE_PRODUCT_PREFIX}13` });
    expect(appPriceFor(1290, 3000)).toEqual({ priceMinor: 1700, appleProductId: `${APP_STORE_PRODUCT_PREFIX}17` }); // 16.77 → 17
    expect(appPriceFor(500, 3000)?.priceMinor).toBe(700); // 6.50 → 7
    expect(appPriceFor(1600, 3000)?.priceMinor).toBe(2200); // 20.80 → 22
  });
  it("ist nie tiefer als der Web-Preis plus Aufschlag", () => {
    for (let web = 50; web <= 15_000; web += 37) {
      const p = appPriceFor(web, 3000);
      if (p) expect(p.priceMinor).toBeGreaterThanOrEqual(Math.ceil(web * 1.3));
    }
  });
  it("liefert null über der höchsten Stufe und bei ungültigen Preisen", () => {
    expect(appPriceFor(20_000, 3000)).toBeNull();
    expect(appPriceFor(0, 3000)).toBeNull();
  });
  it("übersetzt Apple-Produkt-IDs zurück", () => {
    expect(webPriceForAppleProduct(`${APP_STORE_PRODUCT_PREFIX}25`)).toBe(2500);
    expect(webPriceForAppleProduct(`${APP_STORE_PRODUCT_PREFIX}23`)).toBeNull();
    expect(webPriceForAppleProduct("x")).toBeNull();
  });
});

/** Selbstsigniertes EC-Zertifikat wie beim StoreKit-Test in Xcode */
function makeJws(payload: object, opts: { chain?: string[] } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "jws-"));
  execFileSync("openssl", ["ecparam", "-name", "prime256v1", "-genkey", "-noout", "-out", join(dir, "k.pem")]);
  execFileSync("openssl", ["req", "-new", "-x509", "-key", join(dir, "k.pem"), "-out", join(dir, "c.pem"), "-days", "2", "-subj", "/CN=StoreKit Testing in Xcode"]);
  const der = execFileSync("openssl", ["x509", "-in", join(dir, "c.pem"), "-outform", "DER"]).toString("base64");
  const b64u = (b: Buffer) => b.toString("base64url");
  const h = b64u(Buffer.from(JSON.stringify({ alg: "ES256", x5c: opts.chain ?? [der] })));
  const p = b64u(Buffer.from(JSON.stringify(payload)));
  const sig = sign("sha256", Buffer.from(`${h}.${p}`), { key: createPrivateKey(readFileSync(join(dir, "k.pem"))), dsaEncoding: "ieee-p1363" });
  return `${h}.${p}.${b64u(sig)}`;
}

describe("Prüfung der Apple-Belege", () => {
  it("nimmt Xcode-Testkäufe nur mit Freigabe in der Entwicklung an", () => {
    const jws = makeJws({ transactionId: "1", environment: "Xcode", bundleId: "ch.werkuno.app" });
    vi.stubEnv("APPLE_IAP_ALLOW_XCODE", "");
    expect(() => verifyAppStoreJws(jws)).toThrow(AppStoreVerificationError);
    vi.stubEnv("APPLE_IAP_ALLOW_XCODE", "true");
    expect(verifyAppStoreJws<{ transactionId: string }>(jws).transactionId).toBe("1");
    vi.stubEnv("NODE_ENV", "production");
    expect(() => verifyAppStoreJws(jws)).toThrow(AppStoreVerificationError);
    vi.unstubAllEnvs();
  });
  it("lehnt manipulierte Nutzlast ab", () => {
    vi.stubEnv("APPLE_IAP_ALLOW_XCODE", "true");
    const [h, , s] = makeJws({ transactionId: "1", environment: "Xcode" }).split(".");
    const forged = Buffer.from(JSON.stringify({ transactionId: "2", environment: "Xcode" })).toString("base64url");
    expect(() => verifyAppStoreJws(`${h}.${forged}.${s}`)).toThrow("Signatur ungültig.");
    vi.unstubAllEnvs();
  });
  it("verlangt für echte Käufe die Apple-Zertifikatskette", () => {
    const jws = makeJws({ transactionId: "1", environment: "Production" });
    expect(() => verifyAppStoreJws(jws)).toThrow("Unvollständige Zertifikatskette.");
    const fake = makeJws({ transactionId: "1", environment: "Sandbox" });
    const der = JSON.parse(Buffer.from(fake.split(".")[0]!, "base64url").toString()).x5c[0];
    expect(() => verifyAppStoreJws(makeJws({ transactionId: "1", environment: "Sandbox" }, { chain: [der, der, der] }))).toThrow("Unbekannte Wurzelzertifizierungsstelle.");
  });
});
