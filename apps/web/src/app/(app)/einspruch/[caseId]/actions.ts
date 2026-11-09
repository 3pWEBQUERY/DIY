"use server";

import { revalidatePath } from "next/cache";
import { act } from "@/server/errors";
import { getSession, requireUser } from "@/server/auth/session";
import { resolveAppealUser } from "@/server/moderation/appeal-access";
import { fail } from "@/server/errors";
import { rateLimit } from "@/server/ratelimit";
import { submitAppeal } from "@/server/moderation/service";

export async function submitAppealAction(caseId: string, input: { statement: string }, token?: string) {
  return act(async () => {
    // Auch gesperrte Konten müssen Einspruch erheben können (§24.1 Nr. 7, DSA Art. 20): zeitweise gesperrte
    // über ihre Sitzung, dauerhaft gesperrte (keine Anmeldung möglich) über den signierten Link aus der Mail
    const viaToken = !(await getSession()) && token ? await resolveAppealUser(caseId, token) : null;
    if (token && !viaToken && !(await getSession())) throw fail.forbidden("Dieser Link ist ungültig. Bitte nutze den Link aus der E-Mail.");
    const u = viaToken ? { id: viaToken } : await requireUser({ allowSuspended: true });
    await rateLimit(`appeal:${u.id}`, 10, 86_400);
    await submitAppeal(u, caseId, input);
    revalidatePath(`/einspruch/${caseId}`);
    return null;
  }, "Dein Einspruch ist eingegangen. Wir melden uns, sobald er geprüft wurde.");
}
