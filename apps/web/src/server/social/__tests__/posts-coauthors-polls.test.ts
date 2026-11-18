import { beforeEach, describe, expect, it, vi } from "vitest";

/** Mitautor:innen ohne Blockierte/Gesperrte; Umfrage-Ende nur für veröffentlichte Beiträge. */
const m = vi.hoisted(() => {
  const fn = () => vi.fn();
  const db = {
    post: { findMany: fn(), findUnique: fn(), updateMany: fn(), update: fn() },
    poll: { findMany: fn(), updateMany: fn(), update: fn() },
    reaction: { findMany: fn() },
    bookmark: { findMany: fn() },
    pollVote: { findMany: fn() },
    userProfile: { update: fn(), findMany: fn() },
    $transaction: vi.fn(),
  };
  return { db, notify: vi.fn(async () => {}), relationsFor: vi.fn() };
});

vi.mock("@/server/db", () => ({ db: m.db }));
vi.mock("@/server/ratelimit", () => ({ limit: vi.fn() }));
vi.mock("@/server/notifications", () => ({ notify: m.notify }));
vi.mock("@/server/events", () => ({ emit: vi.fn() }));
vi.mock("@/server/visibility", () => ({ canViewContent: vi.fn(), relationsFor: m.relationsFor, visibleContentWhere: vi.fn() }));
vi.mock("@/server/authz", () => ({ assertOwnerOrMod: vi.fn(), hasRole: () => false }));
vi.mock("@/server/auth/adult", () => ({ requireAdult: vi.fn() }));
vi.mock("@/server/media/service", () => ({ attachMedia: vi.fn(), releaseMedia: vi.fn() }));
vi.mock("@/server/categories/settings", () => ({ assertCategoryAllowed: vi.fn() }));
vi.mock("@/server/commerce/restock", () => ({ isPublicProduct: () => true }));
vi.mock("../coauthors", () => ({ releaseQueuedCoauthorInvites: vi.fn() }));

const posts = await import("../posts");

beforeEach(() => {
  vi.clearAllMocks();
  m.db.$transaction.mockImplementation((f: (tx: typeof m.db) => unknown) => f(m.db));
  m.db.reaction.findMany.mockResolvedValue([]);
  m.db.bookmark.findMany.mockResolvedValue([]);
  m.db.pollVote.findMany.mockResolvedValue([]);
  m.relationsFor.mockResolvedValue({ blocked: ["blocked"], muted: [], following: [], hidden: [] });
});

const co = (id: string, status: string) => ({ user: { id, status, profile: { handle: id, displayName: id, avatarUrl: null } } });
const row = {
  id: "p1", kind: "TEXT", body: "Hallo", category: null, visibility: "PUBLIC", isCommercial: false, isPinned: false, isAnnouncement: false,
  publishedAt: new Date(), editedAt: null, authorId: "a", author: { id: "a", profile: { handle: "a", displayName: "A", avatarUrl: null } },
  media: [], project: null, tutorial: null, product: null, article: null, community: null, repostOf: null, poll: null,
  likeCount: 0, commentCount: 0, saveCount: 0, repostCount: 0,
  coauthors: [co("ok", "ACTIVE"), co("susp", "SUSPENDED"), co("banned", "BANNED"), co("gone", "DELETED"), co("blocked", "ACTIVE")],
};

describe("Mitautor:innen", () => {
  it("ohne blockierte, gesperrte und gelöschte Konten; zeitweise Gesperrte bleiben", async () => {
    m.db.post.findMany.mockResolvedValue([row]);
    const [v] = await posts.hydratePosts(["p1"], "viewer");
    expect(v!.coauthors.map((c) => c.id)).toEqual(["ok", "susp"]);
    const [anon] = await posts.hydratePosts(["p1"], null);
    expect(anon!.coauthors.map((c) => c.id)).toEqual(["ok", "susp", "blocked"]);
  });
});

describe("Umfrage-Ende", () => {
  it("meldet nur Umfragen veröffentlichter Beiträge", async () => {
    m.db.poll.findMany.mockResolvedValue([{ id: "poll", voterCount: 2, post: { id: "p1", authorId: "a", body: "x" } }]);
    m.db.poll.updateMany.mockResolvedValue({ count: 1 });
    await posts.notifyEndedPolls();
    expect(m.db.poll.findMany.mock.calls[0]![0].where.post).toEqual({ state: "PUBLISHED" });
    expect(m.db.poll.updateMany.mock.calls[0]![0].where.post).toEqual({ state: "PUBLISHED" });
    expect(m.notify).toHaveBeenCalledTimes(1);
  });

  it("Entwurf veröffentlichen verschiebt die Laufzeit und setzt die Ende-Meldung zurück", async () => {
    const created = new Date(Date.now() - 3600_000);
    m.db.post.findUnique.mockImplementation(async (q: { select: Record<string, unknown> }) =>
      q.select._count ? { authorId: "u1", state: "DRAFT", body: "x", _count: { media: 0 } } : { authorId: "u1", state: "DRAFT", createdAt: created, body: "x", repostOfId: null, poll: { id: "poll", endsAt: new Date(created.getTime() + 60_000) } },
    );
    m.db.post.updateMany.mockResolvedValue({ count: 1 });
    await posts.publishDraft({ id: "u1", role: "MEMBER" } as never, "p1");
    const data = m.db.poll.update.mock.calls[0]![0].data;
    expect(data.endNotifiedAt).toBeNull();
    expect(data.endsAt.getTime()).toBeGreaterThan(Date.now());
  });
});
