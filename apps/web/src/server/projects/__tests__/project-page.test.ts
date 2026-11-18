import { beforeEach, describe, expect, it, vi } from "vitest";

/** Projekt löschen führt Wettbewerbszähler mit; Projektseite: Nachbauten ohne gesperrte Konten, Journal begrenzt. */
const m = vi.hoisted(() => {
  const fn = () => vi.fn();
  const db = {
    project: { findUnique: fn(), updateMany: fn(), delete: fn(), count: fn() },
    projectRelation: { findMany: fn() },
    projectMedia: { findMany: fn() },
    projectUpdate: { findMany: fn(), aggregate: fn() },
    challengeEntry: { findMany: fn() },
    communityChallenge: { updateMany: fn() },
    bookmark: { deleteMany: fn(), findFirst: fn() },
    reaction: { deleteMany: fn(), findFirst: fn() },
    comment: { deleteMany: fn() },
    userProfile: { updateMany: fn(), findUnique: fn() },
    post: { findMany: fn() },
    $transaction: vi.fn(),
  };
  return { db, canViewContent: vi.fn(async () => true) };
});

vi.mock("react", () => ({ cache: <T>(f: T) => f }));
vi.mock("@/server/db", () => ({ db: m.db }));
vi.mock("@/server/ratelimit", () => ({ limit: vi.fn() }));
vi.mock("@/server/notifications", () => ({ notify: vi.fn() }));
vi.mock("@/server/events", () => ({ emit: vi.fn() }));
vi.mock("@/server/audit", () => ({ audit: vi.fn() }));
vi.mock("@/server/visibility", () => ({ canViewContent: m.canViewContent, relationsFor: vi.fn(async () => ({ blocked: [], muted: [], following: [], hidden: [] })), visibleContentWhere: vi.fn() }));
vi.mock("@/server/authz", () => ({ hasRole: () => false }));
vi.mock("@/server/auth/adult", () => ({ requireAdult: vi.fn() }));
vi.mock("@/server/media/service", () => ({ attachMedia: vi.fn(), mediaCoverUrl: vi.fn(), patchFrozenMediaRefsLater: vi.fn(), releaseMedia: vi.fn() }));
vi.mock("@/server/social/posts", () => ({ createPost: vi.fn() }));
vi.mock("@/server/social/interactions", () => ({ listCommentPage: vi.fn(async () => ({ items: [], nextCursor: null })) }));
vi.mock("@/server/categories/settings", () => ({ assertCategoryAllowed: vi.fn() }));
vi.mock("@/server/commerce/restock", () => ({ publicProductWhere: {} }));

const svc = await import("../service");
const owner = { id: "u1", role: "MEMBER" } as never;

beforeEach(() => {
  vi.clearAllMocks();
  m.db.$transaction.mockImplementation((f: (tx: typeof m.db) => unknown) => f(m.db));
});

describe("Projekt löschen", () => {
  it("zieht aktive Wettbewerbs-Einreichungen vom Zähler ab, bevor die Cascade sie löscht", async () => {
    m.db.project.findUnique.mockResolvedValue({ ownerId: "u1", state: "PUBLISHED", coverMediaId: null });
    m.db.projectMedia.findMany.mockResolvedValue([]);
    m.db.projectUpdate.findMany.mockResolvedValue([]);
    m.db.projectRelation.findMany.mockResolvedValue([]);
    m.db.challengeEntry.findMany.mockResolvedValue([{ challengeId: "ch1" }, { challengeId: "ch2" }]);
    await svc.deleteProject(owner, "p1");
    expect(m.db.challengeEntry.findMany).toHaveBeenCalledWith({ where: { projectId: "p1", state: "ACTIVE" }, select: { challengeId: true } });
    expect(m.db.communityChallenge.updateMany).toHaveBeenCalledTimes(2);
    expect(m.db.communityChallenge.updateMany).toHaveBeenCalledWith({ where: { id: "ch1", entryCount: { gt: 0 } }, data: { entryCount: { decrement: 1 } } });
    expect(m.db.communityChallenge.updateMany.mock.invocationCallOrder[1]).toBeLessThan(m.db.project.delete.mock.invocationCallOrder[0]!);
  });
});

describe("Projektseite", () => {
  const update = (i: number, minutes = 10) => ({ id: `j${i}`, body: `E${i}`, milestone: null, problem: null, solution: null, minutes, media: [], happenedAt: new Date(Date.UTC(2026, 0, i)), post: null, authorId: "u1", author: { id: "u1", profile: { handle: "h", displayName: "H", avatarUrl: null } } });
  const page = (updates: ReturnType<typeof update>[], total: number) => ({
    id: "p1", ownerId: "u1", slug: "s", title: "T", description: "", category: "holz", subcategories: [], tags: [], coverUrl: null, coverMediaId: null,
    difficulty: 1, estimatedMinutes: null, actualMinutes: null, budgetMinor: null, currency: "CHF", status: "IN_PROGRESS", visibility: "PUBLIC", state: "PUBLISHED",
    publishedAt: new Date(), createdAt: new Date(), updatedAt: new Date(), completedAt: null, viewCount: 0, likeCount: 0, saveCount: 0, remixCount: 0, commentCount: 0, remixNote: "",
    owner: { id: "u1", status: "ACTIVE", profile: { handle: "h", displayName: "H", avatarUrl: null, bio: "", followerCount: 0, projectCount: 0 } },
    media: [], updates, materials: [], tools: [], outgoing: [], incoming: [], contributors: [], tutorials: [], products: [], articles: [],
    _count: { followers: 0, updates: total },
  });

  beforeEach(() => {
    m.db.userProfile.findUnique.mockResolvedValue({ userId: "u1" });
    m.db.post.findMany.mockResolvedValue([]);
  });

  it("lädt die neuesten Journaleinträge begrenzt, zeigt sie aufsteigend und meldet ältere", async () => {
    m.db.project.findUnique.mockResolvedValue(page([update(3), update(2)], 250));
    m.db.projectUpdate.aggregate.mockResolvedValue({ _sum: { minutes: 999 } });
    const r = await svc.getProjectPage("h", "s", null);
    const q = m.db.project.findUnique.mock.calls[0]![0];
    expect(q.include.updates.take).toBe(svc.JOURNAL_LIMIT);
    expect(q.include.updates.orderBy).toEqual([{ happenedAt: "desc" }, { id: "desc" }]);
    expect(q.include.incoming.where).toEqual({ kind: "REMIX", from: { state: "PUBLISHED", owner: { status: { in: ["ACTIVE", "SUSPENDED"] } } } });
    if (r?.kind !== "ok") throw new Error("erwartet ok");
    expect(r.project.journal.map((j) => j.id)).toEqual(["j2", "j3"]);
    expect(r.project.journalTotal).toBe(250);
    expect(r.project.journalHasMore).toBe(true);
    expect(r.project.journalMinutes).toBe(999);
  });

  it("vollständiges Journal: Zeit aus den geladenen Einträgen, nichts weiter", async () => {
    m.db.project.findUnique.mockResolvedValue(page([update(2, 5), update(1, 7)], 2));
    const r = await svc.getProjectPage("h", "s", null);
    if (r?.kind !== "ok") throw new Error("erwartet ok");
    expect(r.project.journalHasMore).toBe(false);
    expect(r.project.journalMinutes).toBe(12);
    expect(m.db.projectUpdate.aggregate).not.toHaveBeenCalled();
  });
});
