"use server";

import { revalidatePath } from "next/cache";
import type { OrderStatus } from "@werkraum/shared";
import { act } from "@/server/errors";
import { requireUser } from "@/server/auth/session";
import * as orders from "@/server/commerce/orders";

function refresh(orderId: string) {
  revalidatePath(`/studio/bestellungen/${orderId}`);
  revalidatePath("/studio/bestellungen");
}

export async function transitionOrderAction(orderId: string, to: OrderStatus, note: string) {
  return act(async () => {
    await orders.transitionOrder(await requireUser(), orderId, to, note);
    refresh(orderId);
    return null;
  }, "Status aktualisiert. Die Käuferin bzw. der Käufer wurde informiert.");
}

export async function addShipmentAction(orderId: string, input: { carrier: string; trackingNo: string; trackingUrl: string; note: string }) {
  return act(async () => {
    await orders.addShipment(await requireUser(), orderId, input);
    refresh(orderId);
    return null;
  }, "Als versendet markiert.");
}

export async function refundOrderAction(orderId: string, input: { amountMinor: number; reason: string }) {
  return act(async () => {
    await orders.refundOrder(await requireUser(), orderId, input);
    refresh(orderId);
    return null;
  }, "Erstattung ausgelöst. Sie erscheint als bestätigt, sobald der Zahlungsanbieter sie verbucht hat.");
}

export async function cancelOrderAction(orderId: string, reason: string) {
  return act(async () => {
    const r = await orders.cancelBySeller(await requireUser(), orderId, reason);
    refresh(orderId);
    return r;
  }, "Bestellung storniert. Der Betrag wird erstattet.");
}
