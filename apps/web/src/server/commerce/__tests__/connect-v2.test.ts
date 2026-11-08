import { beforeEach, describe, expect, it, vi } from "vitest";

const calls: { create: unknown[]; links: unknown[] } = { create: [], links: [] };
let failFirstWith: string | null = null;

vi.mock("server-only", () => ({}));
vi.mock("stripe", () => {
  class FakeStripe {
    v2 = {
      core: {
        accounts: {
          create: async (params: unknown) => {
            calls.create.push(params);
            if (failFirstWith && calls.create.length === 1) throw Object.assign(new Error(failFirstWith), { type: "StripeInvalidRequestError" });
            return { id: "acct_test123" };
          },
          retrieve: async () => ({ id: "acct_test123" }),
        },
        accountLinks: { create: async (params: unknown) => (calls.links.push(params), { url: "https://connect.stripe.com/setup/e/acct_test123/xyz" }) },
      },
    };
    accounts = { createLoginLink: async () => ({ url: "https://connect.stripe.com/express/x" }) };
  }
  return { default: FakeStripe };
});

process.env.STRIPE_SECRET_KEY = "sk_test_dummy";
process.env.APP_URL = "https://werkuno.ch";
process.env.DATABASE_URL ??= "postgresql://x:x@localhost:5432/x";
process.env.SESSION_SECRET ??= "test-secret-test-secret-test-secret-000";
const s = await import("../stripe");

describe("Stripe Connect (Accounts v2)", () => {
  beforeEach(() => {
    calls.create = [];
    calls.links = [];
    failFirstWith = null;
  });

  it("legt ein Recipient-Konto für Destination Charges an (Express, Plattform trägt Gebühren/Verluste)", async () => {
    const a = await s.createConnectedAccount({ shopId: "shop1", email: "lena@example.com", country: "CH", sellerType: "PRIVATE", shopUrl: "https://werkuno.ch/markt/lena", shopName: "Lenas Maschen" });
    expect(a.id).toBe("acct_test123");
    const p = calls.create[0] as Record<string, any>;
    expect(p.dashboard).toBe("express");
    expect(p.identity).toEqual({ country: "ch", entity_type: "individual" });
    expect(p.configuration.recipient.capabilities.stripe_balance.stripe_transfers.requested).toBe(true);
    expect(p.configuration.merchant).toBeUndefined(); // Werkuno ist Händler (kein on_behalf_of)
    expect(p.defaults.currency).toBe("chf");
    expect(p.defaults.responsibilities).toEqual({ fees_collector: "application", losses_collector: "application" });
    expect(p.metadata).toEqual({ shopId: "shop1" });
  });

  it("weicht auf die Express-Gebührenvariante aus, wenn Stripe sie verlangt", async () => {
    failFirstWith = "Invalid value for defaults.responsibilities.fees_collector";
    await s.createConnectedAccount({ shopId: "shop2", email: "a@b.ch", country: "DE", sellerType: "BUSINESS", shopUrl: "https://werkuno.ch/markt/x", shopName: "X" });
    expect(calls.create).toHaveLength(2);
    expect((calls.create[1] as any).defaults.responsibilities.fees_collector).toBe("application_express");
    expect((calls.create[1] as any).identity.entity_type).toBe("company");
    expect((calls.create[1] as any).defaults.currency).toBe("eur");
  });

  it("erstellt einen v2-Onboarding-Link mit Rücksprung ins Studio", async () => {
    const url = await s.createOnboardingLink("acct_test123");
    expect(url).toMatch(/^https:\/\/connect\.stripe\.com\//);
    const l = calls.links[0] as any;
    expect(l.account).toBe("acct_test123");
    expect(l.use_case.type).toBe("account_onboarding");
    expect(l.use_case.account_onboarding.return_url).toBe("https://werkuno.ch/studio/shop?stripe=zurueck");
    expect(l.use_case.account_onboarding.refresh_url).toBe("https://werkuno.ch/studio/shop?stripe=erneut");
  });

  it("übersetzt den Kontostatus", () => {
    const pending = s.accountStatusV2({ id: "acct_1", configuration: { recipient: { capabilities: { stripe_balance: { stripe_transfers: { status: "pending" } } } } }, requirements: { entries: [{ awaiting_action_from: "user" }, { awaiting_action_from: "stripe" }] } });
    expect(pending).toMatchObject({ chargesEnabled: false, detailsSubmitted: false, currentlyDue: 1 });
    const active = s.accountStatusV2({ id: "acct_1", configuration: { recipient: { capabilities: { stripe_balance: { stripe_transfers: { status: "active" }, payouts: { status: "active" } } } } }, requirements: { entries: [] } });
    expect(active).toMatchObject({ chargesEnabled: true, payoutsEnabled: true, detailsSubmitted: true, disabledReason: null });
    const rejected = s.accountStatusV2({ id: "acct_1", configuration: { recipient: { capabilities: { stripe_balance: { stripe_transfers: { status: "rejected" } } } } } });
    expect(rejected.disabledReason).toMatch(/^rejected/);
  });
});
