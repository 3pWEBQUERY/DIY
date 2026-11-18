import { beforeEach, describe, expect, it, vi } from "vitest";

/** Medien von Stories (inkl. Archiv/Highlights) gelten als verwendet – sonst löscht die Bereinigung sie samt Stories. */
const m = vi.hoisted(() => {
  const list = () => vi.fn().mockResolvedValue([]);
  return {
    db: {
      media: { findMany: vi.fn() },
      postMedia: { findMany: list() },
      projectMedia: { findMany: list() },
      productMedia: { findMany: list() },
      tutorialMedia: { findMany: list() },
      project: { findMany: list() },
      product: { findMany: list() },
      story: { findMany: list() },
      userProfile: { findMany: list() },
      tutorial: { findMany: list() },
      blogArticle: { findMany: list() },
      community: { findMany: list() },
      $queryRaw: vi.fn().mockResolvedValue([]),
    },
  };
});

vi.mock("server-only", () => ({}));
vi.mock("@/server/db", () => ({ db: m.db }));
vi.mock("@/server/storage", () => ({ storage: vi.fn(), ensureBucketCors: vi.fn() }));
vi.mock("@/server/settings", () => ({ getSetting: vi.fn() }));
vi.mock("@/server/pro/service", () => ({ isPro: vi.fn() }));
vi.mock("@/server/flags", () => ({ requireFlag: vi.fn() }));
vi.mock("@/server/ratelimit", () => ({ limit: vi.fn() }));

const { mediaInUse } = await import("../service");

beforeEach(() => {
  m.db.media.findMany.mockResolvedValue([
    { id: "m1", ownerId: "u1", variants: {} },
    { id: "m2", ownerId: "u1", variants: {} },
  ]);
});

describe("mediaInUse", () => {
  it("zählt Stories (nicht entfernte, auch abgelaufene/archivierte) als Verwendung", async () => {
    m.db.story.findMany.mockResolvedValue([{ mediaId: "m1" }]);
    const used = await mediaInUse(["m1", "m2"]);
    expect(used.has("m1")).toBe(true);
    expect(used.has("m2")).toBe(false);
    expect(m.db.story.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { mediaId: { in: ["m1", "m2"] }, state: { not: "REMOVED" } } }));
  });
});
