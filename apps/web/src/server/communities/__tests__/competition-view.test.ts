import { beforeEach, describe, expect, it, vi } from "vitest";

/** Wettbewerbsseite: Einreichungen begrenzt (mit Gesamtzahl), Rohstimmen bis zum Ergebnis verborgen. */
const m = vi.hoisted(() => {
  const fn = () => vi.fn();
  return {
    db: {
      communityChallenge: { findUnique: fn() },
      challengeEntry: { findMany: fn(), count: fn(), findFirst: fn() },
      challengeVote: { findMany: fn() },
    },
    getProjectCards: vi.fn(async (ids: string[]) => ids.map((id) => ({ id }))),
  };
});
vi.mock("@/server/db", () => ({ db: m.db }));
vi.mock("@/server/notifications", () => ({ notify: vi.fn(), notifyMany: vi.fn() }));
vi.mock("@/server/projects/service", () => ({ getProjectCards: m.getProjectCards }));
vi.mock("@/server/ratelimit", () => ({ rateLimit: vi.fn() }));
vi.mock("@/server/authz", () => ({ hasRole: () => false, communityRole: async () => ({ state: "ACTIVE", role: "MEMBER", mutedUntil: null }) }));
vi.mock("../service", () => ({ canViewCommunityContent: () => true, isModRole: () => false, isMuted: () => false }));

const { getCompetition, COMPETITION_ENTRY_LIMIT } = await import("../competitions");
const viewer = { id: "u1", role: "MEMBER" } as never;
const day = 86400_000;
const challenge = (over: Record<string, unknown> = {}) => ({
  id: "ch",
  communityId: "com",
  title: "T",
  description: "",
  rules: "",
  prize: "",
  state: "ACTIVE",
  judging: "VOTES",
  startsAt: new Date(Date.now() - 10 * day),
  endsAt: new Date(Date.now() - 5 * day),
  votingEndsAt: new Date(Date.now() - day),
  resultsAt: null,
  community: { id: "com", slug: "c", name: "C", visibility: "PUBLIC", state: "PUBLISHED" },
  ...over,
});
const entry = (id: string, userId: string, voteCount: number, place: number | null = null) => ({ id, userId, projectId: `p-${id}`, note: "", voteCount, place, createdAt: new Date() });

beforeEach(() => {
  vi.clearAllMocks();
  m.db.challengeVote.findMany.mockResolvedValue([]);
});

describe("getCompetition", () => {
  it("Abstimmung vorbei, Ergebnis offen: keine Rohstimmen, keine Plätze", async () => {
    m.db.communityChallenge.findUnique.mockResolvedValue(challenge());
    m.db.challengeEntry.findMany.mockResolvedValue([entry("e1", "a", 7, 1), entry("e2", "b", 3)]);
    m.db.challengeEntry.count.mockResolvedValue(2);
    const c = (await getCompetition("ch", viewer))!;
    expect(c.phase).toBe("ended");
    expect(c.evaluating).toBe(true);
    expect(c.entries.map((e) => [e.votes, e.place])).toEqual([[null, null], [null, null]]);
  });

  it("nach dem Ergebnis: Stimmen und Plätze sichtbar", async () => {
    m.db.communityChallenge.findUnique.mockResolvedValue(challenge({ resultsAt: new Date(Date.now() - 1000) }));
    m.db.challengeEntry.findMany.mockResolvedValue([entry("e1", "a", 7, 1), entry("e2", "b", 3)]);
    m.db.challengeEntry.count.mockResolvedValue(2);
    const c = (await getCompetition("ch", viewer))!;
    expect(c.evaluating).toBe(false);
    expect(c.entries[0]).toMatchObject({ votes: 7, place: 1 });
  });

  it("begrenzt die Einreichungen, nennt die Gesamtzahl und findet die eigene auch ausserhalb", async () => {
    m.db.communityChallenge.findUnique.mockResolvedValue(challenge({ endsAt: new Date(Date.now() + day), votingEndsAt: new Date(Date.now() + 2 * day) }));
    m.db.challengeEntry.findMany.mockResolvedValue([entry("e1", "a", 0)]);
    m.db.challengeEntry.count.mockResolvedValue(500);
    m.db.challengeEntry.findFirst.mockResolvedValue(entry("mine", "u1", 0));
    const c = (await getCompetition("ch", viewer))!;
    expect(m.db.challengeEntry.findMany.mock.calls[0]![0].take).toBe(COMPETITION_ENTRY_LIMIT);
    expect(c.entryTotal).toBe(500);
    expect(c.viewer.myEntry).toMatchObject({ id: "mine" });
  });
});
