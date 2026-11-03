"use server";

import { revalidatePath } from "next/cache";
import { act } from "@/server/errors";
import { requireRole } from "@/server/authz";
import { decideAppeal } from "@/server/moderation/service";

export async function decideAppealAction(appealId: string, input: { choice?: string; reason: string }) {
  return act(async () => {
    const u = await requireRole("PLATFORM_MODERATOR");
    const decision = input.choice === "OVERTURNED" ? "OVERTURNED" : "UPHELD";
    await decideAppeal(u, appealId, { decision, note: input.reason });
    revalidatePath("/admin/einsprueche");
    revalidatePath("/admin/moderation");
    return { decision };
  }, "Einspruch entschieden. Die Person wurde benachrichtigt.");
}
