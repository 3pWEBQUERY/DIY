"use server";

import { revalidatePath } from "next/cache";
import { act } from "@/server/errors";
import { requireRole } from "@/server/authz";
import { setContentHidden, setFeatured, type ContentKind } from "@/server/admin/content";

const refresh = () => {
  revalidatePath("/admin/inhalte");
  revalidatePath("/admin/communities");
};

export async function setFeaturedAction(kind: ContentKind, id: string, featured: boolean) {
  return act(async () => {
    const u = await requireRole("PLATFORM_MODERATOR");
    await setFeatured(u, kind, id, featured);
    refresh();
    return null;
  }, featured ? "Hervorgehoben." : "Hervorhebung entfernt.");
}

export async function setHiddenAction(kind: ContentKind, id: string, hidden: boolean, input: { reason: string }) {
  return act(async () => {
    const u = await requireRole("PLATFORM_MODERATOR");
    await setContentHidden(u, kind, id, hidden, input.reason);
    refresh();
    return null;
  }, hidden ? "Ausgeblendet. Die Person wurde informiert." : "Wieder sichtbar.");
}
