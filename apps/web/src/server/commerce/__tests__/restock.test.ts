import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

type Req = { id: string; productId: string; userId: string; note: string; notifiedAt: Date | null };
const state = {
  product: null as null | { id: string; title: string; status: string; hideWhenSoldOut: boolean; kind: string; shop: { id: string; ownerId: string; status: string } },
  requests: [] as Req[],
  due: [] as { id: string; userId: string; product: { id: string; title: string; slug: string; shop: { slug: string } } }[],
};
const notify = vi.fn(async () => null);

vi.mock("@/server/db", async () => {
  const { Prisma } = await import("@/generated/prisma/client");
  const restockRequest = {
    findUnique: async ({ where }: { where: { productId_userId: { productId: string; userId: string } } }) =>
      state.requests.find((r) => r.productId === where.productId_userId.productId && r.userId === where.productId_userId.userId) ?? null,
    create: async ({ data }: { data: Omit<Req, "id" | "notifiedAt"> }) => {
      const r = { id: `r${state.requests.length + 1}`, notifiedAt: null, ...data };
      state.requests.push(r);
      return r;
    },
    update: async ({ where, data }: { where: { id: string }; data: Partial<Req> }) => Object.assign(state.requests.find((r) => r.id === where.id)!, data),
    updateMany: async ({ where, data }: { where: { id: string; notifiedAt: null }; data: Partial<Req> }) => {
      const r = state.requests.find((x) => x.id === where.id && x.notifiedAt === null);
      if (!r) return { count: 0 };
      Object.assign(r, data);
      return { count: 1 };
    },
    deleteMany: async () => ({ count: 0 }),
    count: async () => state.requests.filter((r) => !r.notifiedAt).length,
    findMany: async () => state.due,
  };
  const db = {
    product: { findUnique: async () => state.product },
    restockRequest,
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn({ restockRequest }),
  };
  return { db, Prisma };
});
vi.mock("@/server/notifications", () => ({ notify }));
vi.mock("@/server/ratelimit", () => ({ limit: async () => ({ remaining: 10 }) }));
vi.mock("@/server/visibility", () => ({ isBlockedBetween: async () => false }));
vi.mock("@/server/monitoring", () => ({ captureError: async () => null }));

const { isPublicProduct, publicProductSql, requestRestock, notifyBackInStock } = await import("../restock");

const buyer = { id: "buyer" };
const soldOut = () => ({ id: "p1", title: "Vogelhaus", status: "SOLD_OUT", hideWhenSoldOut: false, kind: "UNIQUE", shop: { id: "s1", ownerId: "seller", status: "ACTIVE" } });

beforeEach(() => {
  state.product = soldOut();
  state.requests = [];
  state.due = [];
  notify.mockClear();
});

describe("Sichtbarkeit ausverkaufter Produkte", () => {
  it("zeigt aktive und sichtbare ausverkaufte Produkte, aber keine ausgeblendeten", () => {
    expect(isPublicProduct({ status: "ACTIVE", hideWhenSoldOut: true })).toBe(true);
    expect(isPublicProduct({ status: "SOLD_OUT", hideWhenSoldOut: false })).toBe(true);
    expect(isPublicProduct({ status: "SOLD_OUT", hideWhenSoldOut: true })).toBe(false);
    expect(isPublicProduct({ status: "PAUSED", hideWhenSoldOut: false })).toBe(false);
  });
  it("baut dieselbe Regel als SQL, auch mit Tabellen-Alias", () => {
    expect(publicProductSql().sql).toBe(`("status" = 'ACTIVE' OR ("status" = 'SOLD_OUT' AND NOT "hideWhenSoldOut"))`);
    expect(publicProductSql("pr").sql).toBe(`(pr."status" = 'ACTIVE' OR (pr."status" = 'SOLD_OUT' AND NOT pr."hideWhenSoldOut"))`);
  });
});

describe("Nachproduktion anfragen", () => {
  it("legt eine Anfrage an und benachrichtigt den Shop", async () => {
    const r = await requestRestock(buyer, "p1", { note: "In Blau?" });
    expect(r.requested).toBe(true);
    expect(state.requests).toHaveLength(1);
    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify.mock.calls[0]![0]).toMatchObject({ recipientId: "seller", type: "RESTOCK", actorId: "buyer", data: { kind: "request", excerpt: "In Blau?" } });
  });
  it("benachrichtigt bei einer zweiten Anfrage derselben Person nicht erneut", async () => {
    await requestRestock(buyer, "p1", {});
    await requestRestock(buyer, "p1", {});
    expect(state.requests).toHaveLength(1);
    expect(notify).toHaveBeenCalledTimes(1);
  });
  it("lehnt eigene, verfügbare und ausgeblendete Produkte ab", async () => {
    await expect(requestRestock({ id: "seller" }, "p1", {})).rejects.toThrow(/eigenes Produkt/);
    state.product = { ...soldOut(), status: "ACTIVE" };
    await expect(requestRestock(buyer, "p1", {})).rejects.toThrow(/verfügbar/);
    state.product = { ...soldOut(), hideWhenSoldOut: true };
    await expect(requestRestock(buyer, "p1", {})).rejects.toThrow(/nicht gefunden/);
    expect(notify).not.toHaveBeenCalled();
  });
});

describe("Wieder verfügbar", () => {
  it("informiert jede anfragende Person genau einmal", async () => {
    state.requests = [{ id: "r1", productId: "p1", userId: "buyer", note: "", notifiedAt: null }];
    state.due = [{ id: "r1", userId: "buyer", product: { id: "p1", title: "Vogelhaus", slug: "vogelhaus", shop: { slug: "werkstatt" } } }];
    expect(await notifyBackInStock(["p1"])).toEqual({ sent: 1 });
    expect(notify.mock.calls[0]![0]).toMatchObject({ recipientId: "buyer", type: "RESTOCK", data: { kind: "available", href: "/markt/werkstatt/vogelhaus" } });
    // Zweiter Lauf (z. B. Worker) findet die Anfrage bereits markiert
    expect(await notifyBackInStock(["p1"])).toEqual({ sent: 0 });
    expect(notify).toHaveBeenCalledTimes(1);
  });
});
