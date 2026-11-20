"use server";

import { revalidatePath } from "next/cache";
import { act } from "@/server/errors";
import { requireUser } from "@/server/auth/session";
import * as support from "@/server/supporters/service";

/** Unterstützer-Abo: abschliessen (Web/Stripe), kündigen bzw. Kündigung zurücknehmen. */

export async function startSupportAction(creatorId: string) {
  return act(async () => ({ url: await support.startSupportCheckout(await requireUser(), creatorId) }));
}

export async function setSupportCancelAction(creatorId: string, cancel: boolean) {
  return act(async () => {
    const r = await support.setSupportCancel(await requireUser(), creatorId, cancel);
    revalidatePath("/einstellungen/unterstuetzungen");
    return r;
  }, cancel ? "Gekündigt – deine Unterstützung läuft bis zum Ende des bezahlten Monats." : "Kündigung zurückgenommen.");
}
