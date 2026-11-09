import { describe, expect, it, vi } from "vitest";

vi.mock("@/server/db", () => ({ db: {} }));
vi.mock("@/server/ratelimit", () => ({ rateLimit: async () => ({ remaining: 1 }) }));

const { isAllowedPushEndpoint } = await import("../web");
const { clientIp } = await import("@/server/client-ip");

describe("Web Push: nur echte Push-Dienste", () => {
  it.each([
    "https://fcm.googleapis.com/fcm/send/abc:def",
    "https://updates.push.services.mozilla.com/wpush/v2/gAAA",
    "https://web.push.apple.com/QAbc",
    "https://wns2-par02p.notify.windows.com/w/?token=x",
  ])("erlaubt %s", (u) => expect(isAllowedPushEndpoint(u)).toBe(true));

  it.each([
    "http://fcm.googleapis.com/fcm/send/x",
    "https://fcm.googleapis.com:8443/fcm/send/x",
    "https://evil.example/x",
    "https://fcm.googleapis.com.evil.example/x",
    "https://user:pw@fcm.googleapis.com/x",
    "https://169.254.169.254/latest",
    "https://localhost/x",
    "kein link",
  ])("verweigert %s", (u) => expect(isAllowedPushEndpoint(u)).toBe(false));
});

describe("Client-IP hinter dem Proxy", () => {
  it("nimmt X-Real-IP (vom Proxy gesetzt) statt des fälschbaren ersten X-Forwarded-For", () => {
    expect(clientIp(new Headers({ "x-forwarded-for": "1.2.3.4, 9.9.9.9", "x-real-ip": "9.9.9.9" }))).toBe("9.9.9.9");
  });
  it("ohne X-Real-IP: letzter Eintrag von X-Forwarded-For", () => {
    expect(clientIp(new Headers({ "x-forwarded-for": "1.2.3.4, 5.6.7.8" }))).toBe("5.6.7.8");
  });
  it("ohne Header: Platzhalter", () => expect(clientIp(new Headers())).toBe("0.0.0.0"));
});
