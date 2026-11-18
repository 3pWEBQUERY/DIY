import { describe, expect, it, vi } from "vitest";

/** Suche: Inhalte zeitweise gesperrter Konten bleiben auffindbar (nur BANNED/DELETED fallen weg). */
const m = vi.hoisted(() => {
  type Sql = { text: string };
  const sql = (strings: TemplateStringsArray, ...values: unknown[]): Sql => ({
    text: strings.reduce((a, s, i) => a + s + (i < values.length ? ((values[i] as Sql | null)?.text ?? "?") : ""), ""),
  });
  return { seen: [] as string[], Prisma: { sql, join: () => ({ text: "?" }), empty: { text: "" } } };
});
vi.mock("@/server/db", () => ({
  Prisma: m.Prisma,
  db: {
    $queryRaw: (strings: TemplateStringsArray, ...values: unknown[]) => {
      m.seen.push(m.Prisma.sql(strings, ...values).text);
      return Promise.resolve([]);
    },
  },
}));
vi.mock("@/server/visibility", () => ({ relationsFor: vi.fn(async () => ({ blocked: [] })) }));
vi.mock("@/server/ratelimit", () => ({ rateLimit: vi.fn() }));
vi.mock("@/server/auth/session", () => ({ clientIpHash: vi.fn(async () => "ip") }));
vi.mock("@/server/commerce/restock", () => ({ publicProductSql: () => ({ text: "TRUE" }) }));

const { search } = await import("../search");

describe("Suche – Kontostatus", () => {
  it("ACTIVE und SUSPENDED, nie nur ACTIVE", async () => {
    await search({ q: "Tisch", types: ["project", "tutorial", "user", "article", "post"] }, null);
    expect(m.seen).toHaveLength(5);
    for (const s of m.seen) {
      expect(s).toContain("status IN ('ACTIVE', 'SUSPENDED')");
      expect(s).not.toMatch(/u\.status = 'ACTIVE'/);
    }
  });
});
