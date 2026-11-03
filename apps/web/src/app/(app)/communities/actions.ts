"use server";

import { revalidatePath } from "next/cache";
import type { CommunityRoleKind } from "@/generated/prisma/enums";
import { act, fail } from "@/server/errors";
import { currentUser, requireUser } from "@/server/auth/session";
import * as cs from "@/server/communities/service";

/** Server Actions für Communities (§15). Rechte prüft der Service in jeder Funktion. */

const refresh = () => {
  revalidatePath("/c/[slug]", "page");
  revalidatePath("/c/[slug]/verwalten", "page");
  revalidatePath("/communities");
};

export async function createCommunityAction(input: unknown) {
  return act(async () => {
    const r = await cs.createCommunity(await requireUser(), input);
    revalidatePath("/communities");
    return r;
  }, "Community erstellt.");
}

export async function updateCommunityAction(id: string, input: unknown) {
  return act(async () => {
    const r = await cs.updateCommunity(id, input);
    refresh();
    return r;
  }, "Einstellungen gespeichert.");
}

export async function setRulesAction(id: string, rules: unknown) {
  return act(async () => {
    await cs.setRules(id, rules);
    refresh();
    return null;
  }, "Regeln gespeichert.");
}

export async function joinCommunityAction(id: string) {
  return act(async () => {
    const r = await cs.joinCommunity(await requireUser(), id);
    refresh();
    return r;
  });
}

export async function leaveCommunityAction(id: string) {
  return act(async () => {
    const r = await cs.leaveCommunity(await requireUser(), id);
    refresh();
    return r;
  });
}

export async function decideRequestAction(id: string, userId: string, approve: boolean) {
  return act(async () => {
    await cs.decideRequest(id, userId, approve);
    refresh();
    return null;
  }, approve ? "Beitritt freigegeben." : "Anfrage abgelehnt.");
}

export async function inviteMemberAction(id: string, handle: string) {
  return act(async () => {
    const r = await cs.inviteMember(id, handle);
    refresh();
    return r;
  });
}

export async function revokeInviteAction(id: string, userId: string) {
  return act(async () => {
    await cs.revokeInvite(id, userId);
    refresh();
    return null;
  }, "Einladung zurückgezogen.");
}

const ROLES: CommunityRoleKind[] = ["ADMIN", "MODERATOR", "MEMBER"];

export async function setMemberRoleAction(id: string, userId: string, role: string) {
  return act(async () => {
    if (!ROLES.includes(role as CommunityRoleKind)) throw fail.invalid("Unbekannte Rolle.");
    await cs.setMemberRole(id, userId, role as CommunityRoleKind);
    refresh();
    return null;
  }, "Rolle geändert.");
}

export async function transferOwnershipAction(id: string, userId: string) {
  return act(async () => {
    const r = await cs.transferOwnership(id, userId);
    refresh();
    return r;
  }, "Leitung übertragen.");
}

export async function removeMemberAction(id: string, userId: string, opts: { ban?: boolean; reason?: string }) {
  return act(async () => {
    await cs.removeMember(id, userId, opts);
    refresh();
    return null;
  }, opts.ban ? "Mitglied gesperrt." : "Mitglied entfernt.");
}

export async function unbanMemberAction(id: string, userId: string) {
  return act(async () => {
    await cs.unbanMember(id, userId);
    refresh();
    return null;
  }, "Sperre aufgehoben.");
}

export async function muteMemberAction(id: string, userId: string, until: string | null, reason?: string) {
  return act(async () => {
    const d = until ? new Date(until) : null;
    if (d && Number.isNaN(d.getTime())) throw fail.invalid("Ungültiges Datum.");
    await cs.muteMember(id, userId, d, reason);
    refresh();
    return null;
  }, until ? "Mitglied stummgeschaltet." : "Stummschaltung aufgehoben.");
}

export async function createCommunityPostAction(id: string, input: unknown) {
  return act(async () => {
    const r = await cs.createCommunityPost(await requireUser(), id, input);
    refresh();
    return r;
  }, "Veröffentlicht.");
}

export async function loadCommunityPostsAction(id: string, cursor: string | null) {
  const viewer = await currentUser();
  if (!(await cs.canViewCommunityPost(id, viewer))) return { items: [], nextCursor: null };
  return cs.listCommunityPosts(id, viewer?.id ?? null, cursor);
}

export async function setPostPinnedAction(id: string, postId: string, pinned: boolean) {
  return act(async () => {
    await cs.setPostPinned(id, postId, pinned);
    refresh();
    return null;
  }, pinned ? "Angeheftet." : "Gelöst.");
}

export async function setPostHiddenAction(id: string, postId: string, hidden: boolean, reason?: string) {
  return act(async () => {
    await cs.setPostHidden(id, postId, hidden, reason);
    refresh();
    return null;
  }, hidden ? "Beitrag ausgeblendet." : "Beitrag wiederhergestellt.");
}

export async function setPostAnnouncementAction(id: string, postId: string, on: boolean) {
  return act(async () => {
    await cs.setPostAnnouncement(id, postId, on);
    refresh();
    return null;
  }, on ? "Als Ankündigung markiert." : "Ankündigung aufgehoben.");
}

export async function addCommunityProjectAction(id: string, projectId: string) {
  return act(async () => {
    await cs.addCommunityProject(await requireUser(), id, projectId);
    refresh();
    return null;
  }, "Projekt geteilt.");
}

export async function removeCommunityProjectAction(id: string, projectId: string) {
  return act(async () => {
    await cs.removeCommunityProject(await requireUser(), id, projectId);
    refresh();
    return null;
  }, "Projekt entfernt.");
}

export async function createChallengeAction(id: string, input: unknown) {
  return act(async () => {
    const r = await cs.createChallenge(id, input);
    refresh();
    return r;
  }, "Challenge angelegt.");
}

export async function deleteChallengeAction(id: string, challengeId: string) {
  return act(async () => {
    await cs.deleteChallenge(id, challengeId);
    refresh();
    return null;
  }, "Challenge gelöscht.");
}
