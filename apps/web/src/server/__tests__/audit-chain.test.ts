import { describe, expect, it, vi } from "vitest";

// In-Memory-Ersatz für die AuditEvent-Tabelle: schreibt wie Prisma (id/seq/prevHash/hash) und liest volle Zeilen
type Row = { id: string; seq: number; actorId: string | null; action: string; targetType: string | null; targetId: string | null; meta: unknown; prevHash: string | null; hash: string; createdAt: Date };
const rows: Row[] = [];
const table = {
  findFirst: async (q: { where?: { seq?: { lt: number } } }) => {
    const list = q.where?.seq ? rows.filter((r) => r.seq < q.where!.seq!.lt) : rows;
    return list[list.length - 1] ?? null;
  },
  findMany: async () => [...rows].reverse(),
  create: async ({ data }: { data: Omit<Row, "id" | "seq"> }) => {
    const r = { ...data, id: `id${rows.length + 1}`, seq: rows.length + 1 };
    rows.push(r);
    return r;
  },
};
const client = { auditEvent: table, $executeRaw: async () => 0 };
vi.mock("@/server/db", () => ({ db: { ...client, $transaction: (fn: (t: typeof client) => unknown) => fn(client) } }));
const { audit, verifyAuditChain } = await import("../audit");

describe("Audit-Kette", () => {
  it("unveränderte Kette ist gültig", async () => {
    await audit({ actorId: "u1", action: "a.one", targetType: "USER", targetId: "u2", meta: { b: 2, a: 1 } });
    await audit({ action: "a.two" });
    await audit({ actorId: "u3", action: "a.three", meta: { nested: { z: 1, y: [1, 2] } } });
    expect(await verifyAuditChain()).toEqual({ ok: true, checked: 3 });
  });
  it("erkennt manipulierte Einträge", async () => {
    rows[1]!.action = "a.manipuliert";
    const r = await verifyAuditChain();
    expect(r.ok).toBe(false);
    expect(r).toMatchObject({ brokenAt: 2 });
  });
});
