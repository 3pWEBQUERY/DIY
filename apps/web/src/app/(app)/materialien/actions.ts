"use server";

import { revalidatePath } from "next/cache";
import { act } from "@/server/errors";
import { requireUser } from "@/server/auth/session";
import * as stock from "@/server/materials/stock";

/** Server Actions für den eigenen Materialbestand („Habe ich schon“). */

export async function toggleStockAction(materialId: string, have: boolean) {
  return act(async () => {
    const r = await stock.toggleStockMaterial((await requireUser()).id, materialId, have);
    revalidatePath("/materialien/bestand");
    return r;
  });
}

export async function addStockAction(input: { materialId?: string | null; name?: string; quantity?: string; note?: string }) {
  return act(async () => {
    const r = await stock.addStock((await requireUser()).id, input);
    revalidatePath("/materialien/bestand");
    return r;
  }, "Im Bestand gespeichert.");
}

export async function updateStockAction(id: string, input: { quantity?: string; note?: string }) {
  return act(async () => {
    await stock.updateStock((await requireUser()).id, id, input);
    return null;
  });
}

export async function removeStockAction(id: string) {
  return act(async () => {
    await stock.removeStock((await requireUser()).id, id);
    revalidatePath("/materialien/bestand");
    return null;
  });
}
