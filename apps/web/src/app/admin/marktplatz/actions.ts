"use server";

import { revalidatePath } from "next/cache";
import { act } from "@/server/errors";
import { requireRole } from "@/server/authz";
import { decideShop, type ShopDecision } from "@/server/admin/content";

export async function decideShopAction(shopId: string, decision: ShopDecision, input: { reason: string }) {
  return act(async () => {
    const u = await requireRole("PLATFORM_MODERATOR");
    await decideShop(u, shopId, decision, input.reason);
    revalidatePath("/admin/marktplatz");
    return null;
  }, "Shopstatus aktualisiert.");
}
