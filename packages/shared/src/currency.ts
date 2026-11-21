import type { Currency } from "./money";

/**
 * Land und Währung der Mitglieder: Schweiz und Liechtenstein sehen und bezahlen in Franken,
 * Deutschland und Österreich in Euro. Shops verkaufen in ihrer eigenen Währung; für Mitglieder
 * mit der anderen Währung wird zum Tageskurs der EZB umgerechnet und auf 10 Rappen/Cent gerundet.
 * Gegenstück in iOS: `Core/Currency.swift`.
 */
export const MEMBER_COUNTRIES = ["CH", "LI", "DE", "AT"] as const;
export type MemberCountry = (typeof MEMBER_COUNTRIES)[number];

export const MEMBER_COUNTRY_LABEL: Record<MemberCountry, string> = {
  CH: "Schweiz",
  LI: "Liechtenstein",
  DE: "Deutschland",
  AT: "Österreich",
};

export const MEMBER_COUNTRY_FLAG: Record<MemberCountry, string> = { CH: "🇨🇭", LI: "🇱🇮", DE: "🇩🇪", AT: "🇦🇹" };

export const CURRENCY_LABEL: Record<Currency, string> = { CHF: "Schweizer Franken (CHF)", EUR: "Euro (EUR)" };

export function isMemberCountry(v: unknown): v is MemberCountry {
  return typeof v === "string" && (MEMBER_COUNTRIES as readonly string[]).includes(v);
}

/** Währung, in der ein Mitglied aus diesem Land Preise sieht und bezahlt */
export function currencyForCountry(country: string | null | undefined): Currency {
  return country === "DE" || country === "AT" ? "EUR" : "CHF";
}

/** Startwert, solange noch kein EZB-Kurs geladen ist (CHF je 1 EUR) */
export const FALLBACK_EUR_CHF = 0.94;

/** Gerundet auf 10 Rappen bzw. Cent; positive Beträge nie auf 0 */
export function roundTo10(minor: number) {
  if (minor <= 0) return Math.max(0, Math.round(minor));
  return Math.max(10, Math.round(minor / 10) * 10);
}

/**
 * Betrag umrechnen. `eurChf` = CHF je 1 EUR (EZB-Referenzkurs). Gleiche Währung: unverändert.
 * Umgerechnete Beträge werden auf 10 Rappen/Cent gerundet.
 */
export function convertMinor(minor: number, from: string, to: Currency, eurChf: number): number {
  if (from === to || !Number.isFinite(minor)) return minor;
  if (!(eurChf > 0)) return minor;
  const raw = from === "EUR" ? minor * eurChf : minor / eurChf;
  return roundTo10(raw);
}

/** Faktor, mit dem Beträge in `from` in die Währung `to` umgerechnet werden (ungerundet). */
export function fxFactor(from: string, to: string, eurChf: number) {
  if (from === to || !(eurChf > 0)) return 1;
  return from === "EUR" ? eurChf : 1 / eurChf;
}

/** Währung aus der Sprache des Browsers/Geräts raten (Gäste): de-DE, de-AT → EUR, sonst CHF */
export function currencyFromAcceptLanguage(header: string | null | undefined): Currency {
  const first = (header ?? "").split(",")[0]?.trim().toLowerCase() ?? "";
  return /^[a-z]{2}-(de|at)\b/.test(first) ? "EUR" : "CHF";
}
