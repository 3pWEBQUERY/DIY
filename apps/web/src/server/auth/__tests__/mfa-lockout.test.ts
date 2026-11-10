import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * A-11: Wer nur das Passwort kennt, darf die Inhaberin nicht durch Fehlversuche beim zweiten Faktor
 * aussperren – das Durchprobieren 6-stelliger Codes muss trotzdem begrenzt bleiben.
 * Limits laufen hier in einem In-Memory-Zähler mit den echten Werten aus LIMITS.
 */
const buckets = new Map<string, number>();
const { LIMITS } = await vi.importActual<typeof import("../../ratelimit")>("../../ratelimit");
vi.mock("@/server/ratelimit", () => ({
  LIMITS,
  limit: async (action: keyof typeof LIMITS, subject: string) => {
    const k = `${action}:${subject}`;
    const n = (buckets.get(k) ?? 0) + 1;
    buckets.set(k, n);
    if (n > LIMITS[action][0]) throw Object.assign(new Error("rate"), { code: "RATE_LIMITED" });
  },
  releaseLimit: async (action: string, subject: string) => {
    const k = `${action}:${subject}`;
    buckets.set(k, Math.max(0, (buckets.get(k) ?? 0) - 1));
  },
  isLimited: async (action: keyof typeof LIMITS, subject: string) => (buckets.get(`${action}:${subject}`) ?? 0) >= LIMITS[action][0],
}));

const GOOD = "123456";
const GOOD_RC = "abcde-fghij";
let pending = { id: "pend", userAgent: "UA", ipHash: "ip-attacker", deviceLabel: "x", user: { id: "u1" } };
let known = false;
let recoveryLeft = true;
let lastStep: number | null = null;
vi.mock("@/server/auth/session", () => ({
  getPendingMfaSession: async () => pending,
  isKnownDevice: async () => known,
  deviceLabel: () => "Gerät",
}));
vi.mock("@/server/auth/totp", () => ({
  verifyTotp: (_s: string, code: string, last: number | null) => (code === GOOD && (last ?? 0) < 100 ? 100 : null),
  decryptSecret: (s: string) => s,
  hashRecoveryCode: (c: string) => `h:${c}`,
  encryptSecret: (s: string) => s,
  generateRecoveryCodes: () => [],
  generateTotpSecret: () => "s",
  otpauthUri: () => "",
}));
vi.mock("@/server/db", () => ({
  db: {
    user: {
      findUnique: async () => ({ totpSecret: "s", totpEnabledAt: new Date(), totpLastStep: lastStep }),
      updateMany: async () => {
        lastStep = null; // jeder Testcode darf erneut verwendet werden
        return { count: 1 };
      },
    },
    mfaRecoveryCode: {
      updateMany: async (q: { where: { codeHash: string } }) => ({ count: q.where.codeHash === `h:${GOOD_RC}` && recoveryLeft ? 1 : 0 }),
      count: async () => 5,
    },
    session: { update: async () => ({}), updateMany: async () => ({ count: 1 }) },
  },
}));
vi.mock("@/server/audit", () => ({ audit: async () => ({}) }));
vi.mock("@/server/notifications", () => ({ notify: async () => ({}) }));
vi.mock("@/server/auth/new-device", () => ({ warnNewDevice: async () => {} }));
vi.mock("@/server/auth/reauth", () => ({ assertReauthenticated: async () => "password" }));
vi.mock("@/server/auth/security", () => ({ securityReset: async () => ({ revokedSessions: 0, removedTokens: 0 }) }));
vi.mock("qrcode", () => ({ default: { toString: async () => "" } }));

const { verifyMfaLogin, verifySessionMfa } = await import("../mfa");
const { mfaBuckets } = await import("../mfa-limits");

const from = (ipHash: string, isKnown: boolean) => {
  pending = { ...pending, ipHash };
  known = isKnown;
};
const attempt = (code: string, kind: "totp" | "recovery" = "totp") =>
  verifyMfaLogin(code, kind).then(
    () => "ok",
    (e: { code?: string }) => e.code ?? "error",
  );

beforeEach(() => {
  buckets.clear();
  recoveryLeft = true;
});

describe("mfaBuckets", () => {
  it("kurzes Fenster je Konto und Herkunft, Tageslimit getrennt nach vertraut/unbekannt", () => {
    expect(mfaBuckets("u1", { scope: "ip:a", trusted: false }, "totp")).toEqual([
      { action: "mfaFailDay", subject: "u1" },
      { action: "mfaFail", subject: "u1:ip:a" },
    ]);
    expect(mfaBuckets("u1", { scope: "s:x", trusted: true }, "totp")).toEqual([
      { action: "mfaFailDayTrusted", subject: "u1" },
      { action: "mfaFail", subject: "u1:s:x" },
    ]);
    // Wiederherstellungscodes von vertrauten Herkünften: nie durch ein Tageslimit blockiert
    expect(mfaBuckets("u1", { scope: "ip:a", trusted: true }, "recovery")).toEqual([{ action: "mfaFail", subject: "u1:ip:a" }]);
    expect(mfaBuckets("u1", { scope: "ip:a", trusted: false }, "recovery")).toHaveLength(2);
  });
});

describe("Zwei-Faktor-Anmeldung: keine Aussperrung durch Dritte", () => {
  it("Fehlversuche von fremden Adressen sperren das bekannte Gerät der Inhaberin nicht", async () => {
    // Angreifer mit Passwort: viele Adressen, bis zum Tageslimit für unbekannte Herkünfte
    for (let i = 0; i < 40; i++) {
      from(`ip-${i % 5}`, false);
      await attempt("000000");
    }
    from("ip-x", false);
    expect(await attempt("000000")).toBe("RATE_LIMITED");
    // Inhaberin vom bekannten Gerät: Code und Wiederherstellungscode funktionieren
    from("ip-owner", true);
    expect(await attempt(GOOD)).toBe("ok");
    expect(await attempt(GOOD_RC, "recovery")).toBe("ok");
    // Bestehende Sitzung (Step-up) ebenfalls nicht betroffen
    await expect(verifySessionMfa({ id: "u1", email: "a@b.ch", role: "MEMBER" }, "sess-owner", GOOD)).resolves.toBeUndefined();
  });

  it("Durchprobieren bleibt begrenzt: höchstens 10 je Adresse/15 Min. und 30 je Tag von unbekannten Geräten", async () => {
    from("ip-a", false);
    let tries = 0;
    for (let i = 0; i < 15; i++) if ((await attempt("000000")) === "VALIDATION") tries++;
    expect(tries).toBe(10);
    // Auch ein richtiger Code wird während der Sperre nicht geprüft
    expect(await attempt(GOOD)).toBe("RATE_LIMITED");
    for (let i = 0; i < 60; i++) {
      from(`ip-${i}`, false);
      if ((await attempt("000000")) === "VALIDATION") tries++;
    }
    expect(tries).toBe(30);
  });

  it("vertraute Herkünfte haben ein eigenes Tageslimit für TOTP, Wiederherstellungscodes bleiben möglich", async () => {
    let tries = 0;
    for (let i = 0; i < 60; i++) {
      from(`ip-k${i}`, true);
      if ((await attempt("000000")) === "VALIDATION") tries++;
    }
    expect(tries).toBe(30);
    from("ip-owner", true);
    expect(await attempt(GOOD)).toBe("RATE_LIMITED");
    expect(await attempt(GOOD_RC, "recovery")).toBe("ok");
  });

  it("erfolgreiche Versuche zählen nicht", async () => {
    from("ip-a", false);
    for (let i = 0; i < 20; i++) expect(await attempt(GOOD)).toBe("ok");
  });
});
