"use server";

import { revalidatePath } from "next/cache";
import type { TargetType } from "@/server/db";
import { act } from "@/server/errors";
import { requireUser } from "@/server/auth/session";
import * as posts from "@/server/social/posts";
import * as ix from "@/server/social/interactions";

/** Server Actions für soziale Interaktionen. Alle prüfen Berechtigungen serverseitig. */

export async function createPostAction(input: unknown) {
  return act(async () => {
    const u = await requireUser();
    const p = await posts.createPost(u, input);
    revalidatePath("/feed");
    return { id: p.id };
  }, "Veröffentlicht.");
}

export async function votePollAction(postId: string, optionIds: string[]) {
  return act(async () => posts.votePoll(await requireUser(), postId, optionIds), "Danke für deine Stimme.");
}

export async function updatePostAction(id: string, input: { body: string; category?: string; visibility?: string }) {
  return act(async () => {
    const u = await requireUser();
    await posts.updatePost(u, id, input);
    return null;
  }, "Änderungen gespeichert.");
}

export async function deletePostAction(id: string) {
  return act(async () => {
    const u = await requireUser();
    await posts.deletePost(u, id);
    return null;
  }, "Beitrag gelöscht.");
}

export async function likeAction(type: TargetType, id: string, liked: boolean) {
  return act(async () => ix.setLike(await requireUser(), type, id, liked));
}

export async function bookmarkAction(type: TargetType, id: string, saved: boolean, collectionId?: string | null) {
  return act(async () => ix.setBookmark(await requireUser(), type, id, saved, collectionId));
}

export async function commentAction(type: TargetType, id: string, input: { body: string; parentId?: string }) {
  return act(async () => {
    const c = await ix.createComment(await requireUser(), type, id, input);
    return { id: c.id };
  });
}

export async function deleteCommentAction(id: string) {
  return act(async () => {
    await ix.deleteComment(await requireUser(), id);
    return null;
  }, "Kommentar entfernt.");
}

export async function listCommentsAction(type: TargetType, id: string) {
  const { currentUser } = await import("@/server/auth/session");
  const u = await currentUser();
  return ix.listComments(type, id, u?.id ?? null);
}

export async function followAction(userId: string, follow: boolean) {
  return act(async () => ix.setFollow(await requireUser(), userId, follow));
}

export async function followProjectAction(projectId: string, follow: boolean) {
  return act(async () => ix.setProjectFollow(await requireUser(), projectId, follow), follow ? "Du folgst diesem Projekt." : undefined);
}

export async function blockAction(userId: string, block: boolean) {
  return act(async () => ix.setBlock(await requireUser(), userId, block), block ? "Profil blockiert." : "Blockierung aufgehoben.");
}

export async function muteAction(userId: string, mute: boolean) {
  return act(async () => ix.setMute(await requireUser(), userId, mute), mute ? "Stummgeschaltet – Inhalte erscheinen nicht mehr im Feed." : "Stummschaltung aufgehoben.");
}

export async function hideAction(type: TargetType, id: string) {
  return act(async () => {
    await ix.hideContent(await requireUser(), type, id);
    return null;
  }, "Ausgeblendet. Wir zeigen dir weniger davon.");
}

export async function reportAction(input: { targetType: TargetType; targetId: string; reason: string; details?: string }) {
  return act(async () => ix.report(await requireUser(), input), "Danke. Deine Meldung wurde aufgenommen.");
}

export async function repostAction(postId: string, body: string) {
  return act(async () => {
    const p = await posts.createPost(await requireUser(), { body, repostOfId: postId, media: [] });
    return { id: p.id };
  }, "Geteilt.");
}

export async function loadFeedAction(kind: posts.FeedKind, cursor: string | null) {
  const { currentUser } = await import("@/server/auth/session");
  const u = await currentUser();
  return posts.getFeed(kind, u ? { id: u.id, interests: u.profile?.categories ?? [] } : null, cursor);
}

/* ───────────── Koautorenschaft ───────────── */

export async function listCoauthorsAction(postId: string) {
  return act(async () => {
    const { listCoauthors } = await import("@/server/social/coauthors");
    return listCoauthors(await requireUser(), postId);
  });
}

export async function inviteCoauthorsAction(postId: string, handles: string[]) {
  return act(async () => {
    const { inviteCoauthors } = await import("@/server/social/coauthors");
    const r = await inviteCoauthors(await requireUser(), postId, handles);
    revalidatePath(`/beitrag/${postId}`);
    return r;
  });
}

export async function removeCoauthorAction(postId: string, userId: string) {
  return act(async () => {
    const { removeCoauthor } = await import("@/server/social/coauthors");
    const r = await removeCoauthor(await requireUser(), postId, userId);
    revalidatePath(`/beitrag/${postId}`);
    return r;
  }, "Entfernt.");
}

export async function respondCoauthorAction(postId: string, accept: boolean) {
  return act(async () => {
    const { respondCoauthor } = await import("@/server/social/coauthors");
    const r = await respondCoauthor(await requireUser(), postId, accept);
    revalidatePath(`/beitrag/${postId}`);
    return r;
  }, accept ? "Du bist jetzt Koautor:in dieses Beitrags." : "Einladung abgelehnt.");
}

export async function leaveCoauthorAction(postId: string) {
  return act(async () => {
    const { leaveCoauthor } = await import("@/server/social/coauthors");
    const r = await leaveCoauthor(await requireUser(), postId);
    revalidatePath(`/beitrag/${postId}`);
    return r;
  }, "Du bist nicht mehr Koautor:in dieses Beitrags.");
}

export async function coauthorCandidatesAction() {
  return act(async () => {
    const { coauthorCandidates } = await import("@/server/social/coauthors");
    return coauthorCandidates((await requireUser()).id);
  });
}
