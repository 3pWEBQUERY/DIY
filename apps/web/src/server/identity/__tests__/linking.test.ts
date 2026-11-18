import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Verknüpfte Anmeldungen (Pinterest, Apple) als Hintereingang:
 * - Pinterest verbinden nur nach erneuter Bestätigung, gebunden an die Sitzung; Warnung an die Person.
 * - Apple übernimmt ein unbestätigtes Konto → ALLE fremden Verknüpfungen fallen weg.
 * - Apple verknüpft ein bestehendes Konto → Audit + Warnung.
 */
const h = vi.hoisted(() => ({
  user: { passwordHash: null as string | null },
  session: { userId: "u1", createdAt: new Date() },
  links: new Map<string, string>(), // providerAccountId → userId
  calls: [] as { op: string; args: unknown }[],
  warned: [] as { userId: string; provider: string }[],
  audits: [] as string[],
  existing: null as null | { id: string; emailVerifiedAt: Date | null },
}));

vi.mock("@/server/env", () => ({ env: () => ({ SESSION_SECRET: "test-secret-test-secret-test-secret", APP_URL: "https://werkuno.test" }) }));
vi.mock("@/server/audit", () => ({ audit: async (a: { action: string }) => void h.audits.push(a.action) }));
vi.mock("@/server/flags", () => ({ requireFlag: async () => {} }));
vi.mock("@/server/ratelimit", () => ({ limit: async () => ({}), rateLimit: async () => ({}) }));
vi.mock("@/server/auth/session", () => ({ clientIpHash: async () => "ip", createSession: async () => ({ isNewDevice: false, mfaRequired: false, rawToken: "t" }) }));
vi.mock("@/server/auth/new-device", () => ({
  warnLoginLinked: async (userId: string, provider: string) => void h.warned.push({ userId, provider }),
  warnNewDevice: async () => {},
}));
vi.mock("@/server/crypto", async (orig) => ({ ...(await orig<typeof import("@/server/crypto")>()), verifyPassword: async (pw: string, hash: string) => hash === `hash:${pw}` }));
vi.mock("../service", () => ({ isHandleAvailable: async (h: string) => ({ ok: true, handle: h }), sendVerification: async () => {} }));
vi.mock("../apple-token", () => ({ exchangeAppleCode: async () => null, storeAppleRefreshToken: async () => {}, verifyAppleIdentityToken: async () => ({ sub: "apple-1" }) }));

const tx = {
  user: { update: async (args: unknown) => void h.calls.push({ op: "user.update", args }) },
  mfaRecoveryCode: { deleteMany: async () => ({ count: 0 }) },
  verificationToken: { deleteMany: async () => ({ count: 0 }) },
  pushDevice: { deleteMany: async () => ({ count: 0 }) },
  session: { updateMany: async () => ({ count: 0 }) },
  authAccount: { deleteMany: async (args: unknown) => (h.calls.push({ op: "authAccount.deleteMany", args }), { count: 1 }) },
};
vi.mock("@/server/db", () => ({
  db: {
    user: {
      findUniqueOrThrow: async () => h.user,
      findUnique: async () => h.existing,
    },
    session: { findUnique: async () => h.session },
    authAccount: {
      findUnique: async ({ where }: { where: { provider_providerAccountId: { providerAccountId: string } } }) => {
        const userId = h.links.get(where.provider_providerAccountId.providerAccountId);
        return userId ? { userId } : null;
      },
      deleteMany: async (args: unknown) => (h.calls.push({ op: "authAccount.deleteMany", args }), { count: 0 }),
      create: async ({ data }: { data: { userId: string; providerAccountId: string } }) => void h.links.set(data.providerAccountId, data.userId),
    },
    $transaction: async (fn: (t: typeof tx) => unknown) => fn(tx),
  },
}));

const { beginPinterestLink, pinterestLinkGranted, resolvePinterest } = await import("../pinterest");
const { linkAppleClaims, signInWithAppleIdToken } = await import("../apple");

beforeEach(() => {
  h.links.clear();
  h.calls.length = 0;
  h.warned.length = 0;
  h.audits.length = 0;
  h.existing = null;
  h.session = { userId: "u1", createdAt: new Date() };
});

describe("Pinterest verbinden: erneute Bestätigung", () => {
  it("Konto mit Passwort: ohne Passwort kein Start, falsches Passwort wirft, richtiges gibt eine Freigabe", async () => {
    h.user = { passwordHash: "hash:geheim123" };
    await expect(beginPinterestLink("u1", "s1", {})).resolves.toEqual({ ok: false, need: "password" });
    await expect(beginPinterestLink("u1", "s1", { password: "falsch" })).rejects.toMatchObject({ code: "VALIDATION" });
    const r = await beginPinterestLink("u1", "s1", { password: "geheim123" });
    expect(r.ok).toBe(true);
  });
  it("Konto ohne Passwort: nur kurz nach einer frischen Anmeldung", async () => {
    h.user = { passwordHash: null };
    h.session = { userId: "u1", createdAt: new Date(Date.now() - 3 * 3600_000) };
    await expect(beginPinterestLink("u1", "s1")).resolves.toEqual({ ok: false, need: "fresh_login" });
    h.session = { userId: "u1", createdAt: new Date() };
    await expect(beginPinterestLink("u1", "s1")).resolves.toMatchObject({ ok: true });
  });
  it("Freigabe gilt nur für dieselbe Sitzung und läuft ab", async () => {
    h.user = { passwordHash: null };
    const r = await beginPinterestLink("u1", "s1");
    if (!r.ok) throw new Error("erwartet ok");
    expect(pinterestLinkGranted(r.grant, "s1")).toBe(true);
    expect(pinterestLinkGranted(r.grant, "s2")).toBe(false);
    expect(pinterestLinkGranted(r.grant, "s1", Date.now() + 11 * 60_000)).toBe(false);
    // Altes Cookie aus der Zeit vor der Bestätigung („1“) bzw. gefälschte Signatur
    expect(pinterestLinkGranted("1", "s1")).toBe(false);
    expect(pinterestLinkGranted(`${Date.now() + 60_000}.abc`, "s1")).toBe(false);
  });
  it("Verknüpfen warnt die Person; schon verknüpft → keine neue Warnung", async () => {
    await expect(resolvePinterest({ sub: "p1", username: "x" }, "u1")).resolves.toEqual({ kind: "linked", userId: "u1" });
    expect(h.warned).toEqual([{ userId: "u1", provider: "Pinterest" }]);
    expect(h.audits).toContain("account.pinterest_linked");
    await resolvePinterest({ sub: "p1", username: "x" }, "u1");
    expect(h.warned).toHaveLength(1);
    await expect(resolvePinterest({ sub: "p1", username: "x" }, "u2")).resolves.toEqual({ kind: "taken" });
  });
});

describe("Apple", () => {
  it("unbestätigtes Konto übernehmen: alle Verknüpfungen (auch Pinterest) werden gelöst", async () => {
    h.existing = { id: "u9", emailVerifiedAt: null };
    await linkAppleClaims({ sub: "apple-1", email: "a@werkuno.test", email_verified: true }, null);
    const del = h.calls.find((c) => c.op === "authAccount.deleteMany")!.args as { where: Record<string, unknown> };
    expect(del.where).toEqual({ userId: "u9" });
    expect(h.audits).toEqual(["account.apple_claimed_unverified", "account.apple_linked"]);
    expect(h.warned).toEqual([{ userId: "u9", provider: "Apple" }]);
  });
  it("bestätigtes Konto verknüpfen: Audit und Warnung", async () => {
    h.existing = { id: "u8", emailVerifiedAt: new Date() };
    await expect(linkAppleClaims({ sub: "apple-2", email: "b@werkuno.test", email_verified: "true" }, null)).resolves.toEqual({ userId: "u8", isNew: false });
    expect(h.calls.some((c) => c.op === "authAccount.deleteMany")).toBe(false);
    expect(h.audits).toEqual(["account.apple_linked"]);
    expect(h.warned).toEqual([{ userId: "u8", provider: "Apple" }]);
  });
  it("native Anmeldung ohne Nonce → 400", async () => {
    process.env.APPLE_IOS_CLIENT_ID = "ch.werkuno.app";
    await expect(signInWithAppleIdToken("x.y.z", null, {})).rejects.toMatchObject({ code: "VALIDATION", status: 400 });
    await expect(signInWithAppleIdToken("x.y.z", null, { nonce: "" })).rejects.toMatchObject({ status: 400 });
  });
});
