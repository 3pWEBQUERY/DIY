import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("react", () => ({ cache: <T,>(f: T) => f }));
vi.mock("@/server/db", () => ({ db: {} }));
vi.mock("@/server/env", () => ({ env: () => ({ SESSION_SECRET: "x".repeat(40) }) }));
vi.mock("@/server/pro/service", () => ({ isPro: async () => true, PRO_NAME: "Creator Pro" }));
vi.mock("@/server/projects/service", () => ({ getProjectCards: async () => [] }));
vi.mock("@/server/communities/competitions", () => ({ profileAwards: async () => [] }));

const { mediaKitPreviewToken, isValidMediaKitPreview } = await import("../profile");

/** Vorschau-Link: Die App öffnet das private Medienkit im Browser ohne Anmeldung. */
describe("Medienkit-Vorschau", () => {
  const now = Date.UTC(2026, 10, 19, 12);

  it("gilt für das eigene Konto", () => {
    const t = mediaKitPreviewToken("user-a", now);
    expect(isValidMediaKitPreview(t, "user-a", now)).toBe(true);
    expect(isValidMediaKitPreview(t, "user-a", now + 60 * 60_000)).toBe(true);
  });

  it("gilt nicht für andere Konten, verändert oder abgelaufen", () => {
    const t = mediaKitPreviewToken("user-a", now);
    expect(isValidMediaKitPreview(t, "user-b", now)).toBe(false);
    expect(isValidMediaKitPreview(t.slice(0, -1) + (t.endsWith("A") ? "B" : "A"), "user-a", now)).toBe(false);
    expect(isValidMediaKitPreview(t, "user-a", now + 3 * 60 * 60_000)).toBe(false);
    for (const bad of [null, undefined, "", "abc", "zz.", ".sig", "x".repeat(200)]) expect(isValidMediaKitPreview(bad, "user-a", now)).toBe(false);
  });

  it("lässt sich nicht durch eine spätere Ablaufzeit verlängern", () => {
    const [, sig] = mediaKitPreviewToken("user-a", now).split(".");
    const later = Math.floor((now + 30 * 86400_000) / 1000).toString(36);
    expect(isValidMediaKitPreview(`${later}.${sig}`, "user-a", now)).toBe(false);
  });
});
