import { describe, expect, it, vi } from "vitest";

vi.mock("@/server/db", () => ({ db: {} }));
vi.mock("@/server/events", () => ({ emit: vi.fn() }));

const { riskScore } = await import("../cases");

describe("Risikoeinstufung (PRD §24.1)", () => {
  it("priorisiert gefährliche Anleitungen über Spam", () => {
    expect(riskScore("DANGEROUS", 1, "TUTORIAL")).toBeGreaterThan(riskScore("SPAM", 1, "POST"));
  });
  it("steigt mit der Anzahl Meldungen und ist auf 100 begrenzt", () => {
    expect(riskScore("SPAM", 5, "POST")).toBeGreaterThan(riskScore("SPAM", 1, "POST"));
    expect(riskScore("SCAM", 50, "MESSAGE")).toBeLessThanOrEqual(100);
    expect(riskScore("DANGEROUS", 50, "TUTORIAL")).toBe(88);
  });
});
