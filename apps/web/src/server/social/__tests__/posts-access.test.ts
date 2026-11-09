import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => {
  const fn = () => vi.fn();
  const db = {
    post: { findUnique: fn(), update: fn() },
    community: { findUnique: fn() },
    communityMember: { findUnique: fn() },
    user: { findUnique: fn() },
    userProfile: { findMany: fn() },
    $transaction: vi.fn(),
  };
  return { db, notify: vi.fn(), canViewContent: vi.fn() };
});

vi.mock("@/server/db", () => ({ db: m.db }));
vi.mock("@/server/ratelimit", () => ({ limit: vi.fn() }));
vi.mock("@/server/notifications", () => ({ notify: m.notify }));
vi.mock("@/server/events", () => ({ emit: vi.fn() }));
vi.mock("@/server/visibility", () => ({ canViewContent: m.canViewContent, relationsFor: vi.fn(), visibleContentWhere: vi.fn() }));
vi.mock("@/server/authz", () => ({
  assertOwnerOrMod: vi.fn(),
  hasRole: (u: { role: string; totpEnabledAt?: Date | null } | null) => !!u && u.role !== "MEMBER" && !!u.totpEnabledAt,
}));
vi.mock("@/server/media/service", () => ({ attachMedia: vi.fn() }));
vi.mock("@/server/settings", () => ({ getSetting: vi.fn() }));
vi.mock("@/server/categories/settings", () => ({ assertCategoryAllowed: vi.fn() }));

const posts = await import("../posts");
const member = (state: string | null, mutedUntil: Date | null = null) => m.db.communityMember.findUnique.mockResolvedValue(state ? { state, mutedUntil } : null);

beforeEach(() => {
  vi.clearAllMocks();
  m.db.user.findUnique.mockResolvedValue({ role: "MEMBER", totpEnabledAt: null });
});

describe("Beiträge ausgeblendeter Communities", () => {
  it("öffentliche, aktive Community: für alle sichtbar", async () => {
    m.db.community.findUnique.mockResolvedValue({ visibility: "PUBLIC", state: "PUBLISHED" });
    expect(await posts.canViewCommunityContentOf("c1", null)).toBe(true);
  });

  it("von der Plattform ausgeblendet: nur Mitglieder und Moderation", async () => {
    m.db.community.findUnique.mockResolvedValue({ visibility: "PUBLIC", state: "HIDDEN" });
    expect(await posts.canViewCommunityContentOf("c1", null)).toBe(false);
    member(null);
    expect(await posts.canViewCommunityContentOf("c1", "u1")).toBe(false);
    member("BANNED");
    expect(await posts.canViewCommunityContentOf("c1", "u1")).toBe(false);
    member("ACTIVE");
    expect(await posts.canViewCommunityContentOf("c1", "u1")).toBe(true);
    member(null);
    m.db.user.findUnique.mockResolvedValue({ role: "PLATFORM_MODERATOR", totpEnabledAt: new Date() });
    expect(await posts.canViewCommunityContentOf("c1", "mod")).toBe(true);
  });

  it("entfernt: für niemanden", async () => {
    m.db.community.findUnique.mockResolvedValue({ visibility: "PUBLIC", state: "REMOVED" });
    member("ACTIVE");
    expect(await posts.canViewCommunityContentOf("c1", "u1")).toBe(false);
  });
});

describe("Community-Beiträge bearbeiten", () => {
  const user = { id: "u1", role: "MEMBER" } as never;
  beforeEach(() => m.db.post.findUnique.mockResolvedValue({ authorId: "u1", state: "PUBLISHED", repostOfId: null, communityId: "c1" }));

  it("gesperrte Mitglieder können alte Beiträge nicht ändern", async () => {
    member("BANNED");
    await expect(posts.updatePost(user, "p1", { body: "neu" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(m.db.$transaction).not.toHaveBeenCalled();
  });

  it("stummgeschaltete Mitglieder ebenso", async () => {
    member("ACTIVE", new Date(Date.now() + 86400_000));
    await expect(posts.updatePost(user, "p1", { body: "neu" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(m.db.$transaction).not.toHaveBeenCalled();
  });

  it("abgelaufene Stummschaltung hindert nicht", async () => {
    member("ACTIVE", new Date(Date.now() - 1000));
    m.db.$transaction.mockResolvedValue(undefined);
    await posts.updatePost(user, "p1", { body: "neu" });
    expect(m.db.$transaction).toHaveBeenCalled();
  });
});

describe("Erwähnungen", () => {
  it("benachrichtigen nur Personen, die den Beitrag sehen dürfen", async () => {
    m.db.post.findUnique.mockResolvedValue({ authorId: "a", visibility: "FOLLOWERS", state: "PUBLISHED", communityId: null });
    m.db.userProfile.findMany.mockResolvedValue([{ userId: "follower" }, { userId: "stranger" }]);
    m.canViewContent.mockImplementation(async (viewerId: string) => viewerId === "follower");
    await posts.notifyMentions("Schau mal @follower und @stranger", "a", "p1");
    expect(m.notify).toHaveBeenCalledTimes(1);
    expect(m.notify).toHaveBeenCalledWith(expect.objectContaining({ recipientId: "follower", type: "MENTION" }));
  });

  it("in privaten Communities nur Mitglieder", async () => {
    m.db.post.findUnique.mockResolvedValue({ authorId: "a", visibility: "PUBLIC", state: "PUBLISHED", communityId: "c1" });
    m.db.userProfile.findMany.mockResolvedValue([{ userId: "outsider" }]);
    m.canViewContent.mockResolvedValue(true);
    m.db.community.findUnique.mockResolvedValue({ visibility: "PRIVATE", state: "PUBLISHED" });
    member(null);
    await posts.notifyMentions("@outsider schau", "a", "p1");
    expect(m.notify).not.toHaveBeenCalled();
  });
});
