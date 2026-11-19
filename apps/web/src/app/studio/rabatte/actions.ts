"use server";

import { revalidatePath } from "next/cache";
import { act } from "@/server/errors";
import { requireUser } from "@/server/auth/session";
import * as promo from "@/server/commerce/promotions";

/** Gutscheine und Sets im Studio. Eigentum am Shop prüft der Dienst. */

export async function saveCouponAction(couponId: string | null, input: unknown) {
  return act(async () => {
    const r = await promo.saveCoupon(await requireUser(), couponId, input);
    revalidatePath("/studio/rabatte");
    return r;
  }, couponId ? "Gutschein gespeichert." : "Gutschein angelegt.");
}

export async function setCouponActiveAction(couponId: string, active: boolean) {
  return act(async () => {
    await promo.setCouponActive(await requireUser(), couponId, active);
    revalidatePath("/studio/rabatte");
    return null;
  }, active ? "Gutschein aktiviert." : "Gutschein deaktiviert.");
}

export async function deleteCouponAction(couponId: string) {
  return act(async () => {
    await promo.deleteCoupon(await requireUser(), couponId);
    revalidatePath("/studio/rabatte");
    return null;
  }, "Gutschein gelöscht.");
}

export async function saveBundleAction(bundleId: string | null, input: unknown) {
  return act(async () => {
    const r = await promo.saveBundle(await requireUser(), bundleId, input);
    revalidatePath("/studio/rabatte");
    revalidatePath("/anleitungen", "layout");
    revalidatePath("/markt", "layout");
    return r;
  }, bundleId ? "Set gespeichert." : "Set angelegt.");
}

export async function deleteBundleAction(bundleId: string) {
  return act(async () => {
    await promo.deleteBundle(await requireUser(), bundleId);
    revalidatePath("/studio/rabatte");
    revalidatePath("/anleitungen", "layout");
    revalidatePath("/markt", "layout");
    return null;
  }, "Set gelöscht.");
}
