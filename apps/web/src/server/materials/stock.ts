import "server-only";
import { z } from "zod";
import { db } from "@/server/db";
import { fail } from "@/server/errors";
import { rateLimit } from "@/server/ratelimit";

/**
 * Eigener Materialbestand („Habe ich schon“). Privat – nur die Person selbst sieht ihn.
 * Einträge verweisen auf ein Material der Datenbank (eindeutig je Person) oder sind frei benannt.
 * Der Bestand fliesst in Projekt-Materiallisten (Markierung „Habe ich“) und in Einkaufslisten
 * (übernommene Positionen, die schon im Bestand sind, gelten als erledigt).
 */

const MAX_STOCK = 1000;

const stockSchema = z
  .object({
    materialId: z.string().min(1).max(40).nullish(),
    name: z.string().trim().max(120).optional(),
    quantity: z.string().trim().max(40).default(""),
    note: z.string().trim().max(200).default(""),
  })
  .refine((d) => d.materialId || d.name, { message: "Gib ein Material an.", path: ["name"] });

const patchSchema = z.object({ quantity: z.string().trim().max(40).optional(), note: z.string().trim().max(200).optional() });

export async function listStock(userId: string) {
  const rows = await db.materialStock.findMany({
    where: { userId },
    orderBy: [{ updatedAt: "desc" }],
    select: {
      id: true, name: true, quantity: true, note: true, updatedAt: true, materialId: true,
      material: { select: { slug: true, name: true, unit: true, type: true, category: { select: { slug: true, name: true } } } },
    },
  });
  return rows.map((r) => ({
    id: r.id,
    materialId: r.materialId,
    name: r.material?.name ?? r.name,
    quantity: r.quantity,
    note: r.note,
    updatedAt: r.updatedAt.toISOString(),
    slug: r.material?.slug ?? null,
    unit: r.material?.unit ?? null,
    type: r.material?.type ?? null,
    category: r.material?.category ?? null,
  }));
}
export type StockEntry = Awaited<ReturnType<typeof listStock>>[number];

/** Material in den Bestand aufnehmen oder Menge/Notiz aktualisieren (Material: upsert, frei: neu). */
export async function addStock(userId: string, input: unknown) {
  const d = stockSchema.parse(input);
  await rateLimit(`stock:${userId}`, 600, 3600);
  if (d.materialId) {
    const m = await db.material.findUnique({ where: { id: d.materialId }, select: { id: true, name: true } });
    if (!m) throw fail.notFound("Material nicht gefunden.");
    const row = await db.materialStock.upsert({
      where: { userId_materialId: { userId, materialId: m.id } },
      create: { userId, materialId: m.id, name: m.name, quantity: d.quantity, note: d.note },
      update: { ...(d.quantity ? { quantity: d.quantity } : {}), ...(d.note ? { note: d.note } : {}) },
      select: { id: true },
    });
    return row;
  }
  const name = d.name!.trim();
  if (!name) throw fail.invalid("Gib ein Material an.");
  const same = await db.materialStock.findFirst({ where: { userId, materialId: null, name: { equals: name, mode: "insensitive" } }, select: { id: true } });
  if (same) {
    await db.materialStock.update({ where: { id: same.id }, data: { ...(d.quantity ? { quantity: d.quantity } : {}), ...(d.note ? { note: d.note } : {}) } });
    return same;
  }
  if ((await db.materialStock.count({ where: { userId } })) >= MAX_STOCK) throw fail.invalid(`Dein Bestand fasst höchstens ${MAX_STOCK} Einträge.`);
  return db.materialStock.create({ data: { userId, name, quantity: d.quantity, note: d.note }, select: { id: true } });
}

export async function updateStock(userId: string, id: string, input: unknown) {
  const d = patchSchema.parse(input);
  const r = await db.materialStock.updateMany({ where: { id, userId }, data: d });
  if (!r.count) throw fail.notFound();
}

export async function removeStock(userId: string, id: string) {
  const r = await db.materialStock.deleteMany({ where: { id, userId } });
  if (!r.count) throw fail.notFound();
}

/** „Habe ich“ für ein Datenbank-Material umschalten. */
export async function toggleStockMaterial(userId: string, materialId: string, have: boolean) {
  if (have) return { have: true, id: (await addStock(userId, { materialId })).id };
  await db.materialStock.deleteMany({ where: { userId, materialId } });
  return { have: false, id: null };
}

/** Welche dieser Materialien (IDs) bzw. freien Namen hat die Person im Bestand? */
export async function stockLookup(userId: string | null | undefined, materialIds: string[], names: string[] = []) {
  const empty = { ids: new Set<string>(), names: new Set<string>() };
  if (!userId || (!materialIds.length && !names.length)) return empty;
  const rows = await db.materialStock.findMany({
    where: { userId, OR: [{ materialId: { in: materialIds } }, ...(names.length ? [{ materialId: null, name: { in: names, mode: "insensitive" as const } }] : [])] },
    select: { materialId: true, name: true },
  });
  return { ids: new Set(rows.map((r) => r.materialId).filter((x): x is string => !!x)), names: new Set(rows.filter((r) => !r.materialId).map((r) => r.name.trim().toLowerCase())) };
}

export async function stockEntryFor(userId: string | null | undefined, materialId: string) {
  if (!userId) return null;
  return db.materialStock.findUnique({ where: { userId_materialId: { userId, materialId } }, select: { id: true, quantity: true, note: true, updatedAt: true } });
}

/** Gekaufte Position einer Einkaufsliste in den Bestand übernehmen. */
export async function stockFromShoppingItem(userId: string, itemId: string) {
  const it = await db.shoppingListItem.findUnique({ where: { id: itemId }, select: { name: true, quantity: true, materialId: true, list: { select: { ownerId: true } } } });
  if (!it || it.list.ownerId !== userId) throw fail.notFound();
  return addStock(userId, { materialId: it.materialId, name: it.name, quantity: it.quantity });
}
