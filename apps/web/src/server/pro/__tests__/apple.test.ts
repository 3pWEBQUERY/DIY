import { beforeEach, describe, expect, it, vi } from "vitest";

/** Creator Pro über den App Store: Konto-Zuordnung, Status aus Apple-Daten, Reihenfolge, Konflikte. */
const m = vi.hoisted(() => {
  const fn = () => vi.fn();
  return {
    db: { subscription: { findUnique: fn(), upsert: fn() }, userProfile: { updateMany: fn() } },
    verify: vi.fn(),
    notify: vi.fn(),
    captureError: vi.fn(),
  };
});

vi.mock("server-only", () => ({}));
vi.mock("react", () => ({ cache: <T,>(f: T) => f }));
vi.mock("@/server/db", () => ({ db: m.db }));
vi.mock("@/server/env", () => ({ env: () => ({ SESSION_SECRET: "x".repeat(40), APPLE_IAP_BUNDLE_ID: "ch.werkuno.app" }) }));
vi.mock("@/server/audit", () => ({ audit: async () => {} }));
vi.mock("@/server/flags", () => ({ requireFlag: async () => {} }));
vi.mock("@/server/monitoring", () => ({ captureError: m.captureError }));
vi.mock("@/server/notifications", () => ({ notify: m.notify }));
vi.mock("@/server/ratelimit", () => ({ rateLimit: async () => {} }));
vi.mock("@/server/settings", () => ({ getSetting: async () => 0 }));
vi.mock("@/server/authz", () => ({ hasRole: () => false }));
vi.mock("@/server/commerce/stripe", () => ({ appUrl: (p: string) => p, isStripeError: () => false, paymentsMode: () => "stripe", stripe: () => ({}), stripeKeyMode: () => "test" }));
vi.mock("@/server/commerce/appstore-verify", () => ({ AppStoreVerificationError: class extends Error {}, verifyAppStoreJws: m.verify }));

const apple = await import("../apple");
const { isActiveSubscription } = await import("../service");

const DAY = 86400_000;
const tx = (over: Record<string, unknown> = {}) => ({
  transactionId: "t2",
  originalTransactionId: "o1",
  bundleId: "ch.werkuno.app",
  productId: "ch.werkuno.app.pro.monthly",
  purchaseDate: Date.now(),
  type: "Auto-Renewable Subscription",
  environment: "Production",
  appAccountToken: apple.proAccountToken("u1"),
  expiresDate: Date.now() + 30 * DAY,
  price: 9000,
  currency: "CHF",
  signedDate: Date.now(),
  ...over,
});
const jws = (payloads: Record<string, unknown>) => m.verify.mockImplementation((s: string) => payloads[s]);
const saved = () => m.db.subscription.upsert.mock.calls.at(-1)?.[0].update as Record<string, unknown>;

beforeEach(() => {
  vi.clearAllMocks();
  // Kleine Abo-Tabelle: upsert speichert, findUnique je Konto liest den gespeicherten Stand
  let row: object | null = null;
  m.db.subscription.findUnique.mockImplementation(async (q: { where: { userId?: string } }) => (q.where.userId ? row : null));
  m.db.subscription.upsert.mockImplementation(async (a: { update: object }) => (row = { ...a.update }));
  m.notify.mockResolvedValue(undefined);
  m.db.userProfile.updateMany.mockResolvedValue({ count: 1 });
});

describe("Konto-Token", () => {
  it("ist eine stabile UUID je Konto und für andere Konten verschieden", () => {
    const a = apple.proAccountToken("u1");
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(apple.proAccountToken("u1")).toBe(a);
    expect(apple.proAccountToken("u2")).not.toBe(a);
  });
});

describe("Kauf aus der App", () => {
  it("schaltet Pro frei: Intervall, Preis in Rappen, Periodenende, Apple als Anbieter", async () => {
    jws({ t: tx() });
    await apple.syncAppleProFromApp({ id: "u1" }, { signedTransaction: "t" });
    const s = saved();
    expect(s).toMatchObject({ provider: "apple", status: "active", interval: "month", priceMinor: 900, currency: "CHF", appleOriginalTransactionId: "o1" });
    expect(isActiveSubscription(s as never)).toBe(true);
    expect(m.db.userProfile.updateMany).toHaveBeenCalledWith({ where: { userId: "u1" }, data: { isCreatorPro: true } });
  });

  it("Beleg eines anderen Kontos (fremdes Token) wird abgelehnt", async () => {
    jws({ t: tx({ appAccountToken: apple.proAccountToken("u2") }) });
    await expect(apple.syncAppleProFromApp({ id: "u1" }, { signedTransaction: "t" })).rejects.toThrow(/anderen Werkuno-Konto/);
    expect(m.db.subscription.upsert).not.toHaveBeenCalled();
  });

  it("Produkt, das nicht Pro ist, wird abgelehnt", async () => {
    jws({ t: tx({ productId: "ch.werkuno.app.digital.chf9" }) });
    await expect(apple.syncAppleProFromApp({ id: "u1" }, { signedTransaction: "t" })).rejects.toThrow(/nicht zu Creator Pro/);
  });

  it("laufendes Web-Abo wird nicht überschrieben – Konflikt wird gemeldet", async () => {
    jws({ t: tx() });
    m.db.subscription.findUnique.mockImplementation(async (a: { where: { userId?: string } }) =>
      a.where.userId ? { provider: "stripe", status: "active", currentPeriodEnd: new Date(Date.now() + 10 * DAY), cancelAtPeriodEnd: false } : null,
    );
    await expect(apple.syncAppleProFromApp({ id: "u1" }, { signedTransaction: "t" })).rejects.toThrow(/über die Website/);
    expect(m.db.subscription.upsert).not.toHaveBeenCalled();
    expect(m.captureError).toHaveBeenCalled();
  });

  it("Verlängerungsstatus: gekündigt (läuft aus) und Kulanzfrist", async () => {
    const grace = Date.now() + 40 * DAY;
    jws({ t: tx(), r: { originalTransactionId: "o1", autoRenewStatus: 0, isInBillingRetryPeriod: true, gracePeriodExpiresDate: grace } });
    await apple.syncAppleProFromApp({ id: "u1" }, { signedTransaction: "t", signedRenewalInfo: "r" });
    expect(saved()).toMatchObject({ status: "past_due", cancelAtPeriodEnd: true, currentPeriodEnd: new Date(grace) });
  });
});

describe("Server-Benachrichtigungen", () => {
  const known = (over: Record<string, unknown> = {}) =>
    m.db.subscription.findUnique.mockImplementation(async (a: { where: { userId?: string; appleOriginalTransactionId?: string } }) =>
      a.where.appleOriginalTransactionId
        ? { userId: "u1" }
        : { provider: "apple", status: "active", appleOriginalTransactionId: "o1", appleSignedAt: new Date(Date.now() - DAY), currentPeriodEnd: new Date(Date.now() + DAY), cancelAtPeriodEnd: false, ...over },
    );

  it("unbekanntes Abo (App hat es noch nicht gemeldet): ignoriert", async () => {
    expect(await apple.handleAppleProNotification("SUBSCRIBED", tx() as never)).toBe(false);
    expect(m.db.subscription.upsert).not.toHaveBeenCalled();
  });

  it("Verlängerung verschiebt das Periodenende", async () => {
    known();
    const next = Date.now() + 31 * DAY;
    expect(await apple.handleAppleProNotification("DID_RENEW", tx({ expiresDate: next }) as never)).toBe(true);
    expect(saved()).toMatchObject({ status: "active", currentPeriodEnd: new Date(next) });
  });

  it("Ablauf und Erstattung beenden Pro sofort", async () => {
    for (const [type, over] of [["EXPIRED", {}], ["REFUND", { revocationDate: Date.now() }]] as const) {
      known();
      await apple.handleAppleProNotification(type, tx(over) as never);
      expect(saved()).toMatchObject({ status: "canceled" });
      expect(isActiveSubscription(saved() as never)).toBe(false);
    }
  });

  it("verspätete, ältere Meldung überschreibt einen neueren Stand nicht", async () => {
    known({ appleSignedAt: new Date(Date.now() + DAY) });
    await apple.handleAppleProNotification("EXPIRED", tx({ signedDate: Date.now() - 5 * DAY }) as never);
    expect(m.db.subscription.upsert).not.toHaveBeenCalled();
  });
});

describe("isActiveSubscription (Apple)", () => {
  it("nur bis zum Periodenende aktiv – auch ohne Ablauf-Meldung", () => {
    expect(isActiveSubscription({ provider: "apple", status: "active", currentPeriodEnd: new Date(Date.now() + DAY) })).toBe(true);
    expect(isActiveSubscription({ provider: "apple", status: "active", currentPeriodEnd: new Date(Date.now() - 1000) })).toBe(false);
    expect(isActiveSubscription({ provider: "apple", status: "active", currentPeriodEnd: null })).toBe(false);
  });
});
