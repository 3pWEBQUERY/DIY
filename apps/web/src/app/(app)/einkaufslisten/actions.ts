"use server";

import { revalidatePath } from "next/cache";
import { act } from "@/server/errors";
import { requireUser } from "@/server/auth/session";
import * as lists from "@/server/materials/service";

/** Server Actions für Einkaufslisten (PRD §17). Listen sind privat; Prüfung im Service. */

export async function myShoppingListsAction() {
  return act(async () => lists.listMyShoppingLists((await requireUser()).id));
}

export async function createShoppingListAction(input: { title: string }) {
  return act(async () => {
    const r = await lists.createShoppingList(await requireUser(), input);
    revalidatePath("/einkaufslisten");
    return r;
  }, "Liste angelegt.");
}

export async function renameShoppingListAction(id: string, input: { title: string }) {
  return act(async () => {
    await lists.renameShoppingList(await requireUser(), id, input);
    return null;
  }, "Umbenannt.");
}

export async function deleteShoppingListAction(id: string) {
  return act(async () => {
    await lists.deleteShoppingList(await requireUser(), id);
    revalidatePath("/einkaufslisten");
    return null;
  }, "Liste gelöscht.");
}

export async function addShoppingListItemAction(listId: string, input: { name: string; quantity?: string; materialId?: string }) {
  return act(async () => lists.addShoppingListItem(await requireUser(), listId, input));
}

export async function updateShoppingListItemAction(itemId: string, input: { quantity?: string; haveIt?: boolean; purchased?: boolean }) {
  return act(async () => {
    await lists.updateShoppingListItem(await requireUser(), itemId, input);
    return null;
  });
}

export async function removeShoppingListItemAction(itemId: string) {
  return act(async () => {
    await lists.removeShoppingListItem(await requireUser(), itemId);
    return null;
  });
}

export async function clearDoneItemsAction(listId: string) {
  return act(async () => lists.clearDoneItems(await requireUser(), listId), "Erledigte Positionen entfernt.");
}

export async function mergeShoppingListsAction(targetId: string, sourceId: string) {
  return act(async () => {
    const r = await lists.mergeShoppingLists(await requireUser(), targetId, sourceId);
    revalidatePath("/einkaufslisten");
    return r;
  }, "Listen zusammengeführt.");
}

export async function setShoppingListSharedAction(listId: string, shared: boolean) {
  return act(async () => lists.setShoppingListShared(await requireUser(), listId, shared), shared ? "Freigabelink erstellt." : "Freigabe beendet.");
}

export async function addSourceToShoppingListAction(input: { kind: "PROJECT" | "TUTORIAL"; id: string; listId?: string | null; newTitle?: string | null }) {
  return act(async () => {
    const r = await lists.addSourceToShoppingList(await requireUser(), input);
    revalidatePath("/einkaufslisten");
    return r;
  });
}
