/**
 * Haltefrist für Verkäufererlöse – reine Regeln (ohne Datenbank, testbar).
 *
 * Ein Erlös wird auszahlbar, sobald die Bestellung abgeschlossen ist UND die Haltefrist danach
 * abgelaufen ist. Problemfälle und angefochtene Zahlungen bleiben zurückgehalten. Bis dahin liegt das
 * Geld auf dem Stripe-Konto des Shops (Destination Charge), wird aber nicht ausgezahlt – Erstattungen
 * und Rückbuchungen sind so in aller Regel vom Shop-Guthaben gedeckt.
 */
import { zurichDayKey } from "@/lib/tz";

const DAY = 86_400_000;

export type HoldOrder = {
  status: string;
  paidAt: Date | null;
  shippedAt: Date | null;
  completedAt: Date | null;
  totalMinor: number;
  platformFeeMinor: number;
  refundedMinor: number;
  disputed: boolean;
};

export type HoldConfig = { holdDays: number; autoCompleteDays: number; waived: boolean };

/** Zurückgehalten? Und ab wann voraussichtlich frei (null = erst nach Abschluss bzw. Klärung). */
export function holdState(o: HoldOrder, cfg: HoldConfig, now: Date = new Date()): { held: boolean; releaseAt: Date | null } {
  if (!o.paidAt || o.status === "PENDING_PAYMENT" || o.status === "CANCELLED" || o.status === "REFUNDED") return { held: false, releaseAt: null };
  // Angefochtene Zahlungen und Problemfälle nie auszahlen, auch nicht bei erlassener Frist
  if (o.disputed || o.status === "PROBLEM") return { held: true, releaseAt: null };
  if (cfg.waived) return { held: false, releaseAt: null };
  if (o.status === "COMPLETED") {
    const releaseAt = new Date((o.completedAt ?? o.paidAt).getTime() + cfg.holdDays * DAY);
    return releaseAt <= now ? { held: false, releaseAt: null } : { held: true, releaseAt };
  }
  // Versendet: Abschluss spätestens automatisch nach autoCompleteDays – voraussichtliches Freigabedatum
  if (o.status === "SHIPPED" && o.shippedAt) return { held: true, releaseAt: new Date(o.shippedAt.getTime() + (cfg.autoCompleteDays + cfg.holdDays) * DAY) };
  return { held: true, releaseAt: null };
}

/** Anteil des Shops an einer Bestellung (Bestellwährung): Betrag minus Erstattungen minus anteilige Provision. */
export function sellerShare(o: Pick<HoldOrder, "totalMinor" | "platformFeeMinor" | "refundedMinor">) {
  if (o.totalMinor <= 0) return 0;
  const refunded = Math.min(o.totalMinor, Math.max(0, o.refundedMinor));
  const ratio = refunded / o.totalMinor;
  const fee = o.platformFeeMinor - Math.round(o.platformFeeMinor * ratio);
  return Math.max(0, o.totalMinor - refunded - fee);
}

/** Gutschrift auf dem Verkäuferkonto (dessen Währung) anteilig um Erstattungen kürzen. */
export function scaleSettlement(settledMinor: number, o: Pick<HoldOrder, "totalMinor" | "refundedMinor">) {
  if (o.totalMinor <= 0) return 0;
  const left = 1 - Math.min(1, Math.max(0, o.refundedMinor) / o.totalMinor);
  return Math.max(0, Math.round(settledMinor * left));
}

export type PayoutPlan = { interval: string; weeklyAnchor: string | null; monthlyAnchor: number | null };

const WEEKDAY = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const weekdayFmt = new Intl.DateTimeFormat("en-US", { timeZone: "Europe/Zurich", weekday: "long" });

/** Ist heute (Zürcher Kalender) ein Auszahlungstag – und wurde heute noch nicht automatisch ausgezahlt? */
export function isPayoutDue(plan: PayoutPlan, lastAutoPayoutAt: Date | null, now: Date = new Date()) {
  if (plan.interval === "manual") return false;
  const today = zurichDayKey(now);
  if (lastAutoPayoutAt && zurichDayKey(lastAutoPayoutAt) === today) return false;
  if (plan.interval === "daily") return true;
  if (plan.interval === "weekly") return weekdayFmt.format(now).toLowerCase() === (plan.weeklyAnchor ?? "monday");
  if (plan.interval === "monthly") {
    const [y, m, d] = today.split("-").map(Number) as [number, number, number];
    const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
    // Anker 31 in kürzeren Monaten: am letzten Tag des Monats
    return d === Math.min(plan.monthlyAnchor ?? 1, lastDay);
  }
  return false;
}

export { WEEKDAY };
