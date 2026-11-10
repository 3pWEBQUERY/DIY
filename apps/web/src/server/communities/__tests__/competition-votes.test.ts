import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => {
  const fn = () => vi.fn();
  return {
    db: {
      communityChallenge: { findUnique: fn(), update: fn() },
      challengeVote: { groupBy: fn() },
      challengeEntry: { findMany: fn(), updateMany: fn(), update: fn() },
      $transaction: fn(),
    },
  };
});
vi.mock("server-only", () => ({}));
vi.mock("@/server/db", () => ({ db: m.db }));
vi.mock("@/server/notifications", () => ({ notify: vi.fn(), notifyMany: vi.fn() }));
vi.mock("@/server/projects/service", () => ({ getProjectCards: vi.fn() }));
vi.mock("../service", () => ({ canViewCommunityContent: vi.fn(), isModRole: vi.fn(), isMuted: vi.fn() }));

const { podium, finalizeVotes } = await import("../competitions");
const t = (n: number) => new Date(2026, 10, n);
const pub = { state: "PUBLISHED", visibility: "PUBLIC" };

beforeEach(() => {
  vi.clearAllMocks();
  m.db.$transaction.mockResolvedValue([]);
  m.db.challengeEntry.update.mockImplementation((a: unknown) => ({ op: "update", ...(a as object) }));
  m.db.challengeEntry.updateMany.mockImplementation((a: unknown) => ({ op: "updateMany", ...(a as object) }));
  m.db.communityChallenge.update.mockImplementation((a: unknown) => ({ op: "challenge", ...(a as object) }));
});

describe("Wettbewerb – Auswertung", () => {
  it("podium: nach gültigen Stimmen, Gleichstand → frühere Einreichung, ohne Nullstimmen", () => {
    const entries = [{ id: "a", createdAt: t(3) }, { id: "b", createdAt: t(1) }, { id: "c", createdAt: t(2) }, { id: "d", createdAt: t(4) }];
    expect(podium(entries, new Map([["a", 2], ["b", 2], ["c", 5]]))).toEqual(["c", "b", "a"]);
    expect(podium(entries, new Map([["d", 1]]))).toEqual(["d"]);
  });

  it("zählt nur Stimmen aktiver Mitglieder und korrigiert den gespeicherten Zähler", async () => {
    m.db.communityChallenge.findUnique.mockResolvedValueOnce({ communityId: "com" }).mockResolvedValue(null);
    // a hatte 3 Stimmen, davon 2 von inzwischen gesperrten/ausgetretenen Personen
    m.db.challengeVote.groupBy.mockResolvedValue([{ entryId: "a", _count: { _all: 1 } }, { entryId: "b", _count: { _all: 2 } }]);
    m.db.challengeEntry.findMany.mockResolvedValue([
      { id: "a", createdAt: t(1), voteCount: 3, project: pub },
      { id: "b", createdAt: t(2), voteCount: 2, project: pub },
    ]);
    await finalizeVotes("ch");
    const where = m.db.challengeVote.groupBy.mock.calls[0]![0].where;
    expect(where.user.communityMemberships.some).toEqual({ communityId: "com", state: "ACTIVE" });
    const ops = m.db.$transaction.mock.calls[0]![0] as { op: string; where: { id?: string }; data: Record<string, unknown> }[];
    expect(ops.find((o) => o.op === "update" && o.where.id === "a" && "voteCount" in o.data)?.data.voteCount).toBe(1);
    expect(ops.some((o) => o.op === "update" && o.where.id === "b" && "voteCount" in o.data)).toBe(false);
    const places = ops.filter((o) => o.op === "update" && "place" in o.data).map((o) => [o.where.id, o.data.place]);
    expect(places).toEqual([["b", 1], ["a", 2]]);
  });
});
