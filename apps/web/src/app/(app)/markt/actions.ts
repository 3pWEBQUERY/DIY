"use server";

import { revalidatePath } from "next/cache";
import { act } from "@/server/errors";
import { requireUser } from "@/server/auth/session";
import * as cart from "@/server/commerce/cart";
import * as checkout from "@/server/commerce/checkout";
import * as restock from "@/server/commerce/restock";
import * as promo from "@/server/commerce/promotions";

/** Warenkorb & Kasse. Berechtigungen, Preise und Bestand werden ausschliesslich serverseitig geprüft. */

export async function addToCartAction(input: { productId: string; variantId?: string; quantity: number }) {
  return act(async () => {
    const r = await cart.addToCart(await requireUser(), input);
    revalidatePath("/warenkorb");
    return r;
  });
}

export async function updateCartItemAction(itemId: string, quantity: number) {
  return act(async () => {
    const r = await cart.updateCartItem(await requireUser(), { itemId, quantity });
    revalidatePath("/warenkorb");
    return r;
  });
}

export async function removeCartItemAction(itemId: string) {
  return act(async () => {
    await cart.removeCartItem(await requireUser(), itemId);
    revalidatePath("/warenkorb");
    return null;
  }, "Aus dem Warenkorb entfernt.");
}

export async function applyCouponAction(shopId: string, code: string) {
  return act(async () => {
    const r = await promo.applyCoupon(await requireUser(), { shopId, code });
    revalidatePath("/warenkorb");
    return r;
  });
}

export async function removeCouponAction(shopId: string) {
  return act(async () => {
    await promo.removeCoupon(await requireUser(), shopId);
    revalidatePath("/warenkorb");
    return null;
  }, "Gutschein entfernt.");
}

export async function addBundleToCartAction(bundleId: string) {
  return act(async () => {
    const r = await promo.addBundleToCart(await requireUser(), bundleId);
    revalidatePath("/warenkorb");
    return r;
  });
}

export async function startCheckoutAction(input: unknown) {
  return act(async () => checkout.startCheckout(await requireUser(), input));
}

export async function resumePaymentAction(orderId: string) {
  return act(async () => ({ url: await checkout.resumePayment(await requireUser(), orderId) }));
}

export async function abandonOrderAction(orderId: string) {
  return act(async () => {
    await checkout.abandonPendingOrder(await requireUser(), orderId);
    revalidatePath("/bestellungen");
    return null;
  }, "Bestellung verworfen. Die Artikel liegen weiterhin in deinem Warenkorb.");
}

export async function simulatePaymentAction(orderId: string, outcome: "success" | "failure") {
  return act(async () => {
    const r = await checkout.simulatePayment(await requireUser(), orderId, outcome);
    revalidatePath("/bestellungen");
    revalidatePath("/warenkorb");
    return r;
  });
}

/** Nur eigene Produktseiten neu validieren – `path` kommt vom Client und ist nicht vertrauenswürdig. */
function revalidateProductPath(path: unknown) {
  if (typeof path === "string" && path.length <= 300 && /^\/markt\/[\w\-./%~]+$/.test(path) && !path.includes("..")) revalidatePath(path);
}

/** Nachproduktion eines ausverkauften Produkts anfragen bzw. zurückziehen. */
export async function requestRestockAction(productId: string, note: string, path: string) {
  return act(async () => {
    const r = await restock.requestRestock(await requireUser(), productId, { note });
    revalidateProductPath(path);
    return r;
  });
}

export async function cancelRestockAction(productId: string, path: string) {
  return act(async () => {
    const r = await restock.cancelRestock(await requireUser(), productId);
    revalidateProductPath(path);
    return r;
  });
}
