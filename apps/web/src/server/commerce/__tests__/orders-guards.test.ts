import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Stornieren/Erstatten: angefochtene Zahlungen sperren beides; die Plattform-Erstattung prüft Vier-Augen-
 * Prinzip und erstattbaren Betrag, bevor irgendetwas geändert wird.
 */
const m = vi.hoisted(() => {
  const fn = () => vi.fn();
  return {
    tx: {
      order: { findUnique: fn(), update: fn() },
      shop: { findUniqueOrThrow: fn() },
      shipment: { findMany: fn(), count: fn() },
      digitalEntitlement: { updateMany: fn() },
      orderEvent: { create: fn() },
    },
    db: { $transaction: fn() },
    orderWith: vi.fn(),
    restock: vi.fn(),
    initiateRefund: vi.fn(),
  };
});

vi.mock("server-only", () => ({}));
vi.mock("@/server/db", () => ({ db: m.db }));
vi.mock("@/server/events", () => ({ emit: vi.fn() }));
vi.mock("@/server/audit", () => ({ audit: vi.fn() }));
vi.mock("@/server/notifications", () => ({ notify: vi.fn() }));
vi.mock("@/server/ratelimit", () => ({ rateLimit: vi.fn() }));
vi.mock("../inventory", () => ({ lockOrder: vi.fn() }));
vi.mock("../shops", () => ({ requireOwnShop: vi.fn() }));
vi.mock("../payments", () => ({ orderWith: m.orderWith, initiateRefund: m.initiateRefund, grantMissingEntitlementsTx: vi.fn(), restockOrderTx: m.restock, APPLE_REFUND_MESSAGE: "apple" }));

const { cancelBySeller, refundOrderByAdmin } = await import("../orders");

const seller = { id: "s1", role: "USER" } as never;
const admin = { id: "a1", role: "ADMIN" } as never;
const full = (payment: Record<string, unknown>, over: Record<string, unknown> = {}) => ({
  id: "o1",
  number: "W-1",
  status: "NEW",
  buyerId: "b1",
  currency: "CHF",
  shopId: "sh1",
  items: [{ id: "i1", isDigital: false, productId: "p1", variantId: null, quantity: 1 }],
  payments: [{ id: "pay1", provider: "stripe", status: "SUCCEEDED", amountMinor: 5000, ...payment }],
  refunds: [],
  shop: { id: "sh1", ownerId: "s1" },
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  m.db.$transaction.mockImplementation(async (f: (t: typeof m.tx) => unknown) => f(m.tx));
  m.tx.order.findUnique.mockResolvedValue({ id: "o1", number: "W-1", status: "NEW", buyerId: "b1", shopId: "sh1" });
  m.tx.shop.findUniqueOrThrow.mockResolvedValue({ ownerId: "s1", status: "ACTIVE" });
  m.tx.shipment.findMany.mockResolvedValue([]);
  m.tx.shipment.count.mockResolvedValue(0);
  m.initiateRefund.mockResolvedValue({});
});

describe("cancelBySeller", () => {
  it("angefochtene Zahlung: nicht stornieren (sonst storniert ohne Rückzahlung)", async () => {
    m.orderWith.mockResolvedValue(full({ status: "DISPUTED" }));
    await expect(cancelBySeller(seller, "o1", "Ausverkauft")).rejects.toMatchObject({ code: "CONFLICT", message: expect.stringContaining("angefochten") });
    expect(m.restock).not.toHaveBeenCalled();
    expect(m.tx.order.update).not.toHaveBeenCalled();
    expect(m.initiateRefund).not.toHaveBeenCalled();
  });

  it("bezahlt: storniert und erstattet den offenen Betrag", async () => {
    m.orderWith.mockResolvedValue(full({}));
    const r = await cancelBySeller(seller, "o1", "Ausverkauft");
    expect(r.refundedMinor).toBe(5000);
    expect(m.initiateRefund).toHaveBeenCalledWith("o1", expect.objectContaining({ amountMinor: 5000 }));
  });
});

describe("refundOrderByAdmin", () => {
  it("Vier-Augen-Prinzip: eigener Shop bzw. eigener Kauf wird nicht selbst erstattet", async () => {
    m.orderWith.mockResolvedValue(full({}, { shop: { id: "sh1", ownerId: "a1" } }));
    await expect(refundOrderByAdmin(admin, "o1", "Shop gesperrt")).rejects.toMatchObject({ code: "FORBIDDEN" });
    m.orderWith.mockResolvedValue(full({}, { buyerId: "a1" }));
    await expect(refundOrderByAdmin(admin, "o1", "Shop gesperrt")).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(m.tx.order.update).not.toHaveBeenCalled();
  });

  it("nichts mehr erstattbar: abbrechen, bevor storniert, zurückgebucht oder widerrufen wird", async () => {
    m.orderWith.mockResolvedValue(full({ status: "REFUNDED" }, { refunds: [{ amountMinor: 5000, status: "SUCCEEDED" }] }));
    await expect(refundOrderByAdmin(admin, "o1", "Shop gesperrt")).rejects.toMatchObject({ code: "CONFLICT", message: expect.stringContaining("keinen erstattbaren Betrag") });
    expect(m.restock).not.toHaveBeenCalled();
    expect(m.tx.digitalEntitlement.updateMany).not.toHaveBeenCalled();
    expect(m.tx.order.update).not.toHaveBeenCalled();
    expect(m.initiateRefund).not.toHaveBeenCalled();
  });

  it("angefochtene Zahlung: keine Plattform-Erstattung", async () => {
    m.orderWith.mockResolvedValue(full({ status: "DISPUTED" }));
    await expect(refundOrderByAdmin(admin, "o1", "Shop gesperrt")).rejects.toMatchObject({ code: "CONFLICT" });
    expect(m.restock).not.toHaveBeenCalled();
  });

  it("erstattbar: storniert vor dem Versand und erstattet den Rest", async () => {
    m.orderWith.mockResolvedValue(full({}, { refunds: [{ amountMinor: 1000, status: "SUCCEEDED" }] }));
    const r = await refundOrderByAdmin(admin, "o1", "Shop gesperrt");
    expect(r.refundedMinor).toBe(4000);
    expect(m.restock).toHaveBeenCalled();
    expect(m.initiateRefund).toHaveBeenCalledWith("o1", expect.objectContaining({ amountMinor: 4000 }));
  });
});
