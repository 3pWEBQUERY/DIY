import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * A-12: Passwort-Reset antwortet für vorhandene und unbekannte Adressen gleich schnell (Token + Mail nach der Antwort).
 * A-13: E-Mail-Bestätigung löst den Link nur einmal ein (bedingtes updateMany statt update).
 */
const afterTasks: (() => Promise<unknown>)[] = [];
vi.mock("next/server", () => ({ after: (fn: () => Promise<unknown>) => void afterTasks.push(fn) }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
const mails: string[] = [];
let mailDelay = 0;
vi.mock("@/server/mail", () => ({
  sendMail: async (to: string) => {
    await new Promise((r) => setTimeout(r, mailDelay));
    mails.push(to);
    return { delivered: true };
  },
}));
vi.mock("@/server/env", () => ({ env: () => ({ APP_URL: "https://werkuno.test" }) }));
vi.mock("@/server/auth/session", () => ({ clientIpHash: async () => "ip", createSession: async () => ({}) }));
vi.mock("@/server/ratelimit", () => ({ limit: async () => ({}), rateLimit: async () => ({}), isLimited: async () => false, releaseLimit: async () => {} }));
vi.mock("@/server/audit", () => ({ audit: async () => ({}) }));
vi.mock("@/server/flags", () => ({ requireFlag: async () => {} }));
vi.mock("@/server/account/deletion", () => ({ assertAccountDeletable: async () => {} }));

const users: Record<string, { id: string; email: string; status: string }> = { "da@werkuno.test": { id: "u1", email: "da@werkuno.test", status: "ACTIVE" } };
const tokens = new Map<string, { id: string; userId: string; purpose: string; usedAt: Date | null; expiresAt: Date }>();
const verified: string[] = [];
const tx = {
  verificationToken: {
    updateMany: async ({ where, data }: { where: { id: string; usedAt: null; expiresAt: { gt: Date } }; data: { usedAt: Date } }) => {
      const t = tokens.get(where.id);
      // Wie Postgres: erst prüfen, dann schreiben – ein zweiter Aufruf sieht usedAt gesetzt
      if (!t || t.usedAt || t.expiresAt <= where.expiresAt.gt) return { count: 0 };
      t.usedAt = data.usedAt;
      return { count: 1 };
    },
  },
  user: { update: async ({ where }: { where: { id: string } }) => void verified.push(where.id) },
};
vi.mock("@/server/db", () => ({
  db: {
    user: { findUnique: async ({ where }: { where: { email: string } }) => users[where.email] ?? null },
    verificationToken: {
      findUnique: async ({ where }: { where: { id: string } }) => (tokens.has(where.id) ? { ...tokens.get(where.id)! } : null),
      create: async ({ data }: { data: { id: string; userId: string; purpose: string; expiresAt: Date } }) => tokens.set(data.id, { ...data, usedAt: null }),
    },
    $transaction: async (fn: (t: typeof tx) => unknown) => fn(tx),
  },
}));

const { requestPasswordReset, verifyEmail } = await import("../service");
const { sha256 } = await import("@/server/crypto");

beforeEach(() => {
  afterTasks.length = 0;
  mails.length = 0;
  tokens.clear();
  verified.length = 0;
});

describe("requestPasswordReset (A-12)", () => {
  it("vorhandene Adresse: Antwort wartet nicht auf Token und Mail", async () => {
    mailDelay = 300;
    const t0 = Date.now();
    await requestPasswordReset("DA@werkuno.test");
    expect(Date.now() - t0).toBeLessThan(250);
    expect(tokens.size).toBe(0);
    expect(mails).toHaveLength(0);
    expect(afterTasks).toHaveLength(1);
    await afterTasks[0]!();
    expect(tokens.size).toBe(1);
    expect(mails).toEqual(["da@werkuno.test"]);
  });
  it("unbekannte Adresse: derselbe Ablauf, aber keine Mail", async () => {
    await requestPasswordReset("niemand@werkuno.test");
    expect(afterTasks).toHaveLength(1);
    await afterTasks[0]!();
    expect(tokens.size).toBe(0);
    expect(mails).toHaveLength(0);
  });
});

describe("verifyEmail (A-13)", () => {
  it("gleichzeitig eingelöster Link bestätigt nur einmal", async () => {
    tokens.set(sha256("raw"), { id: sha256("raw"), userId: "u1", purpose: "EMAIL_VERIFY", usedAt: null, expiresAt: new Date(Date.now() + 60_000) });
    const r = await Promise.all([verifyEmail("raw"), verifyEmail("raw")]);
    expect(r.sort()).toEqual([false, true]);
    expect(verified).toEqual(["u1"]);
    expect(await verifyEmail("raw")).toBe(false);
  });
  it("abgelaufene und fremde Links zählen nicht", async () => {
    tokens.set(sha256("old"), { id: sha256("old"), userId: "u1", purpose: "EMAIL_VERIFY", usedAt: null, expiresAt: new Date(Date.now() - 1000) });
    tokens.set(sha256("pw"), { id: sha256("pw"), userId: "u1", purpose: "PASSWORD_RESET", usedAt: null, expiresAt: new Date(Date.now() + 60_000) });
    expect(await verifyEmail("old")).toBe(false);
    expect(await verifyEmail("pw")).toBe(false);
    expect(verified).toEqual([]);
  });
});
