import "server-only";
import { formatMoney, salePrice, saleForProduct, salesOverlap, SALE_MAX_DAYS, shopSaleSchema, type Currency } from "@werkraum/shared";
import { db } from "@/server/db";
import { fail } from "@/server/errors";
import { rateLimit } from "@/server/ratelimit";
import { audit } from "@/server/audit";
import { isPro } from "@/server/pro/service";
import type { SessionUser } from "@/server/auth/session";
import { requireOwnShop } from "./shops";

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

export { runningSalesByShop, saleFor, saleUnit, salesForProducts, localizeWithSale, salePriceFields, saleView } from "./sale-prices";
export type { ActiveSale, PriceSale, SaleView } from "./sale-prices";
import { runningSalesByShop, saleView, type ActiveSale } from "./sale-prices";

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

