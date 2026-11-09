import "server-only";
import { isValidSchedule, postCreateSchema, type PostCreateInput } from "@werkraum/shared";
import { db, type Prisma } from "@/server/db";
import { fail } from "@/server/errors";
import { emit } from "@/server/events";
import { limit } from "@/server/ratelimit";
import { notify } from "@/server/notifications";
import { relationsFor, visibleContentWhere, canViewContent } from "@/server/visibility";
import { assertOwnerOrMod, hasRole } from "@/server/authz";
import type { SessionUser } from "@/server/auth/session";
import { attachMedia } from "@/server/media/service";
import { getSetting } from "@/server/settings";
import { rankFeed, type Candidate } from "./ranking";
import { assertCategoryAllowed } from "@/server/categories/settings";

export const postInclude = {
  author: { select: { id: true, profile: { select: { handle: true, displayName: true, avatarUrl: true } } } },
  media: { orderBy: { position: "asc" }, include: { media: { select: { id: true, variants: true, width: true, height: true, kind: true, state: true } } } },
  project: { select: { id: true, slug: true, title: true, status: true, coverUrl: true, category: true, difficulty: true, state: true, visibility: true, owner: { select: { profile: { select: { handle: true } } } } } },
  tutorial: { select: { id: true, slug: true, title: true, difficulty: true, minutes: true, coverUrl: true, category: true, state: true } },
  product: { select: { id: true, slug: true, title: true, priceMinor: true, currency: true, coverUrl: true, status: true, shop: { select: { slug: true, name: true, status: true } } } },
  article: { select: { id: true, slug: true, title: true, dek: true, coverUrl: true, readingMinutes: true, state: true, author: { select: { profile: { select: { handle: true } } } } } },
  community: { select: { slug: true, name: true } },
  coauthors: { where: { status: "ACCEPTED" }, orderBy: { respondedAt: "asc" }, select: { user: { select: { id: true, profile: { select: { handle: true, displayName: true, avatarUrl: true } } } } } },
  poll: { select: { id: true, endsAt: true, multiple: true, voterCount: true, options: { orderBy: { position: "asc" }, select: { id: true, label: true, voteCount: true } } } },
  repostOf: {
    select: {
      id: true,
      body: true,
      state: true,
      visibility: true,
      communityId: true,
      publishedAt: true,
      author: { select: { profile: { select: { handle: true, displayName: true, avatarUrl: true } } } },
      media: { orderBy: { position: "asc" }, take: 1, include: { media: { select: { variants: true } } } },
    },
  },
} satisfies Prisma.PostInclude;

type PostRow = Prisma.PostGetPayload<{ include: typeof postInclude }>;

export type PostView = ReturnType<typeof toView>;

type ViewerState = { liked: Set<string>; saved: Set<string>; votes: Map<string, string[]>; id?: string | null };

/**
 * Umfrage für die Anzeige. Stimmenzahlen erst nach eigener Abstimmung, nach Ende oder für die
 * Autorin/den Autor – so beeinflusst der Zwischenstand niemanden.
 */
function pollView(p: PostRow, viewer: ViewerState) {
  if (!p.poll) return null;
  const voted = viewer.votes.get(p.poll.id) ?? [];
  const ended = p.poll.endsAt.getTime() <= Date.now();
  const showResults = ended || voted.length > 0 || viewer.id === p.authorId;
  return {
    id: p.poll.id,
    endsAt: p.poll.endsAt.toISOString(),
    ended,
    multiple: p.poll.multiple,
    voterCount: p.poll.voterCount,
    showResults,
    viewerVotes: voted,
    options: p.poll.options.map((o) => ({ id: o.id, label: o.label, votes: showResults ? o.voteCount : null })),
  };
}

function toView(p: PostRow, viewer: ViewerState) {
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
    coauthors: p.coauthors.filter((c) => c.user.profile).map((c) => ({ id: c.user.id, handle: c.user.profile!.handle, displayName: c.user.profile!.displayName, avatarUrl: c.user.profile!.avatarUrl })),
    media: p.media
      .filter((m) => m.media.state === "READY" || m.media.state === "PROCESSING")
      .map((m) => ({ id: m.mediaId, alt: m.alt, kind: m.media.kind, variants: m.media.variants as Record<string, string>, width: m.media.width, height: m.media.height })),
    // Verknüpfte Inhalte nur zeigen, solange sie öffentlich sind (nach Moderation, Privat-Stellen oder
    // Deaktivieren eines Angebots darf der Beitrag Titel, Bild und Preis nicht weiter verbreiten)
    project: p.project && p.project.state === "PUBLISHED" && p.project.visibility === "PUBLIC" ? { ...p.project, ownerHandle: p.project.owner.profile?.handle ?? "" } : null,
    tutorial: p.tutorial && p.tutorial.state === "PUBLISHED" ? p.tutorial : null,
    product: p.product && ["ACTIVE", "SOLD_OUT"].includes(p.product.status) && p.product.shop.status === "ACTIVE" ? p.product : null,
    article: p.article && p.article.state === "PUBLISHED" ? { ...p.article, authorHandle: p.article.author.profile?.handle ?? "" } : null,
    community: p.community,
    repostOf:
      // Original nur zeigen, solange es veröffentlicht und öffentlich ist (sonst Leck nach Sichtbarkeitswechsel)
      // Community-Beiträge nie als Repost zeigen – private Communities würden sonst öffentlich
      p.repostOf && p.repostOf.state === "PUBLISHED" && p.repostOf.visibility === "PUBLIC" && !p.repostOf.communityId
        ? {
            id: p.repostOf.id,
            body: p.repostOf.body,
            publishedAt: p.repostOf.publishedAt.toISOString(),
            author: p.repostOf.author.profile,
            cover: (p.repostOf.media[0]?.media.variants as Record<string, string> | undefined) ?? null,
          }
        : null,
    poll: pollView(p, viewer),
    counts: { likes: p.likeCount, comments: p.commentCount, saves: p.saveCount, reposts: p.repostCount },
    viewer: { liked: viewer.liked.has(p.id), saved: viewer.saved.has(p.id), isAuthor: viewer.id === p.authorId, isCoauthor: !!viewer.id && p.coauthors.some((c) => c.user.id === viewer.id) },
  };
}

async function viewerState(viewerId: string | null | undefined, ids: string[]): Promise<ViewerState> {
  if (!viewerId || !ids.length) return { liked: new Set<string>(), saved: new Set<string>(), votes: new Map(), id: viewerId };
  const [likes, saves, votes] = await Promise.all([
    db.reaction.findMany({ where: { userId: viewerId, targetType: "POST", targetId: { in: ids } }, select: { targetId: true } }),
    db.bookmark.findMany({ where: { userId: viewerId, targetType: "POST", targetId: { in: ids } }, select: { targetId: true } }),
    db.pollVote.findMany({ where: { userId: viewerId, poll: { postId: { in: ids } } }, select: { pollId: true, optionId: true } }),
  ]);
  const byPoll = new Map<string, string[]>();
  for (const v of votes) byPoll.set(v.pollId, [...(byPoll.get(v.pollId) ?? []), v.optionId]);
  return { liked: new Set(likes.map((l) => l.targetId)), saved: new Set(saves.map((s) => s.targetId)), votes: byPoll, id: viewerId };
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
        OR: [
          { authorId: { in: [...rel.following, viewerId] } },
          { coauthors: { some: { status: "ACCEPTED", userId: { in: [...rel.following, viewerId] } } } },
          ...(followedProjects.length ? [{ projectId: { in: followedProjects.map((p) => p.projectId) } }] : [])],
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
  // Ungültiger Cursor (manipuliert/alt) → von vorn beginnen statt Fehler
  const asOfParsed = asOfRaw ? new Date(Number(asOfRaw)) : null;
  const asOf = asOfParsed && !Number.isNaN(asOfParsed.getTime()) ? asOfParsed : new Date();
  const offset = Math.max(0, Math.min(10_000, Math.floor(Number(offsetRaw ?? 0)) || 0));
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
    const orig = await db.post.findUnique({ where: { id: data.repostOfId }, select: { authorId: true, visibility: true, state: true, communityId: true } });
    // Community-Beiträge bleiben in ihrer Community (auch öffentliche – Mitglieder teilen dort, nicht im Profil)
    if (!orig || orig.communityId || !(await canViewContent(user.id, { ownerId: orig.authorId, visibility: orig.visibility, state: orig.state })) || orig.visibility !== "PUBLIC") {
      throw fail.invalid("Dieser Beitrag kann nicht geteilt werden.");
    }
  }
  // Koautor:innen vorab prüfen – lieber gar nicht veröffentlichen als halb
  const { validateCoauthorHandles, inviteCoauthors } = await import("./coauthors");
  if (data.coauthors?.length) {
    if (data.repostOfId || extra.communityId) throw fail.invalid("Koautor:innen gibt es nur bei eigenen Beiträgen ausserhalb von Communities.");
    await validateCoauthorHandles(user, data.coauthors);
  }
  const later = data.publish !== "now";
  if (later) {
    const drafts = await db.post.count({ where: { authorId: user.id, state: "DRAFT", articleId: null } });
    if (drafts >= 100) throw fail.invalid("Du hast bereits 100 Entwürfe. Veröffentliche oder lösche zuerst einige.");
  }
  const post = await db.$transaction(async (tx) => {
    const p = await tx.post.create({
      data: {
        authorId: user.id,
        ...(later ? { state: "DRAFT" as const, scheduledAt: data.publish === "schedule" ? data.scheduledAt : null, publishedAt: data.scheduledAt ?? new Date() } : {}),
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
    if (data.poll) {
      await tx.poll.create({
        data: {
          postId: p.id,
          endsAt: new Date(Date.now() + data.poll.durationHours * 3600_000),
          multiple: data.poll.multiple,
          options: { create: data.poll.options.map((label, position) => ({ label, position })) },
        },
      });
    }
    if (later) return p; // Entwurf: keine Zähler, kein Feed, keine Benachrichtigungen – erst bei Veröffentlichung
    if (data.repostOfId) await tx.post.update({ where: { id: data.repostOfId }, data: { repostCount: { increment: 1 } } });
    await tx.userProfile.update({ where: { userId: user.id }, data: { postCount: { increment: 1 } } });
    await emit({ type: "PostPublished", postId: p.id, authorId: user.id }, tx);
    return p;
  });
  if (!later) await notifyMentions(data.body, user.id, post.id);
  if (data.coauthors?.length) await inviteCoauthors(user, post.id, data.coauthors);
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
        ...(post.state === "DRAFT" ? {} : { editedAt: new Date() }),
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
    scheduledAt: p.scheduledAt?.toISOString() ?? null,
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
  if (post.state === "DRAFT") {
    // Nie veröffentlicht → endgültig löschen
    await db.post.delete({ where: { id: postId } });
    return;
  }
  await db.$transaction([
    db.post.update({ where: { id: postId }, data: { state: "REMOVED" } }),
    ...(post.state === "PUBLISHED" ? [db.userProfile.update({ where: { userId: post.authorId }, data: { postCount: { decrement: 1 } } })] : []),
  ]);
}

/** Beiträge privater Communities sind nur für aktive Mitglieder sichtbar (§15.1). */
export async function canViewCommunityContentOf(communityId: string, viewerId: string | null) {
  const c = await db.community.findUnique({ where: { id: communityId }, select: { visibility: true, state: true } });
  if (!c || c.state === "REMOVED") return false;
  if (c.visibility !== "PRIVATE") return true;
  if (!viewerId) return false;
  // Plattform-Moderation nur mit aktiver Zwei-Faktor-Anmeldung (wie im Admin-Bereich)
  const viewer = await db.user.findUnique({ where: { id: viewerId }, select: { role: true, totpEnabledAt: true } });
  if (viewer && hasRole(viewer, "PLATFORM_MODERATOR")) return true;
  const m = await db.communityMember.findUnique({ where: { communityId_userId: { communityId, userId: viewerId } }, select: { state: true } });
  return m?.state === "ACTIVE";
}

export async function getPostForViewer(postId: string, viewerId: string | null) {
  const p = await db.post.findUnique({ where: { id: postId }, select: { authorId: true, visibility: true, state: true, communityId: true, scheduledAt: true } });
  if (!p || !(await canViewContent(viewerId, { ownerId: p.authorId, visibility: p.visibility, state: p.state }))) return null;
  if (p.communityId && !(await canViewCommunityContentOf(p.communityId, viewerId))) return null;
  const view = (await hydratePosts([postId], viewerId))[0] ?? null;
  // Für die Autorin/den Autor sichtbar machen, dass der Beitrag nicht öffentlich ist
  return view
    ? { ...view, moderationState: p.state === "HIDDEN" || p.state === "REMOVED" ? p.state : null, draft: p.state === "DRAFT" ? { scheduledAt: p.scheduledAt?.toISOString() ?? null } : null }
    : null;
}

// ───────────────────────── Umfragen ─────────────────────────

/** Stimme abgeben (einmalig, nicht änderbar). Bei Mehrfachauswahl mehrere Antworten auf einmal. */
export async function votePoll(user: SessionUser, postId: string, optionIds: string[]) {
  await limit("like", user.id);
  const post = await db.post.findUnique({ where: { id: postId }, select: { id: true, authorId: true, visibility: true, state: true, communityId: true, poll: { select: { id: true, endsAt: true, multiple: true, options: { select: { id: true } } } } } });
  if (!post?.poll || !(await canViewContent(user.id, { ownerId: post.authorId, visibility: post.visibility, state: post.state }))) throw fail.notFound("Umfrage nicht gefunden.");
  if (post.communityId && !(await canViewCommunityContentOf(post.communityId, user.id))) throw fail.notFound("Umfrage nicht gefunden.");
  const poll = post.poll;
  if (post.state === "DRAFT") throw fail.conflict("Diese Umfrage startet erst mit der Veröffentlichung.");
  if (poll.endsAt.getTime() <= Date.now()) throw fail.conflict("Diese Umfrage ist bereits beendet.");
  const chosen = [...new Set(optionIds)];
  const valid = new Set(poll.options.map((o) => o.id));
  if (!chosen.length || chosen.some((id) => !valid.has(id))) throw fail.invalid("Bitte wähle eine Antwort.");
  if (!poll.multiple && chosen.length > 1) throw fail.invalid("Hier ist nur eine Antwort möglich.");
  try {
    await db.$transaction(async (tx) => {
      // Gleichzeitige Stimmen derselben Person (verschiedene Optionen) nacheinander prüfen
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`poll-vote:${poll.id}:${user.id}`}))`;
      if (await tx.pollVote.findFirst({ where: { pollId: poll.id, userId: user.id }, select: { pollId: true } })) throw fail.conflict("Du hast bereits abgestimmt.");
      await tx.pollVote.createMany({ data: chosen.map((optionId) => ({ pollId: poll.id, optionId, userId: user.id })) });
      await tx.pollOption.updateMany({ where: { id: { in: chosen } }, data: { voteCount: { increment: 1 } } });
      await tx.poll.update({ where: { id: poll.id }, data: { voterCount: { increment: 1 } } });
    });
  } catch (e) {
    // Doppelklick/zwei Tabs: Primärschlüssel verhindert doppelte Stimmen
    if ((e as { code?: string }).code === "P2002") throw fail.conflict("Du hast bereits abgestimmt.");
    throw e;
  }
  const [view] = await hydratePosts([postId], user.id);
  return view?.poll ?? null;
}

/** Beendete Umfragen: Autor:in benachrichtigen (Worker, minütlich). */
export async function notifyEndedPolls() {
  const ended = await db.poll.findMany({ where: { endsAt: { lte: new Date() }, endNotifiedAt: null }, take: 100, select: { id: true, voterCount: true, post: { select: { id: true, authorId: true, body: true } } } });
  for (const p of ended) {
    const claimed = await db.poll.updateMany({ where: { id: p.id, endNotifiedAt: null }, data: { endNotifiedAt: new Date() } });
    if (!claimed.count) continue;
    await notify({
      recipientId: p.post.authorId,
      type: "PROJECT_ACTIVITY",
      targetType: "POST",
      targetId: p.post.id,
      data: { kind: "POLL_ENDED", message: `Deine Umfrage ist beendet – ${p.voterCount} ${p.voterCount === 1 ? "Stimme" : "Stimmen"}.`, excerpt: p.post.body.slice(0, 120), href: `/beitrag/${p.post.id}` },
      bundle: false,
    }).catch(() => {});
  }
  return ended.length;
}

// ───────────────────────── Entwürfe & geplante Veröffentlichung ─────────────────────────

/**
 * Entwurf veröffentlichen (atomar, genau einmal): Zähler, Feed-Verteilung, Erwähnungen.
 * Umfragen laufen ab dem Veröffentlichungszeitpunkt (Laufzeit wird verschoben).
 */
async function publishDraftNow(postId: string) {
  const now = new Date();
  const done = await db.$transaction(async (tx) => {
    const p = await tx.post.findUnique({ where: { id: postId }, select: { authorId: true, state: true, createdAt: true, body: true, poll: { select: { id: true, endsAt: true } } } });
    if (!p || p.state !== "DRAFT") return null;
    const claimed = await tx.post.updateMany({ where: { id: postId, state: "DRAFT" }, data: { state: "PUBLISHED", publishedAt: now, scheduledAt: null } });
    if (!claimed.count) return null;
    if (p.poll) await tx.poll.update({ where: { id: p.poll.id }, data: { endsAt: new Date(p.poll.endsAt.getTime() + (now.getTime() - p.createdAt.getTime())) } });
    await tx.userProfile.update({ where: { userId: p.authorId }, data: { postCount: { increment: 1 } } });
    await emit({ type: "PostPublished", postId, authorId: p.authorId }, tx);
    return p;
  });
  if (done) {
    await notifyMentions(done.body, done.authorId, postId);
    const { releaseQueuedCoauthorInvites } = await import("./coauthors");
    await releaseQueuedCoauthorInvites(postId);
  }
  return done;
}

async function ownDraft(user: SessionUser, postId: string) {
  const p = await db.post.findUnique({ where: { id: postId }, select: { authorId: true, state: true, body: true, _count: { select: { media: true } } } });
  if (!p || p.authorId !== user.id) throw fail.notFound();
  if (p.state !== "DRAFT") throw fail.conflict("Dieser Beitrag ist bereits veröffentlicht.");
  return p;
}

/** Jetzt veröffentlichen. */
export async function publishDraft(user: SessionUser, postId: string) {
  const p = await ownDraft(user, postId);
  if (!p.body.trim() && !p._count.media) throw fail.invalid("Ein Beitrag braucht Text oder Medien.");
  await limit("post", user.id);
  await publishDraftNow(postId);
  return { id: postId };
}

/** Zeitpunkt setzen (planen) oder entfernen (bleibt Entwurf). */
export async function scheduleDraft(user: SessionUser, postId: string, at: Date | null) {
  await ownDraft(user, postId);
  if (at && !isValidSchedule(at)) throw fail.invalid("Wähle einen Zeitpunkt zwischen 5 Minuten und einem Jahr ab jetzt.", { scheduledAt: "Ungültiger Zeitpunkt" });
  await db.post.update({ where: { id: postId }, data: { scheduledAt: at, ...(at ? { publishedAt: at } : {}) } });
  return { id: postId, scheduledAt: at?.toISOString() ?? null };
}

/** Eigene Entwürfe und geplante Beiträge (geplante zuerst, nach Zeitpunkt). */
export async function listDrafts(userId: string, take = 50) {
  const rows = await db.post.findMany({
    where: { authorId: userId, state: "DRAFT", articleId: null, communityId: null },
    orderBy: [{ scheduledAt: { sort: "asc", nulls: "last" } }, { updatedAt: "desc" }],
    take,
    select: { id: true },
  });
  const views = await hydratePosts(rows.map((r) => r.id), userId);
  const sched = new Map((await db.post.findMany({ where: { id: { in: rows.map((r) => r.id) } }, select: { id: true, scheduledAt: true } })).map((r) => [r.id, r.scheduledAt]));
  return views.map((v) => ({ ...v, scheduledAt: sched.get(v.id)?.toISOString() ?? null }));
}

/** Worker (minütlich): fällige geplante Beiträge veröffentlichen und Autor:in informieren. */
export async function publishScheduledPosts() {
  // Gesperrte/gebannte Konten veröffentlichen nichts (keine Benachrichtigungen in ihrem Namen)
  const due = await db.post.findMany({ where: { state: "DRAFT", scheduledAt: { lte: new Date() }, author: { status: "ACTIVE" } }, orderBy: { scheduledAt: "asc" }, take: 50, select: { id: true } });
  let n = 0;
  for (const d of due) {
    const p = await publishDraftNow(d.id);
    if (!p) continue;
    n++;
    await notify({
      recipientId: p.authorId,
      type: "PROJECT_ACTIVITY",
      targetType: "POST",
      targetId: d.id,
      bundle: false,
      data: { kind: "SCHEDULED_PUBLISHED", message: "Dein geplanter Beitrag ist jetzt online.", excerpt: p.body.slice(0, 120), href: `/beitrag/${d.id}` },
    }).catch(() => {});
  }
  return n;
}
