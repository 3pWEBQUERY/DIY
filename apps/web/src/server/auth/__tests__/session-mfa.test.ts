import { describe, expect, it, vi } from "vitest";

// In-Memory-Ersatz: ein Konto (mit/ohne Passwort) und Sitzungen; Zugriffe werden protokolliert
const state = {
  user: { passwordHash: null as string | null },
  session: { userId: "u1", createdAt: new Date() },
  calls: [] as { op: string; args: unknown }[],
};
const db = {
  user: { findUniqueOrThrow: async () => state.user, findUnique: async () => ({ adultConfirmedAt: null }) },
  session: {
    findUnique: async () => state.session,
    updateMany: async (args: unknown) => (state.calls.push({ op: "session.updateMany", args }), { count: 2 }),
  },
  verificationToken: { deleteMany: async (args: unknown) => (state.calls.push({ op: "verificationToken.deleteMany", args }), { count: 1 }) },
  authAccount: { findUnique: async () => null },
};
vi.mock("@/server/db", () => ({ db }));
vi.mock("@/server/auth/session", () => ({ requireUser: async () => null }));
vi.mock("@/server/ratelimit", () => ({ rateLimit: async () => ({ remaining: 1 }) }));
vi.mock("@/server/crypto", () => ({ verifyPassword: async (pw: string, hash: string) => hash === `hash:${pw}` }));

const { hasRole, mfaSatisfied } = await import("../../authz");
const { assertReauthenticated, isFreshLogin } = await import("../reauth");
const { securityReset } = await import("../security");
const { requireAdult } = await import("../adult");

describe("Zwei-Faktor je Sitzung (hasRole)", () => {
  const enabled = new Date("2026-11-01");
  it("Moderationsrechte nur, wenn DIESE Sitzung den Code bestätigt hat", () => {
    expect(hasRole({ role: "PLATFORM_MODERATOR", totpEnabledAt: enabled, mfaVerified: true }, "PLATFORM_MODERATOR")).toBe(true);
    // Alte Sitzung: 2FA wurde später aktiviert, Code hier nie eingegeben
    expect(hasRole({ role: "PLATFORM_MODERATOR", totpEnabledAt: enabled, mfaVerified: false }, "PLATFORM_MODERATOR")).toBe(false);
    expect(hasRole({ role: "ADMIN", totpEnabledAt: null, mfaVerified: false }, "PLATFORM_MODERATOR")).toBe(false);
  });
  it("Mitgliedsrechte brauchen keinen zweiten Faktor", () => {
    expect(hasRole({ role: "ADMIN", totpEnabledAt: null, mfaVerified: false }, "MEMBER")).toBe(true);
  });
  it("Objekte ohne Sitzungsbezug werden wie bisher bewertet", () => {
    expect(hasRole({ role: "ADMIN", totpEnabledAt: enabled }, "ADMIN")).toBe(true);
    expect(hasRole({ role: "ADMIN" }, "ADMIN")).toBe(true);
    expect(mfaSatisfied({ totpEnabledAt: enabled })).toBe(true);
    expect(mfaSatisfied({ totpEnabledAt: null })).toBe(false);
  });
});

describe("Erneute Bestätigung (assertReauthenticated)", () => {
  it("mit Passwort: nur das richtige Passwort zählt", async () => {
    state.user = { passwordHash: "hash:geheim123" };
    await expect(assertReauthenticated("u1", "s1", { password: "geheim123" })).resolves.toBe("password");
    await expect(assertReauthenticated("u1", "s1", { password: "falsch" })).rejects.toMatchObject({ code: "VALIDATION", fields: { password: "Passwort nicht korrekt" } });
    // Eine frische Sitzung ersetzt das Passwort NICHT
    state.session = { userId: "u1", createdAt: new Date() };
    await expect(assertReauthenticated("u1", "s1", {})).rejects.toMatchObject({ code: "VALIDATION" });
  });
  it("ohne Passwort: nur kurz nach einer frischen Anmeldung", async () => {
    state.user = { passwordHash: null };
    state.session = { userId: "u1", createdAt: new Date(Date.now() - 2 * 60_000) };
    await expect(assertReauthenticated("u1", "s1", {})).resolves.toBe("recent");
    state.session = { userId: "u1", createdAt: new Date(Date.now() - 3 * 86400_000) };
    await expect(assertReauthenticated("u1", "s1", {})).rejects.toMatchObject({ code: "FORBIDDEN", fields: { reauth: "apple" } });
    // Fremde Sitzung zählt nie
    state.session = { userId: "u2", createdAt: new Date() };
    await expect(assertReauthenticated("u1", "s1", {})).rejects.toMatchObject({ fields: { reauth: "apple" } });
  });
  it("isFreshLogin: 10-Minuten-Fenster", () => {
    const now = Date.now();
    expect(isFreshLogin(new Date(now - 9 * 60_000), now)).toBe(true);
    expect(isFreshLogin(new Date(now - 11 * 60_000), now)).toBe(false);
  });
});

describe("securityReset", () => {
  it("beendet andere Sitzungen und entwertet Reset- und E-Mail-Wechsel-Links", async () => {
    state.calls = [];
    const r = await securityReset("u1", { keepSessionId: "keep", exceptTokenId: "used" });
    expect(r).toEqual({ revokedSessions: 2, removedTokens: 1 });
    const s = state.calls.find((c) => c.op === "session.updateMany")!.args as { where: Record<string, unknown> };
    expect(s.where).toMatchObject({ userId: "u1", revokedAt: null, id: { not: "keep" } });
    const t = state.calls.find((c) => c.op === "verificationToken.deleteMany")!.args as { where: Record<string, unknown> };
    expect(t.where).toMatchObject({ userId: "u1", usedAt: null, purpose: { in: ["PASSWORD_RESET", "EMAIL_CHANGE"] }, id: { not: "used" } });
  });
  it("ohne keepSessionId werden alle Sitzungen beendet", async () => {
    state.calls = [];
    await securityReset("u1");
    const s = state.calls.find((c) => c.op === "session.updateMany")!.args as { where: Record<string, unknown> };
    expect(s.where).not.toHaveProperty("id");
  });
});

describe("requireAdult", () => {
  it("ohne Altersbestätigung → FORBIDDEN mit fields.adult", async () => {
    await expect(requireAdult({ id: "u1", adultConfirmedAt: null })).rejects.toMatchObject({ code: "FORBIDDEN", fields: { adult: "Erforderlich" } });
    await expect(requireAdult({ id: "u1" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(requireAdult({ id: "u1", adultConfirmedAt: new Date() })).resolves.toBeUndefined();
  });
});
