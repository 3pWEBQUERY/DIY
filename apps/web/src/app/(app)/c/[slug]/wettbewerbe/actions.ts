"use server";

import { revalidatePath } from "next/cache";
import { act } from "@/server/errors";
import { requireUser } from "@/server/auth/session";
import * as comp from "@/server/communities/competitions";

/** Wettbewerbe: einreichen, zurückziehen, abstimmen, Moderation/Jury. */

const path = (slug: string, id: string) => `/c/${slug}/wettbewerbe/${id}`;

export async function submitEntryAction(slug: string, challengeId: string, input: { projectId: string; note: string }) {
  return act(async () => {
    const r = await comp.submitEntry(await requireUser(), challengeId, input);
    revalidatePath(path(slug, challengeId));
    return r;
  }, "Eingereicht – viel Glück!");
}

export async function withdrawEntryAction(slug: string, challengeId: string) {
  return act(async () => {
    const r = await comp.withdrawEntry(await requireUser(), challengeId);
    revalidatePath(path(slug, challengeId));
    return r;
  }, "Einreichung zurückgezogen.");
}

export async function voteEntryAction(entryId: string, on: boolean) {
  return act(async () => comp.voteEntry(await requireUser(), entryId, on));
}

export async function removeEntryAction(slug: string, challengeId: string, entryId: string) {
  return act(async () => {
    const r = await comp.removeEntry(await requireUser(), entryId);
    revalidatePath(path(slug, challengeId));
    return r;
  }, "Einreichung entfernt.");
}

export async function publishJuryResultAction(slug: string, challengeId: string, places: { entryId: string; place: number }[]) {
  return act(async () => {
    const r = await comp.publishJuryResult(await requireUser(), challengeId, places);
    revalidatePath(path(slug, challengeId));
    return r;
  }, "Ergebnis veröffentlicht.");
}
