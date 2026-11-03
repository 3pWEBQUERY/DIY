"use server";

import { revalidatePath } from "next/cache";
import { act } from "@/server/errors";
import { requireRole } from "@/server/authz";
import { deleteCatalog, upsertCatalog, type CatalogEntity } from "@/server/admin/catalog";

const ENTITIES: CatalogEntity[] = ["materialCategory", "material", "tool"];

export async function upsertCatalogAction(entity: CatalogEntity, id: string | null, input: Record<string, unknown>) {
  return act(async () => {
    const u = await requireRole("PLATFORM_MODERATOR");
    if (!ENTITIES.includes(entity)) throw new Error("Unbekannter Typ");
    const r = await upsertCatalog(u, entity, id, input);
    revalidatePath("/admin/kategorien");
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
