import { beforeEach, describe, expect, it, vi } from "vitest";

// Aufrufzählung ohne Datenbank: Rate-Limits als Zähler im Speicher, Ziele/Sichtbarkeit als Stubs
const buckets = new Map<string, number>();
const meta = new Map<string, { ownerId: string; visibility: string; state: string; title: string; href: string }>();
const viewable = new Set<string>();
const created: unknown[] = [];
const bumped: string[] = [];

vi.mock("@/server/ratelimit", () => ({
  rateLimit: vi.fn(async (key: string, n: number) => {
    const c = (buckets.get(key) ?? 0) + 1;
    buckets.set(key, c);
    if (c > n) throw new Error("rate");
  }),
}));
vi.mock("@/server/social/targets", () => ({ targetMeta: vi.fn(async (_t: string, id: string) => meta.get(id) ?? null) }));
vi.mock("@/server/visibility", () => ({ canViewContent: vi.fn(async (viewer: string | null, m: { href: string }) => viewable.has(`${viewer}:${m.href}`)) }));
vi.mock("@/server/social/posts", () => ({ canViewCommunityContentOf: vi.fn(async () => true) }));
vi.mock("@/server/client-ip", () => ({ clientIp: () => "203.0.113.1" }));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ "user-agent": "Mozilla/5.0" }) }));
vi.mock("next/server", () => ({ after: (fn: () => unknown) => void fn() }));
vi.mock("@/server/db", () => ({
  db: {
    analyticsEvent: { create: vi.fn(async (a: unknown) => (created.push(a), { id: "e" })) },
    post: { findUnique: vi.fn(async () => null) },
    project: { update: vi.fn(async (a: { where: { id: string } }) => (bumped.push(a.where.id), { id: a.where.id })) },
    tutorial: { update: vi.fn() },
    blogArticle: { update: vi.fn() },
    product: { update: vi.fn() },
  },
}));

const { recordView, isBotUserAgent } = await import("../analytics/service");
const req = { ua: "Mozilla/5.0 (iPhone)", ip: "198.51.100.4" };

beforeEach(() => {
  buckets.clear();
  meta.clear();
  viewable.clear();
  created.length = 0;
  bumped.length = 0;
  meta.set("p1", { ownerId: "owner", visibility: "PUBLIC", state: "PUBLISHED", title: "P", href: "/p1" });
  viewable.add("null:/p1").add("u1:/p1").add("owner:/p1");
});

describe("Aufrufe zählen (recordView)", () => {
  it("zählt denselben Betrachter innerhalb von 30 Minuten nur einmal", async () => {
    expect(await recordView({ viewerId: null, targetType: "PROJECT", targetId: "p1", request: req })).toEqual({ counted: true });
    expect(await recordView({ viewerId: null, targetType: "PROJECT", targetId: "p1", request: req })).toMatchObject({ counted: false, reason: "duplicate" });
    expect(bumped).toEqual(["p1"]);
    expect(created).toHaveLength(1);
  });

  it("ignoriert Bots, leere User-Agents und eigene Aufrufe", async () => {
    expect(isBotUserAgent("")).toBe(true);
    expect(isBotUserAgent("Mozilla/5.0 (compatible; Googlebot/2.1)")).toBe(true);
    expect(await recordView({ viewerId: null, targetType: "PROJECT", targetId: "p1", request: { ua: "facebookexternalhit/1.1", ip: "1.2.3.4" } })).toMatchObject({ reason: "bot" });
    expect(await recordView({ viewerId: "owner", targetType: "PROJECT", targetId: "p1", request: req })).toMatchObject({ reason: "own" });
    expect(bumped).toEqual([]);
  });

  it("verrät nicht, ob ein Ziel existiert oder nur unsichtbar ist", async () => {
    meta.set("privat", { ownerId: "owner", visibility: "PRIVATE", state: "PUBLISHED", title: "X", href: "/privat" });
    meta.set("entfernt", { ownerId: "owner", visibility: "PUBLIC", state: "REMOVED", title: "X", href: "/entfernt" });
    const results = await Promise.all(
      ["privat", "entfernt", "gibtsnicht"].map((id) => recordView({ viewerId: "u1", targetType: "PROJECT", targetId: id, request: req })),
    );
    for (const r of results) expect(r).toEqual({ counted: false, reason: "unavailable" });
    expect(created).toHaveLength(0);
  });
});
