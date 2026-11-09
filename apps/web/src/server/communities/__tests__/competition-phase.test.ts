import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/server/db", () => ({ db: {} }));
vi.mock("@/server/notifications", () => ({ notify: vi.fn() }));
vi.mock("@/server/projects/service", () => ({ getProjectCards: vi.fn() }));
vi.mock("../service", () => ({ canViewCommunityContent: vi.fn(), isModRole: vi.fn(), isMuted: vi.fn() }));

const { competitionPhase } = await import("../competitions");
const d = (s: string) => new Date(`2026-11-${s}T12:00:00Z`);
const base = { startsAt: d("10"), endsAt: d("20"), votingEndsAt: d("27"), resultsAt: null as Date | null, judging: "VOTES" };

describe("Wettbewerb – Phasen", () => {
  it("Abstimmung: bald → Einreichung → Abstimmung → beendet", () => {
    expect(competitionPhase(base, d("05"))).toBe("upcoming");
    expect(competitionPhase(base, d("15"))).toBe("open");
    expect(competitionPhase(base, d("22"))).toBe("voting");
    expect(competitionPhase(base, d("28"))).toBe("ended");
    expect(competitionPhase({ ...base, resultsAt: d("28") }, d("29"))).toBe("ended");
  });
  it("Jury: nach der Einreichung entscheidet die Jury, bis das Ergebnis veröffentlicht ist", () => {
    const jury = { ...base, judging: "JURY", votingEndsAt: null };
    expect(competitionPhase(jury, d("21"))).toBe("jury");
    expect(competitionPhase(jury, d("29"))).toBe("jury");
    expect(competitionPhase({ ...jury, resultsAt: d("23") }, d("24"))).toBe("ended");
  });
});
