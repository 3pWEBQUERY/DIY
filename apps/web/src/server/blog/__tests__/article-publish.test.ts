import { beforeEach, describe, expect, it, vi } from "vitest";

/** Erstveröffentlichung genau einmal; Löschen räumt polymorphe Verknüpfungen mit ab; zeitweise Gesperrte bleiben sichtbar. */
const m = vi.hoisted(() => {
  const fn = () => vi.fn();
  const db = {
    blogArticle: { findUnique: fn(), update: fn(), updateMany: fn(), delete: fn(), findMany: fn() },
    post: { deleteMany: fn() },
    bookmark: { deleteMany: fn() },
    reaction: { deleteMany: fn() },
    comment: { deleteMany: fn() },
    $transaction: vi.fn(async (ops: unknown[]) => ops),
  };
  return { db, emit: vi.fn(), createPost: vi.fn() };
});

vi.mock("react", () => ({ cache: <T>(f: T) => f }));
vi.mock("@/server/db", () => ({ db: m.db, Prisma: {} }));
vi.mock("@/server/ratelimit", () => ({ limit: vi.fn() }));
vi.mock("@/server/events", () => ({ emit: m.emit }));
vi.mock("@/server/visibility", () => ({ relationsFor: vi.fn(async () => ({ blocked: [], muted: [], following: [], hidden: [] })) }));
vi.mock("@/server/media/service", () => ({ attachMedia: vi.fn() }));
vi.mock("@/server/social/posts", () => ({ createPost: m.createPost }));
vi.mock("@/server/auth/session", () => ({ currentUser: vi.fn() }));
vi.mock("@/server/auth/adult", () => ({ requireAdult: vi.fn() }));
vi.mock("@/server/commerce/restock", () => ({ publicProductWhere: {} }));

const blog = await import("../service");
const user = { id: "u1", role: "MEMBER" } as never;
const draft = { id: "a1", authorId: "u1", state: "DRAFT", publishedAt: null, title: "T", dek: "D", blocks: [{ id: "b", type: "paragraph", text: "Hallo" }] };

beforeEach(() => {
  vi.clearAllMocks();
  m.db.blogArticle.findUnique.mockResolvedValue(draft);
});

describe("publishArticle", () => {
  it("beansprucht die Erstveröffentlichung bedingt und löst sie einmal aus", async () => {
    m.db.blogArticle.updateMany.mockResolvedValue({ count: 1 });
    const r = await blog.publishArticle(user, "a1", { shareToFeed: true });
    expect(r.state).toBe("PUBLISHED");
    expect(m.db.blogArticle.updateMany.mock.calls[0]![0].where).toEqual({ id: "a1", OR: [{ state: "SCHEDULED" }, { state: "DRAFT", publishedAt: null }] });
    expect(m.emit).toHaveBeenCalledTimes(1);
    expect(m.createPost).toHaveBeenCalledTimes(1);
  });

  it("parallel schon veröffentlicht: keine zweite Ankündigung", async () => {
    m.db.blogArticle.updateMany.mockResolvedValue({ count: 0 });
    m.db.blogArticle.findUnique.mockResolvedValueOnce(draft).mockResolvedValueOnce({ state: "PUBLISHED", publishedAt: new Date("2026-11-01T00:00:00Z") });
    const r = await blog.publishArticle(user, "a1", { shareToFeed: true });
    expect(r).toEqual({ state: "PUBLISHED", publishedAt: "2026-11-01T00:00:00.000Z" });
    expect(m.emit).not.toHaveBeenCalled();
    expect(m.createPost).not.toHaveBeenCalled();
  });

  it("wieder veröffentlicht (früher schon online): ohne Erstveröffentlichung", async () => {
    const at = new Date("2026-10-01T00:00:00Z");
    m.db.blogArticle.findUnique.mockResolvedValue({ ...draft, publishedAt: at });
    await blog.publishArticle(user, "a1", {});
    expect(m.db.blogArticle.update).toHaveBeenCalledWith({ where: { id: "a1" }, data: { state: "PUBLISHED", publishedAt: at } });
    expect(m.db.blogArticle.updateMany).not.toHaveBeenCalled();
    expect(m.emit).not.toHaveBeenCalled();
  });
});

describe("deleteArticle", () => {
  it("löscht Merken, Reaktionen und Kommentare zum Artikel in derselben Transaktion", async () => {
    await blog.deleteArticle(user, "a1");
    const w = { where: { targetType: "ARTICLE", targetId: "a1" } };
    expect(m.db.bookmark.deleteMany).toHaveBeenCalledWith(w);
    expect(m.db.reaction.deleteMany).toHaveBeenCalledWith(w);
    expect(m.db.comment.deleteMany).toHaveBeenCalledWith(w);
    expect(m.db.$transaction).toHaveBeenCalledTimes(1);
    expect((m.db.$transaction.mock.calls[0]![0] as unknown[]).length).toBe(5);
  });
});

describe("Artikel-Sitemap", () => {
  it("zeitweise gesperrte Autor:innen bleiben, gebannte nicht", async () => {
    m.db.blogArticle.findMany.mockResolvedValue([]);
    await blog.getArticleSitemapEntries();
    expect(m.db.blogArticle.findMany.mock.calls[0]![0].where.author).toEqual({ status: { in: ["ACTIVE", "SUSPENDED"] } });
  });
});
