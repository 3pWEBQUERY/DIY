import "server-only";
import { formatMoney, salePrice, saleForProduct, salesOverlap, SALE_MAX_DAYS, shopSaleSchema, type Currency } from "@werkraum/shared";
import { db } from "@/server/db";
import { fail } from "@/server/errors";
import { rateLimit } from "@/server/ratelimit";
import { audit } from "@/server/audit";
import { isPro } from "@/server/pro/service";
import type { SessionUser } from "@/server/auth/session";
import { requireOwnShop } from "./shops";
import { localize, localizePrice, type PriceContext } from "./currency";

/**
 * Shop-Aktionen mit Countdown (Creator Pro).
 *
 * Preisregel: Der Aktionsrabatt senkt den Stückpreis in der Shop-Währung (auf 10 Rappen/Cent gerundet);
 * erst danach wird für Käufer:innen der anderen Währung umgerechnet. Warenkorb, Kasse und Bestellung
 * rechnen mit dem Aktionspreis – Provision, Einnahmen und Erstattungen stimmen damit automatisch.
 * Aktionsartikel sind von Set-Rabatten und Gutscheinen ausgenommen (keine doppelten Rabatte).
 * In-App-Käufe (Apple) bleiben beim regulären Preis: Apple-Preisstufen lassen sich nicht kurzfristig ändern.
 *
 * Bearbeiten: Geplante Aktionen sind frei änderbar. Laufende Aktionen behalten Prozent, Beginn und
 * Produkte (Käufer:innen sollen sich auf den angekündigten Rabatt verlassen können); änderbar sind
 * Titel und Ende (verlängern bis höchstens 30 Tage ab Beginn oder vorzeitig beenden).
 * Beendete Aktionen bleiben als Verlauf sichtbar.
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

/** Banner auf der Shopseite: laufende Aktion mit dem grössten Rabatt */
export async function shopSaleBanner(shopId: string) {
  const list = (await runningSalesByShop([shopId])).get(shopId) ?? [];
  const best = list.sort((a, b) => b.percent - a.percent)[0];
  return best ? saleView(best) : null;
}

/* ───────────────────────── Studio ───────────────────────── */

function statusOf(s: { active: boolean; startsAt: Date; endsAt: Date }, now = new Date()) {
  if (!s.active) return "PAUSED" as const;
  if (now >= s.endsAt) return "ENDED" as const;
  if (now < s.startsAt) return "SCHEDULED" as const;
  return "RUNNING" as const;
}

export async function listMySales(user: Pick<SessionUser, "id">) {
  const shop = await requireOwnShop(user);
  const [pro, sales, products] = await Promise.all([
    isPro(user.id),
    db.shopSale.findMany({ where: { shopId: shop.id }, orderBy: [{ endsAt: "desc" }], take: 100 }),
    db.product.findMany({ where: { shopId: shop.id, status: { in: ["ACTIVE", "SOLD_OUT", "PAUSED", "DRAFT"] } }, orderBy: { title: "asc" }, take: 300, select: { id: true, title: true, priceMinor: true, status: true, kind: true, coverUrl: true } }),
  ]);
  const now = new Date();
  return {
    pro,
    shop: { id: shop.id, currency: shop.currency, status: shop.status },
    maxDays: SALE_MAX_DAYS,
    products,
    sales: sales.map((s) => ({ ...s, startsAt: s.startsAt.toISOString(), endsAt: s.endsAt.toISOString(), createdAt: s.createdAt.toISOString(), updatedAt: s.updatedAt.toISOString(), status: statusOf(s, now) })),
  };
}

async function assertCanRun(user: Pick<SessionUser, "id">) {
  if (!(await isPro(user.id))) throw fail.forbidden("Aktionen mit Countdown gehören zu Creator Pro.");
}

async function assertNoOverlap(shopId: string, exceptId: string | null, s: { startsAt: Date; endsAt: Date; productIds: string[] }) {
  const others = await db.shopSale.findMany({ where: { shopId, active: true, endsAt: { gt: new Date() }, ...(exceptId ? { id: { not: exceptId } } : {}) }, select: { title: true, startsAt: true, endsAt: true, productIds: true } });
  const hit = others.find((o) => salesOverlap(o, s));
  if (hit) throw fail.invalid(`Überschneidet sich mit der Aktion „${hit.title}“ – je Produkt gilt höchstens eine Aktion gleichzeitig.`, { productIds: `Überschneidet sich mit „${hit.title}“` });
}

async function assertOwnProducts(shopId: string, productIds: string[]) {
  if (!productIds.length) return;
  const n = await db.product.count({ where: { shopId, id: { in: productIds } } });
  if (n !== productIds.length) throw fail.invalid("Einige Produkte gehören nicht zu deinem Shop.", { productIds: "Ungültige Auswahl" });
}

export async function saveSale(user: SessionUser, saleId: string | null, input: unknown) {
  const data = shopSaleSchema.parse(input);
  const shop = await requireOwnShop(user, { writable: true });
  await assertCanRun(user);
  await rateLimit(`sale-save:${user.id}`, 60, 3600);
  await assertOwnProducts(shop.id, data.productIds);
  const now = new Date();

  if (!saleId) {
    if (data.endsAt <= now) throw fail.invalid("Das Ende liegt in der Vergangenheit.", { endsAt: "Ende liegt in der Vergangenheit" });
    if ((await db.shopSale.count({ where: { shopId: shop.id } })) >= 200) throw fail.invalid("Höchstens 200 Aktionen je Shop. Lösche alte Aktionen.");
    if (data.active) await assertNoOverlap(shop.id, null, data);
    const s = await db.shopSale.create({ data: { shopId: shop.id, title: data.title, percent: data.percent, startsAt: data.startsAt, endsAt: data.endsAt, productIds: data.productIds, active: data.active }, select: { id: true } });
    await audit({ actorId: user.id, action: "sale.create", targetType: "ShopSale", targetId: s.id, meta: { percent: data.percent, products: data.productIds.length } });
    return s;
  }

  const cur = await db.shopSale.findFirst({ where: { id: saleId, shopId: shop.id } });
  if (!cur) throw fail.notFound();
  const st = statusOf(cur, now);
  if (st === "ENDED") throw fail.invalid("Beendete Aktionen lassen sich nicht mehr ändern. Lege eine neue an.");
  let next = { title: data.title, percent: data.percent, startsAt: data.startsAt, endsAt: data.endsAt, productIds: data.productIds, active: data.active };
  if (st === "RUNNING") {
    // Laufend: Rabatt, Beginn und Produkte bleiben; Ende verlängern (max. 30 Tage ab Beginn) oder vorziehen
    if (data.percent !== cur.percent) throw fail.invalid("Der Rabatt einer laufenden Aktion bleibt fest. Beende sie und starte eine neue.", { percent: "Bei laufender Aktion fest" });
    const sameProducts = data.productIds.length === cur.productIds.length && data.productIds.every((id) => cur.productIds.includes(id));
    if (!sameProducts) throw fail.invalid("Die Produkte einer laufenden Aktion bleiben fest.", { productIds: "Bei laufender Aktion fest" });
    if (data.endsAt.getTime() - cur.startsAt.getTime() > SALE_MAX_DAYS * 86_400_000) throw fail.invalid(`Eine Aktion dauert höchstens ${SALE_MAX_DAYS} Tage.`, { endsAt: `Höchstens ${SALE_MAX_DAYS} Tage ab Beginn` });
    next = { ...next, percent: cur.percent, startsAt: cur.startsAt, productIds: cur.productIds, endsAt: data.endsAt < now ? now : data.endsAt };
  } else if (data.endsAt <= now) {
    throw fail.invalid("Das Ende liegt in der Vergangenheit.", { endsAt: "Ende liegt in der Vergangenheit" });
  }
  if (next.active) await assertNoOverlap(shop.id, saleId, next);
  await db.shopSale.update({ where: { id: saleId }, data: next });
  await audit({ actorId: user.id, action: "sale.update", targetType: "ShopSale", targetId: saleId, meta: { percent: next.percent, active: next.active } });
  return { id: saleId };
}

/** Vorzeitig beenden (bleibt im Verlauf) */
export async function endSale(user: SessionUser, saleId: string) {
  const shop = await requireOwnShop(user);
  const cur = await db.shopSale.findFirst({ where: { id: saleId, shopId: shop.id } });
  if (!cur) throw fail.notFound();
  const now = new Date();
  if (cur.endsAt <= now) return { ended: true };
  // Noch nicht gestartet: Ende = Beginn (taucht nie auf)
  await db.shopSale.update({ where: { id: saleId }, data: { endsAt: cur.startsAt > now ? cur.startsAt : now } });
  await audit({ actorId: user.id, action: "sale.end", targetType: "ShopSale", targetId: saleId });
  return { ended: true };
}

/** Löschen: nur geplante oder beendete Aktionen (laufende erst beenden) */
export async function deleteSale(user: SessionUser, saleId: string) {
  const shop = await requireOwnShop(user);
  const cur = await db.shopSale.findFirst({ where: { id: saleId, shopId: shop.id } });
  if (!cur) throw fail.notFound();
  if (statusOf(cur) === "RUNNING") throw fail.invalid("Beende die Aktion zuerst.");
  await db.shopSale.delete({ where: { id: saleId } });
  await audit({ actorId: user.id, action: "sale.delete", targetType: "ShopSale", targetId: saleId });
}

/** Text für den Bestellverlauf */
export function saleNote(lines: { title: string; sale: ActiveSale | null }[], currency: string, savedMinor: number) {
  const used = [...new Map(lines.filter((l) => l.sale).map((l) => [l.sale!.id, l.sale!])).values()];
  if (!used.length) return "";
  return ` · Aktion: ${used.map((s) => `„${s.title}“ −${s.percent} %`).join(", ")} (gespart ${formatMoney(savedMinor, currency as Currency)})`;
}

