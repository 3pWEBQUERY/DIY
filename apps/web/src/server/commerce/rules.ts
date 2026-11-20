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

export type ShopTotals<L extends PricedLine> = {
  shopId: string;
  lines: L[];
  /** Warenwert vor Rabatt */
  subtotal: number;
  /** Rabatt auf den Warenwert (Sets, Gutschein); `fees` ist bereits auf den Warenwert nach Rabatt gerechnet */
  discount: number;
  fees: FeeBreakdown;
};

/**
 * Gruppiert Positionen je Shop (→ eine Bestellung pro Shop) und berechnet Gebühren transparent.
 * `discountFor` liefert den Rabatt je Shop; er wird auf den Warenwert begrenzt und so, dass die
 * Bestellung den Mindestbetrag des Zahlungsanbieters nicht unterschreitet. Die Provision gilt
 * auf den Warenwert nach Rabatt – den Rabatt trägt der Shop.
 */
export function groupByShop<L extends PricedLine>(
  lines: L[],
  feeBps: number | ((shopId: string) => number),
  discountFor?: (shopId: string, lines: L[], subtotal: number) => number,
): ShopTotals<L>[] {
  const groups = new Map<string, L[]>();
  for (const l of lines) {
    if (!Number.isInteger(l.quantity) || l.quantity < 1) throw new Error("Ungültige Menge");
    const g = groups.get(l.shopId);
    if (g) g.push(l);
    else groups.set(l.shopId, [l]);
  }
  return [...groups.entries()].map(([shopId, ls]) => {
    const subtotal = ls.reduce((s, l) => s + l.unitMinor * l.quantity, 0);
    const shipping = shippingForLines(ls);
    const discount = clampDiscount(discountFor ? discountFor(shopId, ls, subtotal) : 0, subtotal, shipping);
    return { shopId, lines: ls, subtotal, discount, fees: computeFees(subtotal - discount, shipping, typeof feeBps === "function" ? feeBps(shopId) : feeBps) };
  });
}

/** Summe mehrerer Shop-Bestellungen (Anzeige im Warenkorb). `subtotal` = Warenwert vor Rabatt. */
export function grandTotal(groups: { fees: FeeBreakdown; subtotal?: number; discount?: number }[]) {
  return groups.reduce(
    (a, g) => ({
      subtotal: a.subtotal + (g.subtotal ?? g.fees.subtotal),
      discount: a.discount + (g.discount ?? 0),
      shipping: a.shipping + g.fees.shipping,
      total: a.total + g.fees.total,
    }),
    { subtotal: 0, discount: 0, shipping: 0, total: 0 },
  );
}

/* ───────────────────────── Rabatte: Gutscheine und Sets ───────────────────────── */

/** Mindestbetrag einer Zahlung (Stripe: CHF/EUR 0.50). Rabatte drücken eine Bestellung nie darunter. */
export const MIN_CHARGE_MINOR = 50;

/** Rabatt begrenzen: nicht negativ, nicht über dem Warenwert, Gesamtbetrag bleibt ≥ Mindestbetrag. */
export function clampDiscount(discount: number, subtotal: number, shipping: number) {
  if (!Number.isFinite(discount) || discount <= 0) return 0;
  const room = Math.max(0, subtotal + shipping - MIN_CHARGE_MINOR);
  return Math.min(Math.round(discount), subtotal, room);
}

export type CouponRule = {
  code: string;
  kind: "PERCENT" | "FIXED";
  value: number;
  minSubtotalMinor: number;
  startsAt: Date | null;
  endsAt: Date | null;
  maxUses: number | null;
  usedCount: number;
  onePerBuyer: boolean;
  active: boolean;
};

/**
 * Warum ein Gutschein gerade nicht gilt – oder `null`. `buyerUses` = bisherige Einlösungen dieses
 * Kontos (offene oder bezahlte Bestellungen); `subtotal` = Warenwert, auf den er angewendet wird.
 */
export function couponProblem(c: CouponRule, ctx: { now: Date; subtotal: number; buyerUses: number; fmt: (minor: number) => string }) {
  if (!c.active) return "Dieser Gutschein ist nicht mehr gültig.";
  if (c.startsAt && c.startsAt > ctx.now) return `Dieser Gutschein gilt erst ab ${c.startsAt.toLocaleDateString("de-CH", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Zurich" })}.`;
  if (c.endsAt && c.endsAt < ctx.now) return "Dieser Gutschein ist abgelaufen.";
  if (c.maxUses != null && c.usedCount >= c.maxUses) return "Dieser Gutschein ist bereits vergeben.";
  if (c.onePerBuyer && ctx.buyerUses > 0) return "Du hast diesen Gutschein bereits eingelöst.";
  if (ctx.subtotal < c.minSubtotalMinor) return `Gilt ab einem Warenwert von ${ctx.fmt(c.minSubtotalMinor)} in diesem Shop.`;
  return null;
}

/** Gutscheinrabatt auf einen Warenwert (ohne Prüfung der Gültigkeit). */
export function couponAmount(c: Pick<CouponRule, "kind" | "value">, subtotal: number) {
  if (subtotal <= 0) return 0;
  const d = c.kind === "PERCENT" ? Math.round((subtotal * c.value) / 100) : c.value;
  return Math.max(0, Math.min(subtotal, d));
}

/** Kurzbeschreibung eines Gutscheins: „10 %“ bzw. „CHF 5.00“. */
export function couponValueLabel(c: Pick<CouponRule, "kind" | "value">, fmt: (minor: number) => string) {
  return c.kind === "PERCENT" ? `${c.value} %` : fmt(c.value);
}

export type BundleRule = { id: string; title: string; discountPct: number; items: { productId: string; quantity: number }[] };
export type BundleLine = { productId: string; variantId?: string | null; unitMinor: number; quantity: number };

/**
 * Set-Rabatte: Ein Set gilt, wenn alle Teile (ohne Variante) mindestens in der Set-Menge im
 * Warenkorb liegen. Jede Einheit zählt höchstens für ein Set; Rabatt = Prozent auf den Set-Anteil.
 * Reihenfolge der Sets = Reihenfolge, in der sie in den Warenkorb kamen.
 */
export function applyBundles(lines: BundleLine[], bundles: BundleRule[]) {
  const left = new Map<string, { unit: number; qty: number }>();
  for (const l of lines) {
    if (l.variantId) continue;
    const e = left.get(l.productId);
    if (e) e.qty += l.quantity;
    else left.set(l.productId, { unit: l.unitMinor, qty: l.quantity });
  }
  const applied: { id: string; title: string; amountMinor: number; valueMinor: number }[] = [];
  const incomplete: { id: string; title: string; missing: string[] }[] = [];
  for (const b of bundles) {
    if (!b.items.length) continue;
    const missing = b.items.filter((i) => (left.get(i.productId)?.qty ?? 0) < i.quantity).map((i) => i.productId);
    if (missing.length) {
      incomplete.push({ id: b.id, title: b.title, missing });
      continue;
    }
    let value = 0;
    for (const i of b.items) {
      const e = left.get(i.productId)!;
      e.qty -= i.quantity;
      value += e.unit * i.quantity;
    }
    applied.push({ id: b.id, title: b.title, valueMinor: value, amountMinor: Math.round((value * Math.max(0, Math.min(100, b.discountPct))) / 100) });
  }
  return { applied, incomplete };
}

export type DiscountRow = { kind: "bundle" | "coupon"; label: string; amountMinor: number };

/**
 * Rabattzeilen an den tatsächlich gewährten (begrenzten) Rabatt anpassen: gekürzt wird von hinten,
 * also zuerst der Gutschein, dann die Sets.
 */
export function fitRows(rows: DiscountRow[], amountMinor: number): DiscountRow[] {
  let over = rows.reduce((s, r) => s + r.amountMinor, 0) - amountMinor;
  const out = rows.map((r) => ({ ...r }));
  for (let i = out.length - 1; i >= 0 && over > 0; i--) {
    const cut = Math.min(over, out[i]!.amountMinor);
    out[i]!.amountMinor -= cut;
    over -= cut;
  }
  return out.filter((r) => r.amountMinor > 0);
}

/** Set-Preis aus Teilen (Anzeige „CHF X statt Y“). */
export function bundlePrice(items: { unitMinor: number; quantity: number }[], discountPct: number) {
  const full = items.reduce((s, i) => s + i.unitMinor * i.quantity, 0);
  const discount = Math.round((full * discountPct) / 100);
  return { fullMinor: full, discountMinor: discount, priceMinor: full - discount };
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

/**
 * Apples Provision auf In-App-Käufe (Standardsatz). Der App-Preis enthält dafür einen Aufschlag
 * (`commerce.iosMarkupBps`), der Shop erhält denselben Anteil wie bei einem Web-Verkauf.
 */
export const APPLE_COMMISSION_BPS = 3000;

export type AppleTransferState = "pending" | "sent" | "failed" | "reversed" | "test" | "none";

/** Anteil des Shops an einer Bestellung, getrennt nach Zahlungsweg (Stripe im Web, Apple in der iOS-App). */
export type SellerShare =
  | { channel: "stripe"; feeBps: number; platformFeeMinor: number; payoutMinor: number }
  | {
      channel: "apple";
      feeBps: number;
      /** In der App bezahlter Preis (inkl. Aufschlag für Apple) */
      appPriceMinor: number;
      appleFeeBps: number;
      appleFeeMinor: number;
      /** Web-Preis des Shops zum Kaufzeitpunkt (Grundlage der Provision) */
      webPriceMinor: number;
      platformFeeMinor: number;
      /** Überweisung von Werkuno an den Shop (per Stripe aus dem Plattformguthaben) */
      payoutMinor: number;
      transfer: AppleTransferState;
      refunded: boolean;
    };

const TRANSFER_STATE: Record<string, AppleTransferState> = { PENDING: "pending", SENT: "sent", FAILED: "pending", REVERSED: "reversed", SKIPPED: "test", NONE: "none" };

export function sellerShareFor(
  order: { totalMinor: number; platformFeeMinor: number; feeBps: number; payments: { provider: string; status: string }[] },
  refundedMinor: number,
  apple?: { priceMinor: number; webPriceMinor: number; sellerNetMinor: number; status: string; transferStatus: string } | null,
): SellerShare {
  const isApple = order.payments.some((p) => p.provider === "apple");
  if (!isApple) {
    const fee = netPlatformFee(order.platformFeeMinor, order.totalMinor, refundedMinor);
    return { channel: "stripe", feeBps: order.feeBps, platformFeeMinor: fee, payoutMinor: order.totalMinor - refundedMinor - fee };
  }
  const appPrice = apple?.priceMinor ?? order.totalMinor;
  const sellerNet = apple?.sellerNetMinor ?? Math.max(0, order.totalMinor - order.platformFeeMinor);
  // Ohne Kaufdatensatz (Altfälle) den Web-Preis aus Anteil und Provisionssatz zurückrechnen
  const webPrice = apple?.webPriceMinor ?? (order.feeBps < 10_000 ? Math.round((sellerNet * 10_000) / (10_000 - order.feeBps)) : sellerNet);
  const refunded = apple?.status === "REFUNDED" || apple?.transferStatus === "REVERSED" || order.payments.some((p) => p.provider === "apple" && p.status === "REFUNDED");
  return {
    channel: "apple",
    feeBps: order.feeBps,
    appPriceMinor: appPrice,
    appleFeeBps: APPLE_COMMISSION_BPS,
    appleFeeMinor: Math.round((appPrice * APPLE_COMMISSION_BPS) / 10_000),
    webPriceMinor: webPrice,
    platformFeeMinor: Math.max(0, webPrice - sellerNet),
    payoutMinor: refunded ? 0 : sellerNet,
    transfer: refunded ? "reversed" : (TRANSFER_STATE[apple?.transferStatus ?? "NONE"] ?? "none"),
    refunded,
  };
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
/** Preis in der iOS-App (Rappen) für einen Web-Preis: kleinste Stufe ≥ Web-Preis × (1 + Aufschlag); null = keine Stufe hoch genug. */
export function appTierFor(webMinor: number, markupBps: number, tiersMinor: readonly number[]) {
  if (!Number.isInteger(webMinor) || webMinor <= 0) return null;
  const target = Math.ceil((webMinor * (10_000 + Math.max(0, markupBps))) / 10_000);
  return tiersMinor.find((t) => t >= target) ?? null;
}

export function formatBps(bps: number) {
  return `${new Intl.NumberFormat("de-CH", { maximumFractionDigits: 2 }).format(bps / 100)} %`;
}
