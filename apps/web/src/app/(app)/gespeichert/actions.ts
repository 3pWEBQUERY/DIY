"use server";

import { revalidatePath } from "next/cache";
import type { TargetType } from "@/server/db";
import { act } from "@/server/errors";
import { requireUser } from "@/server/auth/session";
import { setBookmark } from "@/server/social/interactions";
import * as collections from "@/server/collections/service";

/** Server Actions für Gespeichertes & Sammlungen (PRD §10.7). */

export async function myCollectionsAction() {
  return act(async () => collections.listCollections((await requireUser()).id));
}

export async function createCollectionAction(input: { title: string; description?: string; visibility?: string }) {
  return act(async () => {
    const r = await collections.createCollection(await requireUser(), input);
    revalidatePath("/gespeichert");
    return r;
  }, "Sammlung angelegt.");
}

export async function updateCollectionAction(id: string, input: { title: string; description?: string; visibility?: string }) {
  return act(async () => {
    await collections.updateCollection(await requireUser(), id, input);
    revalidatePath("/gespeichert");
    revalidatePath(`/sammlungen/${id}`);
    return null;
  }, "Sammlung gespeichert.");
}

export async function deleteCollectionAction(id: string) {
  return act(async () => {
    await collections.deleteCollection(await requireUser(), id);
    revalidatePath("/gespeichert");
    return null;
  }, "Sammlung gelöscht. Die Inhalte bleiben gespeichert.");
}

/** Lesezeichen in eine Sammlung verschieben (null = aus Sammlung lösen). */
export async function moveBookmarkAction(type: TargetType, id: string, collectionId: string | null) {
  return act(async () => {
    await setBookmark(await requireUser(), type, id, true, collectionId);
    return null;
  }, collectionId ? "In Sammlung verschoben." : "Aus Sammlung gelöst.");
}

export async function removeBookmarkAction(type: TargetType, id: string) {
  return act(async () => {
    await setBookmark(await requireUser(), type, id, false);
    return null;
  }, "Nicht mehr gespeichert.");
}
