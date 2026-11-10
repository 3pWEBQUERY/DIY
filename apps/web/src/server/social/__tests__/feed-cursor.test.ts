import { describe, expect, it } from "vitest";
import { decodeFeedCursor, encodeFeedCursor, feedIdHash, nextFeedPage } from "../ranking";

const ids = (n: number, p = "p") => Array.from({ length: n }, (_, i) => `${p}${i}`);

describe("Cursor „Für dich“", () => {
  it("Seiten überlappen nicht, auch wenn sich das Ranking zwischen den Seiten ändert", () => {
    const all = ids(40);
    const first = nextFeedPage(all, decodeFeedCursor(null), 15);
    expect(first.ids).toEqual(all.slice(0, 15));
    expect(first.nextCursor).toBeTruthy();
    // Ranking ändert sich: p20 steigt nach oben, p3 (bereits gesehen) fällt nach hinten
    const reranked = ["p20", ...all.filter((id) => id !== "p20" && id !== "p3"), "p3"];
    const second = nextFeedPage(reranked, decodeFeedCursor(first.nextCursor), 15);
    expect(second.ids[0]).toBe("p20");
    expect(second.ids.some((id) => first.ids.includes(id))).toBe(false);
    const third = nextFeedPage(reranked, decodeFeedCursor(second.nextCursor), 15);
    const served = [...first.ids, ...second.ids, ...third.ids];
    expect(new Set(served).size).toBe(served.length);
    expect(new Set(served)).toEqual(new Set(all)); // keine Lücke
    expect(third.nextCursor).toBeNull();
  });

  it("Stichzeitpunkt bleibt über alle Seiten erhalten", () => {
    const asOf = new Date("2026-11-01T10:00:00Z");
    const c = decodeFeedCursor(encodeFeedCursor(asOf, [feedIdHash("a")]), new Date("2026-11-02T00:00:00Z"));
    expect(c.asOf.getTime()).toBe(asOf.getTime());
    expect(c.seen.has(feedIdHash("a"))).toBe(true);
  });

  it("ungültige Cursor beginnen von vorn, altes Format bleibt lesbar", () => {
    const now = new Date("2026-11-02T00:00:00Z");
    for (const bad of ["s1.zz!.", "s1..AAAA", "s1.abc.%%%", "quatsch", `s1.${(now.getTime() + 3_600_000).toString(36)}.`]) {
      const c = decodeFeedCursor(bad, now);
      expect(c.seen.size).toBe(0);
      expect(c.legacyOffset).toBe(0);
      expect(c.asOf).toBe(now);
    }
    const legacy = decodeFeedCursor(`${now.getTime() - 1000}|15`, now);
    expect(legacy.legacyOffset).toBe(15);
    const page = nextFeedPage(ids(40), legacy, 15);
    expect(page.ids).toEqual(ids(40).slice(15, 30));
    expect(decodeFeedCursor(page.nextCursor, now).seen.size).toBe(30);
  });

  it("Cursor bleibt kompakt", () => {
    const c = encodeFeedCursor(new Date(), ids(400).map(feedIdHash));
    expect(c.length).toBeLessThan(2300);
  });
});
