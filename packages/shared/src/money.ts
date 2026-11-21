/** Geldbeträge werden immer als Integer in Rappen/Cent gespeichert. */
export type Currency = "CHF" | "EUR";

/** Betrag formatieren; Währung als Code aus der Datenbank (`CHF`, `EUR`), leer = CHF */
export function formatMoney(minor: number, currency: Currency | (string & {}) | null = "CHF", locale = "de-CH") {
  const out = new Intl.NumberFormat(locale, { style: "currency", currency: currency || "CHF", minimumFractionDigits: 2 }).format(minor / 100);
  // Euro mit Zeichen („€ 90.40“), Franken wie gewohnt mit Code („CHF 85.00“)
  return currency === "EUR" ? out.replace("EUR", "€") : out;
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

/**
 * Ungefähre Materialkosten aus Richtpreisen je Zeile. `null`, wenn keine Zeile einen Preis hat;
 * `complete` sagt, ob alle Zeilen einen Preis haben (sonst „ab“).
 */
export function materialsCostEstimate(lines: { costMinor?: number | null }[]) {
  const priced = lines.filter((l) => typeof l.costMinor === "number" && l.costMinor >= 0);
  if (!priced.length) return null;
  return { totalMinor: priced.reduce((a, l) => a + (l.costMinor as number), 0), complete: priced.length === lines.length, priced: priced.length };
}
