import { beforeEach, describe, expect, it, vi } from "vitest";

/** Einreichen: Die „schon eingereicht?“-Prüfung läuft unter einer Sperre – parallel zählt entryCount nur einmal. */
const m = vi.hoisted(() => {
  const fn = () => vi.fn();
  const tx = {
    $executeRaw: fn(),
    challengeEntry: { findUnique: fn(), upsert: fn() },
    communityChallenge: { update: fn() },
  };
  return {
    tx,
    db: {
      communityChallenge: { findUnique: fn() },
      project: { findUnique: fn() },
      challengeEntry: { findUnique: fn() },
      $transaction: vi.fn(async (f: (t: typeof tx) => unknown) => f(tx)),
    },
  };
});
vi.mock("@/server/db", () => ({ db: m.db }));
vi.mock("@/server/notifications", () => ({ notify: vi.fn(), notifyMany: vi.fn() }));
vi.mock("@/server/projects/service", () => ({ getProjectCards: vi.fn() }));
vi.mock("@/server/ratelimit", () => ({ rateLimit: vi.fn() }));
vi.mock("@/server/authz", () => ({ hasRole: () => false, communityRole: async () => ({ state: "ACTIVE", role: "MEMBER", mutedUntil: null }) }));
vi.mock("../service", () => ({ canViewCommunityContent: () => true, isModRole: () => false, isMuted: () => false }));

const { submitEntry } = await import("../competitions");
const user = { id: "u1", role: "MEMBER" } as never;

beforeEach(() => {
  vi.clearAllMocks();
  const now = Date.now();
  m.db.communityChallenge.findUnique.mockResolvedValue({
    id: "ch",
    communityId: "com",
    state: "ACTIVE",
    judging: "VOTES",
    startsAt: new Date(now - 86400_000),
    endsAt: new Date(now + 86400_000),
    votingEndsAt: null,
    resultsAt: null,
    community: { id: "com", slug: "c", name: "C", visibility: "PUBLIC", state: "PUBLISHED" },
  });
  m.db.project.findUnique.mockResolvedValue({ ownerId: "u1", state: "PUBLISHED", visibility: "PUBLIC" });
});

describe("submitEntry", () => {
  it("erste Einreichung: Sperre vor der Prüfung, Zähler +1", async () => {
    m.tx.challengeEntry.findUnique.mockResolvedValue(null);
    expect(await submitEntry(user, "ch", { projectId: "p1" })).toEqual({ replaced: false });
    expect(m.tx.$executeRaw).toHaveBeenCalledTimes(1);
    expect(m.tx.$executeRaw.mock.invocationCallOrder[0]).toBeLessThan(m.tx.challengeEntry.findUnique.mock.invocationCallOrder[0]!);
    expect(m.tx.communityChallenge.update).toHaveBeenCalledWith({ where: { id: "ch" }, data: { entryCount: { increment: 1 } } });
  });

  it("parallel schon angelegt (unter der Sperre sichtbar): ersetzt, zählt nicht erneut", async () => {
    m.tx.challengeEntry.findUnique.mockResolvedValue({ state: "ACTIVE" });
    expect(await submitEntry(user, "ch", { projectId: "p1" })).toEqual({ replaced: true });
    expect(m.tx.challengeEntry.upsert).toHaveBeenCalled();
    expect(m.tx.communityChallenge.update).not.toHaveBeenCalled();
  });

  it("von der Moderation entfernte Einreichung bleibt gesperrt", async () => {
    m.tx.challengeEntry.findUnique.mockResolvedValue({ state: "REMOVED" });
    await expect(submitEntry(user, "ch", { projectId: "p1" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(m.tx.challengeEntry.upsert).not.toHaveBeenCalled();
  });
});
