import "server-only";
import { currentUser } from "@/server/auth/session";
import { getHashtagPage, hashtagKindFromSlug } from "@/server/hashtags/service";

/** Daten für Seite und Fenster der Hashtag-Ansicht. */
export async function loadHashtagView(params: Promise<{ tag: string }>, searchParams: Promise<{ typ?: string | string[] }>) {
  const [{ tag }, sp, user] = await Promise.all([params, searchParams, currentUser()]);
  const typ = Array.isArray(sp.typ) ? sp.typ[0] : sp.typ;
  const page = await getHashtagPage(tag, { kind: hashtagKindFromSlug(typ), viewerId: user?.id ?? null });
  const viewer = user?.profile ? { id: user.id, displayName: user.profile.displayName, avatarUrl: user.profile.avatarUrl ?? null } : null;
  return { page, viewer };
}
