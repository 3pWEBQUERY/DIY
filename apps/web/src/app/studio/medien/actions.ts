"use server";

import { revalidatePath } from "next/cache";
import { act } from "@/server/errors";
import { requireUser } from "@/server/auth/session";
import { deleteUnusedMedia, updateMediaAlt } from "@/server/analytics/studio";

export async function updateAltAction(mediaId: string, alt: string) {
  return act(async () => {
    const u = await requireUser();
    await updateMediaAlt(u.id, mediaId, alt);
    revalidatePath("/studio/medien");
    return null;
  }, "Alt-Text gespeichert.");
}

export async function deleteMediaAction(mediaId: string) {
  return act(async () => {
    const u = await requireUser();
    await deleteUnusedMedia(u.id, mediaId);
    revalidatePath("/studio/medien");
    return null;
  }, "Medium gelöscht.");
}
