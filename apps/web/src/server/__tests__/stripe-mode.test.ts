import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const state = { key: "" as string | undefined };
vi.mock("@/server/env", () => ({ env: () => ({ STRIPE_SECRET_KEY: state.key, NODE_ENV: "test" }), features: { payments: () => !!state.key } }));

const { stripeKeyMode, isForeignAccountError } = await import("../commerce/stripe");
const { notificationParts } = await import("../notifications-format");

describe("Stripe-Modus des Schlüssels", () => {
  it("erkennt Live- und Test-Schlüssel (auch eingeschränkte)", () => {
    for (const [key, mode] of [["sk_live_abc", "live"], ["rk_live_abc", "live"], ["sk_test_abc", "test"], ["rk_test_abc", "test"], ["", null], [undefined, null], ["pk_live_abc", null]] as const) {
      state.key = key;
      expect(stripeKeyMode()).toBe(mode);
    }
  });
});

describe("Konto aus anderem Modus", () => {
  const err = (message: string, code?: string) => ({ type: "StripePermissionError", message, code });
  it("erkennt fremde bzw. fehlende verbundene Konten", () => {
    expect(isForeignAccountError(err("The provided key 'sk_live_***' does not have access to account 'acct_1' (or that account does not exist)."))).toBe(true);
    expect(isForeignAccountError(err("No such account: 'acct_1'"))).toBe(true);
    expect(isForeignAccountError(err("x", "account_invalid"))).toBe(true);
  });
  it("übrige Fehler lösen keine Trennung aus", () => {
    expect(isForeignAccountError(err("Rate limit", "rate_limit"))).toBe(false);
    expect(isForeignAccountError(new Error("does not have access to account"))).toBe(false);
    expect(isForeignAccountError(null)).toBe(false);
  });
});

describe("Benachrichtigung zum Neuverbinden", () => {
  it("zeigt den Hinweistext", () => {
    const p = notificationParts({ type: "ORDER_STATUS", count: 1, data: { kind: "shop_reconnect", note: "Bitte neu verbinden.", href: "/studio/shop" }, actor: null, targetType: null } as never);
    expect(p.text).toBe("Bitte neu verbinden.");
  });
});
