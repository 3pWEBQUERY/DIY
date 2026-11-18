import { beforeEach, describe, expect, it, vi } from "vitest";

/** Profil-Sammlungen: FOLLOWERS nur für Folgende, nichts bei Blockierung oder gebanntem Konto. */
const m = vi.hoisted(() => {
  const fn = () => vi.fn();
  return { db: { user: { findUnique: fn() }, follow: { findUnique: fn() }, collection: { findMany: fn() } }, isBlockedBetween: vi.fn(async () => false) };
});
vi.mock("react", () => ({ cache: <T>(f: T) => f }));
vi.mock("@/server/db", () => ({ db: m.db }));
vi.mock("@/server/ratelimit", () => ({ rateLimit: vi.fn() }));
vi.mock("@/server/visibility", () => ({ canViewContent: vi.fn(), isBlockedBetween: m.isBlockedBetween, relationsFor: vi.fn(), visibleContentWhere: vi.fn() }));
vi.mock("@/server/auth/adult", () => ({ requireAdult: vi.fn() }));
vi.mock("@/server/social/posts", () => ({ hydratePosts: vi.fn(), viewableCommunityIds: vi.fn() }));
vi.mock("@/server/projects/service", () => ({ getProjectCards: vi.fn() }));
vi.mock("@/server/tutorials/service", () => ({ getTutorialCards: vi.fn() }));
vi.mock("@/server/commerce/restock", () => ({ publicProductWhere: {} }));

const { listPublicCollections } = await import("../service");

beforeEach(() => {
  vi.clearAllMocks();
  m.db.user.findUnique.mockResolvedValue({ status: "SUSPENDED" });
  m.db.collection.findMany.mockResolvedValue([]);
});
const visibility = () => m.db.collection.findMany.mock.calls.at(-1)![0].where.visibility;

describe("listPublicCollections", () => {
  it("Folgende sehen PUBLIC und FOLLOWERS, andere nur PUBLIC, Eigentümer:in alles", async () => {
    m.db.follow.findUnique.mockResolvedValueOnce({ followerId: "v" });
    await listPublicCollections("o", "v");
    expect(visibility()).toEqual({ in: ["PUBLIC", "FOLLOWERS"] });
    m.db.follow.findUnique.mockResolvedValueOnce(null);
    await listPublicCollections("o", "v");
    expect(visibility()).toEqual({ in: ["PUBLIC"] });
    await listPublicCollections("o", null);
    expect(visibility()).toEqual({ in: ["PUBLIC"] });
    await listPublicCollections("o", "o");
    expect(visibility()).toBeUndefined();
  });

  it("gebannt oder blockiert: keine Sammlungen", async () => {
    m.db.user.findUnique.mockResolvedValueOnce({ status: "BANNED" });
    expect(await listPublicCollections("o", "v")).toEqual([]);
    m.isBlockedBetween.mockResolvedValueOnce(true);
    expect(await listPublicCollections("o", "v")).toEqual([]);
    expect(m.db.collection.findMany).not.toHaveBeenCalled();
  });
});
