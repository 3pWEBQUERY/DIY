"use server";

import { revalidatePath } from "next/cache";
import { act } from "@/server/errors";
import { requireRole } from "@/server/authz";
import { setContentHidden, setFeatured } from "@/server/admin/content";
import {
  removeCommunity,
  removeCommunityMember,
  restoreCommunity,
  setCommunityMemberRole,
  transferCommunityOwnership,
  unbanCommunityMember,
  updateCommunityMeta,
} from "@/server/admin/communities";

type ReasonInput = { reason: string; publicNote?: string; days?: number | null; choice?: string };

const refresh = (id: string) => {
  revalidatePath("/admin/communities");
  revalidatePath(`/admin/communities/${id}`);
};

export async function setCommunityFeaturedAction(id: string, featured: boolean) {
  return act(async () => {
    const u = await requireRole("PLATFORM_MODERATOR");
    await setFeatured(u, "COMMUNITY", id, featured);
    refresh(id);
    return null;
  }, featured ? "Community hervorgehoben." : "Hervorhebung entfernt.");
}

export async function setCommunityHiddenAction(id: string, hidden: boolean, input: ReasonInput) {
  return act(async () => {
    const u = await requireRole("PLATFORM_MODERATOR");
    await setContentHidden(u, "COMMUNITY", id, hidden, input.reason);
    refresh(id);
    return null;
  }, hidden ? "Community ausgeblendet. Die Leitung wurde informiert." : "Community wieder sichtbar.");
}

export async function updateCommunityMetaAction(id: string, input: Record<string, unknown>) {
  return act(async () => {
    const u = await requireRole("PLATFORM_MODERATOR");
    const r = await updateCommunityMeta(u, id, input);
    refresh(id);
    return r;
  }, "Angaben gespeichert.");
}

export async function removeCommunityAction(id: string, input: ReasonInput) {
  return act(async () => {
    const u = await requireRole("ADMIN");
    await removeCommunity(u, id, { reason: input.reason, publicNote: input.publicNote });
    refresh(id);
    return null;
  }, "Community archiviert. Die Leitung wurde informiert.");
}

export async function restoreCommunityAction(id: string, input: ReasonInput) {
  return act(async () => {
    const u = await requireRole("ADMIN");
    await restoreCommunity(u, id, { reason: input.reason, choice: input.choice });
    refresh(id);
    return null;
  }, "Community wiederhergestellt.");
}

export async function transferOwnershipAction(id: string, input: ReasonInput) {
  return act(async () => {
    const u = await requireRole("ADMIN");
    await transferCommunityOwnership(u, id, input.choice ?? "", input.reason);
    refresh(id);
    return null;
  }, "Leitung übertragen.");
}

export async function setMemberRoleAction(id: string, userId: string, input: ReasonInput) {
  return act(async () => {
    const u = await requireRole("ADMIN");
    await setCommunityMemberRole(u, id, userId, input.choice ?? "", input.reason);
    refresh(id);
    return null;
  }, "Rolle aktualisiert.");
}

export async function removeMemberAction(id: string, userId: string, input: ReasonInput) {
  return act(async () => {
    const u = await requireRole("PLATFORM_MODERATOR");
    await removeCommunityMember(u, id, userId, { reason: input.reason });
    refresh(id);
    return null;
  }, "Mitgliedschaft entfernt.");
}

export async function banMemberAction(id: string, userId: string, input: ReasonInput) {
  return act(async () => {
    const u = await requireRole("PLATFORM_MODERATOR");
    await removeCommunityMember(u, id, userId, { reason: input.reason, publicNote: input.publicNote, ban: true });
    refresh(id);
    return null;
  }, "Mitglied gesperrt. Die Person wurde informiert.");
}

export async function unbanMemberAction(id: string, userId: string, input: ReasonInput) {
  return act(async () => {
    const u = await requireRole("PLATFORM_MODERATOR");
    await unbanCommunityMember(u, id, userId, input.reason);
    refresh(id);
    return null;
  }, "Sperre aufgehoben.");
}
