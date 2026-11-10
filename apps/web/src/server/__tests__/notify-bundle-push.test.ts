import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => {
  const fn = () => vi.fn();
  return {
    db: {
      userBlock: { findFirst: fn(), findMany: fn() },
      userMute: { findUnique: fn(), findMany: fn() },
      userPreference: { findUnique: fn(), findMany: fn() },
      notification: { findFirst: fn(), findMany: fn(), update: fn(), updateMany: fn(), create: fn(), createMany: fn() },
    },
  };
});
vi.mock("@/server/db", () => ({ db: m.db }));
vi.mock("@/server/realtime/bus", () => ({ publish: vi.fn() }));

const { notify, notifyMany, shouldRepush, REPUSH_AFTER_MS } = await import("../notifications");

beforeEach(() => {
  vi.clearAllMocks();
  m.db.userBlock.findFirst.mockResolvedValue(null);
  m.db.userMute.findUnique.mockResolvedValue(null);
  m.db.userPreference.findUnique.mockResolvedValue(null);
  m.db.userBlock.findMany.mockResolvedValue([]);
  m.db.userMute.findMany.mockResolvedValue([]);
  m.db.userPreference.findMany.mockResolvedValue([]);
});

describe("Push bei gebündelten Benachrichtigungen", () => {
  it("shouldRepush: nie gepusht oder länger her → ja, kürzlich → nein", () => {
    const now = new Date("2026-11-10T12:00:00Z");
    expect(shouldRepush(null, now)).toBe(true);
    expect(shouldRepush(new Date(now.getTime() - 60_000), now)).toBe(false);
    expect(shouldRepush(new Date(now.getTime() - REPUSH_AFTER_MS), now)).toBe(true);
  });

  it("notify: kürzlich gepushter Eintrag wird still hochgezählt", async () => {
    m.db.notification.findFirst.mockResolvedValue({ id: "n1", pushedAt: new Date(Date.now() - 10_000) });
    await notify({ recipientId: "r", actorId: "a", type: "LIKE", targetType: "POST", targetId: "p" });
    const data = m.db.notification.update.mock.calls[0]![0].data;
    expect(data.count).toEqual({ increment: 1 });
    expect("pushedAt" in data).toBe(false);
  });

  it("notify: alter Push → wieder freigeben", async () => {
    m.db.notification.findFirst.mockResolvedValue({ id: "n1", pushedAt: new Date(Date.now() - REPUSH_AFTER_MS - 1000) });
    await notify({ recipientId: "r", actorId: "a", type: "LIKE", targetType: "POST", targetId: "p" });
    expect(m.db.notification.update.mock.calls[0]![0].data.pushedAt).toBeNull();
  });

  it("notifyMany: pushedAt nur für länger zurückliegende Pushes zurücksetzen", async () => {
    m.db.notification.findMany.mockResolvedValue([{ id: "n1", recipientId: "r1" }]);
    await notifyMany(["r1", "r2"], { actorId: "a", type: "LIKE", targetType: "POST", targetId: "p" });
    const [count, reset] = m.db.notification.updateMany.mock.calls.map((c) => c[0]);
    expect("pushedAt" in count.data).toBe(false);
    expect(reset.where.pushedAt.lt).toBeInstanceOf(Date);
    expect(reset.data).toEqual({ pushedAt: null });
    expect(m.db.notification.createMany.mock.calls[0]![0].data.map((d: { recipientId: string }) => d.recipientId)).toEqual(["r2"]);
  });
});
