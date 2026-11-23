import { describe, expect, it, vi } from "vitest";

/** Suche: Preisspanne gegen den Preis, den Käufer:innen zahlen (laufende Aktion, ihre Währung). */
const m = vi.hoisted(() => {
  type Sql = { text: string; values: unknown[] };
  const sql = (strings: TemplateStringsArray, ...values: unknown[]): Sql => {
    const vals: unknown[] = [];
    const text = strings.reduce((a, s, i) => {
      if (i >= values.length) return a + s;
      const v = values[i] as Sql | null;
      if (v && typeof v === "object" && "text" in v) {
        vals.push(...(v.values ?? []));
        return a + s + v.text;
      }
      vals.push(v);
      return a + s + "?";
    }, "");
    return { text, values: vals };
  };
  return { seen: [] as { text: string; values: unknown[] }[], Prisma: { sql, raw: (t: string) => ({ text: t, values: [] }), join: () => ({ text: "?", values: [] }), empty: { text: "", values: [] } } };
});
vi.mock("@/server/db", () => ({
  Prisma: m.Prisma,
  db: {
    $queryRaw: (strings: TemplateStringsArray, ...values: unknown[]) => {
      m.seen.push(m.Prisma.sql(strings, ...values));
      return Promise.resolve([]);
    },
    shopSale: { findMany: async () => [] },
  },
}));
vi.mock("@/server/visibility", () => ({ relationsFor: vi.fn(async () => ({ blocked: [] })) }));
vi.mock("@/server/ratelimit", () => ({ rateLimit: vi.fn() }));
vi.mock("@/server/auth/session", () => ({ clientIpHash: vi.fn(async () => "ip"), currentUser: vi.fn(async () => null) }));
vi.mock("@/server/commerce/restock", () => ({ publicProductSql: () => ({ text: "TRUE", values: [] }) }));
vi.mock("@/server/commerce/currency", async (orig) => ({
  ...(await orig<typeof import("@/server/commerce/currency")>()),
  getPriceContext: async () => ({ currency: "EUR", eurChf: 0.94, fxDate: null }),
}));

const { search } = await import("../search");

describe("Suche – Preisspanne", () => {
  it("filtert nach dem effektiven Preis (Aktion, Währung der Betrachter:in), nicht nach dem Listenpreis", async () => {
    m.seen.length = 0;
    await search({ q: "Brett", types: ["product"], priceMin: 1000, priceMax: 5000 }, null);
    expect(m.seen).toHaveLength(1);
    const q = m.seen[0]!;
    expect(q.text).not.toMatch(/pr\."priceMinor" >= \?/);
    expect(q.text).not.toMatch(/pr\."priceMinor" <= \?/);
    expect(q.text).toContain('"ShopSale"');
    expect(q.text).toMatch(/\) >= \?/);
    expect(q.text).toMatch(/\) <= \?/);
    // Währung und Spanne der Betrachter:in als Parameter
    expect(q.values).toContain("EUR");
    expect(q.values).toContain(1000);
    expect(q.values).toContain(5000);
  });

  it("ohne Spanne kein Preisausdruck", async () => {
    m.seen.length = 0;
    await search({ q: "Brett", types: ["product"] }, null);
    expect(m.seen[0]!.text).not.toContain('"ShopSale"');
  });
});
