"use server";

import { revalidatePath } from "next/cache";
import { act } from "@/server/errors";
import { requireUser } from "@/server/auth/session";
import * as events from "@/server/communities/events";

export async function createEventAction(communityId: string, slug: string, input: unknown) {
  return act(async () => {
    const r = await events.createEvent(await requireUser(), communityId, input);
    revalidatePath(`/c/${slug}`);
    return { href: `/c/${slug}/events/${r.id}` };
  }, "Event veröffentlicht.");
}

export async function updateEventAction(eventId: string, slug: string, input: unknown) {
  return act(async () => {
    await events.updateEvent(await requireUser(), eventId, input);
    revalidatePath(`/c/${slug}/events/${eventId}`);
    return { href: `/c/${slug}/events/${eventId}` };
  }, "Änderungen gespeichert. Teilnehmende werden bei neuer Zeit oder neuem Ort benachrichtigt.");
}

export async function cancelEventAction(eventId: string, slug: string, reason: string) {
  return act(async () => {
    await events.cancelEvent(await requireUser(), eventId, reason);
    revalidatePath(`/c/${slug}/events/${eventId}`);
    return null;
  }, "Event abgesagt. Alle Teilnehmenden wurden benachrichtigt.");
}

export async function setAttendanceAction(eventId: string, status: "GOING" | "INTERESTED" | null) {
  return act(async () => {
    await events.setAttendance(await requireUser(), eventId, status);
    return null;
  }, status === "GOING" ? "Du bist dabei." : status === "INTERESTED" ? "Als interessiert markiert." : "Abgesagt.");
}
