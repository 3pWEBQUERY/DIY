import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/server/db", () => ({ db: {} }));
const { decideFlag } = await import("../flags");
const { alertMessage } = await import("../monitoring");

describe("Feature-Flags für Gäste", () => {
  it("Registrierung bleibt bei Teil-Rollout für Gäste offen", () => {
    expect(decideFlag("signup", { enabled: true, rollout: 30 }, null)).toBe(true);
    expect(decideFlag("signup", { enabled: true, rollout: 0 }, null)).toBe(false);
    expect(decideFlag("signup", { enabled: false, rollout: 100 }, null)).toBe(false);
  });

  it("andere Bereiche sind bei Teil-Rollout für Gäste aus, für Konten stabil", () => {
    expect(decideFlag("marketplace", { enabled: true, rollout: 30 }, null)).toBe(false);
    expect(decideFlag("marketplace", { enabled: true, rollout: 100 }, null)).toBe(true);
    expect(decideFlag("marketplace", undefined, null)).toBe(true);
    const a = decideFlag("marketplace", { enabled: true, rollout: 30 }, "u1");
    expect(decideFlag("marketplace", { enabled: true, rollout: 30 }, "u1")).toBe(a);
  });
});

describe("Fehlermeldungen an die Administration", () => {
  it("gibt bei Browserfehlern keinen gemeldeten Text weiter", () => {
    const m = alertMessage("CLIENT", false, "Error", "Bitte Passwort unter evil.example bestätigen");
    expect(m).not.toMatch(/evil|Passwort|Error/);
  });

  it("nennt bei Serverfehlern Name und Meldung", () => {
    expect(alertMessage("SERVER", true, "TypeError", "kaputt")).toBe("Erneut aufgetreten (Server): TypeError: kaputt");
  });
});
