"use server";

import { revalidatePath } from "next/cache";
import { act } from "@/server/errors";
import { requireUser } from "@/server/auth/session";
import * as sales from "@/server/commerce/sales";

/** Shop-Aktionen mit Countdown (Creator Pro). Eigentum und Pro prüft der Dienst. */

function refresh() {
  revalidatePath("/studio/aktionen");
  revalidatePath("/markt", "layout");
}

export async function saveSaleAction(saleId: string | null, input: unknown) {
  return act(async () => {
    const r = await sales.saveSale(await requireUser(), saleId, input);
    refresh();
    return r;
  }, saleId ? "Aktion gespeichert." : "Aktion angelegt.");
}

export async function endSaleAction(saleId: string) {
  return act(async () => {
    const r = await sales.endSale(await requireUser(), saleId);
    refresh();
    return r;
  }, "Aktion beendet.");
}

export async function deleteSaleAction(saleId: string) {
  return act(async () => {
    await sales.deleteSale(await requireUser(), saleId);
    refresh();
    return null;
  }, "Aktion gelöscht.");
}
