"use server";

import { revalidatePath } from "next/cache";
import { act } from "@/server/errors";
import { requireRole } from "@/server/authz";
import { assignCase, decideCase } from "@/server/moderation/service";

export async function assignCaseAction(caseId: string, assign: boolean) {
  return act(async () => {
    const u = await requireRole("PLATFORM_MODERATOR");
    await assignCase(u, caseId, assign);
    revalidatePath("/admin/moderation");
    return null;
  }, assign ? "Fall übernommen." : "Fall freigegeben.");
}

export async function decideCaseAction(caseId: string, input: { action: string; reason: string; publicNote: string; days?: number }) {
  return act(async () => {
    const u = await requireRole("PLATFORM_MODERATOR");
    const r = await decideCase(u, caseId, input);
    revalidatePath("/admin/moderation");
    revalidatePath(`/admin/moderation/${caseId}`);
    return r;
  }, "Entscheidung gespeichert. Beteiligte wurden benachrichtigt.");
}
