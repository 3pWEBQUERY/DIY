"use server";

import { revalidatePath } from "next/cache";
import { act } from "@/server/errors";
import { requireUser } from "@/server/auth/session";
import { rateLimit } from "@/server/ratelimit";
import { submitAppeal } from "@/server/moderation/service";

export async function submitAppealAction(caseId: string, input: { statement: string }) {
  return act(async () => {
    // Auch zeitweise gesperrte Konten müssen Einspruch erheben können (§24.1 Nr. 7)
    const u = await requireUser({ allowSuspended: true });
    await rateLimit(`appeal:${u.id}`, 10, 86_400);
    await submitAppeal(u, caseId, input);
    revalidatePath(`/einspruch/${caseId}`);
    return null;
  }, "Dein Einspruch ist eingegangen. Wir melden uns, sobald er geprüft wurde.");
}
