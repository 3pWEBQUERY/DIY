import { beforeEach, describe, expect, it, vi } from "vitest";

/** Auszahlungen je Shop unter Postgres-Sperre: Plan-Lauf prüft nach dem Warten erneut. */
const m = vi.hoisted(() => {
  const tx = { $executeRaw: vi.fn() };
  return {
    tx,
    db: { shop: { findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn() }, $transaction: vi.fn(), $executeRaw: vi.fn(), payoutRecord: { upsert: vi.fn(async () => ({ id: "r1" })), findUnique: vi.fn(async () => null), updateMany: vi.fn(async () => ({ count: 0 })) } },
    payout: vi.fn(),
    balance: vi.fn(),
  };
});

vi.mock("server-only", () => ({}));
vi.mock("@/server/db", () => ({ db: m.db }));
vi.mock("@/server/notifications", () => ({ notify: vi.fn() }));
vi.mock("@/server/ratelimit", () => ({ rateLimit: vi.fn() }));
vi.mock("@/server/settings", () => ({ getSetting: async () => 14 }));
vi.mock("@/server/monitoring", () => ({ captureError: vi.fn() }));
vi.mock("../shops", () => ({ disconnectForeignStripeAccount: vi.fn(), requireOwnShop: vi.fn() }));
vi.mock("../revenue", () => ({ shopRevenue: vi.fn() }));
vi.mock("../escrow", () => ({ heldAmount: async () => ({ heldMinor: 0, unknown: false, nextReleaseAt: null, orders: 0 }), payableFrom: (a: number) => a }));
vi.mock("../stripe", () => ({
  connectedBalance: m.balance,
  connectedPayoutSettings: async () => ({ schedule: { interval: "manual" }, bank: { currency: "CHF" } }),
  createAccountUpdateLink: vi.fn(),
  createConnectedPayout: m.payout,
  isForeignAccountError: () => false,
  isStripeError: () => false,
  listConnectedPayouts: vi.fn(),
  paymentsMode: () => "stripe",
  updatePayoutSchedule: vi.fn(),
}));

const { runScheduledPayouts, migrateStripePayoutSchedules, zurichDayStartBound } = await import("../payouts");

const now = new Date("2026-11-18T10:00:00Z");
const shop = { id: "sh1", ownerId: "u1", status: "ACTIVE", currency: "CHF", stripeAccountId: "acct_1", payoutsEnabled: true, payoutHoldWaived: false, payoutInterval: "daily", payoutWeeklyAnchor: null, payoutMonthlyAnchor: null, lastAutoPayoutAt: null };

beforeEach(() => {
  vi.clearAllMocks();
  m.db.$transaction.mockImplementation(async (f: (t: typeof m.tx) => unknown) => f(m.tx));
  m.db.shop.findMany.mockResolvedValue([shop]);
  m.balance.mockResolvedValue({ available: 5000, pending: 0 });
  m.payout.mockResolvedValue({ id: "po_1", amount: 5000, currency: "chf", status: "pending", arrival_date: null });
});

describe("runScheduledPayouts", () => {
  it("nimmt die Sperre je Shop und zahlt aus", async () => {
    m.db.shop.findUnique.mockResolvedValue({ lastAutoPayoutAt: null });
    expect(await runScheduledPayouts(now)).toBe(1);
    const sql = (m.tx.$executeRaw.mock.calls[0]![0] as TemplateStringsArray).join("?");
    expect(sql).toContain("pg_advisory_xact_lock");
    expect(m.tx.$executeRaw.mock.calls[0]![1]).toBe("payout:sh1");
    expect(m.payout).toHaveBeenCalledTimes(1);
  });

  it("paralleler Lauf hat den Tag inzwischen erledigt: keine zweite Auszahlung", async () => {
    m.db.shop.findUnique.mockResolvedValue({ lastAutoPayoutAt: now });
    expect(await runScheduledPayouts(now)).toBe(0);
    expect(m.balance).not.toHaveBeenCalled();
    expect(m.payout).not.toHaveBeenCalled();
  });
});

describe("Reihum-Auswahl im Worker", () => {
  it("lädt nur heute noch nicht ausgezahlte Shops, älteste Prüfung zuerst, und vermerkt den Versuch", async () => {
    m.db.shop.findUnique.mockResolvedValue({ lastAutoPayoutAt: null });
    await runScheduledPayouts(now);
    const args = m.db.shop.findMany.mock.calls[0]![0] as { where: { AND: unknown[] }; orderBy: unknown };
    expect(args.where.AND).toContainEqual({ OR: [{ lastAutoPayoutAt: null }, { lastAutoPayoutAt: { lt: zurichDayStartBound(now) } }] });
    expect(args.orderBy).toEqual([{ payoutAttemptAt: { sort: "asc", nulls: "first" } }, { id: "asc" }]);
    const stamp = (m.db.$executeRaw.mock.calls[0]![0] as TemplateStringsArray).join("?");
    expect(stamp).toContain('"payoutAttemptAt" = now()');
    expect(m.db.$executeRaw.mock.calls[0]![1]).toEqual(["sh1"]);
  });

  it("Planübernahme: ebenfalls reihum, damit scheiternde Konten andere nicht blockieren", async () => {
    m.db.shop.findMany.mockResolvedValue([{ id: "sh2", stripeAccountId: "acct_2" }]);
    await migrateStripePayoutSchedules();
    expect(m.db.shop.findMany).toHaveBeenCalledWith(expect.objectContaining({ orderBy: [{ payoutAttemptAt: { sort: "asc", nulls: "first" } }, { id: "asc" }] }));
    expect(m.db.$executeRaw.mock.calls[0]![1]).toEqual(["sh2"]);
  });

  it("Tagesgrenze: nie nach der Zürcher Mitternacht (Winter UTC+1, Sommer UTC+2)", () => {
    // Winter: Zürcher Mitternacht = 23:00 UTC des Vortags
    expect(zurichDayStartBound(new Date("2026-11-18T10:00:00Z")).toISOString()).toBe("2026-11-17T23:00:00.000Z");
    // Sommer: Mitternacht = 22:00 UTC; Grenze 23:00 UTC liegt danach (isPayoutDue prüft fein)
    const summer = zurichDayStartBound(new Date("2026-07-01T10:00:00Z"));
    expect(summer.getTime()).toBeGreaterThanOrEqual(new Date("2026-06-30T22:00:00Z").getTime());
    // Kurz nach Mitternacht in Zürich gilt schon der neue Tag
    expect(zurichDayStartBound(new Date("2026-11-17T23:30:00Z")).toISOString()).toBe("2026-11-17T23:00:00.000Z");
  });
});
