import "server-only";
import { db } from "@/server/db";
import { getSetting } from "@/server/settings";
import { proUserIds } from "@/server/pro/service";

/**
 * Plattformprovision je Shop: Standard (commerce.feeBps) oder – für Shops mit Creator Pro –
 * die tiefere Pro-Provision (pro.feeBps). Nie höher als der Standard.
 */
export async function feeResolver(shopIds: string[]) {
  const [base, pro] = await Promise.all([getSetting("commerce.feeBps"), getSetting("pro.feeBps")]);
  const shops = shopIds.length ? await db.shop.findMany({ where: { id: { in: [...new Set(shopIds)] } }, select: { id: true, ownerId: true } }) : [];
  const pros = await proUserIds(shops.map((s) => s.ownerId));
  const map = new Map(shops.map((s) => [s.id, pros.has(s.ownerId) ? Math.min(base, pro) : base]));
  return Object.assign((shopId: string) => map.get(shopId) ?? base, { base });
}

/** Provision für einen einzelnen Shop (Anzeige im Studio). */
export async function feeForShop(shopId: string) {
  return (await feeResolver([shopId]))(shopId);
}
