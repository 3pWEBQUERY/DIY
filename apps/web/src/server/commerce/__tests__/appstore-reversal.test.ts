import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Apple: zurückgenommene Erstattung (REFUND_REVERSED) stellt Kauf, Download und Überweisung wieder her;
 * endgültig gescheiterte Überweisungen landen in der Fehlerüberwachung.
 */
const m = vi.hoisted(() => {
  const fn = () => vi.fn();
  return {
    db: {
      webhookEvent: { create: fn(), findUnique: fn(), update: fn() },
      appStorePurchase: { findUnique: fn(), findMany: fn(), updateMany: fn(), update: fn() },
      appStoreRevocation: { deleteMany: fn(), findUnique: fn() },
      order: { findUniqueOrThrow: fn() },
      $transaction: fn(),
    },
    verify: vi.fn(),
    transfer: vi.fn(),
    capture: vi.fn(),
  };
});

vi.mock("server-only", () => ({}));
vi.mock("@/server/db", () => ({ db: m.db }));
vi.mock("@/server/env", () => ({ env: () => ({ APPLE_IAP_BUNDLE_ID: "ch.werkuno.app" }) }));
vi.mock("@/server/settings", () => ({ getSetting: async () => null }));
vi.mock("@/server/notifications", () => ({ notify: async () => {} }));
vi.mock("@/server/events", () => ({ emit: async () => {} }));
vi.mock("@/server/audit", () => ({ audit: async () => {} }));
vi.mock("@/server/monitoring", () => ({ captureError: m.capture }));
vi.mock("@/server/visibility", () => ({ isBlockedBetween: async () => false }));
vi.mock("../fees", () => ({ feeForShop: async () => 600 }));
vi.mock("../stripe", () => ({ paymentsMode: () => "stripe", isStripeError: () => false, createSellerTransfer: m.transfer, reverseSellerTransfer: async () => ({}) }));
vi.mock("../appstore-verify", () => ({ AppStoreVerificationError: class extends Error {}, verifyAppStoreJws: m.verify }));

const { handleAppStoreNotification, retrySellerTransfers } = await import("../appstore");

function txMock() {
  const fn = () => vi.fn().mockResolvedValue({ count: 1 });
  return { appStorePurchase: { updateMany: fn() }, digitalEntitlement: { updateMany: fn() }, order: { update: fn() }, payment: { updateMany: fn() }, refund: { updateMany: fn() }, orderEvent: { create: fn() } };
}

const reversed = () =>
  m.verify.mockImplementation((s: string) =>
    s === "payload" ? { notificationUUID: "n1", notificationType: "REFUND_REVERSED", data: { bundleId: "ch.werkuno.app", signedTransactionInfo: "tx" } } : { transactionId: "t1" },
  );
const purchase = (over: Record<string, unknown> = {}) => ({ id: "p1", status: "REFUNDED", userId: "u1", productId: "pr1", transferStatus: "REVERSED", environment: "Production", orderId: "o1", ...over });

beforeEach(() => {
  vi.clearAllMocks();
  m.db.webhookEvent.create.mockResolvedValue({});
  m.db.webhookEvent.update.mockResolvedValue({});
  m.db.appStoreRevocation.deleteMany.mockResolvedValue({ count: 0 });
  m.db.appStorePurchase.update.mockResolvedValue({});
  m.db.order.findUniqueOrThrow.mockResolvedValue({ id: "o1", number: "W-1", status: "REFUNDED", buyerId: "u1", shop: { ownerId: "s1" }, items: [{ id: "i1", title: "Plan" }] });
});

describe("REFUND_REVERSED", () => {
  it("stellt Kauf, Lizenz und Bestellung wieder her und überweist mit neuem Idempotenz-Schlüssel", async () => {
    reversed();
    const tx = txMock();
    m.db.$transaction.mockImplementation(async (f: (t: typeof tx) => unknown) => f(tx));
    m.db.appStorePurchase.findUnique
      .mockResolvedValueOnce(purchase())
      // sendSellerTransfer
      .mockResolvedValueOnce({ id: "p1", status: "COMPLETED", transferStatus: "PENDING", transferAttempts: 0, transferId: "tr_old", sellerNetMinor: 1000, currency: "CHF", order: { id: "o1", number: "W-1", shop: { stripeAccountId: "acct_1", name: "S" } } });
    m.transfer.mockResolvedValue({ id: "tr_new" });

    expect(await handleAppStoreNotification({ signedPayload: "payload" })).toBe(200);
    expect(tx.appStorePurchase.updateMany).toHaveBeenCalledWith({ where: { id: "p1", status: "REFUNDED" }, data: expect.objectContaining({ status: "COMPLETED", revokedAt: null, transferStatus: "PENDING" }) });
    expect(tx.digitalEntitlement.updateMany).toHaveBeenCalledWith({ where: { userId: "u1", productId: "pr1", revokedAt: { not: null } }, data: { revokedAt: null, orderItemId: "i1" } });
    expect(tx.order.update).toHaveBeenCalledWith({ where: { id: "o1" }, data: { status: "COMPLETED" } });
    expect(tx.refund.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { providerRef: "apple-refund:t1" }, data: expect.objectContaining({ status: "FAILED" }) }));
    expect(m.transfer).toHaveBeenCalledWith(expect.objectContaining({ idempotencyKey: "appstore-transfer:p1:tr_old" }));
    expect(m.db.appStoreRevocation.deleteMany).toHaveBeenCalledWith({ where: { transactionId: "t1" } });
  });

  it("Testkauf (Sandbox): wiederherstellen, aber nichts überweisen", async () => {
    reversed();
    const tx = txMock();
    m.db.$transaction.mockImplementation(async (f: (t: typeof tx) => unknown) => f(tx));
    m.db.appStorePurchase.findUnique.mockResolvedValueOnce(purchase({ environment: "Sandbox", transferStatus: "SKIPPED" }));
    expect(await handleAppStoreNotification({ signedPayload: "payload" })).toBe(200);
    expect(tx.appStorePurchase.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ transferStatus: "SKIPPED" }) }));
    expect(m.transfer).not.toHaveBeenCalled();
  });

  it("ist idempotent: nicht erstatteter Kauf bleibt unverändert", async () => {
    reversed();
    m.db.appStorePurchase.findUnique.mockResolvedValueOnce(purchase({ status: "COMPLETED" }));
    expect(await handleAppStoreNotification({ signedPayload: "payload" })).toBe(200);
    expect(m.db.$transaction).not.toHaveBeenCalled();
    expect(m.transfer).not.toHaveBeenCalled();
  });
});

describe("Überweisungen nach dem letzten Versuch", () => {
  it("meldet den endgültig gescheiterten Versuch in der Fehlerüberwachung", async () => {
    m.db.appStorePurchase.findMany.mockResolvedValueOnce([{ id: "p1", transferAttempts: 23 }]).mockResolvedValueOnce([]);
    m.db.appStorePurchase.findUnique.mockResolvedValueOnce({ id: "p1", status: "COMPLETED", transferStatus: "FAILED", transferAttempts: 23, transferId: null, sellerNetMinor: 1000, currency: "CHF", order: { id: "o1", number: "W-1", shop: { stripeAccountId: null, name: "S" } } });
    m.db.appStorePurchase.updateMany.mockResolvedValue({ count: 0 });
    await retrySellerTransfers();
    expect(m.capture).toHaveBeenCalledWith(expect.any(Error), expect.objectContaining({ path: "appstore.transfer", meta: expect.objectContaining({ purchaseId: "p1" }) }));
  });

  it("frühere Fehlversuche melden sich nicht", async () => {
    m.db.appStorePurchase.findMany.mockResolvedValueOnce([{ id: "p1", transferAttempts: 3 }]).mockResolvedValueOnce([]);
    m.db.appStorePurchase.findUnique.mockResolvedValueOnce({ id: "p1", status: "COMPLETED", transferStatus: "FAILED", transferAttempts: 3, transferId: null, sellerNetMinor: 1000, currency: "CHF", order: { id: "o1", number: "W-1", shop: { stripeAccountId: null, name: "S" } } });
    m.db.appStorePurchase.updateMany.mockResolvedValue({ count: 0 });
    await retrySellerTransfers();
    expect(m.capture).not.toHaveBeenCalled();
  });
});
