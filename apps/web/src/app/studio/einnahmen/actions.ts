"use server";

import { revalidatePath } from "next/cache";
import { act } from "@/server/errors";
import { requireUser } from "@/server/auth/session";
import * as payouts from "@/server/commerce/payouts";

/** Auszahlungen über Werkuno: beantragen, Plan ändern, Bankkonto ändern (Stripe-Formular). */

export async function requestPayoutAction(input: { amountMinor?: number; switchToManual?: boolean }) {
  return act(async () => {
    const r = await payouts.requestPayout(await requireUser(), input);
    revalidatePath("/studio/einnahmen");
    return r;
  });
}

export async function setPayoutScheduleAction(input: { interval: string; weeklyAnchor?: string | null; monthlyAnchor?: number | null }) {
  return act(async () => {
    const r = await payouts.setPayoutSchedule(await requireUser(), input);
    revalidatePath("/studio/einnahmen");
    return r;
  }, "Auszahlungsplan gespeichert.");
}

export async function bankUpdateLinkAction() {
  return act(async () => ({ url: await payouts.bankUpdateLink(await requireUser()) }));
}
