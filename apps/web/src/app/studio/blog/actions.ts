"use server";

import { revalidatePath } from "next/cache";
import { act } from "@/server/errors";
import { requireUser } from "@/server/auth/session";
import * as blog from "@/server/blog/service";

/** Server Actions des Blog-Editors (§14). Eigentum wird in jeder Funktion serverseitig geprüft. */

function revalidateArticle(handle: string | undefined, slug?: string) {
  revalidatePath("/studio/blog");
  revalidatePath("/blogs");
  if (handle) {
    revalidatePath(`/u/${handle}/blog`);
    if (slug) revalidatePath(`/u/${handle}/blog/${slug}`);
  }
}

export async function saveArticleAction(id: string | null, input: unknown) {
  return act(async () => {
    const u = await requireUser();
    const r = await blog.saveArticle(u, id, input);
    revalidateArticle(u.profile.handle, r.slug);
    return r;
  });
}

export async function publishArticleAction(id: string, input: { publishAt?: string; shareToFeed?: boolean }) {
  return act(async () => {
    const u = await requireUser();
    const r = await blog.publishArticle(u, id, input);
    revalidateArticle(u.profile.handle);
    revalidatePath("/feed");
    return r;
  });
}

export async function unpublishArticleAction(id: string) {
  return act(async () => {
    const u = await requireUser();
    const r = await blog.unpublishArticle(u, id);
    revalidateArticle(u.profile.handle);
    return r;
  }, "Artikel ist wieder ein Entwurf.");
}

export async function deleteArticleAction(id: string) {
  return act(async () => {
    const u = await requireUser();
    await blog.deleteArticle(u, id);
    revalidateArticle(u.profile.handle);
    return null;
  }, "Artikel gelöscht.");
}

export async function listRevisionsAction(id: string) {
  return act(async () => blog.listRevisions(await requireUser(), id));
}

export async function restoreRevisionAction(id: string, revisionId: string) {
  return act(async () => {
    const u = await requireUser();
    const r = await blog.restoreRevision(u, id, revisionId);
    revalidateArticle(u.profile.handle);
    return r;
  }, "Revision wiederhergestellt.");
}
