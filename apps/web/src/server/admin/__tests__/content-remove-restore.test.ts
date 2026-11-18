import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Entfernen/Wiederherstellen (Admin → Inhalte): Wiederherstellen kehrt in den protokollierten Zustand
 * zurück; bei Artikeln genau die beim Entfernen ausgeblendeten Feed-Beiträge, je in ihren Zustand davor.
 */
const h = vi.hoisted(() => ({
  audits: [] as { action: string; meta?: Record<string, unknown> }[],
  calls: [] as { op: string; args: unknown }[],
  article: { state: "PUBLISHED", authorId: "u2", title: "Artikel", publishedAt: new Date("2026-01-01") },
  project: { state: "REMOVED", ownerId: "u2", title: "Projekt", publishedAt: new Date("2026-01-01") },
  posts: [] as { id: string; state: string }[],
}));
vi.mock("@/server/audit", () => ({ audit: async (a: { action: string; meta?: Record<string, unknown> }) => void h.audits.push(a) }));
vi.mock("@/server/notifications", () => ({ notify: async () => null }));
vi.mock("@/server/social/targets", () => ({ bumpCounter: async () => {} }));
vi.mock("@/server/social/counters", () => ({ syncPostCount: async () => {} }));
vi.mock("@/server/admin/content", () => ({ setContentHidden: async () => {}, setFeatured: async () => {}, stateBeforeHide: async () => null }));

const rec = (op: string) => async (args: unknown) => (h.calls.push({ op, args }), { count: 1 });
const tx = {
  blogArticle: { findUnique: async () => h.article, update: rec("blogArticle.update") },
  project: { findUnique: async () => h.project, update: rec("project.update"), count: async () => 0 },
  userProfile: { update: async () => ({}), updateMany: async () => ({ count: 0 }) },
  post: { findMany: async () => h.posts, updateMany: rec("post.updateMany") },
  // Letzter Eintrag „admin.content_removed“ aus dem Protokoll dieses Tests
  auditEvent: { findFirst: async () => ({ meta: [...h.audits].reverse().find((a) => a.action === "admin.content_removed")?.meta ?? {} }) },
};
vi.mock("@/server/db", () => ({ db: { $transaction: async (fn: (t: typeof tx) => unknown) => fn(tx) } }));

const { removeContent, restoreContent } = await import("../content-detail");
const ADMIN = { id: "a1", role: "ADMIN" as const };

beforeEach(() => {
  h.audits.length = 0;
  h.calls.length = 0;
});

describe("Artikel entfernen und wiederherstellen", () => {
  it("merkt sich die ausgeblendeten Beiträge und stellt genau diese wieder her", async () => {
    h.article = { state: "PUBLISHED", authorId: "u2", title: "Artikel", publishedAt: new Date("2026-01-01") };
    h.posts = [
      { id: "p1", state: "PUBLISHED" },
      { id: "p2", state: "DRAFT" },
    ];
    await removeContent(ADMIN, "ARTICLE", "a1x", { reason: "Urheberrecht verletzt", publicNote: "Der Artikel verletzt Urheberrechte." });
    expect(h.audits[0]!.meta).toMatchObject({ from: "PUBLISHED", hiddenPosts: h.posts });
    expect(h.calls.find((c) => c.op === "post.updateMany")!.args).toEqual({ where: { id: { in: ["p1", "p2"] } }, data: { state: "HIDDEN" } });

    h.calls.length = 0;
    h.article = { ...h.article, state: "REMOVED" };
    await restoreContent(ADMIN, "ARTICLE", "a1x", "Fehlentscheid korrigiert");
    expect(h.calls.find((c) => c.op === "blogArticle.update")!.args).toEqual({ where: { id: "a1x" }, data: { state: "PUBLISHED" } });
    const ups = h.calls.filter((c) => c.op === "post.updateMany").map((c) => c.args);
    expect(ups).toEqual([
      { where: { id: { in: ["p1"] }, articleId: "a1x", state: "HIDDEN" }, data: { state: "PUBLISHED" } },
      { where: { id: { in: ["p2"] }, articleId: "a1x", state: "HIDDEN" }, data: { state: "DRAFT" } },
    ]);
  });
  it("ein vor dem Entfernen geplanter Artikel wird wieder geplant, nicht veröffentlicht", async () => {
    h.article = { state: "SCHEDULED", authorId: "u2", title: "Artikel", publishedAt: new Date("2026-01-01") };
    h.posts = [];
    await removeContent(ADMIN, "ARTICLE", "a2", { reason: "Prüfung nötig", publicNote: "Wir prüfen den Artikel noch." });
    h.article = { ...h.article, state: "REMOVED" };
    h.calls.length = 0;
    await restoreContent(ADMIN, "ARTICLE", "a2", "Prüfung abgeschlossen");
    expect(h.calls.find((c) => c.op === "blogArticle.update")!.args).toEqual({ where: { id: "a2" }, data: { state: "SCHEDULED" } });
  });
});

describe("Projekt wiederherstellen", () => {
  it("ausgeblendet vor dem Entfernen → bleibt ausgeblendet", async () => {
    h.audits.push({ action: "admin.content_removed", meta: { from: "HIDDEN" } });
    await restoreContent(ADMIN, "PROJECT", "pr1", "Fehlentscheid korrigiert");
    expect(h.calls.find((c) => c.op === "project.update")!.args).toEqual({ where: { id: "pr1" }, data: { state: "HIDDEN" } });
  });
  it("ohne Protokolleintrag: wie bisher veröffentlicht, falls schon einmal veröffentlicht", async () => {
    await restoreContent(ADMIN, "PROJECT", "pr1", "Fehlentscheid korrigiert");
    expect(h.calls.find((c) => c.op === "project.update")!.args).toEqual({ where: { id: "pr1" }, data: { state: "PUBLISHED" } });
  });
});
