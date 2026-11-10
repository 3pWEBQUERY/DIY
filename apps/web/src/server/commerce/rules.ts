/**
 * Reine Geschäftsregeln des Marktplatzes (PRD §13, §22.2).
 *
 * Bewusst OHNE `import "server-only"`: Diese Datei enthält weder DB-Zugriff noch
 * Geheimnisse, nur deterministische Funktionen – damit sie in Vitest ohne
 * Next-Laufzeit getestet und im Client für Vorschauen genutzt werden kann.
 */
import { ORDER_TRANSITIONS, computeFees, type FeeBreakdown, type OrderStatus } from "@werkraum/shared";

/* ───────────────────────── Bestell-Statusmaschine (§13.6) ───────────────────────── */

export function canTransition(from: OrderStatus, to: OrderStatus) {
  return ORDER_TRANSITIONS[from]?.includes(to) ?? false;
}

export class TransitionError extends Error {
  constructor(
    public from: OrderStatus,
    public to: OrderStatus,
  ) {
    super(`Statuswechsel ${from} → ${to} ist nicht erlaubt`);
  }
}

export function assertTransition(from: OrderStatus, to: OrderStatus) {
  if (!canTransition(from, to)) throw new TransitionError(from, to);
}

/** Status, in denen noch nichts versendet wurde – Stornierung mit Erstattung möglich. */
export const PRE_SHIPMENT: OrderStatus[] = ["NEW", "IN_PROGRESS", "READY_TO_SHIP", "PROBLEM"];

/** Verkäufer darf stornieren, wenn die Statusmaschine es zulässt und noch nicht versendet wurde. */
export function canSellerCancel(status: OrderStatus, shipped: boolean) {
  return !shipped && canTransition(status, "CANCELLED");
}

/** Bewertungen nur nach bestätigtem Kauf und Versand bzw. Abschluss (§13.9). */
export function canReview(status: OrderStatus, paymentStatus: string | null | undefined) {
  const paid = paymentStatus === "SUCCEEDED" || paymentStatus === "PARTIALLY_REFUNDED";
  return paid && (status === "SHIPPED" || status === "COMPLETED");
}

/** Tabs der Verkäufer-Bestellübersicht – Reihenfolge = Arbeitsablauf. */
export const SELLER_ORDER_TABS = [
  { key: "neu", status: "NEW", label: "Neu" },
  { key: "in-bearbeitung", status: "IN_PROGRESS", label: "In Bearbeitung" },
  { key: "versandbereit", status: "READY_TO_SHIP", label: "Versandbereit" },
  { key: "versendet", status: "SHIPPED", label: "Versendet" },
  { key: "abgeschlossen", status: "COMPLETED", label: "Abgeschlossen" },
  { key: "storniert", status: "CANCELLED", label: "Storniert" },
  { key: "erstattet", status: "REFUNDED", label: "Erstattet" },
  { key: "problemfaelle", status: "PROBLEM", label: "Problemfälle" },
] as const satisfies readonly { key: string; status: OrderStatus; label: string }[];

/* ───────────────────────── Bestellnummer ───────────────────────── */

/** Menschenlesbare Bestellnummer: WR-2026-8F3K2 */
export function formatOrderNumber(year: number, code: string) {
  if (!/^[0-9A-Z]{5}$/.test(code)) throw new Error("Ungültiger Bestellcode");
  return `WR-${year}-${code}`;
}

/* ───────────────────────── Preise, Versand, Gebühren ───────────────────────── */

export type PricedLine = {
  shopId: string;
  unitMinor: number;
  quantity: number;
  shippingMinor: number;
  isDigital: boolean;
};

/** Stückpreis = Grundpreis + Variantenaufschlag; nie unter CHF 0.00. */
export function unitPrice(priceMinor: number, deltaMinor = 0) {
  return Math.max(0, priceMinor + deltaMinor);
}

/**
 * Versand je Shop-Bestellung: kombinierter Versand – es gilt der höchste Versandsatz
 * der physischen Artikel. Rein digitale Bestellungen sind versandkostenfrei.
 */
export function shippingForLines(lines: Pick<PricedLine, "shippingMinor" | "isDigital">[]) {
  return lines.filter((l) => !l.isDigital).reduce((max, l) => Math.max(max, l.shippingMinor), 0);
}

export type ShopTotals<L extends PricedLine> = { shopId: string; lines: L[]; fees: FeeBreakdown };

/** Gruppiert Positionen je Shop (→ eine Bestellung pro Shop) und berechnet Gebühren transparent. */
export function groupByShop<L extends PricedLine>(lines: L[], feeBps: number | ((shopId: string) => number)): ShopTotals<L>[] {
  const groups = new Map<string, L[]>();
  for (const l of lines) {
    if (!Number.isInteger(l.quantity) || l.quantity < 1) throw new Error("Ungültige Menge");
    const g = groups.get(l.shopId);
    if (g) g.push(l);
    else groups.set(l.shopId, [l]);
  }
  return [...groups.entries()].map(([shopId, ls]) => {
    const subtotal = ls.reduce((s, l) => s + l.unitMinor * l.quantity, 0);
    return { shopId, lines: ls, fees: computeFees(subtotal, shippingForLines(ls), typeof feeBps === "function" ? feeBps(shopId) : feeBps) };
  });
}

/** Summe mehrerer Shop-Bestellungen (Anzeige im Warenkorb). */
export function grandTotal(groups: { fees: FeeBreakdown }[]) {
  return groups.reduce(
    (a, g) => ({ subtotal: a.subtotal + g.fees.subtotal, shipping: a.shipping + g.fees.shipping, total: a.total + g.fees.total }),
    { subtotal: 0, shipping: 0, total: 0 },
  );
}

/** "24.50" / "24,5" / "24" → 2450 Rappen. Liefert null bei ungültiger Eingabe. */
export function parseMoneyInput(input: string): number | null {
  const s = input.trim().replace(/['’\s]/g, "").replace(",", ".");
  if (!/^\d{1,7}(\.\d{0,2})?$/.test(s)) return null;
  const [fr, rp = ""] = s.split(".");
  return Number(fr) * 100 + Number((rp + "00").slice(0, 2));
}

/** 2450 → "24.50" (Eingabefelder, ohne Währung). */
export function minorToInput(minor: number) {
  return (minor / 100).toFixed(2);
}

/* ───────────────────────── Erstattungen ───────────────────────── */

/** Noch erstattbarer Betrag: Gesamtbetrag abzüglich offener und erfolgreicher Erstattungen. */
export function refundableAmount(totalMinor: number, refunds: { amountMinor: number; status: string }[]) {
  const bound = refunds.filter((r) => r.status !== "FAILED").reduce((s, r) => s + r.amountMinor, 0);
  return Math.max(0, totalMinor - bound);
}

/** Zahlungsstatus nach Erstattungen (Zahlung und Bestellung sind getrennte Modelle, §13.6). */
export function paymentStatusAfterRefund(amountMinor: number, refundedMinor: number): "SUCCEEDED" | "PARTIALLY_REFUNDED" | "REFUNDED" {
  if (refundedMinor <= 0) return "SUCCEEDED";
  return refundedMinor >= amountMinor ? "REFUNDED" : "PARTIALLY_REFUNDED";
}

/**
 * Folgen eines geänderten Erstattungsstands – immer aus der Summe der tatsächlich erfolgreichen
 * Erstattungen berechnet, damit auch ein nachträglich fehlgeschlagener Refund (succeeded → failed)
 * korrekt verbucht wird.
 * - `toRefunded`: Bestellung wird jetzt vollständig erstattet.
 * - `restock`: dabei noch nicht versendet → Bestand zurück wie beim Storno (genau einmal, `restocked`).
 * - `reopen`: Bestellung stand auf „Erstattet“, ist es nach dem Fehlschlag aber nicht mehr.
 */
export function refundEffects(o: { orderStatus: OrderStatus; paymentMinor: number; refundedMinor: number; shipped: boolean; restocked: boolean }) {
  const payStatus = paymentStatusAfterRefund(o.paymentMinor, o.refundedMinor);
  const full = payStatus === "REFUNDED";
  const toRefunded = full && o.orderStatus !== "CANCELLED" && o.orderStatus !== "REFUNDED";
  const restock = toRefunded && !o.restocked && canSellerCancel(o.orderStatus, o.shipped);
  const reopen = !full && o.orderStatus === "REFUNDED";
  return { payStatus, full, toRefunded, restock, reopen };
}

/** Status vor der letzten Umstellung auf „Erstattet“ (aus dem Bestellverlauf, älteste zuerst). */
export function statusBeforeRefunded(events: { from: OrderStatus | null; to: OrderStatus }[]): OrderStatus | null {
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i]!;
    if (e.to === "REFUNDED" && e.from && e.from !== "REFUNDED") return e.from;
  }
  return null;
}

/**
 * Plattformgebühr nach Erstattungen: Stripe erstattet die Application Fee anteilig
 * (`refund_application_fee`), damit Provision nur auf tatsächlich abgeschlossene
 * Umsätze anfällt (§22.2).
 */
export function netPlatformFee(platformFeeMinor: number, totalMinor: number, refundedMinor: number) {
  if (totalMinor <= 0) return 0;
  const ratio = Math.min(1, Math.max(0, refundedMinor / totalMinor));
  return platformFeeMinor - Math.round(platformFeeMinor * ratio);
}

/* ───────────────────────── Bestand ───────────────────────── */

export function available(inv: { onHand: number; reserved: number } | null | undefined) {
  if (!inv) return 0;
  return Math.max(0, inv.onHand - inv.reserved);
}

/** Ein Produkt ist ausverkauft, wenn physisch nichts mehr am Lager ist (Reservierungen zählen nicht). */
export function isSoldOut(items: { onHand: number }[]) {
  return items.reduce((s, i) => s + Math.max(0, i.onHand), 0) <= 0;
}

/** Bps → Prozentanzeige (de-CH), z. B. 600 → "6 %", 650 → "6.5 %". */
export function formatBps(bps: number) {
  return `${new Intl.NumberFormat("de-CH", { maximumFractionDigits: 2 }).format(bps / 100)} %`;
}
