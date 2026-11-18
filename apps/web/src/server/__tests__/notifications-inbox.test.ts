import { beforeEach, describe, expect, it, vi } from "vitest";

/** Posteingang: Auslöser, die blockiert (beide Richtungen), gesperrt oder gelöscht sind, erscheinen nicht. */
const m = vi.hoisted(() => ({
  db: { notification: { findMany: vi.fn(), groupBy: vi.fn() } },
  relationsFor: vi.fn(),
}));
vi.mock("@/server/db", () => ({ db: m.db }));
vi.mock("@/server/visibility", () => ({ relationsFor: m.relationsFor }));

const { listNotifications, unreadByFilter } = await import("../notifications-inbox");

beforeEach(() => {
  vi.clearAllMocks();
  m.db.notification.findMany.mockResolvedValue([]);
  m.db.notification.groupBy.mockResolvedValue([]);
});

const actorFilter = (blocked?: string[]) => ({
  OR: [{ actorId: null }, { actor: { status: { in: ["ACTIVE", "SUSPENDED"] }, ...(blocked ? { id: { notIn: blocked } } : {}) } }],
});

describe("Benachrichtigungen ohne blockierte oder gesperrte Auslöser", () => {
  it("filtert in der Datenbank (Seitengrösse und Cursor bleiben korrekt), System-Einträge bleiben", async () => {
    m.relationsFor.mockResolvedValue({ blocked: ["b1", "b2"] });
    const cursor = Buffer.from(`${new Date("2026-01-01T00:00:00Z").toISOString()}|n9`).toString("base64url");
    await listNotifications("u1", { cursor, limit: 10 });
    const q = m.db.notification.findMany.mock.calls[0]![0];
    expect(q.where.AND).toEqual([actorFilter(["b1", "b2"])]);
    // Cursor-Bedingung bleibt erhalten (eigenes OR, nicht überschrieben)
    expect(q.where.OR).toHaveLength(2);
    expect(q.take).toBe(11);
  });

  it("ohne Blockierungen nur der Status-Filter; Ungelesen-Zähler nutzt dieselbe Regel", async () => {
    m.relationsFor.mockResolvedValue({ blocked: [] });
    await listNotifications("u1");
    expect(m.db.notification.findMany.mock.calls[0]![0].where.AND).toEqual([actorFilter()]);
    await unreadByFilter("u1");
    expect(m.db.notification.groupBy.mock.calls[0]![0].where).toEqual({ recipientId: "u1", readAt: null, AND: [actorFilter()] });
  });
});
