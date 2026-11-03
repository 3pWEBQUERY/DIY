import { api } from "@/server/api";
import { currentUser } from "@/server/auth/session";
import { getFeed, type FeedKind } from "@/server/social/posts";

/** GET /api/v1/feed?kind=for-you|following|new&cursor=… */
export const GET = api(async (req) => {
  const sp = req.nextUrl.searchParams;
  const kind = (["for-you", "following", "new"].includes(sp.get("kind") ?? "") ? sp.get("kind") : "for-you") as FeedKind;
  const u = await currentUser();
  return getFeed(kind, u ? { id: u.id, interests: u.profile?.categories ?? [] } : null, sp.get("cursor"));
});
