import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/server/db", () => ({ db: {} }));
vi.mock("@/server/env", () => ({ env: () => ({ SESSION_SECRET: "test-secret-0123456789", APPLE_IAP_BUNDLE_ID: "ch.werkuno.app" }) }));
vi.mock("@/server/settings", () => ({ getSetting: async () => 1500 }));
vi.mock("@/server/notifications", () => ({ notify: async () => {} }));
vi.mock("@/server/audit", () => ({ audit: async () => {} }));
vi.mock("@/server/monitoring", () => ({ captureError: async () => null }));
vi.mock("@/server/visibility", () => ({ isBlockedBetween: async () => false }));
vi.mock("@/server/ratelimit", () => ({ rateLimit: async () => {} }));
vi.mock("@/server/commerce/stripe", () => ({ paymentsMode: () => "simulated", stripe: () => ({}), appUrl: (p: string) => p, isStripeError: () => false, createSellerTransfer: async () => ({}), reverseSellerTransfer: async () => ({}) }));
vi.mock("@/server/commerce/appstore-verify", () => ({ verifyAppStoreJws: () => ({}), AppStoreVerificationError: class extends Error {} }));

const { isSupportActive, splitAmount, supportAccountToken } = await import("../service");
const { SUPPORT_APPLE_PRODUCTS, supportPlanSchema, supportTierForAppleProduct } = await import("@werkraum/shared");

describe("Unterstützer-Abo", () => {
  const now = new Date("2026-11-20T12:00:00Z");
  const later = new Date("2026-12-01T00:00:00Z");
  const earlier = new Date("2026-11-19T00:00:00Z");

  it("aktiv: Stripe nach Status (mit kurzer Kulanz), App/Test bis zum Ende des bezahlten Monats", () => {
    expect(isSupportActive({ status: "active", provider: "stripe", currentPeriodEnd: later }, now)).toBe(true);
    expect(isSupportActive({ status: "active", provider: "stripe", currentPeriodEnd: null }, now)).toBe(true);
    expect(isSupportActive({ status: "active", provider: "stripe", currentPeriodEnd: earlier }, now)).toBe(true); // Kulanz 2 Tage
    expect(isSupportActive({ status: "active", provider: "stripe", currentPeriodEnd: new Date("2026-11-10T00:00:00Z") }, now)).toBe(false);
    expect(isSupportActive({ status: "past_due", provider: "stripe", currentPeriodEnd: later }, now)).toBe(true);
    expect(isSupportActive({ status: "canceled", provider: "stripe", currentPeriodEnd: later }, now)).toBe(false);
    expect(isSupportActive({ status: "active", provider: "apple", currentPeriodEnd: later }, now)).toBe(true);
    expect(isSupportActive({ status: "active", provider: "apple", currentPeriodEnd: earlier }, now)).toBe(false);
    expect(isSupportActive({ status: "active", provider: "apple", currentPeriodEnd: null }, now)).toBe(false);
    expect(isSupportActive(null, now)).toBe(false);
  });

  it("Aufteilung: Werkuno-Anteil gerundet, Rest an den Creator", () => {
    expect(splitAmount(500, 1500)).toEqual({ platformFeeMinor: 75, creatorNetMinor: 425 });
    expect(splitAmount(300, 1500)).toEqual({ platformFeeMinor: 45, creatorNetMinor: 255 });
    expect(splitAmount(1000, 0)).toEqual({ platformFeeMinor: 0, creatorNetMinor: 1000 });
  });

  it("Apple-Produkte je Stufe und Konto-Token je Person und Creator", () => {
    expect(supportTierForAppleProduct(SUPPORT_APPLE_PRODUCTS[500])).toBe(500);
    expect(supportTierForAppleProduct("ch.werkuno.app.pro.monthly")).toBeNull();
    const a = supportAccountToken("user1", "creatorA");
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(supportAccountToken("user1", "creatorA")).toBe(a);
    expect(supportAccountToken("user1", "creatorB")).not.toBe(a);
    expect(supportAccountToken("user2", "creatorA")).not.toBe(a);
  });

  it("Plan: nur feste Stufen, Beschreibung begrenzt", () => {
    expect(supportPlanSchema.safeParse({ enabled: true, priceMinor: 500, perks: "x" }).success).toBe(true);
    expect(supportPlanSchema.safeParse({ enabled: true, priceMinor: 700 }).success).toBe(false);
    expect(supportPlanSchema.safeParse({ enabled: true, priceMinor: 300, perks: "x".repeat(1001) }).success).toBe(false);
  });
});
