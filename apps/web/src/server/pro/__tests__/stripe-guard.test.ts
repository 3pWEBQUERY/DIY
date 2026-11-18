import { beforeEach, describe, expect, it, vi } from "vitest";

/** Stripe-Ereignisse dürfen ein laufendes App-Store-Abo bzw. einen geschenkten Zugang nicht überschreiben. */
const m = vi.hoisted(() => ({
  db: { subscription: { findUnique: vi.fn(), findFirst: vi.fn(), upsert: vi.fn() }, userProfile: { updateMany: vi.fn() } },
  capture: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/server/db", () => ({ db: m.db }));
vi.mock("@/server/notifications", () => ({ notify: vi.fn().mockResolvedValue(null) }));
vi.mock("@/server/monitoring", () => ({ captureError: m.capture }));
vi.mock("@/server/commerce/stripe", () => ({ appUrl: (p: string) => p, isStripeError: () => false, paymentsMode: () => "stripe", stripe: () => ({}), stripeKeyMode: () => "test" }));

const { syncStripeSubscription } = await import("../service");

const later = new Date(Date.now() + 20 * 86_400_000);
const sub = (status: string) =>
  ({ id: "sub_2", status, customer: "cus_1", metadata: { userId: "u1" }, cancel_at_period_end: false, items: { data: [{ current_period_end: Math.floor(later.getTime() / 1000), price: { unit_amount: 900, currency: "chf", recurring: { interval: "month" } } }] } }) as never;
const row = (over: Record<string, unknown>) => ({ id: "s1", userId: "u1", status: "active", interval: "month", currentPeriodEnd: later, cancelAtPeriodEnd: false, priceMinor: 900, currency: "CHF", subscriptionId: null, customerId: "cus_1", ...over });

beforeEach(() => {
  vi.clearAllMocks();
  m.db.subscription.upsert.mockImplementation(async (a: { create: Record<string, unknown> }) => a.create);
});

function existing(r: Record<string, unknown>) {
  // Kein Treffer über subscriptionId, aber über metadata.userId
  m.db.subscription.findUnique.mockImplementation(async (a: { where: { subscriptionId?: string; userId?: string } }) => (a.where.userId ? r : null));
}

describe("syncStripeSubscription – fremder Anbieter", () => {
  it("beendetes Stripe-Abo überschreibt laufendes Apple-Abo nicht", async () => {
    existing(row({ provider: "apple" }));
    await syncStripeSubscription(sub("canceled"));
    expect(m.db.subscription.upsert).not.toHaveBeenCalled();
    expect(m.capture).not.toHaveBeenCalled();
  });

  it("beendetes Stripe-Abo überschreibt geschenkten Zugang nicht", async () => {
    existing(row({ provider: "comp", interval: "comp", currentPeriodEnd: null }));
    await syncStripeSubscription(sub("incomplete_expired"));
    expect(m.db.subscription.upsert).not.toHaveBeenCalled();
  });

  it("laufendes Stripe-Abo neben laufendem Apple-Abo: Apple bleibt, Doppelabo wird gemeldet", async () => {
    existing(row({ provider: "apple" }));
    await syncStripeSubscription(sub("active"));
    expect(m.db.subscription.upsert).not.toHaveBeenCalled();
    expect(m.capture).toHaveBeenCalledWith(expect.any(Error), expect.objectContaining({ path: "pro.duplicate_subscription", meta: expect.objectContaining({ duplicate: "sub_2" }) }));
  });

  it("laufendes Stripe-Abo ersetzt einen geschenkten Zugang (bewusst abgeschlossen)", async () => {
    existing(row({ provider: "comp", interval: "comp", currentPeriodEnd: null }));
    await syncStripeSubscription(sub("active"));
    expect(m.db.subscription.upsert).toHaveBeenCalledWith(expect.objectContaining({ update: expect.objectContaining({ provider: "stripe", subscriptionId: "sub_2", status: "active" }) }));
  });

  it("abgelaufenes Apple-Abo: Stripe-Stand wird übernommen", async () => {
    existing(row({ provider: "apple", status: "expired", currentPeriodEnd: new Date(Date.now() - 86_400_000) }));
    await syncStripeSubscription(sub("canceled"));
    expect(m.db.subscription.upsert).toHaveBeenCalled();
  });
});
