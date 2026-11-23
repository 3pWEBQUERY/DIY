"use server";

import { revalidatePath } from "next/cache";
import { act } from "@/server/errors";
import { requireUser } from "@/server/auth/session";
import * as nl from "@/server/pro/newsletter";

/** Creator Pro: Newsletter an Follower:innen. Eigentum und Pro-Status prüft der Dienst. */

export async function saveNewsletterAction(id: string | null, input: unknown) {
  return act(async () => {
    const r = await nl.saveNewsletter(await requireUser(), id, input);
    revalidatePath("/studio/newsletter");
    return r;
  }, "Entwurf gespeichert.");
}

export async function previewNewsletterAction(input: unknown) {
  return act(async () => nl.sendNewsletterPreview(await requireUser(), input));
}

export async function scheduleNewsletterAction(id: string, input: { at?: string | null }) {
  return act(async () => {
    const r = await nl.scheduleNewsletter(await requireUser(), id, input);
    revalidatePath("/studio/newsletter");
    return r;
  });
}

export async function unscheduleNewsletterAction(id: string) {
  return act(async () => {
    await nl.unscheduleNewsletter(await requireUser(), id);
    revalidatePath("/studio/newsletter");
    return null;
  }, "Versand zurückgezogen – der Newsletter ist wieder ein Entwurf.");
}

export async function deleteNewsletterAction(id: string) {
  return act(async () => {
    await nl.deleteNewsletter(await requireUser(), id);
    revalidatePath("/studio/newsletter");
    return null;
  }, "Newsletter gelöscht.");
}

/** Profil: Newsletter einer Creatorin abonnieren bzw. abbestellen */
export async function setNewsletterSubscriptionAction(creatorId: string, subscribed: boolean) {
  return act(async () => nl.setNewsletterSubscribed(await requireUser(), creatorId, subscribed), subscribed ? "Newsletter abonniert." : "Newsletter abbestellt.");
}
