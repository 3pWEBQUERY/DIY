"use server";

import { revalidatePath } from "next/cache";
import { refreshCategoryRegistry } from "@/server/categories/settings";
import { act } from "@/server/errors";
import { requireRole } from "@/server/authz";
import { deleteCatalog, upsertCatalog, type CatalogEntity } from "@/server/admin/catalog";
import * as offers from "@/server/materials/offers";
import { mergeMaterial, mergeTool, resetCategory, setCategoryActive, updateCategorySetting } from "@/server/admin/catalog-settings";

const ENTITIES: CatalogEntity[] = ["materialCategory", "material", "tool"];

type ReasonInput = { reason: string; publicNote?: string; days?: number | null; choice?: string };

const DETAIL: Partial<Record<CatalogEntity, string>> = { material: "material", tool: "werkzeug" };

export async function upsertCatalogAction(entity: CatalogEntity, id: string | null, input: Record<string, unknown>) {
  return act(async () => {
    const u = await requireRole("PLATFORM_MODERATOR");
    if (!ENTITIES.includes(entity)) throw new Error("Unbekannter Typ");
    const r = await upsertCatalog(u, entity, id, input);
    revalidatePath("/admin/kategorien");
    if (id && DETAIL[entity]) revalidatePath(`/admin/kategorien/${DETAIL[entity]}/${id}`);
    return r;
  }, id ? "Gespeichert." : "Angelegt.");
}

export async function deleteCatalogAction(entity: CatalogEntity, id: string) {
  return act(async () => {
    const u = await requireRole("PLATFORM_MODERATOR");
    if (!ENTITIES.includes(entity)) throw new Error("Unbekannter Typ");
    await deleteCatalog(u, entity, id);
    revalidatePath("/admin/kategorien");
    return null;
  }, "Gelöscht.");
}

/* ───────────── DIY-Kategorien ───────────── */

/** Kategorien wirken auf Entdecken, Filter und Editoren – daher das ganze Layout neu validieren. */
const refreshCategory = async (slug: string) => {
  await refreshCategoryRegistry();
  revalidatePath(`/admin/kategorien/${slug}`);
  revalidatePath("/", "layout");
};

export async function updateCategoryAction(slug: string, input: Record<string, unknown>) {
  return act(async () => {
    const u = await requireRole("ADMIN");
    const r = await updateCategorySetting(u, slug, input);
    await refreshCategory(slug);
    return r;
  }, "Kategorie gespeichert.");
}

export async function deactivateCategoryAction(slug: string, input: ReasonInput) {
  return act(async () => {
    const u = await requireRole("ADMIN");
    await setCategoryActive(u, slug, false, input.reason);
    await refreshCategory(slug);
    return null;
  }, "Kategorie deaktiviert. Bestehende Inhalte bleiben unverändert.");
}

export async function activateCategoryAction(slug: string, input: ReasonInput) {
  return act(async () => {
    const u = await requireRole("ADMIN");
    await setCategoryActive(u, slug, true, input.reason);
    await refreshCategory(slug);
    return null;
  }, "Kategorie aktiviert.");
}

export async function resetCategoryAction(slug: string, input: ReasonInput) {
  return act(async () => {
    const u = await requireRole("ADMIN");
    await resetCategory(u, slug, input.reason);
    await refreshCategory(slug);
    return null;
  }, "Auf Standard zurückgesetzt.");
}

/* ───────────── Materialien & Werkzeuge ───────────── */

export async function mergeMaterialAction(sourceId: string, input: ReasonInput) {
  return act(async () => {
    const u = await requireRole("ADMIN");
    const r = await mergeMaterial(u, sourceId, { targetId: input.choice ?? "", reason: input.reason });
    revalidatePath("/admin/kategorien");
    revalidatePath(`/admin/kategorien/material/${r.targetId}`);
    return r;
  }, "Zusammengeführt.");
}

export async function mergeToolAction(sourceId: string, input: ReasonInput) {
  return act(async () => {
    const u = await requireRole("ADMIN");
    const r = await mergeTool(u, sourceId, { targetId: input.choice ?? "", reason: input.reason });
    revalidatePath("/admin/kategorien");
    revalidatePath(`/admin/kategorien/werkzeug/${r.targetId}`);
    return r;
  }, "Zusammengeführt.");
}

/* ───────────── Bezugsquellen / Preisvergleich ───────────── */

export async function upsertOfferAction(materialId: string, offerId: string | null, input: Record<string, unknown>) {
  return act(async () => {
    const u = await requireRole("PLATFORM_MODERATOR");
    const r = await offers.upsertOffer(u, materialId, offerId, input);
    revalidatePath(`/admin/kategorien/material/${materialId}`);
    return r;
  }, offerId ? "Bezugsquelle gespeichert." : "Bezugsquelle angelegt.");
}

export async function confirmOfferAction(offerId: string) {
  return act(async () => {
    const u = await requireRole("PLATFORM_MODERATOR");
    const o = await offers.confirmOfferPrice(u, offerId);
    revalidatePath(`/admin/kategorien/material/${o.materialId}`);
    return null;
  }, "Preis als geprüft markiert.");
}

export async function deleteOfferAction(offerId: string) {
  return act(async () => {
    const u = await requireRole("PLATFORM_MODERATOR");
    const o = await offers.deleteOffer(u, offerId);
    revalidatePath(`/admin/kategorien/material/${o.materialId}`);
    return null;
  }, "Bezugsquelle gelöscht.");
}
