"use server";

import { revalidatePath } from "next/cache";
import { act } from "@/server/errors";
import { requireUser } from "@/server/auth/session";
import * as gc from "@/server/commerce/giftcards";

/** Geschenkgutscheine: kaufen, dem Konto hinzufügen, im Warenkorb einlösen. */

export async function buyGiftCardAction(input: Record<string, unknown>) {
  return act(async () => gc.startGiftCardPurchase(await requireUser(), input));
}

export async function claimGiftCardAction(code: string) {
  return act(async () => {
    const r = await gc.claimGiftCard(await requireUser(), code);
    revalidatePath("/geschenkgutscheine");
    return r;
  }, "Gutschein hinzugefügt.");
}

export async function applyGiftCardAction(code: string) {
  return act(async () => {
    const r = await gc.applyGiftCardToCart(await requireUser(), code);
    revalidatePath("/warenkorb");
    revalidatePath("/kasse");
    return r;
  });
}

export async function removeGiftCardAction(shopId: string) {
  return act(async () => {
    const r = await gc.removeGiftCardFromCart(await requireUser(), shopId);
    revalidatePath("/warenkorb");
    revalidatePath("/kasse");
    return r;
  }, "Gutschein entfernt.");
}
