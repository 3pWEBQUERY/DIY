import { beforeEach, describe, expect, it, vi } from "vitest";

/** Produkt löschen: App-Kaufabsichten (Restrict) blockieren nicht, abgeschlossene App-Käufe schon. */
const m = vi.hoisted(() => {
  const tx = {
    appStorePurchase: { groupBy: vi.fn(), count: vi.fn(), deleteMany: vi.fn() },
    product: { delete: vi.fn() },
  };
  return { tx, db: { product: { findUnique: vi.fn() }, $transaction: vi.fn() }, release: vi.fn() };
});

vi.mock("server-only", () => ({}));
vi.mock("@/server/db", () => ({ db: m.db }));
vi.mock("@/server/analytics/service", () => ({ track: vi.fn() }));
vi.mock("@/server/media/service", () => ({ attachMedia: vi.fn(), releaseMedia: m.release }));
vi.mock("@/server/settings", () => ({ getSetting: async () => null }));
vi.mock("@/server/visibility", () => ({ relationsFor: vi.fn(), isBlockedBetween: vi.fn() }));
vi.mock("@/server/social/posts", () => ({ createPost: vi.fn() }));
vi.mock("@/server/categories/settings", () => ({ assertCategoryAllowed: vi.fn() }));
vi.mock("@/server/flags", () => ({ requireFlag: vi.fn() }));
vi.mock("@/server/commerce/restock", () => ({ publicProductWhere: {}, publicProductSql: {}, isPublicProduct: vi.fn(), restockSummary: vi.fn(), notifyBackInStock: vi.fn(), pendingRestockCounts: vi.fn() }));
vi.mock("../shops", () => ({ requireOwnShop: async () => ({ id: "sh1" }) }));

const { deleteProduct } = await import("../products");
const user = { id: "u1" } as never;

beforeEach(() => {
  vi.clearAllMocks();
  m.db.$transaction.mockImplementation(async (f: (t: typeof m.tx) => unknown) => f(m.tx));
  m.db.product.findUnique.mockResolvedValue({ shopId: "sh1", digitalKey: "md1", media: [{ mediaId: "mi1" }], _count: { orderItems: 0 } });
  m.tx.appStorePurchase.count.mockResolvedValue(0);
  m.tx.appStorePurchase.deleteMany.mockResolvedValue({ count: 2 });
  m.tx.product.delete.mockResolvedValue({});
});

describe("deleteProduct", () => {
  it("verwirft offene/abgelaufene Kaufabsichten und gibt Bilder und Datei frei", async () => {
    m.tx.appStorePurchase.groupBy.mockResolvedValue([{ status: "EXPIRED", _count: 2 }]);
    await deleteProduct(user, "pr1");
    expect(m.tx.appStorePurchase.deleteMany).toHaveBeenCalledWith({ where: { productId: "pr1", status: { in: ["PENDING", "EXPIRED"] } } });
    expect(m.tx.product.delete).toHaveBeenCalledWith({ where: { id: "pr1" } });
    expect(m.release).toHaveBeenCalledWith(["mi1", "md1"]);
  });

  it("abgeschlossener App-Kauf: freundliche Ablehnung statt Fremdschlüsselfehler", async () => {
    m.tx.appStorePurchase.groupBy.mockResolvedValue([{ status: "COMPLETED", _count: 1 }]);
    await expect(deleteProduct(user, "pr1")).rejects.toMatchObject({ message: expect.stringContaining("bereits verkauft") });
    expect(m.tx.product.delete).not.toHaveBeenCalled();
    expect(m.release).not.toHaveBeenCalled();
  });

  it("laufender Kauf in der App (gültige Absicht): nicht löschen", async () => {
    m.tx.appStorePurchase.groupBy.mockResolvedValue([{ status: "PENDING", _count: 1 }]);
    m.tx.appStorePurchase.count.mockResolvedValue(1);
    await expect(deleteProduct(user, "pr1")).rejects.toMatchObject({ message: expect.stringContaining("gerade in der App") });
    expect(m.tx.product.delete).not.toHaveBeenCalled();
  });
});
