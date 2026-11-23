import "server-only";
import { salePrice, saleForProduct } from "@werkraum/shared";
import { db, Prisma } from "@/server/db";
import { localize, localizePrice, type PriceContext } from "./currency";

/**
 * Aktionspreise (Shop-Aktionen mit Countdown) ohne Studio-Logik: laufende Aktionen laden und Preise für
 * Käufer:innen berechnen. Leichtgewichtig, damit Feed, Suche, Profile und Einbettungen es nutzen können.
 * Regel: Rabatt in der Shop-Währung (auf 10 Rappen/Cent gerundet), danach in die Währung der Betrachter:in.
 */

export type ActiveSale = { id: string; shopId: string; title: string; percent: number; startsAt: Date; endsAt: Date; productIds: string[]; active: boolean };

const saleSelect = { id: true, shopId: true, title: true, percent: true, startsAt: true, endsAt: true, productIds: true, active: true } as const;

/** Laufende Aktionen je Shop (ein Aufruf für eine ganze Liste) */
export async function runningSalesByShop(shopIds: string[], now = new Date()) {
  const ids = [...new Set(shopIds)].filter(Boolean);
  const map = new Map<string, ActiveSale[]>();
  if (!ids.length) return map;
  const rows = await db.shopSale.findMany({ where: { shopId: { in: ids }, active: true, startsAt: { lte: now }, endsAt: { gt: now } }, select: saleSelect }).catch(() => [] as ActiveSale[]);
  for (const r of rows) map.set(r.shopId, [...(map.get(r.shopId) ?? []), r]);
  return map;
}

/** Laufende Aktion für ein Produkt (oder null) */
export function saleFor(map: Map<string, ActiveSale[]>, shopId: string, productId: string, now = new Date()) {
  return saleForProduct(map.get(shopId) ?? [], productId, now);
}

/** Stückpreis in der Shop-Währung mit Aktion */
export function saleUnit(shopUnit: number, sale: Pick<ActiveSale, "percent"> | null | undefined) {
  return sale ? salePrice(shopUnit, sale.percent) : shopUnit;
}

/** Laufende Aktion je Produkt für eine ganze Liste – eine Abfrage, kein N+1 */
export async function salesForProducts(rows: readonly { id: string; shopId: string }[], now = new Date()) {
  const byShop = await runningSalesByShop(rows.map((r) => r.shopId), now);
  return new Map(rows.map((r) => [r.id, saleFor(byShop, r.shopId, r.id, now)] as const));
}

/** Aktions-Angaben bei eingebetteten Produkten (gleiche Form wie auf Produktkarten) */
export type PriceSale = { id: string; title: string; percent: number; endsAt: string; regularMinor: number; shopRegularMinor: number };

/**
 * Preis eines Produkts für Anzeigen ausserhalb der Produktkarten (Beiträge, Projekte, Anleitungen,
 * Blog, Nachrichten, Suche, Profil): Aktionspreis in der Shop-Währung, dann in die Währung der
 * Betrachter:in umgerechnet – dieselbe Rechnung wie Karte, Warenkorb und Kasse.
 */
export function localizeWithSale<T extends { priceMinor: number; currency: string }>(ctx: PriceContext, item: T, sale: ActiveSale | null | undefined) {
  const s = sale ?? null;
  const base = localizePrice(ctx, { ...item, priceMinor: saleUnit(item.priceMinor, s) });
  const tag: PriceSale | null = s ? { id: s.id, title: s.title, percent: s.percent, endsAt: s.endsAt.toISOString(), regularMinor: localize(ctx, item.priceMinor, item.currency), shopRegularMinor: item.priceMinor } : null;
  return { ...base, sale: tag };
}

/** Nur die Preisfelder (für Objekte, die nicht das ganze Produkt weitergeben) */
export function salePriceFields<T extends { priceMinor: number; currency: string }>(ctx: PriceContext, item: T, sale: ActiveSale | null | undefined) {
  const x = localizeWithSale(ctx, item, sale);
  return { priceMinor: x.priceMinor, currency: x.currency, original: x.original, sale: x.sale };
}

/** Öffentliche Angaben zu einer Aktion (Karten, Produktseite, Shop-Banner, App) */
export function saleView(s: ActiveSale) {
  return { id: s.id, title: s.title, percent: s.percent, startsAt: s.startsAt.toISOString(), endsAt: s.endsAt.toISOString(), allProducts: s.productIds.length === 0 };
}
export type SaleView = ReturnType<typeof saleView>;

/**
 * SQL-Ausdruck: Preis, den die Betrachter:in für das Produkt `alias` zahlt – laufende Shop-Aktion
 * (höchster Rabatt, auf 10 Rappen/Cent gerundet wie `salePrice`), dann in ihre Währung umgerechnet
 * (wie `convertMinor`). Für Preis-Sortierung und Preisspanne in Marktplatz und Suche.
 */
export function effectivePriceSql(alias: string, currency: "CHF" | "EUR", eurChf: number) {
  const p = Prisma.raw(`"${alias.replace(/"/g, "")}"`);
  const rate = eurChf > 0 ? eurChf : 1;
  return Prisma.sql`(
    SELECT CASE
      WHEN e.cur = ${currency} OR e.eff <= 0 THEN e.eff
      WHEN e.cur = 'EUR' THEN GREATEST(10, ROUND(e.eff * ${rate} / 10.0) * 10)
      ELSE GREATEST(10, ROUND(e.eff / ${rate} / 10.0) * 10)
    END
    FROM (
      SELECT ${p}.currency AS cur,
        CASE WHEN s.pct > 0 AND ${p}."priceMinor" > 0
          THEN LEAST(${p}."priceMinor", GREATEST(10, ROUND(${p}."priceMinor" * (100 - s.pct) / 1000.0) * 10))
          ELSE ${p}."priceMinor" END AS eff
      FROM (
        SELECT MAX(x.percent) AS pct FROM "ShopSale" x
        WHERE x."shopId" = ${p}."shopId" AND x.active AND x."startsAt" <= now() AND x."endsAt" > now()
          AND (cardinality(x."productIds") = 0 OR ${p}.id = ANY(x."productIds"))
      ) s
    ) e
  )`;
}
