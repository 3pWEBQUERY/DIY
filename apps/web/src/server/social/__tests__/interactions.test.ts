import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => {
  const fn = () => vi.fn();
  const db = {
    post: { findUnique: fn(), update: fn() },
    project: { findUnique: fn(), update: fn() },
    tutorial: { findUnique: fn(), update: fn() },
    comment: { findUnique: fn(), findMany: fn(), create: fn(), count: fn(), updateMany: fn(), update: fn() },
    reaction: { findMany: fn(), create: fn() },
    bookmark: { findUnique: fn(), create: fn() },
    userBlock: { findMany: fn() },
    $transaction: vi.fn(),
  };
  db.$transaction.mockImplementation((f: (tx: typeof db) => unknown) => f(db));
  return { db, notify: vi.fn(), canViewContent: vi.fn(async () => true) };
});

vi.mock("@/server/db", () => ({ db: m.db, Prisma: { PrismaClientKnownRequestError: class extends Error {} } }));
vi.mock("@/server/ratelimit", () => ({ limit: vi.fn() }));
vi.mock("@/server/notifications", () => ({ notify: m.notify }));
vi.mock("@/server/events", () => ({ emit: vi.fn() }));
vi.mock("@/server/visibility", () => ({ canViewContent: m.canViewContent, isBlockedBetween: vi.fn(async () => false) }));
vi.mock("@/server/authz", () => ({ assertOwnerOrMod: vi.fn() }));
vi.mock("@/server/auth/adult", () => ({ requireAdult: vi.fn() }));
vi.mock("@/server/moderation/cases", () => ({ openOrAttachCase: vi.fn() }));
vi.mock("../posts", () => ({ canViewCommunityContentOf: vi.fn(async () => true), assertNotSilencedInCommunity: vi.fn(), assertCanCommentInCommunity: vi.fn() }));

const ix = await import("../interactions");
const user = { id: "u1", role: "MEMBER" } as never;

beforeEach(() => {
  vi.clearAllMocks();
  m.db.$transaction.mockImplementation((f: (tx: typeof m.db) => unknown) => f(m.db));
});

describe("Interaktionen nur auf vorgesehenen Inhalten", () => {
  it("Kommentare an Profile, Produkte, Communities oder Bewertungen werden abgelehnt – ohne Benachrichtigung", async () => {
    for (const type of ["USER", "PRODUCT", "COMMUNITY", "REVIEW", "MESSAGE", "COMMENT", "TUTORIAL_STEP"] as const) {
      await expect(ix.createComment(user, type, "victim", { body: "Schreib mir!" })).rejects.toMatchObject({ code: "VALIDATION" });
    }
    expect(m.db.comment.create).not.toHaveBeenCalled();
    expect(m.notify).not.toHaveBeenCalled();
  });

  it("Gefällt-mir und Merken nur für die Typen der App", async () => {
    for (const type of ["USER", "PRODUCT", "COMMUNITY", "REVIEW", "MESSAGE"] as const) {
      await expect(ix.setLike(user, type, "x", true)).rejects.toMatchObject({ code: "VALIDATION" });
    }
    for (const type of ["USER", "COMMENT", "COMMUNITY", "REVIEW", "MESSAGE"] as const) {
      await expect(ix.setBookmark(user, type, "x", true)).rejects.toMatchObject({ code: "VALIDATION" });
    }
    expect(m.notify).not.toHaveBeenCalled();
  });

  it("erlaubte Typen kommen bis zur Sichtbarkeitsprüfung", async () => {
    m.db.post.findUnique.mockResolvedValue(null);
    await expect(ix.setLike(user, "POST", "missing", true)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(ix.createComment(user, "POST", "missing", { body: "Hallo" })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("Kommentarliste für andere Typen ist leer", async () => {
    expect(await ix.listCommentPage("USER", "u2", "u1")).toEqual({ items: [], nextCursor: null });
    expect(m.db.comment.findMany).not.toHaveBeenCalled();
  });
});

describe("Kommentare seitenweise", () => {
  const row = (i: number) => ({
    id: `c${String(i).padStart(4, "0")}`,
    body: `Kommentar ${i}`,
    createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, i)),
    editedAt: null,
    likeCount: 0,
    isQuestion: false,
    isAnswer: false,
    author: { id: "a", profile: { handle: "a", displayName: "A", avatarUrl: null } },
    replies: [],
  });

  beforeEach(() => {
    m.db.post.findUnique.mockImplementation(async (q: { select: Record<string, boolean> }) =>
      q.select.communityId ? { communityId: null } : { authorId: "owner", visibility: "PUBLIC", state: "PUBLISHED", body: "Beitrag" },
    );
    m.db.userBlock.findMany.mockResolvedValue([]);
    m.db.reaction.findMany.mockResolvedValue([]);
  });

  it("zeigt die neuesten zuerst geladenen aufsteigend und liefert einen Cursor zu älteren", async () => {
    // 101 neueste (absteigend) → eine Seite à 100 + Hinweis auf mehr
    const desc = Array.from({ length: ix.COMMENT_PAGE + 1 }, (_, k) => row(500 - k));
    m.db.comment.findMany.mockImplementation(async (q: { where: { isAnswer: boolean } }) => (q.where.isAnswer ? [] : desc));
    const page = await ix.listCommentPage("POST", "p1", "u1");
    expect(page.items).toHaveLength(ix.COMMENT_PAGE);
    expect(page.items[0]!.id).toBe("c0401");
    expect(page.items.at(-1)!.id).toBe("c0500");
    expect(page.nextCursor).toBe(`${row(401).createdAt.toISOString()}_c0401`);
    expect(ix.decodeCommentCursor(page.nextCursor)).toEqual({ createdAt: row(401).createdAt, id: "c0401" });
  });

  it("filtert Kommentare und Antworten gesperrter Konten und lädt mit Cursor ältere", async () => {
    m.db.comment.findMany.mockResolvedValue([]);
    const cursor = `${row(401).createdAt.toISOString()}_c0401`;
    await ix.listCommentPage("POST", "p1", "u1", cursor);
    expect(m.db.comment.findMany).toHaveBeenCalledTimes(1); // ältere Seiten ohne die angehefteten Lösungen
    const q = m.db.comment.findMany.mock.calls[0]![0];
    expect(q.where.author).toEqual({ status: { in: ["ACTIVE", "SUSPENDED"] } });
    expect(q.include.replies.where.author).toEqual({ status: { in: ["ACTIVE", "SUSPENDED"] } });
    expect(q.where.OR).toEqual([{ createdAt: { lt: row(401).createdAt } }, { createdAt: row(401).createdAt, id: { lt: "c0401" } }]);
  });

  it("ungültiger Cursor → leere Seite", async () => {
    expect(await ix.listCommentPage("POST", "p1", "u1", "kaputt")).toEqual({ items: [], nextCursor: null });
    expect(ix.decodeCommentCursor("nicht-datum_x")).toBeNull();
  });
});

describe("Kommentar löschen", () => {
  it("zieht Antworten eines gelöschten Hauptkommentars mit vom Zähler ab", async () => {
    m.db.comment.findUnique.mockResolvedValue({ authorId: "u1", targetType: "POST", targetId: "p1", state: "PUBLISHED", parentId: null });
    m.db.post.findUnique.mockResolvedValue({ authorId: "owner", visibility: "PUBLIC", state: "PUBLISHED", body: "Beitrag" });
    m.db.comment.updateMany.mockResolvedValue({ count: 1 });
    m.db.comment.count.mockResolvedValue(3);
    await ix.deleteComment(user, "c1");
    expect(m.db.post.update).toHaveBeenCalledWith({ where: { id: "p1" }, data: { commentCount: { increment: -4 } } });
  });

  it("Antwort löschen zieht genau eins ab, doppelter Aufruf nichts", async () => {
    m.db.comment.findUnique.mockResolvedValue({ authorId: "u1", targetType: "POST", targetId: "p1", state: "PUBLISHED", parentId: "c1" });
    m.db.post.findUnique.mockResolvedValue({ authorId: "owner", visibility: "PUBLIC", state: "PUBLISHED", body: "Beitrag" });
    m.db.comment.updateMany.mockResolvedValueOnce({ count: 1 });
    await ix.deleteComment(user, "c2");
    expect(m.db.post.update).toHaveBeenCalledWith({ where: { id: "p1" }, data: { commentCount: { increment: -1 } } });
    m.db.post.update.mockClear();
    m.db.comment.updateMany.mockResolvedValue({ count: 0 });
    await ix.deleteComment(user, "c2");
    expect(m.db.post.update).not.toHaveBeenCalled();
  });
});
