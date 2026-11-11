import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/server/env", () => ({ env: () => ({ SESSION_SECRET: "s".repeat(40), APP_URL: "https://werkuno.ch", PINTEREST_CLIENT_ID: "123" }) }));
vi.mock("@/server/db", () => ({ db: {} }));
vi.mock("@/server/audit", () => ({ audit: async () => {} }));
vi.mock("@/server/flags", () => ({ requireFlag: async () => {} }));
vi.mock("@/server/ratelimit", () => ({ limit: async () => {} }));
vi.mock("@/server/auth/session", () => ({ clientIpHash: async () => "x", createSession: async () => ({}) }));
vi.mock("../identity/service", () => ({ isHandleAvailable: async () => ({ ok: true }), sendVerification: async () => {} }));

const { decodePending, encodePending, pinterestAuthorizeUrl } = await import("../identity/pinterest");

describe("Registrierung mit Pinterest", () => {
  it("signiertes Cookie: gültig, manipuliert, abgelaufen", () => {
    const raw = encodePending({ sub: "549755885175", username: "lena" });
    expect(decodePending(raw)).toMatchObject({ sub: "549755885175", username: "lena" });
    const [payload, sig] = raw.split(".");
    const forged = Buffer.from(JSON.stringify({ sub: "fremd", username: "x", exp: Date.now() + 60_000 })).toString("base64url");
    expect(decodePending(`${forged}.${sig}`)).toBeNull();
    expect(decodePending(`${payload}.${"0".repeat(64)}`)).toBeNull();
    expect(decodePending(undefined)).toBeNull();
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 31 * 60_000);
    expect(decodePending(raw)).toBeNull();
    vi.useRealTimers();
  });
  it("Autorisierungs-URL mit Rücksprung und nur Lese-Berechtigung", () => {
    const u = pinterestAuthorizeUrl("st4te");
    expect(u.origin + u.pathname).toBe("https://www.pinterest.com/oauth/");
    expect(u.searchParams.get("redirect_uri")).toBe("https://werkuno.ch/api/auth/pinterest/callback");
    expect(u.searchParams.get("scope")).toBe("user_accounts:read");
    expect(u.searchParams.get("state")).toBe("st4te");
    expect(u.searchParams.get("response_type")).toBe("code");
  });
});
