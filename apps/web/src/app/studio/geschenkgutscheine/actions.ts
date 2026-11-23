"use server";

import { revalidatePath } from "next/cache";
import { act } from "@/server/errors";
import { requireUser } from "@/server/auth/session";
import * as gc from "@/server/commerce/giftcards";

export async function saveGiftCardSettingsAction(input: Record<string, unknown>) {
  return act(async () => {
    const r = await gc.saveGiftCardSettings(await requireUser(), input);
    revalidatePath("/studio/geschenkgutscheine");
    return r;
  }, "Gespeichert.");
}

export async function refundGiftCardAction(giftCardId: string) {
  return act(async () => {
    const r = await gc.refundGiftCardBySeller(await requireUser(), giftCardId);
    revalidatePath("/studio/geschenkgutscheine");
    return r;
  }, "Gutschein storniert und erstattet.");
}
