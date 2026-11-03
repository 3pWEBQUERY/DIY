"use server";

import { revalidatePath } from "next/cache";
import { act } from "@/server/errors";
import { requireUser } from "@/server/auth/session";
import { deletePost, updatePost } from "@/server/social/posts";

export async function savePostAction(
  postId: string,
  input: { body: string; category?: string; visibility?: string; media: { id: string; alt: string }[]; projectId: string | null },
) {
  return act(async () => {
    const u = await requireUser();
    await updatePost(u, postId, input);
    revalidatePath(`/beitrag/${postId}`);
    revalidatePath("/studio/inhalte");
    return null;
  }, "Beitrag gespeichert.");
}

export async function removePostAction(postId: string) {
  return act(async () => {
    const u = await requireUser();
    await deletePost(u, postId);
    revalidatePath("/studio/inhalte");
    return null;
  }, "Beitrag gelöscht.");
}
