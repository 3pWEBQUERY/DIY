import { beforeEach, describe, expect, it, vi } from "vitest";

/** Inhalte gebannter bzw. gelöschter Konten sind auch über direkte Links nicht mehr sichtbar. */
const m = vi.hoisted(() => ({
  db: { user: { findUnique: vi.fn() }, userBlock: { findFirst: vi.fn() }, follow: { findUnique: vi.fn() } },
}));
vi.mock("server-only", () => ({}));
vi.mock("@/server/db", () => ({ db: m.db }));

const { canViewContent } = await import("../visibility");
const post = { ownerId: "author", visibility: "PUBLIC", state: "PUBLISHED" };

beforeEach(() => {
  vi.clearAllMocks();
  m.db.userBlock.findFirst.mockResolvedValue(null);
});

describe("canViewContent – Kontostatus der Eigentümerin", () => {
  it("aktiv bzw. zeitweise gesperrt: sichtbar", async () => {
    m.db.user.findUnique.mockResolvedValue({ status: "ACTIVE" });
    expect(await canViewContent("viewer", post)).toBe(true);
    m.db.user.findUnique.mockResolvedValue({ status: "SUSPENDED" });
    expect(await canViewContent(null, post)).toBe(true);
  });

  it("gebannt, gelöscht oder unbekannt: für andere unsichtbar", async () => {
    for (const status of ["BANNED", "DELETED"]) {
      m.db.user.findUnique.mockResolvedValue({ status });
      expect(await canViewContent("viewer", post)).toBe(false);
      expect(await canViewContent(null, post)).toBe(false);
    }
    m.db.user.findUnique.mockResolvedValue(null);
    expect(await canViewContent("viewer", post)).toBe(false);
  });

  it("die Person selbst sieht ihre Inhalte weiterhin", async () => {
    m.db.user.findUnique.mockResolvedValue({ status: "SUSPENDED" });
    expect(await canViewContent("author", { ...post, state: "HIDDEN" })).toBe(true);
  });
});
