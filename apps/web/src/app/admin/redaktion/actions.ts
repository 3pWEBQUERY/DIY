"use server";

import { revalidatePath } from "next/cache";
import { act } from "@/server/errors";
import { requireRole } from "@/server/authz";
import { deleteCollection, toggleCollection, upsertCollection } from "@/server/admin/catalog";

const refresh = () => {
  revalidatePath("/admin/redaktion");
  revalidatePath("/entdecken");
};

export async function saveCollectionAction(id: string | null, input: unknown) {
  return act(async () => {
    const u = await requireRole("PLATFORM_MODERATOR");
    const row = await upsertCollection(u, id, input);
    refresh();
    return { id: row.id };
  }, "Kollektion gespeichert.");
}

export async function toggleCollectionAction(id: string, active: boolean) {
  return act(async () => {
    const u = await requireRole("PLATFORM_MODERATOR");
    await toggleCollection(u, id, active);
    refresh();
    return null;
  }, active ? "Aktiviert." : "Deaktiviert.");
}

export async function deleteCollectionAction(id: string) {
  return act(async () => {
    const u = await requireRole("PLATFORM_MODERATOR");
    await deleteCollection(u, id);
    refresh();
    return null;
  }, "Kollektion gelöscht.");
}
