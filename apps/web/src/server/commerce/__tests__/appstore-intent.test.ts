import { beforeEach, describe, expect, it, vi } from "vitest";

/** Kaufabsicht hinter dem Marktplatz-Notschalter; zweite Apple-Transaktion für dieselbe Absicht wird gemeldet. */
const m = vi.hoisted(() => {
  const fn = () => vi.fn();
  return {
    tx: { appStorePurchase: { updateMany: fn(), findUnique: fn() } },
    db: {
      appStorePurchase: { findUnique: fn(), updateMany: fn(), create: fn() },
      appStoreRevocation: { findUnique: fn() },
      product: { findUnique: fn(), findUniqueOrThrow: fn() },
      digitalEntitlement: { findUnique: fn() },
      $transaction: fn(),
    },
    verify: vi.fn(),
    capture: vi.fn(),
    requireFlag: vi.fn(),
  };
});

vi.mock("server-only", () => ({}));
vi.mock("@/server/db", () => ({ db: m.db }));
vi.mock("@/server/env", () => ({ env: () => ({ APPLE_IAP_BUNDLE_ID: "ch.werkuno.app" }) }));
vi.mock("@/server/settings", () => ({ getSetting: async () => null }));
vi.mock("@/server/flags", () => ({ requireFlag: m.requireFlag }));
vi.mock("@/server/notifications", () => ({ notify: async () => {} }));
vi.mock("@/server/events", () => ({ emit: async () => {} }));
vi.mock("@/server/audit", () => ({ audit: async () => {} }));
vi.mock("@/server/monitoring", () => ({ captureError: m.capture }));
vi.mock("@/server/visibility", () => ({ isBlockedBetween: async () => false }));
vi.mock("@/server/pro/apple", () => ({ handleAppleProNotification: vi.fn(), isProAppleProduct: () => false }));
vi.mock("../fees", () => ({ feeForShop: async () => 600 }));
vi.mock("../stripe", () => ({ paymentsMode: () => "simulated", isStripeError: () => false, createSellerTransfer: vi.fn(), reverseSellerTransfer: vi.fn() }));
vi.mock("../appstore-verify", () => ({ AppStoreVerificationError: class extends Error {}, verifyAppStoreJws: m.verify }));

const { createPurchaseIntent, fulfillAppStoreTransaction } = await import("../appstore");
const user = { id: "u1" };
const intent = { id: "ap1", userId: "u1", productId: "pr1", appleProductId: "ch.werkuno.app.digital.chf13", status: "PENDING", transactionId: null, priceMinor: 1300, sellerNetMinor: 940, currency: "CHF" };

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "log").mockImplementation(() => {});
  m.db.appStoreRevocation.findUnique.mockResolvedValue(null);
  m.db.product.findUniqueOrThrow.mockResolvedValue({ id: "pr1", title: "Plan", shop: { id: "sh1", ownerId: "s1" } });
  m.db.digitalEntitlement.findUnique.mockResolvedValue({ id: "e1", revokedAt: null });
  m.db.$transaction.mockImplementation(async (f: (t: typeof m.tx) => unknown) => f(m.tx));
  m.verify.mockReturnValue({ transactionId: "t_second", originalTransactionId: "t_second", bundleId: "ch.werkuno.app", appAccountToken: "TOK", productId: intent.appleProductId, environment: "Production" });
});

describe("createPurchaseIntent", () => {
  it("Marktplatz pausiert: keine neue Kaufabsicht", async () => {
    m.requireFlag.mockRejectedValue(Object.assign(new Error("pausiert"), { code: "UNAVAILABLE" }));
    await expect(createPurchaseIntent(user, { productId: "pr1" })).rejects.toThrow("pausiert");
    expect(m.requireFlag).toHaveBeenCalledWith("marketplace", "u1");
    expect(m.db.appStorePurchase.create).not.toHaveBeenCalled();
  });
});

describe("fulfillAppStoreTransaction – zweite Transaktion derselben Absicht", () => {
  it("bereits verbucht: Konflikt und Meldung mit beiden Transaktions-IDs", async () => {
    m.db.appStorePurchase.findUnique.mockImplementation(async (a: { where: { transactionId?: string; token?: string } }) =>
      a.where.token ? { ...intent, status: "COMPLETED", transactionId: "t_first" } : null,
    );
    await expect(fulfillAppStoreTransaction(user, { signedTransaction: "jws" })).rejects.toMatchObject({ code: "CONFLICT" });
    expect(m.capture).toHaveBeenCalledWith(expect.any(Error), expect.objectContaining({ path: "appstore.duplicate_transaction", meta: expect.objectContaining({ firstTransactionId: "t_first", secondTransactionId: "t_second" }) }));
  });

  it("gleichzeitig von einer anderen Transaktion beansprucht: erste Bestellung, aber gemeldet", async () => {
    m.db.appStorePurchase.findUnique.mockImplementation(async (a: { where: { transactionId?: string; token?: string } }) => (a.where.token ? intent : null));
    m.tx.appStorePurchase.updateMany.mockResolvedValue({ count: 0 });
    m.tx.appStorePurchase.findUnique.mockResolvedValue({ orderId: "o1", transactionId: "t_first" });
    const r = await fulfillAppStoreTransaction(user, { signedTransaction: "jws" });
    expect(r.orderId).toBe("o1");
    expect(m.capture).toHaveBeenCalledWith(expect.any(Error), expect.objectContaining({ meta: expect.objectContaining({ firstTransactionId: "t_first", secondTransactionId: "t_second" }) }));
  });

  it("dieselbe Transaktion doppelt gemeldet: keine Meldung", async () => {
    m.db.appStorePurchase.findUnique.mockImplementation(async (a: { where: { transactionId?: string; token?: string } }) => (a.where.token ? intent : null));
    m.tx.appStorePurchase.updateMany.mockResolvedValue({ count: 0 });
    m.tx.appStorePurchase.findUnique.mockResolvedValue({ orderId: "o1", transactionId: "t_second" });
    await fulfillAppStoreTransaction(user, { signedTransaction: "jws" });
    expect(m.capture).not.toHaveBeenCalled();
  });
});
