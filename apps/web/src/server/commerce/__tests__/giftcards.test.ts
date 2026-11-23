import { describe, expect, it, vi } from "vitest";
import { formatGiftCode, giftCardSettingsSchema, maskGiftCode, normalizeGiftCode } from "@werkraum/shared";
import { balanceInOrderCurrency, debitForApplied, feeAfterGiftCard, giftAmountAllowed, giftCardExpiry, planGiftCardUse } from "../giftcard-rules";
import { MIN_CHARGE_MINOR } from "../rules";

vi.mock("@/server/db", () => ({ db: {} }));
const { debitGiftCardTx, giftCardForOrder, restoreGiftCardsTx } = await import("../giftcards");

describe("Geschenkgutschein – Anrechnung", () => {
  it("deckt die Bestellung ganz, wenn das Guthaben reicht (ohne Zahlung)", () => {
    expect(planGiftCardUse({ goodsNetMinor: 4000, shippingMinor: 900, balanceInOrderMinor: 10_000 })).toBe(4900);
  });

  it("rechnet teilweise an und lässt mindestens den Mindestbetrag zu bezahlen", () => {
    expect(planGiftCardUse({ goodsNetMinor: 4000, shippingMinor: 900, balanceInOrderMinor: 2500 })).toBe(2500);
    // Guthaben knapp unter dem Gesamtbetrag → Rest wäre unter dem Mindestbetrag
    expect(planGiftCardUse({ goodsNetMinor: 4000, shippingMinor: 900, balanceInOrderMinor: 4880 })).toBe(4900 - MIN_CHARGE_MINOR);
    expect(planGiftCardUse({ goodsNetMinor: 0, shippingMinor: 0, balanceInOrderMinor: 5000 })).toBe(0);
    expect(planGiftCardUse({ goodsNetMinor: 3000, shippingMinor: 0, balanceInOrderMinor: 0 })).toBe(0);
  });

  it("verlangt Provision nur auf den bar bezahlten Warenwert", () => {
    expect(feeAfterGiftCard(4000, 0, 600)).toBe(240);
    expect(feeAfterGiftCard(4000, 2500, 600)).toBe(90); // 1500 × 6 %
    expect(feeAfterGiftCard(4000, 4900, 600)).toBe(0); // Gutschein deckt auch den Versand
  });

  it("rechnet Währungen um, ohne mehr anzurechnen als vorhanden", () => {
    // 50.– CHF-Gutschein, Bestellung in EUR (1 EUR = 0.94 CHF)
    const inEur = balanceInOrderCurrency(5000, "CHF", "EUR", 0.94);
    expect(inEur).toBe(5319);
    expect(debitForApplied(inEur, 5000, "CHF", "EUR", 0.94)).toBe(5000); // ganz aufgebraucht
    expect(debitForApplied(2000, 5000, "CHF", "EUR", 0.94)).toBe(1880);
    expect(debitForApplied(1500, 5000, "CHF", "CHF", 0.94)).toBe(1500);
  });

  it("berechnet Ablaufdatum und erlaubte Beträge", () => {
    expect(giftCardExpiry(new Date("2026-11-23T10:00:00Z"), 36).toISOString()).toBe("2029-11-30T23:59:59.000Z");
    const s = { amounts: [2500, 5000], customEnabled: true, customMinMinor: 1000, customMaxMinor: 20_000 };
    expect(giftAmountAllowed(5000, s)).toBe(true);
    expect(giftAmountAllowed(1500, s)).toBe(true);
    expect(giftAmountAllowed(500, s)).toBe(false);
    expect(giftAmountAllowed(1500, { ...s, customEnabled: false })).toBe(false);
  });

  it("normalisiert und maskiert Codes", () => {
    expect(normalizeGiftCode(" abcd-efgh jkmn-pqrs ")).toBe("ABCDEFGHJKMNPQRS");
    expect(formatGiftCode("ABCDEFGHJKMNPQRS")).toBe("ABCD-EFGH-JKMN-PQRS");
    expect(maskGiftCode("ABCDEFGHJKMNPQRS")).toBe("••••-••••-••••-PQRS");
  });

  it("prüft die Einstellungen", () => {
    expect(giftCardSettingsSchema.safeParse({ enabled: true, amounts: [], customEnabled: false }).success).toBe(false);
    expect(giftCardSettingsSchema.safeParse({ enabled: true, amounts: [2500], customEnabled: true, customMinMinor: 5000, customMaxMinor: 1000 }).success).toBe(false);
    expect(giftCardSettingsSchema.parse({ enabled: true, amounts: [2500, 5000] })).toMatchObject({ validityMonths: 36 });
  });

  it("rechnet abgelaufene oder leere Gutscheine nicht an", () => {
    const base = { id: "g", code: "ABCDEFGHJKMNPQRS", currency: "CHF", balanceMinor: 5000, status: "ACTIVE", expiresAt: new Date(Date.now() + 86_400_000) };
    expect(giftCardForOrder(base, { goodsNetMinor: 3000, shippingMinor: 900, feeBps: 600 }, "CHF", { eurChf: 0.94 })).toMatchObject({ appliedMinor: 3900, debitMinor: 3900, platformFeeMinor: 0, problem: null });
    expect(giftCardForOrder({ ...base, expiresAt: new Date(Date.now() - 1000) }, { goodsNetMinor: 3000, shippingMinor: 900, feeBps: 600 }, "CHF", { eurChf: 0.94 })).toMatchObject({ appliedMinor: 0, platformFeeMinor: 180 });
    expect(giftCardForOrder({ ...base, balanceMinor: 0 }, { goodsNetMinor: 3000, shippingMinor: 900, feeBps: 600 }, "CHF", { eurChf: 0.94 }).problem).toMatch(/aufgebraucht/);
  });
});

describe("Geschenkgutschein – Guthaben", () => {
  it("bucht nie mehr ab als vorhanden (gleichzeitige Bestellungen)", async () => {
    // Erste Abbuchung trifft die Zeile, die zweite findet kein ausreichendes Guthaben mehr
    let balance = 5000;
    const created: unknown[] = [];
    const tx = {
      $executeRaw: vi.fn(async (_s: TemplateStringsArray, debit: number) => {
        if (balance >= debit) {
          balance -= debit;
          return 1;
        }
        return 0;
      }),
      giftCardRedemption: { create: vi.fn(async (a: unknown) => created.push(a)) },
    };
    await debitGiftCardTx(tx as never, { giftCardId: "g", orderId: "o1", debitMinor: 4000, appliedMinor: 4000 });
    await expect(debitGiftCardTx(tx as never, { giftCardId: "g", orderId: "o2", debitMinor: 4000, appliedMinor: 4000 })).rejects.toThrow(/Guthaben/);
    expect(balance).toBe(1000);
    expect(created).toHaveLength(1);
  });

  it("bucht eine Einlösung genau einmal zurück", async () => {
    const reversed = new Set<string>();
    let restored = 0;
    const tx = {
      giftCardRedemption: {
        findMany: vi.fn(async () => [{ id: "r1", giftCardId: "g", amountMinor: 1200 }]),
        updateMany: vi.fn(async ({ where }: { where: { id: string } }) => {
          if (reversed.has(where.id)) return { count: 0 };
          reversed.add(where.id);
          return { count: 1 };
        }),
      },
      $executeRaw: vi.fn(async (_s: TemplateStringsArray, amount: number) => {
        restored += amount;
        return 1;
      }),
    };
    expect(await restoreGiftCardsTx(tx as never, "o1")).toBe(1200);
    expect(await restoreGiftCardsTx(tx as never, "o1")).toBe(0);
    expect(restored).toBe(1200);
  });
});
