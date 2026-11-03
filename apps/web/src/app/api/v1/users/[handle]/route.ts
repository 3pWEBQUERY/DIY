import { api } from "@/server/api";
import { db } from "@/server/db";
import { currentUser } from "@/server/auth/session";
import { isBlockedBetween, relationsFor } from "@/server/visibility";
import { listProjects } from "@/server/projects/service";
import { fail } from "@/server/errors";

export const GET = api(async (_req, ctx: { params: Promise<{ handle: string }> }) => {
  const { handle } = await ctx.params;
  const p = await db.userProfile.findUnique({
    where: { handle: handle.toLowerCase() },
    select: { userId: true, handle: true, displayName: true, bio: true, avatarUrl: true, coverUrl: true, region: true, categories: true, followerCount: true, followingCount: true, projectCount: true, postCount: true, user: { select: { status: true } } },
  });
  if (!p || p.user.status === "DELETED" || p.user.status === "BANNED") throw fail.notFound();
  const viewer = await currentUser();
  if (viewer && viewer.id !== p.userId && (await isBlockedBetween(viewer.id, p.userId))) throw fail.notFound();
  const rel = await relationsFor(viewer?.id);
  const projects = await listProjects({ ownerId: p.userId, sort: "updated" }, viewer?.id ?? null, { take: 24 });
  const { user: _u, ...profile } = p;
  void _u;
  return { profile, following: rel.following.includes(p.userId), isSelf: viewer?.id === p.userId, projects: projects.items };
});
