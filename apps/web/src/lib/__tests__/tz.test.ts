import { describe, expect, it } from "vitest";
import { zurichDayKey, zurichWeekDays } from "../tz";

describe("zurichDayKey", () => {
  it("zählt kurz nach Mitternacht Zürcher Zeit zum neuen Tag", () => {
    // 23:30 UTC im Winter = 00:30 MEZ
    expect(zurichDayKey(new Date("2026-01-14T23:30:00Z"))).toBe("2026-01-15");
    // 22:30 UTC im Sommer = 00:30 MESZ
    expect(zurichDayKey(new Date("2026-07-14T22:30:00Z"))).toBe("2026-07-15");
    expect(zurichDayKey(new Date("2026-07-14T21:30:00Z"))).toBe("2026-07-14");
  });
});

describe("zurichWeekDays", () => {
  it("liefert lückenlose Tage ab Montag bis Sonntag der aktuellen Woche", () => {
    // Montag, 00:15 Zürich (Sonntag 23:15 UTC) → aktuelle Woche beginnt an diesem Montag
    const days = zurichWeekDays(2, new Date("2026-11-08T23:15:00Z"));
    expect(days).toHaveLength(14);
    expect(days[0]).toBe("2026-11-02");
    expect(days[7]).toBe("2026-11-09");
    expect(days[13]).toBe("2026-11-15");
    expect(new Date(`${days[0]}T00:00:00Z`).getUTCDay()).toBe(1);
  });
  it("übersteht die Zeitumstellung ohne doppelte oder fehlende Tage", () => {
    const days = zurichWeekDays(3, new Date("2026-04-01T12:00:00Z"));
    expect(new Set(days).size).toBe(21);
    expect(days).toContain("2026-03-29");
  });
});
