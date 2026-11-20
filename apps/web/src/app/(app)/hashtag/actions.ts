"use server";

import { clientIpHash, currentUser } from "@/server/auth/session";
import { hashtagKindFromSlug, loadHashtagItems, suggestHashtags } from "@/server/hashtags/service";
import { rateLimit } from "@/server/ratelimit";

/** „Mehr laden“ in der Hashtag-Ansicht (öffentlich, Sichtbarkeit wie im Feed). */
export async function loadHashtagAction(tag: string, kind: string, cursor: string | null) {
  const k = hashtagKindFromSlug(kind);
  if (!k) return { items: [], nextCursor: null };
  const u = await currentUser();
  return loadHashtagItems(tag, k, u?.id ?? null, cursor);
}

/** Vorschläge beim Tippen von `#…` (Composer, Kommentare, Editoren). */
export async function suggestHashtagsAction(q: string) {
  const u = await currentUser();
  await rateLimit(`hashtag-suggest:${u?.id ?? (await clientIpHash().catch(() => "anon"))}`, 240, 60);
  return suggestHashtags(String(q ?? "").slice(0, 60), 6);
}
