import { beforeEach, describe, expect, it, vi } from "vitest";

/** Reservierungs-Job: bezahlte, aber (Webhook verpasst) unverbuchte Checkout-Sessions werden verbucht. */
const m = vi.hoisted(() => ({
  db: { order: { findMany: vi.fn() }, $transaction: vi.fn() },
  retrieve: vi.fn(),
  paid: vi.fn(),
  failed: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/server/db", () => ({ db: m.db }));
vi.mock("@/server/events", () => ({ emit: vi.fn() }));
vi.mock("../inventory", () => ({ lockOrder: vi.fn(), release: vi.fn() }));
vi.mock("../stripe", () => ({ paymentsMode: () => "stripe", retrieveCheckoutSession: m.retrieve, isCompletedSessionPaymentFailed: m.failed, expireCheckoutSession: vi.fn() }));
vi.mock("../payments", () => ({ markOrderPaid: m.paid }));

const { releaseExpiredReservations } = await import("../reservations");

beforeEach(() => {
  vi.clearAllMocks();
  m.db.order.findMany.mockResolvedValue([{ id: "o1", checkoutSessionId: "cs_1" }]);
});

describe("Abgelaufene Reservierung mit bezahlter Session", () => {
  it("verbucht die Zahlung mit den Daten von Stripe statt sie zu überspringen", async () => {
    m.retrieve.mockResolvedValue({ id: "cs_1", status: "complete", payment_status: "paid", payment_intent: "pi_1", amount_total: 4200, currency: "chf" });
    m.paid.mockResolvedValue("paid");
    expect(await releaseExpiredReservations()).toMatchObject({ paid: 1, released: 0 });
    expect(m.paid).toHaveBeenCalledWith("o1", { provider: "stripe", providerRef: "pi_1", amountMinor: 4200, currency: "chf" });
    expect(m.db.$transaction).not.toHaveBeenCalled();
  });

  it("noch in Bearbeitung (unbezahlt, nicht gescheitert): weiter warten", async () => {
    m.retrieve.mockResolvedValue({ id: "cs_1", status: "complete", payment_status: "unpaid", payment_intent: "pi_1" });
    m.failed.mockResolvedValue(false);
    expect(await releaseExpiredReservations()).toMatchObject({ skipped: 1, paid: 0 });
    expect(m.paid).not.toHaveBeenCalled();
  });
});
