import { describe, expect, it } from "vitest";
import { holdState, isPayoutDue, scaleSettlement, sellerShare } from "../escrow-rules";

const DAY = 86_400_000;
const now = new Date("2026-11-20T10:00:00Z");
const base = { status: "NEW", paidAt: new Date(now.getTime() - 2 * DAY), shippedAt: null, completedAt: null, totalMinor: 10_000, platformFeeMinor: 600, refundedMinor: 0, disputed: false };
const cfg = { holdDays: 3, autoCompleteDays: 14, waived: false };

describe("Haltefrist", () => {
  it("hält bezahlte, noch nicht abgeschlossene Bestellungen zurück", () => {
    expect(holdState(base, cfg, now)).toEqual({ held: true, releaseAt: null });
  });
  it("versendet: voraussichtliche Freigabe nach Auto-Abschluss plus Frist", () => {
    const shippedAt = new Date(now.getTime() - DAY);
    expect(holdState({ ...base, status: "SHIPPED", shippedAt }, cfg, now)).toEqual({ held: true, releaseAt: new Date(shippedAt.getTime() + 17 * DAY) });
  });
  it("abgeschlossen: frei erst nach Ablauf der Frist", () => {
    const completedAt = new Date(now.getTime() - 2 * DAY);
    expect(holdState({ ...base, status: "COMPLETED", completedAt }, cfg, now)).toEqual({ held: true, releaseAt: new Date(completedAt.getTime() + 3 * DAY) });
    expect(holdState({ ...base, status: "COMPLETED", completedAt: new Date(now.getTime() - 3 * DAY) }, cfg, now)).toEqual({ held: false, releaseAt: null });
  });
  it("Problemfall und Streitfall bleiben zurückgehalten – auch bei erlassener Frist", () => {
    expect(holdState({ ...base, status: "PROBLEM" }, { ...cfg, waived: true }, now).held).toBe(true);
    expect(holdState({ ...base, status: "COMPLETED", completedAt: new Date(0), disputed: true }, cfg, now).held).toBe(true);
  });
  it("erlassene Frist: sofort frei; storniert/erstattet zählt nicht", () => {
    expect(holdState(base, { ...cfg, waived: true }, now).held).toBe(false);
    expect(holdState({ ...base, status: "CANCELLED" }, cfg, now).held).toBe(false);
    expect(holdState({ ...base, status: "REFUNDED" }, cfg, now).held).toBe(false);
  });
  it("Anteil des Shops: abzüglich Erstattungen und anteiliger Provision", () => {
    expect(sellerShare(base)).toBe(9_400);
    expect(sellerShare({ ...base, refundedMinor: 5_000 })).toBe(4_700);
    expect(sellerShare({ ...base, refundedMinor: 10_000 })).toBe(0);
    expect(scaleSettlement(9_000, { totalMinor: 10_000, refundedMinor: 2_500 })).toBe(6_750);
  });
});

describe("Auszahlungsplan (Zürcher Kalender)", () => {
  const plan = (interval: string, weeklyAnchor: string | null = null, monthlyAnchor: number | null = null) => ({ interval, weeklyAnchor, monthlyAnchor });
  it("täglich höchstens einmal pro Tag", () => {
    expect(isPayoutDue(plan("daily"), null, now)).toBe(true);
    expect(isPayoutDue(plan("daily"), new Date(now.getTime() - 3600_000), now)).toBe(false);
    expect(isPayoutDue(plan("daily"), new Date(now.getTime() - DAY), now)).toBe(true);
    expect(isPayoutDue(plan("manual"), null, now)).toBe(false);
  });
  it("wöchentlich am gewählten Wochentag (2026-11-20 ist ein Freitag)", () => {
    expect(isPayoutDue(plan("weekly", "friday"), null, now)).toBe(true);
    expect(isPayoutDue(plan("weekly", "monday"), null, now)).toBe(false);
  });
  it("monatlich, Anker 31 im kürzeren Monat am letzten Tag", () => {
    expect(isPayoutDue(plan("monthly", null, 20), null, now)).toBe(true);
    expect(isPayoutDue(plan("monthly", null, 31), null, new Date("2026-11-30T10:00:00Z"))).toBe(true);
    expect(isPayoutDue(plan("monthly", null, 31), null, new Date("2026-11-29T10:00:00Z"))).toBe(false);
  });
  it("Tagesgrenze in Zürich, nicht UTC", () => {
    // 23:30 UTC am 19.11. ist in Zürich schon der 20.11.
    expect(isPayoutDue(plan("daily"), new Date("2026-11-19T22:30:00Z"), new Date("2026-11-19T23:30:00Z"))).toBe(true);
  });
});
