"use server";

import { revalidatePath } from "next/cache";
import { act } from "@/server/errors";
import { requireUser } from "@/server/auth/session";
import * as orders from "@/server/commerce/orders";
import { createReview } from "@/server/commerce/reviews";

/** Käuferaktionen zu einer Bestellung. */

export async function reportProblemAction(orderId: string, note: string) {
  return act(async () => {
    await orders.reportProblem(await requireUser(), orderId, { note });
    revalidatePath(`/bestellungen/${orderId}`);
    return null;
  }, "Danke. Der Shop wurde informiert – ihr findet gemeinsam eine Lösung.");
}

export async function confirmReceiptAction(orderId: string) {
  return act(async () => {
    await orders.confirmReceipt(await requireUser(), orderId);
    revalidatePath(`/bestellungen/${orderId}`);
    return null;
  }, "Erhalt bestätigt. Danke!");
}

export async function createReviewAction(orderId: string, input: { orderItemId: string; productRating: number; sellerRating?: number; body: string }) {
  return act(async () => {
    await createReview(await requireUser(), input);
    revalidatePath(`/bestellungen/${orderId}`);
    return null;
  }, "Danke für deine Bewertung.");
}
