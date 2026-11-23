import { fxFactor } from "@werkraum/shared";
import { MIN_CHARGE_MINOR } from "./rules";

/**
 * Geschenkgutschein an der Kasse anrechnen – reine Rechenregeln (ohne Datenbank).
 *
 * - Der Gutschein wirkt wie ein Zahlungsmittel NACH Rabatten (Sets, Gutscheincodes, Aktionen) auf
 *   Warenwert und Versand.
 * - Deckt er die Bestellung ganz, wird ohne Zahlungsanbieter abgeschlossen. Sonst bleibt mindestens der
 *   Mindestbetrag des Zahlungsanbieters (MIN_CHARGE_MINOR) zu bezahlen – der Rest bleibt als Guthaben.
 * - Provision: Sie fiel schon beim Kauf des Gutscheins an. Bei der Einlösung gilt sie nur auf den Teil des
 *   Warenwerts, der nicht mit dem Gutschein bezahlt wird (keine doppelte Provision).
 */
export function planGiftCardUse(input: { goodsNetMinor: number; shippingMinor: number; balanceInOrderMinor: number }) {
  const due = Math.max(0, input.goodsNetMinor) + Math.max(0, input.shippingMinor);
  const balance = Math.max(0, Math.floor(input.balanceInOrderMinor));
  if (due <= 0 || balance <= 0) return 0;
  if (balance >= due) return due;
  return Math.max(0, Math.min(balance, due - MIN_CHARGE_MINOR));
}

/** Provision nach Anrechnung: nur auf den bar bezahlten Warenwert */
export function feeAfterGiftCard(goodsNetMinor: number, appliedMinor: number, feeBps: number) {
  const cashGoods = Math.max(0, goodsNetMinor - Math.min(appliedMinor, goodsNetMinor));
  return Math.round((cashGoods * feeBps) / 10_000);
}

/** Guthaben in der Bestellwährung (abgerundet, damit nie mehr angerechnet wird als vorhanden) */
export function balanceInOrderCurrency(balanceMinor: number, cardCurrency: string, orderCurrency: string, eurChf: number) {
  if (cardCurrency === orderCurrency) return balanceMinor;
  return Math.floor(balanceMinor * fxFactor(cardCurrency, orderCurrency, eurChf));
}

/**
 * Abbuchung vom Gutschein (in seiner Währung) für einen in der Bestellwährung angerechneten Betrag.
 * Wird das ganze Guthaben angerechnet, wird es exakt aufgebraucht; sonst aufgerundet, nie über dem Guthaben.
 */
export function debitForApplied(appliedOrderMinor: number, balanceMinor: number, cardCurrency: string, orderCurrency: string, eurChf: number) {
  if (appliedOrderMinor <= 0) return 0;
  if (cardCurrency === orderCurrency) return Math.min(balanceMinor, appliedOrderMinor);
  if (appliedOrderMinor >= balanceInOrderCurrency(balanceMinor, cardCurrency, orderCurrency, eurChf)) return balanceMinor;
  return Math.min(balanceMinor, Math.ceil(appliedOrderMinor * fxFactor(orderCurrency, cardCurrency, eurChf)));
}

/** Ablaufdatum: Monatsende nach `months` Monaten ab Kaufdatum (23:59:59 UTC) */
export function giftCardExpiry(from: Date, months: number) {
  const d = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + months + 1, 0, 23, 59, 59));
  return d;
}

/** Ist ein Betrag für diesen Shop kaufbar? */
export function giftAmountAllowed(amountMinor: number, s: { amounts: number[]; customEnabled: boolean; customMinMinor: number; customMaxMinor: number }) {
  if (!Number.isInteger(amountMinor) || amountMinor <= 0) return false;
  if (s.amounts.includes(amountMinor)) return true;
  return s.customEnabled && amountMinor >= s.customMinMinor && amountMinor <= s.customMaxMinor;
}
