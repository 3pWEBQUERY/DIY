import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/server/db", () => ({ db: {} }));
const { fingerprint, normalizeMessage } = await import("../monitoring");
const { rolloutBucket } = await import("../flags");

describe("Fehlerüberwachung", () => {
  it("fasst gleiche Fehler mit unterschiedlichen IDs/Zahlen zusammen", () => {
    expect(normalizeMessage('Post cmw16kokw007til7dzaodzd0y nicht gefunden (Versuch 3)')).toBe("Post <id> nicht gefunden (Versuch <n>)");
    const a = fingerprint("SERVER", "TypeError", "Cannot read properties of undefined (reading 'id')", "TypeError: x\n    at render (/app/.next/server/chunks/123.js:10:20)");
    const b = fingerprint("SERVER", "TypeError", "Cannot read properties of undefined (reading 'name')", "TypeError: x\n    at render (/app/.next/server/chunks/123.js:99:1)");
    expect(a).toBe(b);
  });

  it("trennt verschiedene Fehler und Quellen", () => {
    const stack = "Error: x\n    at a (/app/x.js:1:1)";
    expect(fingerprint("SERVER", "Error", "Kaputt", stack)).not.toBe(fingerprint("CLIENT", "Error", "Kaputt", stack));
    expect(fingerprint("SERVER", "Error", "Kaputt", stack)).not.toBe(fingerprint("SERVER", "Error", "Anders kaputt", stack));
  });
});

describe("Feature-Flag-Rollout", () => {
  it("ist pro Konto stabil und verteilt ungefähr gleichmässig", () => {
    expect(rolloutBucket("marketplace", "u1")).toBe(rolloutBucket("marketplace", "u1"));
    const n = 4000;
    let under = 0;
    for (let i = 0; i < n; i++) if (rolloutBucket("marketplace", `user-${i}`) < 25) under++;
    expect(under / n).toBeGreaterThan(0.21);
    expect(under / n).toBeLessThan(0.29);
  });
});
