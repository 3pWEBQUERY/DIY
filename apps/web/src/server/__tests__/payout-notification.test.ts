import { describe, expect, it } from "vitest";
import { notificationParts, notificationHref } from "../notifications-format";

const n = (data: Record<string, unknown>) => ({ type: "ORDER_STATUS", count: 1, data: { kind: "payout", amount: "CHF 120.00", href: "/studio/einnahmen#auszahlungen", ...data }, actor: null, targetType: null }) as never;

describe("Benachrichtigung über Auszahlungen", () => {
  it("automatische Auszahlung unterwegs mit Ankunftstag", () => {
    const p = notificationParts(n({ status: "in_transit", arrival: "2026-11-12T00:00:00.000Z", automatic: true }));
    expect(p.text).toMatch(/^Automatische Auszahlung von CHF 120\.00 ist unterwegs – voraussichtlich am Donnerstag, 12\. November/);
  });
  it("gutgeschrieben, fehlgeschlagen mit Grund", () => {
    expect(notificationParts(n({ status: "paid" })).text).toBe("Auszahlung von CHF 120.00 wurde deinem Bankkonto gutgeschrieben.");
    const f = notificationParts(n({ status: "failed", reason: "Die Kontonummer (IBAN) ist ungültig." }));
    expect(f.text).toMatch(/fehlgeschlagen/);
    expect(f.excerpt).toBe("Die Kontonummer (IBAN) ist ungültig.");
  });
  it("führt zu den Auszahlungen", () => {
    expect(notificationHref(n({ status: "paid" }))).toBe("/studio/einnahmen#auszahlungen");
  });
});
