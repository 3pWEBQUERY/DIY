"use server";

import { revalidatePath } from "next/cache";
import { act } from "@/server/errors";
import { requireUser } from "@/server/auth/session";
import { setCommentFilter } from "@/server/pro/comment-tools";

export async function saveCommentFilterAction(words: string[]) {
  return act(async () => {
    const r = await setCommentFilter(await requireUser(), { words });
    revalidatePath("/studio/kommentare");
    return r;
  }, "Wortfilter gespeichert.");
}
