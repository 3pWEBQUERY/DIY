"use server";

import { revalidatePath } from "next/cache";
import { act } from "@/server/errors";
import { requireRole } from "@/server/authz";
import { setContentHidden, setFeatured, type ContentKind } from "@/server/admin/content";
import {
  moderateComment,
  removeContent,
  restoreContent,
  setCommentsLocked,
  setDetailFeatured,
  setDetailHidden,
  updateContentMeta,
  type CommentDecision,
  type DetailKind,
} from "@/server/admin/content-detail";

type ReasonInput = { reason: string; publicNote?: string; days?: number | null; choice?: string };

const DETAIL_SEGMENT: Record<DetailKind, string> = { PROJECT: "projekte", TUTORIAL: "anleitungen", POST: "beitraege", ARTICLE: "artikel" };

const refresh = () => {
  revalidatePath("/admin/inhalte");
  revalidatePath("/admin/communities");
};

const refreshDetail = (kind: DetailKind | string, id: string) => {
  refresh();
  const seg = DETAIL_SEGMENT[kind as DetailKind];
  if (seg) revalidatePath(`/admin/inhalte/${seg}/${id}`);
};

/* ───────── Bestehende Listenaktionen (auch von /admin/communities genutzt) ───────── */

export async function setFeaturedAction(kind: ContentKind, id: string, featured: boolean) {
  return act(async () => {
    const u = await requireRole("PLATFORM_MODERATOR");
    await setFeatured(u, kind, id, featured);
    refreshDetail(kind, id);
    return null;
  }, featured ? "Hervorgehoben." : "Hervorhebung entfernt.");
}

export async function setHiddenAction(kind: ContentKind, id: string, hidden: boolean, input: { reason: string }) {
  return act(async () => {
    const u = await requireRole("PLATFORM_MODERATOR");
    await setContentHidden(u, kind, id, hidden, input.reason);
    refreshDetail(kind, id);
    return null;
  }, hidden ? "Ausgeblendet. Die Person wurde informiert." : "Wieder sichtbar.");
}

/* ───────── Detailaktionen (Projekte, Anleitungen, Beiträge, Artikel) ───────── */

export async function updateContentAction(kind: DetailKind, id: string, input: unknown) {
  return act(async () => {
    const u = await requireRole("PLATFORM_MODERATOR");
    const r = await updateContentMeta(u, kind, id, input);
    refreshDetail(kind, id);
    return r;
  });
}

export async function setDetailFeaturedAction(kind: DetailKind, id: string, featured: boolean) {
  return act(async () => {
    const u = await requireRole("PLATFORM_MODERATOR");
    await setDetailFeatured(u, kind, id, featured);
    refreshDetail(kind, id);
    return null;
  }, featured ? "Hervorgehoben." : "Hervorhebung entfernt.");
}

export async function setDetailHiddenAction(kind: DetailKind, id: string, hidden: boolean, input: ReasonInput) {
  return act(async () => {
    const u = await requireRole("PLATFORM_MODERATOR");
    await setDetailHidden(u, kind, id, hidden, input.reason);
    refreshDetail(kind, id);
    return null;
  }, hidden ? "Ausgeblendet. Die Person wurde informiert." : "Wieder sichtbar.");
}

export async function removeContentAction(kind: DetailKind, id: string, input: ReasonInput) {
  return act(async () => {
    const u = await requireRole("ADMIN");
    await removeContent(u, kind, id, { reason: input.reason, publicNote: input.publicNote ?? "" });
    refreshDetail(kind, id);
    return null;
  }, "Entfernt. Die Person wurde informiert.");
}

export async function restoreContentAction(kind: DetailKind, id: string, input: ReasonInput) {
  return act(async () => {
    const u = await requireRole("ADMIN");
    await restoreContent(u, kind, id, input.reason);
    refreshDetail(kind, id);
    return null;
  }, "Wiederhergestellt.");
}

export async function setCommentsLockedAction(articleId: string, locked: boolean, input: ReasonInput) {
  return act(async () => {
    const u = await requireRole("PLATFORM_MODERATOR");
    await setCommentsLocked(u, articleId, locked, input.reason);
    refreshDetail("ARTICLE", articleId);
    return null;
  }, locked ? "Kommentare gesperrt." : "Kommentare wieder geöffnet.");
}

export async function moderateCommentAction(commentId: string, decision: CommentDecision, input: ReasonInput) {
  return act(async () => {
    const u = await requireRole("PLATFORM_MODERATOR");
    const r = await moderateComment(u, commentId, decision, input.reason);
    refreshDetail(r.targetType, r.targetId);
    return null;
  }, decision === "HIDE" ? "Kommentar ausgeblendet." : decision === "REMOVE" ? "Kommentar entfernt." : "Kommentar wiederhergestellt.");
}
