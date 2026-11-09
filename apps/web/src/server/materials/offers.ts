import "server-only";
import { z } from "zod";
import { db } from "@/server/db";
import { fail } from "@/server/errors";
import { audit } from "@/server/audit";
import { rateLimit } from "@/server/ratelimit";
import type { SessionUser } from "@/server/auth/session";

/**
 * Preisvergleich für Materialien (PRD §17.4) mit optionalen Partnerlinks (§22.4/22.5).
 * - Bezugsquellen pflegt die Redaktion; Preise sind Momentaufnahmen mit „Stand“-Datum.
 * - Partnerlinks werden immer als „Partnerlink“ gekennzeichnet, laufen über /go/[id]
 *   (Klickzählung ohne Personenbezug) und tragen rel="sponsored nofollow".
 * - Die Reihenfolge richtet sich ausschliesslich nach dem Preis je Einheit – Provisionen
 *   beeinflussen das Ranking nicht.
 */

export const OFFER_STALE_DAYS = 90;

const offerSchema = z.object({
  retailer: z.string().trim().min(2, "Händler fehlt.").max(80),
  title: z.string().trim().max(160).default(""),
  url: z
    .string()
    .trim()
    .url("Ungültige Adresse.")
    .max(2000)
    .refine((u) => u.startsWith("https://"), "Nur https-Links."),
  price: z.coerce.number().positive("Preis fehlt.").max(100000),
  currency: z.enum(["CHF", "EUR"]).default("CHF"),
  packAmount: z.coerce.number().positive().max(1_000_000).nullish(),
  packLabel: z.string().trim().max(60).default(""),
  isAffiliate: z.boolean().default(false),
  active: z.boolean().default(true),
});

/** Preis je sinnvoller Einheit: Gramm/Milliliter je 100, alles andere je 1 Einheit. */
export function unitPrice(priceMinor: number, packAmount: number | null | undefined, unit: string) {
  if (!packAmount || packAmount <= 0) return null;
  const u = unit.trim().toLowerCase();
  const per = u === "g" || u === "ml" ? 100 : 1;
  return { minor: Math.round((priceMinor / packAmount) * per), label: per === 1 ? unit : `${per} ${unit}` };
}

const daysSince = (d: Date) => Math.floor((Date.now() - d.getTime()) / 86_400_000);

/** Öffentliche Angebote eines Materials, günstigster Preis je Einheit zuerst. */
export async function listOffers(materialId: string, unit: string) {
  const rows = await db.materialOffer.findMany({
    where: { materialId, active: true },
    select: { id: true, retailer: true, title: true, priceMinor: true, currency: true, packAmount: true, packLabel: true, isAffiliate: true, checkedAt: true },
  });
  const offers = rows.map((o) => ({
    id: o.id,
    retailer: o.retailer,
    title: o.title,
    priceMinor: o.priceMinor,
    currency: o.currency,
    packLabel: o.packLabel,
    isAffiliate: o.isAffiliate,
    checkedAt: o.checkedAt.toISOString(),
    stale: daysSince(o.checkedAt) > OFFER_STALE_DAYS,
    perUnit: unitPrice(o.priceMinor, o.packAmount, unit),
    href: `/go/${o.id}`,
  }));
  // Vergleichbar nur in gleicher Währung und mit Packungsgrösse; der Rest folgt nach Gesamtpreis
  return offers.sort((a, b) => {
    if (a.perUnit && b.perUnit && a.currency === b.currency) return a.perUnit.minor - b.perUnit.minor;
    if (a.perUnit && !b.perUnit) return -1;
    if (!a.perUnit && b.perUnit) return 1;
    return a.priceMinor - b.priceMinor;
  });
}
export type MaterialOfferView = Awaited<ReturnType<typeof listOffers>>[number];

/** Günstigstes Angebot je Material (für Listenansichten). */
export async function cheapestOffers(materialIds: string[]) {
  if (!materialIds.length) return new Map<string, { priceMinor: number; currency: string; retailer: string }>();
  const rows = await db.materialOffer.findMany({ where: { materialId: { in: materialIds }, active: true }, orderBy: { priceMinor: "asc" }, select: { materialId: true, priceMinor: true, currency: true, retailer: true } });
  const map = new Map<string, { priceMinor: number; currency: string; retailer: string }>();
  for (const r of rows) if (!map.has(r.materialId)) map.set(r.materialId, r);
  return map;
}

/** Klick auf eine Bezugsquelle: zählen und Ziel liefern. Kein Personenbezug, nur Zähler. */
export async function offerClick(offerId: string, ipKey: string | null) {
  const o = await db.materialOffer.findUnique({ where: { id: offerId }, select: { id: true, url: true, active: true } });
  if (!o || !o.active) return null;
  // Mehrfachklicks derselben Quelle innerhalb einer Stunde nur einmal zählen
  let count = true;
  if (ipKey) {
    try {
      await rateLimit(`offer-click:${offerId}:${ipKey}`, 1, 3600);
    } catch {
      count = false;
    }
  }
  if (count) await db.materialOffer.update({ where: { id: o.id }, data: { clickCount: { increment: 1 }, lastClickAt: new Date() } });
  return o.url;
}

// ───────────────────────── Verwaltung (Redaktion) ─────────────────────────

export async function adminListOffers(materialId: string) {
  const rows = await db.materialOffer.findMany({ where: { materialId }, orderBy: [{ active: "desc" }, { priceMinor: "asc" }] });
  return rows.map((o) => ({ ...o, checkedAt: o.checkedAt.toISOString(), lastClickAt: o.lastClickAt?.toISOString() ?? null, createdAt: o.createdAt.toISOString(), updatedAt: o.updatedAt.toISOString(), stale: daysSince(o.checkedAt) > OFFER_STALE_DAYS }));
}
export type AdminOffer = Awaited<ReturnType<typeof adminListOffers>>[number];

export async function upsertOffer(actor: SessionUser, materialId: string, offerId: string | null, input: unknown) {
  const d = offerSchema.parse(input);
  const m = await db.material.findUnique({ where: { id: materialId }, select: { id: true } });
  if (!m) throw fail.notFound("Material nicht gefunden.");
  const data = {
    retailer: d.retailer,
    title: d.title,
    url: d.url,
    priceMinor: Math.round(d.price * 100),
    currency: d.currency,
    packAmount: d.packAmount ?? null,
    packLabel: d.packLabel,
    isAffiliate: d.isAffiliate,
    active: d.active,
    checkedAt: new Date(),
  };
  return db.$transaction(async (tx) => {
    let id = offerId;
    if (offerId) {
      const r = await tx.materialOffer.updateMany({ where: { id: offerId, materialId }, data });
      if (!r.count) throw fail.notFound();
    } else {
      if ((await tx.materialOffer.count({ where: { materialId } })) >= 30) throw fail.invalid("Höchstens 30 Bezugsquellen je Material.");
      id = (await tx.materialOffer.create({ data: { ...data, materialId, createdById: actor.id }, select: { id: true } })).id;
    }
    await audit({ actorId: actor.id, action: offerId ? "admin.material_offer_updated" : "admin.material_offer_created", targetType: "MATERIAL", targetId: materialId, meta: { offerId: id, retailer: d.retailer, affiliate: d.isAffiliate } }, tx);
    return { id: id! };
  });
}

/** Preis als geprüft markieren (Stand-Datum auf heute). */
export async function confirmOfferPrice(actor: SessionUser, offerId: string) {
  const o = await db.materialOffer.update({ where: { id: offerId }, data: { checkedAt: new Date() }, select: { materialId: true } });
  await audit({ actorId: actor.id, action: "admin.material_offer_checked", targetType: "MATERIAL", targetId: o.materialId, meta: { offerId } });
  return o;
}

export async function deleteOffer(actor: SessionUser, offerId: string) {
  const o = await db.materialOffer.findUnique({ where: { id: offerId }, select: { materialId: true, retailer: true } });
  if (!o) throw fail.notFound();
  await db.$transaction(async (tx) => {
    await tx.materialOffer.delete({ where: { id: offerId } });
    await audit({ actorId: actor.id, action: "admin.material_offer_deleted", targetType: "MATERIAL", targetId: o.materialId, meta: { offerId, retailer: o.retailer } }, tx);
  });
  return o;
}
