import { z } from "zod";

/**
 * Shop-Aktionen mit Countdown (Creator Pro): ein Prozent-Rabatt auf alle oder ausgewählte Produkte
 * eines Shops, zeitlich begrenzt. Der Rabatt senkt den Stückpreis (in der Shop-Währung, auf 10 Rappen/Cent
 * gerundet), danach wird für Käufer:innen der anderen Währung umgerechnet. Aktionsartikel sind von
 * Set-Rabatten und Gutscheinen ausgenommen (keine doppelten Rabatte).
 */
export const SALE_MIN_PERCENT = 5;
export const SALE_MAX_PERCENT = 70;
export const SALE_MAX_DAYS = 30;
export const SALE_MAX_PRODUCTS = 200;

export const shopSaleSchema = z
  .object({
    title: z.string().trim().min(3, "Mindestens 3 Zeichen").max(60, "Höchstens 60 Zeichen"),
    percent: z.coerce
      .number()
      .int("Ganze Prozent")
      .min(SALE_MIN_PERCENT, `Mindestens ${SALE_MIN_PERCENT} %`)
      .max(SALE_MAX_PERCENT, `Höchstens ${SALE_MAX_PERCENT} %`),
    startsAt: z.coerce.date({ error: "Bitte gib einen Beginn an" }),
    endsAt: z.coerce.date({ error: "Bitte gib ein Ende an" }),
    /** leer = alle Produkte des Shops */
    productIds: z.array(z.string().min(1).max(40)).max(SALE_MAX_PRODUCTS, `Höchstens ${SALE_MAX_PRODUCTS} Produkte`).default([]),
    active: z.boolean().default(true),
  })
  .superRefine((s, ctx) => {
    if (s.endsAt <= s.startsAt) ctx.addIssue({ code: "custom", path: ["endsAt"], message: "Das Ende muss nach dem Beginn liegen" });
    else if (s.endsAt.getTime() - s.startsAt.getTime() > SALE_MAX_DAYS * 86_400_000) ctx.addIssue({ code: "custom", path: ["endsAt"], message: `Eine Aktion dauert höchstens ${SALE_MAX_DAYS} Tage` });
    if (new Set(s.productIds).size !== s.productIds.length) ctx.addIssue({ code: "custom", path: ["productIds"], message: "Jedes Produkt nur einmal" });
  });
export type ShopSaleInput = z.input<typeof shopSaleSchema>;

export type SaleWindow = { id: string; percent: number; startsAt: Date | string; endsAt: Date | string; productIds: string[]; active: boolean };

const t = (d: Date | string) => (typeof d === "string" ? new Date(d) : d).getTime();

/** Läuft die Aktion gerade? */
export function isSaleRunning(s: Pick<SaleWindow, "active" | "startsAt" | "endsAt">, now = new Date()) {
  return s.active && t(s.startsAt) <= now.getTime() && now.getTime() < t(s.endsAt);
}

/** Gilt die Aktion für dieses Produkt? (leere Auswahl = ganzer Shop) */
export function saleCoversProduct(s: Pick<SaleWindow, "productIds">, productId: string) {
  return s.productIds.length === 0 || s.productIds.includes(productId);
}

/** Laufende Aktion für ein Produkt (bei mehreren: der höchste Rabatt) */
export function saleForProduct<T extends SaleWindow>(sales: readonly T[], productId: string, now = new Date()): T | null {
  let best: T | null = null;
  for (const s of sales) if (isSaleRunning(s, now) && saleCoversProduct(s, productId) && (!best || s.percent > best.percent)) best = s;
  return best;
}

/** Aktionspreis: Prozent-Rabatt, auf 10 Rappen/Cent gerundet, nie unter 10 */
export function salePrice(unitMinor: number, percent: number) {
  if (!(percent > 0) || unitMinor <= 0) return unitMinor;
  const raw = (unitMinor * (100 - percent)) / 100;
  return Math.min(unitMinor, Math.max(10, Math.round(raw / 10) * 10));
}

/** Überschneiden sich zwei Aktionen zeitlich und bei mindestens einem Produkt? */
export function salesOverlap(a: Pick<SaleWindow, "startsAt" | "endsAt" | "productIds">, b: Pick<SaleWindow, "startsAt" | "endsAt" | "productIds">) {
  const time = t(a.startsAt) < t(b.endsAt) && t(b.startsAt) < t(a.endsAt);
  if (!time) return false;
  if (!a.productIds.length || !b.productIds.length) return true;
  const set = new Set(a.productIds);
  return b.productIds.some((id) => set.has(id));
}

/** Restzeit als „2 T 4 Std“, „3 Std 12 Min“ bzw. „12 Min“ */
export function saleCountdownLabel(endsAt: Date | string, now = new Date()) {
  const ms = Math.max(0, t(endsAt) - now.getTime());
  const min = Math.floor(ms / 60_000);
  const d = Math.floor(min / 1440);
  const h = Math.floor((min % 1440) / 60);
  const m = min % 60;
  if (d > 0) return `${d} T ${h} Std`;
  if (h > 0) return `${h} Std ${m} Min`;
  return `${Math.max(1, m)} Min`;
}
