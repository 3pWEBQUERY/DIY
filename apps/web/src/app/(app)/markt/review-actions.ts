"use server";

import { revalidatePath } from "next/cache";
import { act } from "@/server/errors";
import { requireUser } from "@/server/auth/session";
import { replyToReview } from "@/server/commerce/reviews";

export async function replyToReviewAction(reviewId: string, reply: string, path: string) {
  return act(async () => {
    const r = await replyToReview(await requireUser(), reviewId, reply);
    if (path.startsWith("/markt/")) revalidatePath(path);
    return r;
  }, "Antwort gespeichert.");
}
