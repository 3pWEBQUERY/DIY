import { describe, expect, it, vi } from "vitest";

const settings: Record<string, unknown> = {};
vi.mock("@/server/settings", () => ({ getSetting: async (k: string) => settings[k] }));

const { excludedPaymentMethods } = await import("../stripe");

describe("Zahlungsmittel an der Kasse", () => {
  it("lässt TWINT und Klarna zu, wenn beide eingeschaltet sind", async () => {
    Object.assign(settings, { "payments.twint": true, "payments.klarna": true });
    expect(await excludedPaymentMethods()).toEqual([]);
  });

  it("schliesst abgeschaltete Zahlungsmittel aus", async () => {
    Object.assign(settings, { "payments.twint": false, "payments.klarna": true });
    expect(await excludedPaymentMethods()).toEqual(["twint"]);
    Object.assign(settings, { "payments.twint": false, "payments.klarna": false });
    expect(await excludedPaymentMethods()).toEqual(["twint", "klarna"]);
  });
});
