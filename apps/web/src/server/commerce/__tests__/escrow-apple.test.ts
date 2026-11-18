import { beforeEach, describe, expect, it, vi } from "vitest";

/** Haltefrist mit Apple-Käufen: keine Stripe-Abfrage mit „apple:…“, Testkäufe zählen nicht. */
const m = vi.hoisted(() => ({
  db: { order: { findMany: vi.fn() }, payment: { updateMany: vi.fn() } },
  seller: vi.fn(),
  transfer: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/server/db", () => ({ db: m.db, Prisma: { sql: () => ({}) } }));
vi.mock("@/server/settings", () => ({ getSetting: async (k: string) => (k === "commerce.payoutHoldDays" ? 14 : 14) }));
vi.mock("../stripe", () => ({ paymentsMode: () => "stripe", sellerSettlement: m.seller, transferSettlement: m.transfer }));

const { heldAmount } = await import("../escrow");
const { REAL_ORDER } = await import("../real-orders");

const now = new Date("2026-11-18T12:00:00Z");
const shop = { id: "sh1", currency: "CHF", stripeAccountId: "acct_1", payoutHoldWaived: false };
const appleOrder = (purchase: { transferId: string | null; transferStatus: string }) => ({
  id: "o1",
  number: "W-1",
  status: "COMPLETED",
  currency: "CHF",
  paidAt: new Date(now.getTime() - 86_400_000),
  shippedAt: null,
  completedAt: new Date(now.getTime() - 86_400_000),
  totalMinor: 1300,
  platformFeeMinor: 360,
  refunds: [],
  payments: [{ status: "SUCCEEDED", provider: "apple", providerRef: "apple:1000", sellerAmountMinor: null, sellerCurrency: null }],
  appStorePurchase: purchase,
});

beforeEach(() => {
  vi.clearAllMocks();
  m.db.payment.updateMany.mockResolvedValue({ count: 1 });
});

describe("heldAmount mit Apple-Käufen", () => {
  it("filtert Testkäufe (REAL_ORDER) aus den Kandidaten", async () => {
    m.db.order.findMany.mockResolvedValue([]);
    await heldAmount(shop, "CHF", now);
    expect(m.db.order.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ AND: [REAL_ORDER] }) }));
  });

  it("andere Saldowährung: Gutschrift der Überweisung statt Stripe-Zahlung mit apple:-Referenz", async () => {
    m.db.order.findMany.mockResolvedValue([appleOrder({ transferId: "tr_1", transferStatus: "SENT" })]);
    m.transfer.mockResolvedValue({ amountMinor: 900, currency: "EUR" });
    const r = await heldAmount(shop, "EUR", now);
    expect(m.seller).not.toHaveBeenCalled();
    expect(m.transfer).toHaveBeenCalledWith("tr_1", "acct_1");
    expect(r).toMatchObject({ heldMinor: 900, unknown: false });
  });

  it("noch nicht überwiesen: liegt nicht im Guthaben, blockiert die Auszahlung nicht", async () => {
    m.db.order.findMany.mockResolvedValue([appleOrder({ transferId: null, transferStatus: "FAILED" })]);
    const r = await heldAmount(shop, "EUR", now);
    expect(m.seller).not.toHaveBeenCalled();
    expect(m.transfer).not.toHaveBeenCalled();
    expect(r).toMatchObject({ heldMinor: 0, unknown: false });
  });
});

describe("heldAmount – Stornos und Obergrenze", () => {
  const cancelled = (payStatus: string) => ({
    ...appleOrder({ transferId: null, transferStatus: "NONE" }),
    status: "CANCELLED",
    completedAt: null,
    appStorePurchase: null,
    payments: [{ status: payStatus, provider: "stripe", providerRef: "pi_1", amountMinor: 1300, sellerAmountMinor: null, sellerCurrency: null }],
  });

  it("storniert, Erstattung noch offen: Shop-Anteil bleibt zurückgehalten", async () => {
    m.db.order.findMany.mockResolvedValue([cancelled("SUCCEEDED")]);
    const r = await heldAmount(shop, "CHF", now);
    expect(r).toMatchObject({ heldMinor: 1300 - 360, unknown: false, orders: 1 });
  });

  it("storniert und vollständig erstattet: nichts zurückhalten", async () => {
    m.db.order.findMany.mockResolvedValue([{ ...cancelled("REFUNDED"), refunds: [{ amountMinor: 1300 }] }]);
    const r = await heldAmount(shop, "CHF", now);
    expect(r).toMatchObject({ heldMinor: 0, orders: 0 });
  });

  it("zu viele Kandidaten: seitenweise geladen, über der Obergrenze gilt alles als zurückgehalten", async () => {
    const page = Array.from({ length: 1000 }, (_, i) => ({ ...appleOrder({ transferId: null, transferStatus: "NONE" }), id: `o${i}` }));
    m.db.order.findMany.mockResolvedValue(page);
    const r = await heldAmount(shop, "CHF", now);
    expect(r.unknown).toBe(true);
    expect(m.db.order.findMany).toHaveBeenCalledWith(expect.objectContaining({ orderBy: { id: "asc" }, take: 1000 }));
    expect(m.db.order.findMany).toHaveBeenCalledTimes(20);
  });
});
