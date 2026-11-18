import { beforeEach, describe, expect, it, vi } from "vitest";

/** Events: Zähler nach Austritt vollständig, keine Erinnerungen/Übersicht für aufgelöste Communities. */
const m = vi.hoisted(() => {
  const fn = () => vi.fn();
  return {
    db: {
      communityEvent: { findMany: fn(), updateMany: fn(), update: fn(), findUnique: fn() },
      communityMember: { findMany: fn() },
      eventAttendee: { findMany: fn(), deleteMany: fn(), count: fn() },
    },
    notifyMany: vi.fn(async () => {}),
    communityRole: vi.fn(),
  };
});
vi.mock("@/server/db", () => ({ db: m.db }));
vi.mock("@/server/notifications", () => ({ notify: vi.fn(), notifyMany: m.notifyMany }));
vi.mock("@/server/ratelimit", () => ({ rateLimit: vi.fn() }));
vi.mock("@/server/authz", () => ({ hasRole: () => false, communityRole: m.communityRole }));
vi.mock("@/server/auth/adult", () => ({ requireAdult: vi.fn() }));
vi.mock("@/server/visibility", () => ({ relationsFor: vi.fn(async () => ({ blocked: [] })) }));
vi.mock("../service", () => ({ canViewCommunityContent: () => true, isModRole: () => false, isMuted: () => false }));

const ev = await import("../events");

beforeEach(() => vi.clearAllMocks());

describe("dropFutureAttendance", () => {
  it("setzt Zusagen und Interessierte neu", async () => {
    m.db.eventAttendee.findMany.mockResolvedValue([{ eventId: "e1" }]);
    m.db.eventAttendee.count.mockImplementation(async (q: { where: { status: string } }) => (q.where.status === "GOING" ? 4 : 2));
    expect(await ev.dropFutureAttendance(m.db as never, "c1", "u1")).toBe(1);
    expect(m.db.communityEvent.update).toHaveBeenCalledWith({ where: { id: "e1" }, data: { goingCount: 4, interestedCount: 2 } });
  });
});

describe("aufgelöste/entfernte Communities", () => {
  it("Erinnerungen nur für Events veröffentlichter Communities", async () => {
    m.db.communityEvent.findMany.mockResolvedValue([]);
    await ev.sendEventReminders();
    expect(m.db.communityEvent.findMany.mock.calls[0]![0].where.community).toEqual({ state: "PUBLISHED" });
  });

  it("„Meine“ Events ohne entfernte Communities", async () => {
    m.db.communityMember.findMany.mockResolvedValue([]);
    m.db.communityEvent.findMany.mockResolvedValue([]);
    m.db.eventAttendee.findMany.mockResolvedValue([]);
    await ev.eventsOverview({ id: "u1", role: "MEMBER" } as never);
    const mine = m.db.communityEvent.findMany.mock.calls.find((c) => c[0].where.attendees)![0];
    expect(mine.where.community).toEqual({ state: { in: ["PUBLISHED", "HIDDEN"] } });
  });

  it("keine Zusage für Events entfernter Communities", async () => {
    m.db.communityEvent.findUnique.mockResolvedValue({ id: "e1", communityId: "c1", organizerId: "o", state: "SCHEDULED", endsAt: new Date(Date.now() + 86400_000), capacity: null, title: "T", community: { slug: "c", state: "REMOVED" } });
    await expect(ev.setAttendance({ id: "u1", role: "MEMBER" } as never, "e1", "GOING")).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(m.communityRole).not.toHaveBeenCalled();
  });
});
