import { describe, expect, it } from "vitest";
import { refundEffects, statusBeforeRefunded } from "../rules";

const base = { paymentMinor: 5000, shipped: false, restocked: false } as const;

describe("Erstattungsfolgen (refundEffects)", () => {
  it("Vollerstattung vor dem Versand: Erstattet und Bestand zurück", () => {
    expect(refundEffects({ ...base, orderStatus: "NEW", refundedMinor: 5000 })).toEqual({ payStatus: "REFUNDED", full: true, toRefunded: true, restock: true, reopen: false });
    expect(refundEffects({ ...base, orderStatus: "PROBLEM", refundedMinor: 5000 }).restock).toBe(true);
  });

  it("Vollerstattung nach dem Versand bzw. abgeschlossen: kein Zurückbuchen", () => {
    expect(refundEffects({ ...base, orderStatus: "SHIPPED", shipped: true, refundedMinor: 5000 }).restock).toBe(false);
    expect(refundEffects({ ...base, orderStatus: "PROBLEM", shipped: true, refundedMinor: 5000 }).restock).toBe(false);
    expect(refundEffects({ ...base, orderStatus: "COMPLETED", refundedMinor: 5000 }).restock).toBe(false);
  });

  it("genau einmal: bereits zurückgebucht oder storniert → kein zweites Mal", () => {
    expect(refundEffects({ ...base, orderStatus: "NEW", refundedMinor: 5000, restocked: true }).restock).toBe(false);
    const cancelled = refundEffects({ ...base, orderStatus: "CANCELLED", refundedMinor: 5000 });
    expect(cancelled.toRefunded).toBe(false);
    expect(cancelled.restock).toBe(false);
  });

  it("Teilerstattung: weder Statuswechsel noch Bestand", () => {
    expect(refundEffects({ ...base, orderStatus: "NEW", refundedMinor: 1000 })).toEqual({ payStatus: "PARTIALLY_REFUNDED", full: false, toRefunded: false, restock: false, reopen: false });
  });

  it("Erstattung nachträglich gescheitert: Zahlung wieder bezahlt, Bestellung nicht mehr erstattet", () => {
    expect(refundEffects({ ...base, orderStatus: "REFUNDED", refundedMinor: 0 })).toEqual({ payStatus: "SUCCEEDED", full: false, toRefunded: false, restock: false, reopen: true });
    expect(refundEffects({ ...base, orderStatus: "REFUNDED", refundedMinor: 2000 }).payStatus).toBe("PARTIALLY_REFUNDED");
    // Stornierte Bestellung bleibt storniert – nur die Zahlung zählt wieder als erstattbar (Worker erstattet erneut)
    expect(refundEffects({ ...base, orderStatus: "CANCELLED", refundedMinor: 0 })).toMatchObject({ payStatus: "SUCCEEDED", reopen: false });
  });
});

describe("Status vor der Erstattung (statusBeforeRefunded)", () => {
  it("nimmt den Ausgangsstatus des letzten Wechsels auf „Erstattet“", () => {
    expect(
      statusBeforeRefunded([
        { from: "PENDING_PAYMENT", to: "NEW" },
        { from: "NEW", to: "IN_PROGRESS" },
        { from: "IN_PROGRESS", to: "IN_PROGRESS" },
        { from: "IN_PROGRESS", to: "REFUNDED" },
        { from: "REFUNDED", to: "REFUNDED" },
      ]),
    ).toBe("IN_PROGRESS");
  });
  it("ohne passenden Eintrag: null", () => {
    expect(statusBeforeRefunded([{ from: null, to: "NEW" }])).toBeNull();
  });
});
