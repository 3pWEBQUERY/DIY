"use server";

import { revalidatePath } from "next/cache";
import { act } from "@/server/errors";
import { requireUser } from "@/server/auth/session";
import * as cart from "@/server/commerce/cart";
import * as checkout from "@/server/commerce/checkout";
import * as restock from "@/server/commerce/restock";

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

/** Nachproduktion eines ausverkauften Produkts anfragen bzw. zurückziehen. */
export async function requestRestockAction(productId: string, note: string, path: string) {
  return act(async () => {
    const r = await restock.requestRestock(await requireUser(), productId, { note });
    revalidatePath(path);
    return r;
  });
}

export async function cancelRestockAction(productId: string, path: string) {
  return act(async () => {
    const r = await restock.cancelRestock(await requireUser(), productId);
    revalidatePath(path);
    return r;
  });
}
