import { describe, expect, it } from "vitest";
import { computeFees, ORDER_STATUS, ORDER_TRANSITIONS, type OrderStatus } from "@werkraum/shared";
import {
  assertTransition,
  canReview,
  canSellerCancel,
  canTransition,
  formatBps,
  formatOrderNumber,
  groupByShop,
  grandTotal,
  isSoldOut,
  netPlatformFee,
  parseMoneyInput,
  paymentStatusAfterRefund,
  refundableAmount,
  shippingForLines,
  TransitionError,
  unitPrice,
  available,
} from "../rules";

describe("computeFees (§22.2)", () => {
  it("berechnet Provision nur auf den Warenwert, nicht auf den Versand", () => {
    const f = computeFees(10_000, 900, 600);
    expect(f).toEqual({ subtotal: 10_000, shipping: 900, total: 10_900, platformFee: 600, sellerNet: 10_300 });
  });

  it("rundet kaufmännisch auf ganze Rappen", () => {
    expect(computeFees(2_475, 0, 600).platformFee).toBe(149); // 148.5 → 149
    expect(computeFees(2_458, 0, 600).platformFee).toBe(147); // 147.48 → 147
    expect(computeFees(1, 0, 600).platformFee).toBe(0);
  });

  it("erlaubt 0 % Provision und kostenlosen Versand", () => {
    expect(computeFees(5_000, 0, 0)).toEqual({ subtotal: 5_000, shipping: 0, total: 5_000, platformFee: 0, sellerNet: 5_000 });
  });

  it("Verkäufernetto + Gebühr = Gesamtbetrag (keine versteckten Kosten)", () => {
    for (const [s, sh, bps] of [
      [12_345, 700, 600],
      [99, 0, 1250],
      [4_999_999, 100_000, 3000],
    ] as const) {
      const f = computeFees(s, sh, bps);
      expect(f.sellerNet + f.platformFee).toBe(f.total);
      expect(f.total).toBe(s + sh);
    }
  });

  it("lehnt ungültige Beträge und Provisionssätze ab", () => {
    expect(() => computeFees(-1, 0, 600)).toThrow();
    expect(() => computeFees(10.5, 0, 600)).toThrow();
    expect(() => computeFees(100, -5, 600)).toThrow();
    expect(() => computeFees(100, 0, -1)).toThrow();
    expect(() => computeFees(100, 0, 3001)).toThrow();
  });
});

describe("Warenkorb → Bestellungen je Shop", () => {
  const lines = [
    { shopId: "a", unitMinor: 3_000, quantity: 2, shippingMinor: 900, isDigital: false },
    { shopId: "a", unitMinor: 1_500, quantity: 1, shippingMinor: 1_200, isDigital: false },
    { shopId: "b", unitMinor: 800, quantity: 1, shippingMinor: 700, isDigital: true },
  ];

  it("bildet eine Bestellung pro Shop mit kombiniertem Versand", () => {
    const groups = groupByShop(lines, 600);
    expect(groups).toHaveLength(2);
    const a = groups.find((g) => g.shopId === "a")!;
    expect(a.fees.subtotal).toBe(7_500);
    expect(a.fees.shipping).toBe(1_200);
    expect(a.fees.total).toBe(8_700);
    expect(a.fees.platformFee).toBe(450);
    const b = groups.find((g) => g.shopId === "b")!;
    expect(b.fees.shipping).toBe(0); // digital → kein Versand
    expect(grandTotal(groups)).toEqual({ subtotal: 8_300, shipping: 1_200, total: 9_500 });
  });

  it("lehnt Mengen < 1 und Bruchmengen ab", () => {
    expect(() => groupByShop([{ ...lines[0]!, quantity: 0 }], 600)).toThrow();
    expect(() => groupByShop([{ ...lines[0]!, quantity: 1.5 }], 600)).toThrow();
  });

  it("Versand nur für physische Artikel", () => {
    expect(shippingForLines([])).toBe(0);
    expect(shippingForLines([{ shippingMinor: 500, isDigital: true }])).toBe(0);
    expect(shippingForLines([{ shippingMinor: 500, isDigital: false }, { shippingMinor: 300, isDigital: false }])).toBe(500);
  });

  it("Variantenpreis wird nie negativ", () => {
    expect(unitPrice(2_000, 500)).toBe(2_500);
    expect(unitPrice(2_000, -2_500)).toBe(0);
  });
});

describe("Bestell-Statusmaschine (§13.6)", () => {
  it("erlaubt den regulären Ablauf", () => {
    const path: OrderStatus[] = ["NEW", "IN_PROGRESS", "READY_TO_SHIP", "SHIPPED", "COMPLETED"];
    for (let i = 0; i < path.length - 1; i++) expect(canTransition(path[i]!, path[i + 1]!)).toBe(true);
  });

  it("verhindert Sprünge und Rückschritte", () => {
    expect(canTransition("NEW", "SHIPPED")).toBe(false);
    expect(canTransition("SHIPPED", "NEW")).toBe(false);
    expect(canTransition("COMPLETED", "IN_PROGRESS")).toBe(false);
    expect(canTransition("READY_TO_SHIP", "CANCELLED")).toBe(false);
  });

  it("„bezahlt“ ist kein Verkäuferübergang – nur Provider-Events setzen PENDING_PAYMENT → NEW (§31.4 Nr. 9)", () => {
    expect(canTransition("PENDING_PAYMENT", "NEW")).toBe(false);
    for (const s of ORDER_STATUS) expect(ORDER_TRANSITIONS[s].includes("PENDING_PAYMENT")).toBe(false);
  });

  it("Endzustände sind final", () => {
    for (const s of ORDER_STATUS) {
      expect(canTransition("CANCELLED", s)).toBe(false);
      expect(canTransition("REFUNDED", s)).toBe(false);
    }
  });

  it("jeder Status hat eine definierte Übergangsliste mit gültigen Zielen", () => {
    for (const s of ORDER_STATUS) {
      expect(Array.isArray(ORDER_TRANSITIONS[s])).toBe(true);
      for (const t of ORDER_TRANSITIONS[s]) expect(ORDER_STATUS).toContain(t);
      expect(ORDER_TRANSITIONS[s]).not.toContain(s);
    }
  });

  it("assertTransition wirft TransitionError", () => {
    expect(() => assertTransition("NEW", "IN_PROGRESS")).not.toThrow();
    expect(() => assertTransition("NEW", "COMPLETED")).toThrow(TransitionError);
  });

  it("Stornierung nur vor dem Versand", () => {
    expect(canSellerCancel("NEW", false)).toBe(true);
    expect(canSellerCancel("IN_PROGRESS", false)).toBe(true);
    expect(canSellerCancel("PROBLEM", false)).toBe(true);
    expect(canSellerCancel("PROBLEM", true)).toBe(false);
    expect(canSellerCancel("SHIPPED", false)).toBe(false);
    expect(canSellerCancel("COMPLETED", false)).toBe(false);
  });

  it("Bewertungen nur nach bestätigtem Kauf und Versand (§13.9)", () => {
    expect(canReview("SHIPPED", "SUCCEEDED")).toBe(true);
    expect(canReview("COMPLETED", "PARTIALLY_REFUNDED")).toBe(true);
    expect(canReview("NEW", "SUCCEEDED")).toBe(false);
    expect(canReview("COMPLETED", "REQUIRES_PAYMENT")).toBe(false);
    expect(canReview("COMPLETED", "REFUNDED")).toBe(false);
    expect(canReview("SHIPPED", null)).toBe(false);
  });
});

describe("Erstattungen", () => {
  it("berücksichtigt offene und erfolgreiche, nicht aber fehlgeschlagene Erstattungen", () => {
    expect(
      refundableAmount(10_000, [
        { amountMinor: 2_000, status: "SUCCEEDED" },
        { amountMinor: 1_000, status: "PENDING" },
        { amountMinor: 5_000, status: "FAILED" },
      ]),
    ).toBe(7_000);
    expect(refundableAmount(1_000, [{ amountMinor: 1_500, status: "SUCCEEDED" }])).toBe(0);
  });

  it("leitet den Zahlungsstatus getrennt vom Bestellstatus ab", () => {
    expect(paymentStatusAfterRefund(10_000, 0)).toBe("SUCCEEDED");
    expect(paymentStatusAfterRefund(10_000, 2_500)).toBe("PARTIALLY_REFUNDED");
    expect(paymentStatusAfterRefund(10_000, 10_000)).toBe("REFUNDED");
  });

  it("Plattformgebühr wird anteilig zurückerstattet", () => {
    expect(netPlatformFee(600, 10_900, 0)).toBe(600);
    expect(netPlatformFee(600, 10_900, 10_900)).toBe(0);
    expect(netPlatformFee(600, 10_000, 5_000)).toBe(300);
    expect(netPlatformFee(600, 0, 0)).toBe(0);
  });
});

describe("Hilfsfunktionen", () => {
  it("Bestellnummer im Format WR-Jahr-Code", () => {
    expect(formatOrderNumber(2026, "8F3K2")).toBe("WR-2026-8F3K2");
    expect(() => formatOrderNumber(2026, "abc")).toThrow();
  });

  it("Geldeingabe → Rappen", () => {
    expect(parseMoneyInput("24.50")).toBe(2_450);
    expect(parseMoneyInput("24,5")).toBe(2_450);
    expect(parseMoneyInput("24")).toBe(2_400);
    expect(parseMoneyInput("1'200.05")).toBe(120_005);
    expect(parseMoneyInput("0.07")).toBe(7);
    expect(parseMoneyInput("-3")).toBeNull();
    expect(parseMoneyInput("abc")).toBeNull();
    expect(parseMoneyInput("1.234")).toBeNull();
  });

  it("Bestand und Ausverkauft", () => {
    expect(available({ onHand: 3, reserved: 1 })).toBe(2);
    expect(available({ onHand: 1, reserved: 2 })).toBe(0);
    expect(available(null)).toBe(0);
    expect(isSoldOut([{ onHand: 0 }, { onHand: 0 }])).toBe(true);
    expect(isSoldOut([{ onHand: 0 }, { onHand: 1 }])).toBe(false);
    expect(isSoldOut([])).toBe(true);
  });

  it("Provision als Prozent", () => {
    expect(formatBps(600)).toBe("6 %");
    expect(formatBps(650)).toBe("6.5 %");
  });
});
