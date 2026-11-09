import { describe, expect, it } from "vitest";
import { detectSuspiciousPayment, normalizeForDetection } from "../suspicious";

const ZWSP = "\u200B";

describe("Warnhinweis bei Zahlungen ausserhalb der Plattform", () => {
  it("erkennt die bekannten Muster", () => {
    for (const t of [
      "Zahl mir das bitte per Twint",
      "Hier: paypal.me/werkstatt",
      "Am besten Paypal Freunde und Familie",
      "Meine IBAN schicke ich dir",
      "CH93 0076 2011 6238 5295 7",
      "Lieber ausserhalb der Plattform bezahlen",
      "Nur gegen Vorkasse",
    ]) expect(detectSuspiciousPayment(t), t).toBe(true);
  });

  it("lässt sich nicht mit ß, unsichtbaren Zeichen oder Kleinschreibung umgehen", () => {
    for (const t of [
      "Wir machen das außerhalb der Plattform",
      "AUẞERHALB VON WERKUNO ist es günstiger",
      `Schick es per tw${ZWSP}int`,
      "Schick es per T\u2060WINT",
      "Schick es per tw\u00ADint",
      "ch93 0076 2011 6238 5295 7",
      "Konto: ch9300762011623852957, danke",
      "de89-3704-0044-0532-0130-00",
      "Überweisung an DE89 3704 0044 0532 0130 00 bitte",
    ]) expect(detectSuspiciousPayment(t), t).toBe(true);
  });

  it("erkennt Vorauszahlung und Überweisung vorab", () => {
    for (const t of [
      "Ich bräuchte eine Vorauszahlung",
      "Banküberweisung vorab, dann versende ich",
      "Ueberweisung im Voraus wäre mir lieber",
      "Überweis mir das Geld direkt",
      "Kannst du vorab überweisen?",
      "Bitte im Voraus bezahlen",
      "Du kannst auch vorab zahlen",
      "Bezahl einfach direkt bei mir",
    ]) expect(detectSuspiciousPayment(t), t).toBe(true);
  });

  it("bleibt bei Alltagsnachrichten still", () => {
    for (const t of [
      "Danke, das Paket ist gut angekommen!",
      "Ich zahle gern die 20 CHF für den Versand über Werkuno.",
      "Ausserhalb der Garage habe ich keinen Strom.",
      "Die Schraube M8 ist 12 mm lang, Bestellnummer WR-2026-001234.",
      "Vorab: Das Holz ist Eiche, nicht Buche.",
      "Die Zahlung ist über die Plattform eingegangen.",
      "Artikel ab12 schraubenzieher set 2024",
      "seriennummer de12 3456 7890 1234 5678 90 (ohne gültige Prüfziffer)",
      "Ich habe die Bestellung bezahlt und warte auf den Versand.",
      "Grösse: 120 × 80 cm, Massangabe in Zentimetern",
    ]) expect(detectSuspiciousPayment(t), t).toBe(false);
  });

  it("normalisiert Formatzeichen und ß", () => {
    expect(normalizeForDetection(`au${ZWSP}ßer\uFEFFhalb`)).toBe("ausserhalb");
  });
});
