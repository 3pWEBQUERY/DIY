import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Zahlungsverbuchung ohne Datenbank und Stripe: verlorener Teil-Streitfall, wiederholt scheiternde
 * Webhooks (Fehlerüberwachung).
 */
const m = vi.hoisted(() => {
  const fn = () => vi.fn();
  return {
    db: {
      webhookEvent: { findUnique: fn(), create: fn(), update: fn() },
      payment: { findUnique: fn() },
      order: { findUnique: fn() },
      orderEvent: { create: fn() },
      $transaction: fn(),
    },
    capture: vi.fn(),
    reverse: vi.fn(),
  };
});

vi.mock("server-only", () => ({}));
vi.mock("@/server/db", () => ({ db: m.db }));
vi.mock("@/server/events", () => ({ emit: vi.fn() }));
vi.mock("@/server/audit", () => ({ audit: vi.fn() }));
vi.mock("@/server/notifications", () => ({ notify: vi.fn() }));
vi.mock("@/server/monitoring", () => ({ captureError: m.capture }));
vi.mock("../reservations", () => ({ cancelPendingOrderTx: vi.fn() }));
vi.mock("../shops", () => ({ applyAccountStatus: vi.fn() }));
vi.mock("../inventory", () => ({ lockOrder: vi.fn(), commitSale: vi.fn(), refreshSoldOut: vi.fn(), restock: vi.fn(), retakeSale: vi.fn(), OutOfStockError: class extends Error {} }));
vi.mock("../stripe", () => ({
  retrieveConnectStatus: vi.fn(),
  createRefund: vi.fn(),
  expireCheckoutSession: vi.fn(),
  isStripeError: () => false,
  listRefunds: vi.fn(),
  reverseTransferForDispute: m.reverse,
}));

const { markDisputeClosed, processStripeWebhook, WEBHOOK_ALERT_ATTEMPTS } = await import("../payments");

function disputeTx(paymentAmount: number) {
  const fn = () => vi.fn().mockResolvedValue({ count: 1 });
  return {
    payment: { findUnique: vi.fn().mockResolvedValue({ id: "pay1", orderId: "o1", status: "DISPUTED", amountMinor: paymentAmount, provider: "stripe" }), update: fn() },
    order: { findUniqueOrThrow: vi.fn().mockResolvedValue({ id: "o1", number: "W-1", status: "PROBLEM", currency: "CHF", shopId: "sh1", restockedAt: null }), update: fn(), updateMany: fn() },
    refund: { findMany: vi.fn().mockResolvedValue([]), create: fn() },
    orderItem: { findMany: vi.fn().mockResolvedValue([{ id: "i1", isDigital: true, productId: "pr1", variantId: null, quantity: 1 }]) },
    shop: { findUniqueOrThrow: vi.fn().mockResolvedValue({ ownerId: "s1" }), update: fn() },
    shipment: { count: vi.fn().mockResolvedValue(0) },
    digitalEntitlement: { updateMany: fn() },
    orderEvent: { create: fn() },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  m.reverse.mockResolvedValue({ reversedMinor: 0, reason: "none" });
  m.db.order.findUnique.mockResolvedValue({ status: "PROBLEM", currency: "CHF" });
});

describe("Streitfall verloren", () => {
  it("Teilverlust: Bestellung bleibt bestehen, Lizenzen bleiben gültig", async () => {
    const tx = disputeTx(5000);
    m.db.$transaction.mockImplementation(async (f: (t: typeof tx) => unknown) => f(tx));
    await markDisputeClosed("pi_1", { disputeId: "dp_1", status: "lost", amountMinor: 2000 });
    expect(tx.payment.update).toHaveBeenCalledWith({ where: { id: "pay1" }, data: { status: "PARTIALLY_REFUNDED" } });
    expect(tx.order.update).not.toHaveBeenCalled();
    expect(tx.digitalEntitlement.updateMany).not.toHaveBeenCalled();
    expect(tx.orderEvent.create).toHaveBeenCalledWith({ data: expect.objectContaining({ from: "PROBLEM", to: "PROBLEM" }) });
  });

  it("Vollverlust: erstattet, Lizenzen widerrufen", async () => {
    const tx = disputeTx(5000);
    m.db.$transaction.mockImplementation(async (f: (t: typeof tx) => unknown) => f(tx));
    await markDisputeClosed("pi_1", { disputeId: "dp_1", status: "lost", amountMinor: 5000 });
    expect(tx.payment.update).toHaveBeenCalledWith({ where: { id: "pay1" }, data: { status: "REFUNDED" } });
    expect(tx.order.update).toHaveBeenCalledWith({ where: { id: "o1" }, data: { status: "REFUNDED" } });
    expect(tx.digitalEntitlement.updateMany).toHaveBeenCalled();
  });
});

describe("Webhook scheitert wiederholt", () => {
  const event = { id: "evt_1", type: "charge.refunded", data: { object: { payment_intent: "pi_1" } } } as never;

  beforeEach(() => {
    m.db.webhookEvent.findUnique.mockResolvedValue({ processedAt: null });
    m.db.payment.findUnique.mockRejectedValue(new Error("db weg"));
  });

  it("meldet ab der Schwelle in der Fehlerüberwachung", async () => {
    m.db.webhookEvent.update.mockResolvedValue({ attempts: WEBHOOK_ALERT_ATTEMPTS });
    expect((await processStripeWebhook(event)).status).toBe(500);
    expect(m.capture).toHaveBeenCalledWith(expect.any(Error), expect.objectContaining({ path: "/api/webhooks/stripe", meta: expect.objectContaining({ eventId: "evt_1" }) }));
  });

  it("einzelne Fehlversuche bleiben still (Stripe stellt erneut zu)", async () => {
    m.db.webhookEvent.update.mockResolvedValue({ attempts: 1 });
    expect((await processStripeWebhook(event)).status).toBe(500);
    expect(m.capture).not.toHaveBeenCalled();
  });
});
