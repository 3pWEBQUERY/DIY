import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Apple-Erstattungen (Server-Benachrichtigungen V2): Grabstein vor der Verbuchung,
 * Wiederholung unerledigter Ereignisse, keine doppelte Verarbeitung.
 */
const m = vi.hoisted(() => {
  const fn = () => vi.fn();
  return {
    db: {
      webhookEvent: { create: fn(), findUnique: fn(), update: fn() },
      appStorePurchase: { findUnique: fn(), updateMany: fn(), update: fn() },
      appStoreRevocation: { upsert: fn(), findUnique: fn() },
      order: { findUniqueOrThrow: fn() },
      $transaction: fn(),
    },
    verify: vi.fn(),
  };
});

vi.mock("server-only", () => ({}));
vi.mock("@/server/db", () => ({ db: m.db }));
vi.mock("@/server/env", () => ({ env: () => ({ APPLE_IAP_BUNDLE_ID: "ch.werkuno.app" }) }));
vi.mock("@/server/settings", () => ({ getSetting: async () => null }));
vi.mock("@/server/notifications", () => ({ notify: async () => {} }));
vi.mock("@/server/events", () => ({ emit: async () => {} }));
vi.mock("@/server/audit", () => ({ audit: async () => {} }));
vi.mock("@/server/monitoring", () => ({ captureError: async () => null }));
vi.mock("@/server/visibility", () => ({ isBlockedBetween: async () => false }));
vi.mock("../fees", () => ({ feeForShop: async () => 600 }));
vi.mock("../stripe", () => ({ paymentsMode: () => "stripe", isStripeError: () => false, createSellerTransfer: async () => ({}), reverseSellerTransfer: async () => ({}) }));
vi.mock("../appstore-verify", () => ({
  AppStoreVerificationError: class extends Error {},
  verifyAppStoreJws: m.verify,
}));

const { handleAppStoreNotification } = await import("../appstore");

const refund = (uuid = "n1") => {
  m.verify.mockImplementation((s: string) =>
    s === "payload"
      ? { notificationUUID: uuid, notificationType: "REFUND", data: { bundleId: "ch.werkuno.app", signedTransactionInfo: "tx" } }
      : { transactionId: "t1" },
  );
};

beforeEach(() => {
  vi.clearAllMocks();
  m.db.webhookEvent.create.mockResolvedValue({});
  m.db.webhookEvent.update.mockResolvedValue({});
});

describe("Apple-Erstattung vor der Verbuchung", () => {
  it("legt einen Grabstein an und gilt als erledigt", async () => {
    refund();
    m.db.appStorePurchase.findUnique.mockResolvedValue(null);
    expect(await handleAppStoreNotification({ signedPayload: "payload" })).toBe(200);
    expect(m.db.appStoreRevocation.upsert).toHaveBeenCalledWith(expect.objectContaining({ where: { transactionId: "t1" } }));
    expect(m.db.webhookEvent.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "apple:n1" }, data: expect.objectContaining({ processedAt: expect.any(Date) }) }));
  });

  it("auch eine nur vorgemerkte Kaufabsicht (ohne Bestellung) bekommt einen Grabstein", async () => {
    refund();
    m.db.appStorePurchase.findUnique.mockResolvedValue({ id: "p1", orderId: null, status: "PENDING" });
    expect(await handleAppStoreNotification({ signedPayload: "payload" })).toBe(200);
    expect(m.db.appStoreRevocation.upsert).toHaveBeenCalledTimes(1);
  });
});

describe("Doppelte Zustellung", () => {
  it("erledigtes Ereignis wird nicht noch einmal verarbeitet", async () => {
    refund();
    m.db.webhookEvent.create.mockRejectedValue(Object.assign(new Error("dup"), { code: "P2002" }));
    m.db.webhookEvent.findUnique.mockResolvedValue({ processedAt: new Date() });
    expect(await handleAppStoreNotification({ signedPayload: "payload" })).toBe(200);
    expect(m.db.appStorePurchase.findUnique).not.toHaveBeenCalled();
  });

  it("abgebrochenes Ereignis (ohne processedAt) wird erneut verarbeitet", async () => {
    refund();
    m.db.webhookEvent.create.mockRejectedValue(Object.assign(new Error("dup"), { code: "P2002" }));
    m.db.webhookEvent.findUnique.mockResolvedValue({ processedAt: null });
    m.db.appStorePurchase.findUnique.mockResolvedValue(null);
    expect(await handleAppStoreNotification({ signedPayload: "payload" })).toBe(200);
    expect(m.db.appStoreRevocation.upsert).toHaveBeenCalledTimes(1);
  });

  it("Fehler: Ereignis bleibt unerledigt, Apple soll erneut zustellen", async () => {
    refund();
    m.db.appStorePurchase.findUnique.mockRejectedValue(new Error("db weg"));
    expect(await handleAppStoreNotification({ signedPayload: "payload" })).toBe(500);
    expect(m.db.webhookEvent.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ error: "db weg" }) }));
    expect(m.db.webhookEvent.update).not.toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ processedAt: expect.any(Date) }) }));
  });

  it("bereits erstatteter Kauf wird nicht doppelt gebucht", async () => {
    refund();
    m.db.appStorePurchase.findUnique.mockResolvedValue({ id: "p1", orderId: "o1", status: "COMPLETED", userId: "u1", productId: "pr1", transferStatus: "SKIPPED", transferId: null, priceMinor: 1300, currency: "CHF" });
    m.db.order.findUniqueOrThrow.mockResolvedValue({ id: "o1", number: "W-1", status: "COMPLETED", buyerId: "u1", shop: { ownerId: "s1" }, items: [{ title: "Plan" }] });
    // Zweiter, gleichzeitiger Durchlauf verliert das bedingte Update
    const tx = { appStorePurchase: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) } };
    m.db.$transaction.mockImplementation(async (f: (t: typeof tx) => unknown) => f(tx));
    expect(await handleAppStoreNotification({ signedPayload: "payload" })).toBe(200);
    expect(tx.appStorePurchase.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "p1", status: { not: "REFUNDED" } } }));
  });
});
