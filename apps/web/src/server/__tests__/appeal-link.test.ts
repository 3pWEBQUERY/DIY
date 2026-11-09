import { describe, expect, it, vi } from "vitest";

vi.mock("@/server/env", () => ({ env: () => ({ SESSION_SECRET: "x".repeat(40) }) }));
const { appealToken, verifyAppealToken } = await import("../moderation/appeal-link");

describe("Einspruchs-Link ohne Anmeldung", () => {
  it("gilt nur für den Fall und das Konto, für die er ausgestellt wurde", () => {
    const t = appealToken("case1", "user1");
    expect(verifyAppealToken("case1", t)).toBe("user1");
    expect(verifyAppealToken("case2", t)).toBeNull();
    expect(verifyAppealToken("case1", t.replace("user1", "user2"))).toBeNull();
    expect(verifyAppealToken("case1", `${t}x`)).toBeNull();
    expect(verifyAppealToken("case1", null)).toBeNull();
  });
});
