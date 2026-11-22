import "server-only";
import { formatMoney, type Currency } from "@werkraum/shared";
import { db, type Prisma } from "@/server/db";
import { applyBundles, couponAmount, couponProblem, couponValueLabel, fitRows, type BundleRule, type CouponRule, type DiscountRow } from "./rules";

export { fitRows, type DiscountRow };

/**
 * Rabatte im Warenkorb und an der Kasse: Set-Rabatte (ProductBundle) und je Shop höchstens ein
 * Gutschein (ShopCoupon). Dieselbe Berechnung läuft für die Anzeige und in der Checkout-Transaktion,
 * damit der angezeigte Betrag dem belasteten entspricht.
 */

type Client = Prisma.TransactionClient | typeof db;

export type ShopDiscount = {
  rows: DiscountRow[];
  amountMinor: number;
  coupon: { id: string; code: string; valueLabel: string; problem: string | null } | null;
  /** Sets im Warenkorb, deren Teile nicht (mehr) vollständig sind */
  incompleteBundles: { id: string; title: string }[];
};

const couponSelect = {
  id: true,
  shopId: true,
  code: true,
  kind: true,
  value: true,
  minSubtotalMinor: true,
  startsAt: true,
  endsAt: true,
  maxUses: true,
  usedCount: true,
  onePerBuyer: true,
  active: true,
} satisfies Prisma.ShopCouponSelect;

type CouponRow = Prisma.ShopCouponGetPayload<{ select: typeof couponSelect }>;

/** Bisherige Einlösungen eines Kontos: bezahlte Bestellungen, auf Wunsch auch offene. */
export async function buyerCouponUses(client: Client, buyerId: string, couponIds: string[], opts: { includePending: boolean }) {
  if (!couponIds.length) return new Map<string, { used: number; pending: number }>();
  const rows = await client.order.groupBy({
    by: ["couponId", "status"],
    where: { buyerId, couponId: { in: couponIds }, OR: [{ paidAt: { not: null } }, { status: "PENDING_PAYMENT" }] },
    _count: { _all: true },
  });
  const m = new Map<string, { used: number; pending: number }>();
  for (const r of rows) {
    const e = m.get(r.couponId!) ?? { used: 0, pending: 0 };
    if (r.status === "PENDING_PAYMENT") e.pending += r._count._all;
    else e.used += r._count._all;
    m.set(r.couponId!, e);
  }
  if (opts.includePending) for (const e of m.values()) e.used += e.pending;
  return m;
}

/**
 * Lädt Gutscheine und Sets eines Warenkorbs und liefert einen Rechner je Shop.
 * `includePending`: in der Kasse zählen eigene offene Bestellungen mit (sie wurden vorher verworfen);
 * in der Anzeige nicht – sonst wirkte ein Gutschein nach einer abgebrochenen Zahlung „verbraucht“.
 */
export async function loadCartDiscounts(client: Client, opts: { userId: string; cartId: string | null | undefined; includePending: boolean; now?: Date }) {
  const now = opts.now ?? new Date();
  if (!opts.cartId) return { forShop: () => empty(), coupons: new Map<string, CouponRow>() };
  const [cartCoupons, cartBundles] = await Promise.all([
    client.cartCoupon.findMany({ where: { cartId: opts.cartId }, select: { shopId: true, coupon: { select: couponSelect } } }),
    client.cartBundle.findMany({
      where: { cartId: opts.cartId, bundle: { active: true, shop: { status: "ACTIVE" } } },
      orderBy: { createdAt: "asc" },
      select: { bundle: { select: { id: true, shopId: true, title: true, discountPct: true, items: { select: { productId: true, quantity: true, product: { select: { status: true } } } } } } },
    }),
  ]);
  const coupons = new Map<string, CouponRow>();
  for (const c of cartCoupons) if (c.coupon.shopId === c.shopId) coupons.set(c.shopId, c.coupon);
  const uses = await buyerCouponUses(client, opts.userId, [...coupons.values()].map((c) => c.id), { includePending: opts.includePending });
  const bundlesByShop = new Map<string, BundleRule[]>();
  for (const { bundle: b } of cartBundles) {
    // Ein Set mit nicht mehr erhältlichen Teilen gilt nicht
    if (b.items.some((i) => i.product.status !== "ACTIVE")) continue;
    const list = bundlesByShop.get(b.shopId) ?? [];
    list.push({ id: b.id, title: b.title, discountPct: b.discountPct, items: b.items.map((i) => ({ productId: i.productId, quantity: i.quantity })) });
    bundlesByShop.set(b.shopId, list);
  }

  /**
   * `currency` = Währung der Zeilen (Käufer:in). `convert` rechnet feste Beträge des Gutscheins
   * (Wert, Mindestbestellwert) aus der Shop-Währung um, wenn in einer anderen Währung bezahlt wird.
   */
  function forShop(
    shopId: string,
    lines: { productId: string; variantId?: string | null; unitMinor: number; quantity: number; onSale?: boolean }[],
    subtotal: number,
    currency: string = "CHF",
    convert: (minor: number) => number = (m) => m,
  ): ShopDiscount {
    const fmt = (m: number) => formatMoney(m, currency as Currency);
    const rows: DiscountRow[] = [];
    const inCart = new Set(lines.map((l) => l.productId));
    // Aktionsartikel (Shop-Aktion mit Countdown) sind von Sets und Gutscheinen ausgenommen
    const onSale = new Set(lines.filter((l) => l.onSale).map((l) => l.productId));
    const eligible = onSale.size ? lines.filter((l) => !l.onSale) : lines;
    const base = onSale.size ? eligible.reduce((s, l) => s + l.unitMinor * l.quantity, 0) : subtotal;
    const { applied, incomplete } = applyBundles(eligible, bundlesByShop.get(shopId) ?? []);
    for (const a of applied) if (a.amountMinor > 0) rows.push({ kind: "bundle", label: `Set „${a.title}“`, amountMinor: a.amountMinor });
    const bundleTotal = rows.reduce((s, r) => s + r.amountMinor, 0);
    let coupon: ShopDiscount["coupon"] = null;
    const raw = coupons.get(shopId);
    const c = raw && { ...raw, value: raw.kind === "FIXED" ? convert(raw.value) : raw.value, minSubtotalMinor: raw.minSubtotalMinor ? convert(raw.minSubtotalMinor) : raw.minSubtotalMinor };
    if (c) {
      const u = uses.get(c.id) ?? { used: 0, pending: 0 };
      // Eigene offene Bestellungen halten in der Anzeige keinen Platz besetzt
      const rule: CouponRule = { ...c, usedCount: opts.includePending ? c.usedCount : Math.max(0, c.usedCount - u.pending) };
      const problem = onSale.size && !eligible.length ? "Gilt nicht für Artikel in einer Aktion." : couponProblem(rule, { now, subtotal: base, buyerUses: u.used, fmt });
      coupon = { id: c.id, code: c.code, valueLabel: couponValueLabel(c, fmt), problem };
      if (!problem) {
        const amount = couponAmount(c, base - bundleTotal);
        if (amount > 0) rows.push({ kind: "coupon", label: `Gutschein ${c.code}`, amountMinor: amount });
      }
    }
    return {
      rows,
      amountMinor: rows.reduce((s, r) => s + r.amountMinor, 0),
      coupon,
      // Nur Sets nennen, von denen noch etwas im Warenkorb liegt
      // Sets mit Aktionsartikeln gelten als „in der Aktion“, nicht als unvollständig
      incompleteBundles: incomplete
        .filter((b) => !b.missing.some((id) => onSale.has(id)))
        .filter((b) => (bundlesByShop.get(shopId) ?? []).find((x) => x.id === b.id)?.items.some((i) => inCart.has(i.productId)))
        .map((b) => ({ id: b.id, title: b.title })),
    };
  }

  return { forShop, coupons };
}

function empty(): ShopDiscount {
  return { rows: [], amountMinor: 0, coupon: null, incompleteBundles: [] };
}

/** Bezeichnung für den Zahlungsanbieter (Stripe: höchstens 40 Zeichen). */
export function discountLabel(rows: DiscountRow[]) {
  const coupon = rows.find((r) => r.kind === "coupon");
  const bundles = rows.filter((r) => r.kind === "bundle").length;
  const parts = [bundles ? (bundles === 1 ? "Set-Rabatt" : `${bundles} Set-Rabatte`) : null, coupon?.label ?? null].filter(Boolean);
  return (parts.join(" + ") || "Rabatt").slice(0, 40);
}

/** Rabattzeilen einer Bestellung aus dem Json-Feld lesen. */
export function orderDiscountRows(value: unknown): DiscountRow[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((r) =>
    r && typeof r === "object" && typeof (r as DiscountRow).label === "string" && Number.isInteger((r as DiscountRow).amountMinor)
      ? [{ kind: (r as DiscountRow).kind === "coupon" ? "coupon" : "bundle", label: (r as DiscountRow).label, amountMinor: (r as DiscountRow).amountMinor } as DiscountRow]
      : [],
  );
}
