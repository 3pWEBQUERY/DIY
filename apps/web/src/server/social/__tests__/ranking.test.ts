import { describe, expect, it } from "vitest";
import { rankFeed, scoreCandidate, type Candidate } from "../ranking";

const now = new Date("2026-11-03T12:00:00Z");
const base = (o: Partial<Candidate>): Candidate => ({
  id: Math.random().toString(36).slice(2),
  authorId: "a",
  category: "holz",
  publishedAt: new Date(now.getTime() - 3600_000),
  likeCount: 0,
  commentCount: 0,
  saveCount: 0,
  qualityScore: 0.5,
  isCommercial: false,
  authorFollowers: 10,
  hasMedia: false,
  hasProject: false,
  ...o,
});
const ctx = { now, interests: ["haekeln-stricken"], following: new Set<string>() };

describe("Feed-Ranking (PRD §9.5)", () => {
  it("bevorzugt frische Inhalte", () => {
    const fresh = scoreCandidate(base({ publishedAt: new Date(now.getTime() - 3600_000) }), ctx);
    const old = scoreCandidate(base({ publishedAt: new Date(now.getTime() - 10 * 86400_000) }), ctx);
    expect(fresh).toBeGreaterThan(old);
  });

  it("berücksichtigt Interessen", () => {
    expect(scoreCandidate(base({ category: "haekeln-stricken" }), ctx)).toBeGreaterThan(scoreCandidate(base({ category: "holz" }), ctx));
  });

  it("schliesst kleine Creator nicht systematisch aus (Engagement relativ zur Reichweite)", () => {
    const small = scoreCandidate(base({ authorFollowers: 20, likeCount: 15, commentCount: 4 }), ctx);
    const big = scoreCandidate(base({ authorFollowers: 50_000, likeCount: 40, commentCount: 4 }), ctx);
    expect(small).toBeGreaterThan(big * 0.9);
  });

  it("dämpft Verkaufsposts", () => {
    expect(scoreCandidate(base({ isCommercial: true }), ctx)).toBeLessThan(scoreCandidate(base({}), ctx));
  });

  it("begrenzt Beiträge pro Autor je Seite (Vielfalt)", () => {
    const items = [
      ...Array.from({ length: 6 }, (_, i) => base({ id: `a${i}`, authorId: "star", likeCount: 100, category: `c${i}` })),
      ...Array.from({ length: 6 }, (_, i) => base({ id: `b${i}`, authorId: `small${i}`, category: `d${i}` })),
    ];
    const ranked = rankFeed(items, ctx, { authorCap: 2, pageSize: 6 });
    const firstPage = ranked.slice(0, 6);
    expect(firstPage.filter((id) => id.startsWith("a")).length).toBeLessThanOrEqual(2);
    expect(new Set(ranked).size).toBe(ranked.length);
  });

  it("entfernt Duplikate", () => {
    const c = base({ id: "x" });
    expect(rankFeed([c, c, c], ctx, { authorCap: 2, pageSize: 10 })).toEqual(["x"]);
  });
});
