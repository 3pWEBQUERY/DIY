import { api } from "@/server/api";
import { db } from "@/server/db";
import { currentUser } from "@/server/auth/session";
import { canViewContent } from "@/server/visibility";
import { fail } from "@/server/errors";

/** Projektdetail für die iOS-App: Datenblatt, Journal, Materialien, Anleitung, Nachbauten (§10.4). */
export const GET = api(async (_req, ctx: { params: Promise<{ handle: string; slug: string }> }) => {
  const { handle, slug } = await ctx.params;
  const owner = await db.userProfile.findUnique({ where: { handle: handle.toLowerCase() }, select: { userId: true, handle: true, displayName: true, avatarUrl: true } });
  if (!owner) throw fail.notFound();
  const p = await db.project.findUnique({
    where: { ownerId_slug: { ownerId: owner.userId, slug } },
    include: {
      media: { orderBy: { position: "asc" }, include: { media: { select: { variants: true, width: true, height: true } } } },
      updates: { orderBy: { happenedAt: "asc" } },
      materials: { orderBy: { position: "asc" } },
      tools: { orderBy: { position: "asc" } },
      tutorials: { where: { state: "PUBLISHED" }, select: { id: true, slug: true, title: true, minutes: true, difficulty: true } },
      incoming: { where: { kind: "REMIX", from: { state: "PUBLISHED", visibility: "PUBLIC" } }, include: { from: { select: { id: true, slug: true, title: true, coverUrl: true, category: true, owner: { select: { profile: { select: { handle: true, displayName: true } } } } } } } },
      outgoing: { where: { kind: "REMIX" }, include: { to: { select: { slug: true, title: true, owner: { select: { profile: { select: { handle: true, displayName: true } } } } } } } },
    },
  });
  const viewer = await currentUser();
  if (!p || !(await canViewContent(viewer?.id ?? null, { ownerId: p.ownerId, visibility: p.visibility, state: p.state }))) throw fail.notFound();
  const [liked, saved] = viewer
    ? await Promise.all([
        db.reaction.findFirst({ where: { userId: viewer.id, targetType: "PROJECT", targetId: p.id } }).then(Boolean),
        db.bookmark.findFirst({ where: { userId: viewer.id, targetType: "PROJECT", targetId: p.id } }).then(Boolean),
      ])
    : [false, false];
  return {
    id: p.id,
    title: p.title,
    description: p.description,
    category: p.category,
    tags: p.tags,
    status: p.status,
    difficulty: p.difficulty,
    estimatedMinutes: p.estimatedMinutes,
    actualMinutes: p.actualMinutes,
    budgetMinor: p.budgetMinor,
    currency: p.currency,
    coverUrl: p.coverUrl,
    owner,
    gallery: p.media.map((m) => ({ id: m.mediaId, alt: m.alt, variants: m.media.variants })),
    journal: p.updates.map((u) => ({ id: u.id, body: u.body, milestone: u.milestone, problem: u.problem, solution: u.solution, minutes: u.minutes, happenedAt: u.happenedAt, media: u.media })),
    materials: p.materials.map((m) => ({ name: m.name, quantity: m.quantity, note: m.note })),
    tools: p.tools.map((t) => ({ name: t.name, note: t.note })),
    tutorials: p.tutorials,
    remixes: p.incoming.map((r) => ({ id: r.from.id, slug: r.from.slug, title: r.from.title, coverUrl: r.from.coverUrl, category: r.from.category, deviations: r.deviations, owner: r.from.owner.profile })),
    remixOf: p.outgoing[0] ? { slug: p.outgoing[0].to.slug, title: p.outgoing[0].to.title, owner: p.outgoing[0].to.owner.profile } : null,
    counts: { likes: p.likeCount, saves: p.saveCount, remixes: p.remixCount, comments: p.commentCount },
    viewer: { liked, saved, isOwner: viewer?.id === p.ownerId },
  };
});
