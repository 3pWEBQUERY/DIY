import { describe, expect, it } from "vitest";
import { APPLE_COMMISSION_BPS, sellerShareFor } from "../rules";

const stripeOrder = { totalMinor: 800, platformFeeMinor: 40, feeBps: 500, payments: [{ provider: "stripe", status: "SUCCEEDED" }] };
const appleOrder = { totalMinor: 800, platformFeeMinor: 230, feeBps: 500, payments: [{ provider: "apple", status: "SUCCEEDED" }] };
const purchase = { priceMinor: 800, webPriceMinor: 600, sellerNetMinor: 570, status: "COMPLETED", transferStatus: "SENT" };

describe("sellerShareFor", () => {
  it("Web-Kauf: Stripe mit Plattformgebühr auf den Warenwert", () => {
    expect(sellerShareFor(stripeOrder, 0)).toEqual({ channel: "stripe", feeBps: 500, platformFeeMinor: 40, payoutMinor: 760 });
  });

  it("Web-Kauf mit Teilerstattung: Gebühr anteilig, Auszahlung ohne Erstattung", () => {
    const s = sellerShareFor(stripeOrder, 400);
    expect(s).toMatchObject({ channel: "stripe", platformFeeMinor: 20, payoutMinor: 380 });
  });

  it("App-Kauf: Apple-Gebühr 30 % vom App-Preis, Provision auf den Web-Preis", () => {
    const s = sellerShareFor(appleOrder, 0, purchase);
    expect(s).toEqual({
      channel: "apple",
      feeBps: 500,
      appPriceMinor: 800,
      appleFeeBps: APPLE_COMMISSION_BPS,
      appleFeeMinor: 240,
      webPriceMinor: 600,
      platformFeeMinor: 30,
      payoutMinor: 570,
      transfer: "sent",
      refunded: false,
    });
  });

  it("App-Kauf von Apple erstattet: keine Auszahlung", () => {
    const s = sellerShareFor(appleOrder, 0, { ...purchase, status: "REFUNDED", transferStatus: "REVERSED" });
    expect(s).toMatchObject({ channel: "apple", payoutMinor: 0, transfer: "reversed", refunded: true });
  });

  it("Testkauf (Sandbox): Hinweis statt Überweisung", () => {
    expect(sellerShareFor(appleOrder, 0, { ...purchase, transferStatus: "SKIPPED" })).toMatchObject({ transfer: "test", payoutMinor: 570 });
  });

  it("App-Kauf ohne Kaufdatensatz: Web-Preis aus Anteil zurückgerechnet", () => {
    expect(sellerShareFor(appleOrder, 0, null)).toMatchObject({ webPriceMinor: 600, platformFeeMinor: 30, payoutMinor: 570 });
  });
});
