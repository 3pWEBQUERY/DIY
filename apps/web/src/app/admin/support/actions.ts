"use server";

import { revalidatePath } from "next/cache";
import { act } from "@/server/errors";
import { requireRole } from "@/server/authz";
import { setTicketStatus } from "@/server/admin/catalog";

export async function setTicketStatusAction(id: string, status: string) {
  return act(async () => {
    const u = await requireRole("PLATFORM_MODERATOR");
    await setTicketStatus(u, id, status);
    revalidatePath("/admin/support");
    return null;
  }, "Status aktualisiert.");
}
