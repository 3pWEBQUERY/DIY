"use server";

import { revalidatePath } from "next/cache";
import { act } from "@/server/errors";
import { requireUser, currentUser } from "@/server/auth/session";
import * as tutorials from "@/server/tutorials/service";

/** Server Actions für Anleitungen (PRD §11). */

export async function saveTutorialAction(id: string | null, input: unknown, publish: boolean) {
  return act(async () => {
    const r = await tutorials.saveTutorial(await requireUser(), id, input, { publish });
    revalidatePath("/studio/anleitungen");
    if (publish) {
      revalidatePath(r.href);
      revalidatePath("/anleitungen");
    }
    return r;
  }, publish ? "Neue Version veröffentlicht." : "Entwurf gespeichert.");
}

export async function setTutorialPublishedAction(id: string, published: boolean) {
  return act(async () => {
    const r = await tutorials.setTutorialPublished(await requireUser(), id, published);
    revalidatePath("/studio/anleitungen");
    return r;
  }, published ? "Wieder veröffentlicht." : "Zurückgezogen – nur noch für dich sichtbar.");
}

export async function deleteTutorialAction(id: string) {
  return act(async () => {
    await tutorials.deleteTutorial(await requireUser(), id);
    revalidatePath("/studio/anleitungen");
    return null;
  }, "Anleitung gelöscht.");
}

export async function toggleTutorialStepAction(id: string, stableKey: string, done: boolean) {
  return act(async () => tutorials.toggleTutorialStep(await requireUser(), id, stableKey, done));
}

export async function completeTutorialAction(id: string) {
  return act(async () => tutorials.completeTutorial(await requireUser(), id), "Glückwunsch – als nachgebaut markiert.");
}

export async function resetTutorialProgressAction(id: string) {
  return act(async () => tutorials.resetTutorialProgress(await requireUser(), id), "Fortschritt zurückgesetzt.");
}

export async function markTutorialVersionSeenAction(id: string) {
  return act(async () => tutorials.markTutorialVersionSeen(await requireUser(), id));
}

export async function loadTutorialsAction(filters: tutorials.TutorialFilters, cursor: string | null) {
  const u = await currentUser();
  return tutorials.listTutorials(filters, u?.id ?? null, { cursor });
}
