import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Passwort-Reset eines unbestätigten Kontos: Der Link beweist den Zugriff aufs Postfach. Was jemand
 * anderes vorab am Konto angelegt hat (z. B. ein verbundenes Pinterest-Konto), fällt weg.
 */
const h = vi.hoisted(() => ({
  verified: null as Date | null,
  calls: [] as { op: string; args: unknown }[],
}));
vi.mock("next/server", () => ({ after: () => {} }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/server/mail", () => ({ sendMail: async () => ({ delivered: true }) }));
vi.mock("@/server/env", () => ({ env: () => ({ APP_URL: "https://werkuno.test" }) }));
vi.mock("@/server/auth/session", () => ({ clientIpHash: async () => "ip", createSession: async () => ({ mfaRequired: false }) }));
vi.mock("@/server/ratelimit", () => ({ limit: async () => ({}), rateLimit: async () => ({}), isLimited: async () => false, releaseLimit: async () => {} }));
vi.mock("@/server/audit", () => ({ audit: async () => ({}) }));
vi.mock("@/server/flags", () => ({ requireFlag: async () => {} }));
vi.mock("@/server/account/deletion", () => ({ assertAccountDeletable: async () => {} }));
vi.mock("@/server/auth/security", () => ({ securityReset: async (userId: string) => (h.calls.push({ op: "securityReset", args: userId }), { revokedSessions: 1, removedTokens: 0 }) }));
vi.mock("@/server/crypto", async (orig) => ({ ...(await orig<typeof import("@/server/crypto")>()), hashPassword: async (pw: string) => `hash:${pw}` }));

const rec = (op: string) => async (args: unknown) => (h.calls.push({ op, args }), { count: 1 });
const tx = {
  verificationToken: { updateMany: async () => ({ count: 1 }), deleteMany: rec("verificationToken.deleteMany") },
  user: { findUniqueOrThrow: async () => ({ emailVerifiedAt: h.verified }), update: rec("user.update") },
  mfaRecoveryCode: { deleteMany: rec("mfaRecoveryCode.deleteMany") },
  authAccount: { deleteMany: rec("authAccount.deleteMany") },
  pushDevice: { deleteMany: rec("pushDevice.deleteMany") },
};
vi.mock("@/server/db", () => ({
  db: {
    verificationToken: { findUnique: async () => ({ id: "tok", userId: "u1", purpose: "PASSWORD_RESET", usedAt: null, expiresAt: new Date(Date.now() + 60_000) }) },
    $transaction: async (fn: (t: typeof tx) => unknown) => fn(tx),
  },
}));

const { resetPassword } = await import("../service");

beforeEach(() => {
  h.calls.length = 0;
});

describe("resetPassword", () => {
  it("unbestätigtes Konto: Adresse gilt als bestätigt, fremde Verknüpfungen und 2FA werden entfernt", async () => {
    h.verified = null;
    await resetPassword("raw", "ganz-neues-Passwort-1");
    const upd = h.calls.find((c) => c.op === "user.update")!.args as { data: Record<string, unknown> };
    expect(upd.data.passwordHash).toBe("hash:ganz-neues-Passwort-1");
    expect(upd.data.emailVerifiedAt).toBeInstanceOf(Date);
    expect(upd.data.totpSecret).toBeNull();
    expect(h.calls.find((c) => c.op === "authAccount.deleteMany")!.args).toEqual({ where: { userId: "u1" } });
    expect(h.calls.some((c) => c.op === "pushDevice.deleteMany")).toBe(true);
    // Der eingelöste Link selbst bleibt (als benutzt) erhalten
    expect(h.calls.find((c) => c.op === "verificationToken.deleteMany")!.args).toEqual({ where: { userId: "u1", id: { not: "tok" } } });
    expect(h.calls.some((c) => c.op === "securityReset")).toBe(true);
  });
  it("bestätigtes Konto: nur das Passwort, Verknüpfungen bleiben", async () => {
    h.verified = new Date();
    await resetPassword("raw", "ganz-neues-Passwort-1");
    const upd = h.calls.find((c) => c.op === "user.update")!.args as { data: Record<string, unknown> };
    expect(upd.data).toEqual({ passwordHash: "hash:ganz-neues-Passwort-1" });
    expect(h.calls.some((c) => c.op === "authAccount.deleteMany")).toBe(false);
    expect(h.calls.some((c) => c.op === "securityReset")).toBe(true);
  });
});
