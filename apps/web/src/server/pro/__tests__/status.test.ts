import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/server/db", () => ({ db: {} }));
vi.mock("@/server/notifications", () => ({ notify: vi.fn() }));
vi.mock("@/server/commerce/stripe", () => ({ appUrl: (p: string) => p, isStripeError: () => false, paymentsMode: () => "simulated", stripe: () => ({}) }));

const { isActiveSubscription } = await import("../service");
const now = new Date("2026-11-10T12:00:00Z");
const later = new Date("2026-12-10T12:00:00Z");
const earlier = new Date("2026-11-01T12:00:00Z");

describe("Creator Pro – ist das Abo aktiv?", () => {
  it("Stripe: aktiv, Probezeit und Mahnphase zählen, gekündigt/unvollständig nicht", () => {
    for (const status of ["active", "trialing", "past_due"]) expect(isActiveSubscription({ status, provider: "stripe", currentPeriodEnd: later }, now)).toBe(true);
    for (const status of ["canceled", "incomplete", "incomplete_expired", "unpaid"]) expect(isActiveSubscription({ status, provider: "stripe", currentPeriodEnd: later }, now)).toBe(false);
  });
  it("Geschenkt: unbefristet oder bis zum Ablaufdatum", () => {
    expect(isActiveSubscription({ status: "active", provider: "comp", currentPeriodEnd: null }, now)).toBe(true);
    expect(isActiveSubscription({ status: "active", provider: "comp", currentPeriodEnd: later }, now)).toBe(true);
    expect(isActiveSubscription({ status: "active", provider: "comp", currentPeriodEnd: earlier }, now)).toBe(false);
    expect(isActiveSubscription({ status: "canceled", provider: "comp", currentPeriodEnd: null }, now)).toBe(false);
  });
  it("Kein Abo", () => {
    expect(isActiveSubscription(null, now)).toBe(false);
  });
});
