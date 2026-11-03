/** Geldbeträge werden immer als Integer in Rappen/Cent gespeichert. */
export type Currency = "CHF" | "EUR";

export function formatMoney(minor: number, currency: Currency = "CHF", locale = "de-CH") {
  return new Intl.NumberFormat(locale, { style: "currency", currency, minimumFractionDigits: 2 }).format(minor / 100);
}

export interface FeeBreakdown {
  subtotal: number;
  shipping: number;
  total: number;
  platformFee: number;
  sellerNet: number;
}

/**
 * PRD §22.2 – Provision nur auf abgeschlossene Transaktionen, transparent ausgewiesen.
 * Die Plattformgebühr wird auf Warenwert (ohne Versand) berechnet und kaufmännisch gerundet.
 * Zahlungsdienstleisterkosten werden separat vom Provider abgezogen und hier nicht verdeckt eingerechnet.
 */
export function computeFees(subtotal: number, shipping: number, feeBps: number): FeeBreakdown {
  if (!Number.isInteger(subtotal) || !Number.isInteger(shipping) || subtotal < 0 || shipping < 0) {
    throw new Error("Beträge müssen nicht-negative Ganzzahlen (Rappen) sein");
  }
  if (feeBps < 0 || feeBps > 3000) throw new Error("Provision ausserhalb des erlaubten Bereichs");
  const platformFee = Math.round((subtotal * feeBps) / 10_000);
  const total = subtotal + shipping;
  return { subtotal, shipping, total, platformFee, sellerNet: total - platformFee };
}
