import { beforeEach, describe, expect, it, vi } from "vitest";

/** Listen zusammenführen: Obergrenze 300 für bestehende + neue Positionen; zusammengefasste zählen nicht neu. */
const m = vi.hoisted(() => {
  const fn = () => vi.fn();
  const db = {
    shoppingList: { findUnique: fn(), update: fn(), delete: fn() },
    shoppingListItem: { findMany: fn(), update: fn(), create: fn() },
    $transaction: vi.fn(),
  };
  return { db };
});
vi.mock("@/server/db", () => ({ db: m.db }));
vi.mock("@/server/ratelimit", () => ({ rateLimit: vi.fn() }));
vi.mock("@/server/visibility", () => ({ canViewContent: vi.fn() }));
vi.mock("@/server/crypto", () => ({ token: () => "t" }));
vi.mock("@/server/materials/stock", () => ({ stockLookup: vi.fn() }));
vi.mock("@/server/projects/service", () => ({ visibleProjectsWhere: vi.fn() }));

const svc = await import("../service");
const user = { id: "u1", role: "MEMBER" } as never;
const item = (name: string, i = 0) => ({ id: `${name}-${i}`, name, quantity: "1", materialId: null, sourceType: null, sourceId: null, sourceTitle: null, haveIt: false, purchased: false, position: i });
const items = (prefix: string, n: number) => Array.from({ length: n }, (_, i) => item(`${prefix}${i}`, i));

beforeEach(() => {
  vi.clearAllMocks();
  m.db.$transaction.mockImplementation((f: (tx: typeof m.db) => unknown) => f(m.db));
  m.db.shoppingList.findUnique.mockImplementation(async (q: { where: { id: string } }) => ({ id: q.where.id, ownerId: "u1", title: "L", shareToken: null }));
  m.db.shoppingListItem.create.mockImplementation(async (q: { data: { name: string } }) => item(q.data.name));
});

describe("mergeShoppingLists", () => {
  it("lehnt ab, wenn bestehende + neue Positionen 300 übersteigen", async () => {
    m.db.shoppingListItem.findMany.mockResolvedValueOnce(items("neu", 101)).mockResolvedValueOnce(items("alt", 200));
    await expect(svc.mergeShoppingLists(user, "target", "source")).rejects.toMatchObject({ code: "VALIDATION" });
    expect(m.db.shoppingListItem.create).not.toHaveBeenCalled();
    expect(m.db.shoppingList.delete).not.toHaveBeenCalled();
  });

  it("zusammengefasste Positionen zählen nicht als neu", async () => {
    // 300 bestehende, die Quelle enthält nur gleiche Materialien → erlaubt
    m.db.shoppingListItem.findMany.mockResolvedValueOnce(items("alt", 50)).mockResolvedValueOnce(items("alt", 300));
    expect(await svc.mergeShoppingLists(user, "target", "source")).toEqual({ added: 0, merged: 50 });
  });
});
