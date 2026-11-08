import "server-only";
import { postCreateSchema, type PostCreateInput } from "@werkraum/shared";
import { db, type Prisma } from "@/server/db";
import { fail } from "@/server/errors";
import { emit } from "@/server/events";
import { limit } from "@/server/ratelimit";
import { notify } from "@/server/notifications";
import { relationsFor, visibleContentWhere, canViewContent } from "@/server/visibility";
import { assertOwnerOrMod } from "@/server/authz";
import type { SessionUser } from "@/server/auth/session";
import { attachMedia } from "@/server/media/service";
import { getSetting } from "@/server/settings";
import { rankFeed, type Candidate } from "./ranking";
import { assertCategoryAllowed } from "@/server/categories/settings";

export const postInclude = {
  author: { select: { id: true, profile: { select: { handle: true, displayName: true, avatarUrl: true } } } },
  media: { orderBy: { position: "asc" }, include: { media: { select: { id: true, variants: true, width: true, height: true, kind: true, state: true } } } },
  project: { select: { id: true, slug: true, title: true, status: true, coverUrl: true, category: true, difficulty: true, owner: { select: { profile: { select: { handle: true } } } } } },
  tutorial: { select: { id: true, slug: true, title: true, difficulty: true, minutes: true, coverUrl: true, category: true } },
  product: { select: { id: true, slug: true, title: true, priceMinor: true, currency: true, coverUrl: true, shop: { select: { slug: true, name: true } } } },
  article: { select: { id: true, slug: true, title: true, dek: true, coverUrl: true, readingMinutes: true, author: { select: { profile: { select: { handle: true } } } } } },
  community: { select: { slug: true, name: true } },
  repostOf: {
    select: {
      id: true,
      body: true,
      state: true,
      visibility: true,
      publishedAt: true,
      author: { select: { profile: { select: { handle: true, displayName: true, avatarUrl: true } } } },
      media: { orderBy: { position: "asc" }, take: 1, include: { media: { select: { variants: true } } } },
    },
  },
} satisfies Prisma.PostInclude;

type PostRow = Prisma.PostGetPayload<{ include: typeof postInclude }>;

export type PostView = ReturnType<typeof toView>;

function toView(p: PostRow, viewer: { liked: Set<string>; saved: Set<string>; id?: string | null }) {
  return {
    id: p.id,
    kind: p.kind,
    body: p.body,
    category: p.category,
    visibility: p.visibility,
    isCommercial: p.isCommercial,
    isPinned: p.isPinned,
    isAnnouncement: p.isAnnouncement,
    publishedAt: p.publishedAt.toISOString(),
    editedAt: p.editedAt?.toISOString() ?? null,
    author: { id: p.author.id, handle: p.author.profile?.handle ?? "unbekannt", displayName: p.author.profile?.displayName ?? "Unbekannt", avatarUrl: p.author.profile?.avatarUrl ?? null },
    media: p.media
      .filter((m) => m.media.state === "READY" || m.media.state === "PROCESSING")
      .map((m) => ({ id: m.mediaId, alt: m.alt, kind: m.media.kind, variants: m.media.variants as Record<string, string>, width: m.media.width, height: m.media.height })),
    project: p.project ? { ...p.project, ownerHandle: p.project.owner.profile?.handle ?? "" } : null,
    tutorial: p.tutorial,
    product: p.product,
    article: p.article ? { ...p.article, authorHandle: p.article.author.profile?.handle ?? "" } : null,
    community: p.community,
    repostOf:
      // Original nur zeigen, solange es veröffentlicht und öffentlich ist (sonst Leck nach Sichtbarkeitswechsel)
      p.repostOf && p.repostOf.state === "PUBLISHED" && p.repostOf.visibility === "PUBLIC"
        ? {
            id: p.repostOf.id,
            body: p.repostOf.body,
            publishedAt: p.repostOf.publishedAt.toISOString(),
            author: p.repostOf.author.profile,
            cover: (p.repostOf.media[0]?.media.variants as Record<string, string> | undefined) ?? null,
          }
        : null,
    counts: { likes: p.likeCount, comments: p.commentCount, saves: p.saveCount, reposts: p.repostCount },
    viewer: { liked: viewer.liked.has(p.id), saved: viewer.saved.has(p.id), isAuthor: viewer.id === p.authorId },
  };
}

async function viewerState(viewerId: string | null | undefined, ids: string[]) {
  if (!viewerId || !ids.length) return { liked: new Set<string>(), saved: new Set<string>(), id: viewerId };
  const [likes, saves] = await Promise.all([
    db.reaction.findMany({ where: { userId: viewerId, targetType: "POST", targetId: { in: ids } }, select: { targetId: true } }),
    db.bookmark.findMany({ where: { userId: viewerId, targetType: "POST", targetId: { in: ids } }, select: { targetId: true } }),
  ]);
  return { liked: new Set(likes.map((l) => l.targetId)), saved: new Set(saves.map((s) => s.targetId)), id: viewerId };
}

/** Lädt Beiträge in gegebener Reihenfolge inkl. Betrachterstatus. */
export async function hydratePosts(ids: string[], viewerId?: string | null) {
  if (!ids.length) return [];
  const [rows, v] = await Promise.all([db.post.findMany({ where: { id: { in: ids } }, include: postInclude }), viewerState(viewerId, ids)]);
  const byId = new Map(rows.map((r) => [r.id, r]));
  return ids.map((id) => byId.get(id)).filter((r): r is PostRow => !!r).map((r) => toView(r, v));
}

export async function listPosts(where: Prisma.PostWhereInput, viewerId: string | null | undefined, opts: { cursor?: string | null; take?: number } = {}) {
  const take = opts.take ?? 15;
  const rows = await db.post.findMany({
    where,
    include: postInclude,
    orderBy: [{ publishedAt: "desc" }, { id: "desc" }],
    take: take + 1,
    ...(opts.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
  });
  const hasMore = rows.length > take;
  const page = rows.slice(0, take);
  const v = await viewerState(viewerId, page.map((p) => p.id));
  return { items: page.map((r) => toView(r, v)), nextCursor: hasMore ? page[page.length - 1]!.id : null };
}

/** Basisfilter: veröffentlicht, sichtbar, ohne blockierte/stummgeschaltete/ausgeblendete Inhalte. */
export async function baseFeedWhere(viewerId: string | null | undefined, opts: { includeMuted?: boolean } = {}): Promise<Prisma.PostWhereInput> {
  const rel = await relationsFor(viewerId);
  const excludeAuthors = [...rel.blocked, ...(opts.includeMuted ? [] : rel.muted)];
  const hiddenPosts = rel.hidden.filter((h) => h.targetType === "POST").map((h) => h.targetId);
  return {
    state: "PUBLISHED",
    publishedAt: { lte: new Date() },
    author: { status: { in: ["ACTIVE", "SUSPENDED"] } },
    ...(excludeAuthors.length ? { authorId: { notIn: excludeAuthors } } : {}),
    ...(hiddenPosts.length ? { id: { notIn: hiddenPosts } } : {}),
    AND: [visibleContentWhere(viewerId, rel.following) as Prisma.PostWhereInput],
  };
}

export type FeedKind = "for-you" | "following" | "new";

export async function getFeed(kind: FeedKind, viewer: { id: string; interests: string[] } | null, cursor?: string | null) {
  const viewerId = viewer?.id ?? null;
  const base = await baseFeedWhere(viewerId);
  const communityFilter: Prisma.PostWhereInput = { communityId: null };

  if (kind === "following") {
    if (!viewerId) return { items: [], nextCursor: null };
    const rel = await relationsFor(viewerId);
    const followedProjects = await db.projectFollow.findMany({ where: { userId: viewerId }, select: { projectId: true } });
    return listPosts(
      {
        ...base,
        ...communityFilter,
        OR: [{ authorId: { in: [...rel.following, viewerId] } }, ...(followedProjects.length ? [{ projectId: { in: followedProjects.map((p) => p.projectId) } }] : [])],
      },
      viewerId,
      { cursor },
    );
  }

  if (kind === "new") {
    const cats = viewer?.interests.length ? viewer.interests : null;
    return listPosts({ ...base, ...communityFilter, visibility: "PUBLIC", ...(cats ? { category: { in: cats } } : {}) }, viewerId, { cursor });
  }

  // Für dich: Kandidaten der letzten 21 Tage → Ranking → Offset-Cursor auf Snapshot
  const [asOfRaw, offsetRaw] = (cursor ?? "").split("|");
  const asOf = asOfRaw ? new Date(Number(asOfRaw)) : new Date();
  const offset = Number(offsetRaw ?? 0) || 0;
  const pageSize = 15;
  const rel = await relationsFor(viewerId);
  const pref = viewerId ? await db.userPreference.findUnique({ where: { userId: viewerId }, select: { hiddenCategories: true } }) : null;
  const rows = await db.post.findMany({
    where: { ...base, ...communityFilter, publishedAt: { lte: asOf, gte: new Date(asOf.getTime() - 21 * 86400_000) }, reachLimited: false },
    select: {
      id: true,
      authorId: true,
      category: true,
      publishedAt: true,
      likeCount: true,
      commentCount: true,
      saveCount: true,
      qualityScore: true,
      isCommercial: true,
      projectId: true,
      _count: { select: { media: true } },
      author: { select: { profile: { select: { followerCount: true } } } },
    },
    orderBy: { publishedAt: "desc" },
    take: 400,
  });
  const candidates: Candidate[] = rows.map((r) => ({
    id: r.id,
    authorId: r.authorId,
    category: r.category,
    publishedAt: r.publishedAt,
    likeCount: r.likeCount,
    commentCount: r.commentCount,
    saveCount: r.saveCount,
    qualityScore: r.qualityScore,
    isCommercial: r.isCommercial,
    authorFollowers: r.author.profile?.followerCount ?? 0,
    hasMedia: r._count.media > 0,
    hasProject: !!r.projectId,
  }));
  const ranked = rankFeed(
    candidates,
    { now: asOf, interests: viewer?.interests ?? [], following: new Set(rel.following), hiddenCategories: pref?.hiddenCategories },
    { authorCap: await getSetting("feed.authorCap"), pageSize },
  );
  const ids = ranked.slice(offset, offset + pageSize);
  const items = await hydratePosts(ids, viewerId);
  const next = offset + pageSize < ranked.length ? `${asOf.getTime()}|${offset + pageSize}` : null;
  return { items, nextCursor: next };
}

// ───────────────────────── Schreiben ─────────────────────────

function deriveKind(p: PostCreateInput, hasProject: boolean) {
  if (p.repostOfId) return "REPOST" as const;
  if (hasProject) return "PROJECT_SHOWCASE" as const;
  return p.media.length ? ("MEDIA" as const) : ("TEXT" as const);
}

/** Erwähnungen @handle → Benachrichtigungen. */
async function notifyMentions(body: string, actorId: string, postId: string) {
  const handles = [...new Set([...body.matchAll(/(^|\s)@([a-z0-9._]{3,24})/g)].map((m) => m[2]!))].slice(0, 10);
  if (!handles.length) return;
  const users = await db.userProfile.findMany({ where: { handle: { in: handles } }, select: { userId: true } });
  for (const u of users) await notify({ recipientId: u.userId, type: "MENTION", actorId, targetType: "POST", targetId: postId, bundle: false });
}

export async function createPost(user: SessionUser, input: unknown, extra: { communityId?: string; tutorialId?: string; articleId?: string; productId?: string; projectUpdateId?: string } = {}) {
  const data = postCreateSchema.parse(input);
  await assertCategoryAllowed(data.category);
  await limit("post", user.id);
  if (data.projectId) {
    const pr = await db.project.findUnique({ where: { id: data.projectId }, select: { ownerId: true } });
    if (!pr || pr.ownerId !== user.id) throw fail.forbidden("Du kannst nur eigene Projekte verknüpfen.");
  }
  if (data.repostOfId) {
    const orig = await db.post.findUnique({ where: { id: data.repostOfId }, select: { authorId: true, visibility: true, state: true } });
    if (!orig || !(await canViewContent(user.id, { ownerId: orig.authorId, visibility: orig.visibility, state: orig.state })) || orig.visibility !== "PUBLIC") {
      throw fail.invalid("Dieser Beitrag kann nicht geteilt werden.");
    }
  }
  const post = await db.$transaction(async (tx) => {
    const p = await tx.post.create({
      data: {
        authorId: user.id,
        body: data.body,
        category: data.category,
        visibility: extra.communityId ? "PUBLIC" : data.visibility,
        projectId: data.projectId,
        repostOfId: data.repostOfId,
        communityId: extra.communityId,
        tutorialId: extra.tutorialId,
        articleId: extra.articleId,
        productId: extra.productId,
        projectUpdateId: extra.projectUpdateId,
        isCommercial: !!extra.productId,
        kind: extra.tutorialId ? "TUTORIAL" : extra.articleId ? "ARTICLE" : extra.productId ? "PRODUCT" : extra.projectUpdateId ? "PROJECT_UPDATE" : deriveKind(data, !!data.projectId),
        qualityScore: 0.4 + (data.media.length ? 0.15 : 0) + (data.projectId ? 0.15 : 0) + Math.min(0.2, data.body.length / 2000),
      },
    });
    if (data.media.length) {
      await attachMedia(tx, user.id, data.media.map((m) => m.id));
      await tx.postMedia.createMany({ data: data.media.map((m, i) => ({ postId: p.id, mediaId: m.id, position: i, alt: m.alt })) });
    }
    if (data.repostOfId) await tx.post.update({ where: { id: data.repostOfId }, data: { repostCount: { increment: 1 } } });
    await tx.userProfile.update({ where: { userId: user.id }, data: { postCount: { increment: 1 } } });
    await emit({ type: "PostPublished", postId: p.id, authorId: user.id }, tx);
    return p;
  });
  await notifyMentions(data.body, user.id, post.id);
  return post;
}

export async function updatePost(
  user: SessionUser,
  postId: string,
  input: { body: string; category?: string; visibility?: string; media?: { id: string; alt: string }[]; projectId?: string | null },
) {
  const post = await db.post.findUnique({ where: { id: postId }, select: { authorId: true, state: true, repostOfId: true, communityId: true } });
  if (!post || post.state === "REMOVED") throw fail.notFound();
  if (post.authorId !== user.id) throw fail.forbidden();
  const data = postCreateSchema.parse({ ...input, media: input.media ?? [], repostOfId: post.repostOfId ?? undefined, projectId: input.projectId ?? undefined });
  await assertCategoryAllowed(data.category, (await db.post.findUnique({ where: { id: postId }, select: { category: true } }))?.category);
  if (input.projectId) {
    const pr = await db.project.findUnique({ where: { id: input.projectId }, select: { ownerId: true } });
    if (!pr || pr.ownerId !== user.id) throw fail.forbidden("Du kannst nur eigene Projekte verknüpfen.");
  }
  await db.$transaction(async (tx) => {
    await tx.post.update({
      where: { id: postId },
      data: {
        body: data.body,
        category: data.category ?? null,
        // Community-Beiträge bleiben öffentlich innerhalb der Community
        visibility: post.communityId ? "PUBLIC" : data.visibility,
        ...(input.projectId !== undefined ? { projectId: input.projectId || null } : {}),
        editedAt: new Date(),
      },
    });
    if (input.media) {
      await attachMedia(tx, user.id, data.media.map((m) => m.id));
      await tx.postMedia.deleteMany({ where: { postId } });
      await tx.postMedia.createMany({ data: data.media.map((m, i) => ({ postId, mediaId: m.id, position: i, alt: m.alt })) });
    }
  });
}

/** Beitrag für die Bearbeitung im Studio – nur für die Autorin / den Autor. */
export async function getPostForEdit(user: SessionUser, postId: string) {
  const p = await db.post.findUnique({
    where: { id: postId },
    include: {
      media: { orderBy: { position: "asc" }, include: { media: { select: { id: true, variants: true, kind: true, state: true } } } },
      project: { select: { id: true, title: true } },
      community: { select: { name: true, slug: true } },
      repostOf: { select: { id: true, body: true } },
    },
  });
  if (!p || p.state === "REMOVED") throw fail.notFound();
  if (p.authorId !== user.id) throw fail.notFound();
  return {
    id: p.id,
    kind: p.kind,
    body: p.body,
    category: p.category,
    visibility: p.visibility,
    state: p.state,
    projectId: p.projectId,
    project: p.project,
    community: p.community,
    repostOf: p.repostOf,
    publishedAt: p.publishedAt.toISOString(),
    editedAt: p.editedAt?.toISOString() ?? null,
    counts: { likes: p.likeCount, comments: p.commentCount, saves: p.saveCount, reposts: p.repostCount },
    media: p.media.map((m) => ({ id: m.mediaId, alt: m.alt, kind: m.media.kind, preview: ((m.media.variants ?? {}) as Record<string, string>).sm ?? ((m.media.variants ?? {}) as Record<string, string>).video ?? "" })),
  };
}
export type PostEditData = Awaited<ReturnType<typeof getPostForEdit>>;

export async function deletePost(user: SessionUser, postId: string) {
  const post = await db.post.findUnique({ where: { id: postId }, select: { authorId: true, state: true } });
  if (!post || post.state === "REMOVED") throw fail.notFound();
  assertOwnerOrMod(user, post.authorId);
  await db.$transaction([
    db.post.update({ where: { id: postId }, data: { state: "REMOVED" } }),
    db.userProfile.update({ where: { userId: post.authorId }, data: { postCount: { decrement: 1 } } }),
  ]);
}

/** Beiträge privater Communities sind nur für aktive Mitglieder sichtbar (§15.1). */
export async function canViewCommunityContentOf(communityId: string, viewerId: string | null) {
  const c = await db.community.findUnique({ where: { id: communityId }, select: { visibility: true, state: true } });
  if (!c || c.state === "REMOVED") return false;
  if (c.visibility !== "PRIVATE") return true;
  if (!viewerId) return false;
  const viewer = await db.user.findUnique({ where: { id: viewerId }, select: { role: true } });
  if (viewer && viewer.role !== "MEMBER") return true;
  const m = await db.communityMember.findUnique({ where: { communityId_userId: { communityId, userId: viewerId } }, select: { state: true } });
  return m?.state === "ACTIVE";
}

export async function getPostForViewer(postId: string, viewerId: string | null) {
  const p = await db.post.findUnique({ where: { id: postId }, select: { authorId: true, visibility: true, state: true, communityId: true } });
  if (!p || !(await canViewContent(viewerId, { ownerId: p.authorId, visibility: p.visibility, state: p.state }))) return null;
  if (p.communityId && !(await canViewCommunityContentOf(p.communityId, viewerId))) return null;
  const view = (await hydratePosts([postId], viewerId))[0] ?? null;
  // Für die Autorin/den Autor sichtbar machen, dass der Beitrag nicht öffentlich ist
  return view ? { ...view, moderationState: p.state === "HIDDEN" || p.state === "REMOVED" ? p.state : null } : null;
}
