"use server";

import { revalidatePath } from "next/cache";
import { act } from "@/server/errors";
import { requireRole } from "@/server/authz";
import { refundOrderByAdmin } from "@/server/commerce/orders";

/** Nur ADMIN (§24.3): Bestellung durch die Plattform stornieren bzw. erstatten. */
export async function refundOrderAdminAction(orderId: string, input: { reason: string }) {
  return act(async () => {
    const u = await requireRole("ADMIN");
    const r = await refundOrderByAdmin(u, orderId, input.reason);
    revalidatePath("/admin/transaktionen");
    return r;
  }, "Erstattung ausgelöst.");
}
