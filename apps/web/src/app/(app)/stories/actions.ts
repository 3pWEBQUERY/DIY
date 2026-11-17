"use server";

import { revalidatePath } from "next/cache";
import { act } from "@/server/errors";
import { currentUser, requireUser } from "@/server/auth/session";
import * as stories from "@/server/stories/service";
import * as highlights from "@/server/stories/highlights";

/** Server Actions für Stories und Highlights. Alle Berechtigungen prüft der Dienst. */

export async function createStoryAction(input: unknown) {
  return act(async () => {
    const s = await stories.createStory(await requireUser(), input);
    revalidatePath("/feed");
    return s;
  }, "Deine Story ist online – 24 Stunden lang.");
}

export async function storyTrayAction() {
  return stories.storyTray(await currentUser());
}

/** Nächste Person im Betrachter nachladen. */
export async function storyGroupAction(handle: string) {
  return act(async () => stories.storyGroup((await currentUser())?.id ?? null, handle));
}

export async function markStorySeenAction(storyId: string) {
  return act(async () => stories.markStorySeen(await requireUser(), storyId));
}

export async function storyLikeAction(storyId: string, liked: boolean) {
  return act(async () => stories.setStoryLike(await requireUser(), storyId, liked));
}

export async function storyReplyAction(storyId: string, body: string) {
  return act(async () => stories.replyToStory(await requireUser(), storyId, { body }), "Antwort gesendet.");
}

export async function storyViewersAction(storyId: string) {
  return act(async () => stories.storyViewers(await requireUser(), storyId));
}

export async function deleteStoryAction(storyId: string) {
  return act(async () => {
    await stories.deleteStory(await requireUser(), storyId);
    revalidatePath("/feed");
    return null;
  }, "Story gelöscht.");
}

export async function storyMuteAction(userId: string, muted: boolean) {
  return act(async () => stories.setStoryMute(await requireUser(), userId, muted), muted ? "Du siehst die Stories dieser Person nicht mehr." : "Stories werden wieder angezeigt.");
}

export async function storyArchiveAction(cursor: string | null) {
  return act(async () => stories.storyArchive(await requireUser(), cursor));
}

// ── Highlights ──

export async function myHighlightsAction(storyId?: string | null) {
  return act(async () => highlights.myHighlights(await requireUser(), storyId));
}

export async function addToHighlightAction(input: { storyId: string; highlightId?: string | null; title?: string | null }) {
  return act(async () => {
    const u = await requireUser();
    const r = await highlights.addToHighlight(u, input);
    revalidatePath(`/u/${u.profile.handle}`);
    return r;
  }, "Zum Highlight hinzugefügt.");
}

export async function removeFromHighlightAction(highlightId: string, storyId: string) {
  return act(async () => {
    const u = await requireUser();
    const r = await highlights.removeFromHighlight(u, highlightId, storyId);
    revalidatePath(`/u/${u.profile.handle}`);
    return r;
  }, "Aus dem Highlight entfernt.");
}

export async function createHighlightAction(input: unknown) {
  return act(async () => {
    const u = await requireUser();
    const r = await highlights.createHighlight(u, input);
    revalidatePath(`/u/${u.profile.handle}`);
    return r;
  }, "Highlight angelegt.");
}

export async function updateHighlightAction(highlightId: string, input: unknown) {
  return act(async () => {
    const u = await requireUser();
    await highlights.updateHighlight(u, highlightId, input);
    revalidatePath(`/u/${u.profile.handle}`);
    return null;
  }, "Highlight gespeichert.");
}

export async function deleteHighlightAction(highlightId: string) {
  return act(async () => {
    const u = await requireUser();
    await highlights.deleteHighlight(u, highlightId);
    revalidatePath(`/u/${u.profile.handle}`);
    return null;
  }, "Highlight gelöscht.");
}
