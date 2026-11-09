import "server-only";
import { z } from "zod";
import { db, type Prisma } from "@/server/db";
import { fail } from "@/server/errors";
import * as posts from "@/server/social/posts";
import * as ix from "@/server/social/interactions";
import * as coauthors from "@/server/social/coauthors";
import { activeProjectsOf, suggestedCommunities, suggestedCreators, trendingProjects } from "@/server/discovery/suggestions";
import { categoryOptions } from "@/server/categories/settings";
import { isBlockedBetween, relationsFor } from "@/server/visibility";
import { listProjects } from "@/server/projects/service";
import { listTutorials } from "@/server/tutorials/service";
import { listArticles, resolveHandle } from "@/server/blog/service";
import { listPublicCollections } from "@/server/collections/service";
import { profileAwards } from "@/server/communities/competitions";
import { listGivenReviews, listReceivedReviews, profileReviewCounts, shopRatingDistribution } from "@/server/commerce/reviews";
import { decodeFollowCursor, encodeFollowCursor } from "../params";
import { DELETE, GET, PATCH, POST, me, need, str, takeParam, viewer, viewerId, zBool, zIds, zStr, type RouteDef } from "../router";

/**
 * Kommentarliste für die App. Ohne `paged=1`/`cursor` wie bisher nur die erste Seite als Liste
 * (ältere App-Versionen dekodieren ein Array); mit `paged=1` bzw. `cursor` → `{ items, nextCursor }`
 * für „Ältere Kommentare laden“.
 */
export async function commentsResponse(type: "POST" | "PROJECT" | "TUTORIAL" | "ARTICLE", id: string, q: URLSearchParams) {
  const cursor = str(q, "cursor") ?? null;
  const page = await ix.listCommentPage(type, id, await viewerId(), cursor);
  return cursor || q.get("paged") === "1" || q.get("paged") === "true" ? page : page.items;
}

const TARGET = z.enum(["POST", "COMMENT", "PROJECT", "TUTORIAL", "TUTORIAL_STEP", "PRODUCT", "USER", "MESSAGE", "ARTICLE", "COMMUNITY", "REVIEW"]);

/** Feed, Beiträge, Interaktionen, Profile (PRD §9, §12). */
export const socialRoutes: RouteDef[] = [
  // ── Feed ──
  GET("/feed", async (c) => {
    const kind = (["for-you", "following", "new"].includes(c.q.get("kind") ?? "") ? c.q.get("kind") : "for-you") as posts.FeedKind;
    const u = await viewer();
    return posts.getFeed(kind, u ? { id: u.id, interests: u.profile?.categories ?? [] } : null, str(c.q, "cursor") ?? null);
  }),
  /** Seitenleiste des Feeds (Werkbank, Vorschläge, Trends) + Composer-Optionen. */
  GET("/feed/context", async () => {
    const u = await me();
    const interests = u.profile.categories ?? [];
    const [workbench, creators, communities, trending, rel, projectOptions, categories] = await Promise.all([
      activeProjectsOf(u.id),
      suggestedCreators(u.id, interests, 6),
      suggestedCommunities(u.id, interests, 4),
      trendingProjects(5, u.id),
      relationsFor(u.id),
      db.project.findMany({ where: { ownerId: u.id, state: { not: "REMOVED" } }, orderBy: { updatedAt: "desc" }, take: 30, select: { id: true, title: true } }),
      categoryOptions(),
    ]);
    return {
      workbench: workbench.map((p) => ({ ...p, handle: u.profile.handle })),
      creators,
      communities,
      trending,
      isNew: rel.following.length === 0,
      projectOptions,
      categories,
    };
  }),

  // ── Beiträge ──
  GET("/posts/drafts", async () => posts.listDrafts((await me()).id)),
  GET("/posts/:id", async (c) => need(await posts.getPostForViewer(c.p.id!, await viewerId()))),
  POST("/posts", async (c) => {
    const u = await me();
    const p = await posts.createPost(u, await c.json());
    return posts.getPostForViewer(p.id, u.id);
  }),
  GET("/posts/:id/edit", async (c) => posts.getPostForEdit(await me(), c.p.id!)),
  PATCH("/posts/:id", async (c) => {
    const u = await me();
    await posts.updatePost(u, c.p.id!, await c.json());
    return posts.getPostForViewer(c.p.id!, u.id);
  }),
  DELETE("/posts/:id", async (c) => {
    await posts.deletePost(await me(), c.p.id!);
    return { ok: true };
  }),
  // Umfrage: { optionIds: string[] } → aktualisierte Umfrage (mit Ergebnissen)
  POST("/posts/:id/poll", async (c) => {
    const b = await c.body({ optionIds: zIds });
    return posts.votePoll(await me(), c.p.id!, b.optionIds ?? []);
  }),
  // ── Entwürfe & geplante Beiträge (Erstellen: POST /posts mit publish: "draft" | "schedule", scheduledAt) ──
  POST("/posts/:id/publish", async (c) => posts.publishDraft(await me(), c.p.id!)),
  // Koautorenschaft (§9.3)
  GET("/me/coauthor-candidates", async () => coauthors.coauthorCandidates((await me()).id)),
  GET("/me/coauthor-invites", async () => coauthors.myCoauthorInvites((await me()).id)),
  GET("/posts/:id/coauthors", async (c) => coauthors.listCoauthors(await me(), c.p.id!)),
  POST("/posts/:id/coauthors", async (c) => {
    const { handles } = await c.body({ handles: zIds });
    return coauthors.inviteCoauthors(await me(), c.p.id!, handles ?? []);
  }),
  POST("/posts/:id/coauthors/respond", async (c) => {
    const { accept } = await c.body({ accept: zBool });
    return coauthors.respondCoauthor(await me(), c.p.id!, !!accept);
  }),
  DELETE("/posts/:id/coauthors/me", async (c) => coauthors.leaveCoauthor(await me(), c.p.id!)),
  DELETE("/posts/:id/coauthors/:userId", async (c) => coauthors.removeCoauthor(await me(), c.p.id!, c.p.userId!)),
  // { scheduledAt: ISO | null }
  POST("/posts/:id/schedule", async (c) => {
    const at = (await c.body({ scheduledAt: z.string().max(64).nullish() })).scheduledAt;
    const when = at ? new Date(at) : null;
    if (when && Number.isNaN(when.getTime())) throw fail.invalid("Ungültiger Zeitpunkt.", { scheduledAt: "Ungültiger Zeitpunkt" });
    return posts.scheduleDraft(await me(), c.p.id!, when);
  }),
  POST("/posts/:id/repost", async (c) => {
    const u = await me();
    const { body } = await c.body({ body: zStr });
    const p = await posts.createPost(u, { body: String(body ?? ""), repostOfId: c.p.id!, media: [] });
    return posts.getPostForViewer(p.id, u.id);
  }),

  // ── Interaktionen ──
  POST("/likes", async (c) => {
    const b = z.object({ type: z.enum(["POST", "PROJECT", "TUTORIAL", "COMMENT", "ARTICLE"]), id: z.string().min(1), liked: z.boolean() }).parse(await c.json());
    return ix.setLike(await me(), b.type, b.id, b.liked);
  }),
  POST("/bookmarks", async (c) => {
    const b = z.object({ type: z.enum(["POST", "PROJECT", "TUTORIAL", "PRODUCT", "ARTICLE"]), id: z.string().min(1), saved: z.boolean(), collectionId: z.string().nullish() }).parse(await c.json());
    return ix.setBookmark(await me(), b.type, b.id, b.saved, b.collectionId);
  }),
  GET("/comments", async (c) => {
    const t = z.enum(["POST", "PROJECT", "TUTORIAL", "ARTICLE"]).safeParse(c.q.get("type"));
    const id = str(c.q, "id");
    if (!t.success || !id) throw fail.invalid("type und id erforderlich");
    return commentsResponse(t.data, id, c.q);
  }),
  POST("/comments", async (c) => {
    const b = z.object({ type: z.enum(["POST", "PROJECT", "TUTORIAL", "ARTICLE"]), id: z.string(), body: z.string(), parentId: z.string().optional() }).parse(await c.json());
    const r = await ix.createComment(await me(), b.type, b.id, { body: b.body, parentId: b.parentId });
    return { id: r.id };
  }),
  DELETE("/comments/:id", async (c) => {
    await ix.deleteComment(await me(), c.p.id!);
    return { ok: true };
  }),
  POST("/users/:id/follow", async (c) => {
    const { follow } = await c.body({ follow: zBool });
    return ix.setFollow(await me(), c.p.id!, follow !== false);
  }),
  POST("/users/:id/block", async (c) => {
    const { block } = await c.body({ block: zBool });
    return ix.setBlock(await me(), c.p.id!, block !== false);
  }),
  POST("/users/:id/mute", async (c) => {
    const { mute } = await c.body({ mute: zBool });
    return ix.setMute(await me(), c.p.id!, mute !== false);
  }),
  POST("/projects/:id/follow", async (c) => {
    const { follow } = await c.body({ follow: zBool });
    return ix.setProjectFollow(await me(), c.p.id!, follow !== false);
  }),
  POST("/hide", async (c) => {
    const b = z.object({ type: TARGET, id: z.string().min(1) }).parse(await c.json());
    await ix.hideContent(await me(), b.type, b.id);
    return { message: "Ausgeblendet. Wir zeigen dir weniger davon." };
  }),
  POST("/reports", async (c) => {
    const r = await ix.report(await me(), await c.json());
    return { ...(typeof r === "object" && r ? r : {}), message: "Danke. Deine Meldung wurde aufgenommen." };
  }),

  // ── Profile (§12) ──
  GET("/users/:handle", async (c) => {
    const handle = c.p.handle!.toLowerCase();
    let profile = await db.userProfile.findUnique({
      where: { handle },
      include: { user: { select: { id: true, status: true, createdAt: true, role: true, shop: { select: { id: true, slug: true, name: true, status: true, tagline: true } } } } },
    });
    if (!profile) {
      const r = await db.handleRedirect.findUnique({ where: { oldHandle: handle }, include: { profile: { select: { handle: true } } } });
      if (r) return { redirect: r.profile.handle };
      throw fail.notFound("Profil nicht gefunden.");
    }
    if (profile.user.status === "DELETED" || profile.user.status === "BANNED") throw fail.notFound("Profil nicht gefunden.");
    const v = await viewer();
    const vid = v?.id ?? null;
    const userId = profile.userId;
    const isSelf = vid === userId;
    const blocked = vid && !isSelf ? await isBlockedBetween(vid, userId) : false;
    const rel = await relationsFor(vid);
    const base = await posts.baseFeedWhere(vid, { includeMuted: true });
    const [projects, tutorials, postList, products, collections, articleCount, followsYou] = blocked
      ? [null, null, null, [], [], 0, false]
      : await Promise.all([
          listProjects({ ownerId: userId, sort: "updated" }, vid, { take: 24 }),
          listTutorials({ authorId: userId }, vid, { take: 12 }),
          posts.byAuthorsWhere([userId]).then((or) => posts.listPosts({ ...base, communityId: null, OR: or }, vid, { take: 12 })),
          profile.user.shop?.status === "ACTIVE"
            ? db.product.findMany({
                where: { shop: { ownerId: userId }, status: { in: ["ACTIVE", "SOLD_OUT"] } },
                orderBy: { publishedAt: "desc" },
                take: 12,
                select: { id: true, slug: true, title: true, priceMinor: true, currency: true, coverUrl: true, category: true, status: true },
              })
            : Promise.resolve([]),
          db.collection.findMany({ where: { ownerId: userId, ...(isSelf ? {} : { visibility: "PUBLIC" }) }, orderBy: { updatedAt: "desc" }, include: { _count: { select: { items: true } } } }),
          db.blogArticle.count({ where: { authorId: userId, state: "PUBLISHED" } }),
          vid && !isSelf ? db.follow.findUnique({ where: { followerId_followeeId: { followerId: userId, followeeId: vid } } }).then(Boolean) : Promise.resolve(false),
        ]);
    const p = profile;
    profile = null as never;
    const activeShop = p.user.shop?.status === "ACTIVE" ? p.user.shop : null;
    const [reviewCounts, awards] = blocked ? [{ given: 0, received: 0 }, []] : await Promise.all([profileReviewCounts(userId, activeShop?.id ?? null, vid), profileAwards(userId, v)]);
    return {
      profile: {
        userId: p.userId,
        handle: p.handle,
        displayName: p.displayName,
        bio: p.bio,
        avatarUrl: p.avatarUrl,
        coverUrl: p.coverUrl,
        region: p.region,
        country: p.country,
        website: p.website,
        pronouns: p.pronouns,
        links: Array.isArray(p.links) ? p.links : [],
        categories: p.categories,
        followerCount: p.followerCount,
        followingCount: p.followingCount,
        projectCount: p.projectCount,
        postCount: p.postCount,
        isCreatorPro: p.isCreatorPro,
        memberSince: p.user.createdAt,
        role: p.user.role,
        shop: p.user.shop,
      },
      viewer: { isSelf, following: rel.following.includes(userId), muted: rel.muted.includes(userId), blocked: !!blocked, followsYou },
      projects: projects?.items ?? [],
      tutorials: tutorials?.items ?? [],
      posts: postList?.items ?? [],
      postsCursor: postList?.nextCursor ?? null,
      products: (products as { slug: string }[]).map((x) => ({ ...x, shopSlug: p.user.shop?.slug ?? null })),
      collections: (collections as { id: string; title: string; description: string; visibility: string; _count: { items: number } }[]).map((x) => ({
        id: x.id,
        title: x.title,
        description: x.description,
        visibility: x.visibility,
        itemCount: x._count.items,
      })),
      articleCount,
      // Bewertungen: bei Shops immer (erhalten), sonst nur wenn selbst welche abgegeben → GET /users/:handle/reviews
      reviews: { given: reviewCounts.given, received: reviewCounts.received, show: !!activeShop || reviewCounts.given > 0, defaultView: activeShop ? "received" : "given" },
      // Gewinner-Abzeichen aus Wettbewerben
      awards,
    };
  }),
  GET("/users/:handle/reviews", async (c) => {
    const prof = need(await db.userProfile.findUnique({ where: { handle: c.p.handle!.toLowerCase() }, select: { userId: true, user: { select: { status: true, shop: { select: { id: true, status: true } } } } } }), "Profil nicht gefunden.");
    // Wie das Profil selbst: gesperrte/gelöschte Konten gibt es nach aussen nicht
    if (prof.user.status === "BANNED" || prof.user.status === "DELETED") throw fail.notFound("Profil nicht gefunden.");
    const vid = await viewerId();
    if (vid && vid !== prof.userId && (await isBlockedBetween(vid, prof.userId))) return { view: "given", items: [], distribution: null };
    const shop = prof.user.shop?.status === "ACTIVE" ? prof.user.shop : null;
    const view = str(c.q, "view") === "given" || !shop ? "given" : "received";
    const [items, distribution] = await Promise.all([
      view === "received" ? listReceivedReviews(shop!.id, vid) : listGivenReviews(prof.userId),
      view === "received" ? shopRatingDistribution(shop!.id) : Promise.resolve(null),
    ]);
    return { view, items, distribution };
  }),
  GET("/users/:handle/posts", async (c) => {
    const { prof, vid, blocked } = await visibleProfile(c.p.handle!);
    if (blocked) return { items: [], nextCursor: null };
    const base = await posts.baseFeedWhere(vid, { includeMuted: true });
    return posts.listPosts({ ...base, communityId: null, OR: await posts.byAuthorsWhere([prof.userId]) }, vid, { take: 20, cursor: str(c.q, "cursor") ?? null });
  }),
  GET("/users/:handle/blog", async (c) => {
    const h = need(await resolveHandle(c.p.handle!));
    if (h.kind === "redirect") return { redirect: h.handle };
    const vid = await viewerId();
    if (vid && vid !== h.profile.userId && (await isBlockedBetween(vid, h.profile.userId))) return { items: [], nextCursor: null };
    return listArticles({ authorId: h.profile.userId, tag: str(c.q, "tag"), viewerId: vid, take: takeParam(c.q, "take", 20) }, str(c.q, "cursor") ?? null);
  }),
  GET("/users/:handle/collections", async (c) => {
    const { prof, vid, blocked } = await visibleProfile(c.p.handle!);
    return blocked ? [] : listPublicCollections(prof.userId, vid);
  }),
  GET("/users/:handle/followers", async (c) => listFollows(c.p.handle!, "followers", str(c.q, "cursor"))),
  GET("/users/:handle/following", async (c) => listFollows(c.p.handle!, "following", str(c.q, "cursor"))),
];

/**
 * Profil für Unterseiten (Beiträge, Sammlungen, Follower): unbekannt, gesperrt oder gelöscht → 404;
 * `blocked`, wenn zwischen Betrachter:in und Profil eine Blockierung besteht (in beide Richtungen).
 */
async function visibleProfile(handle: string) {
  const prof = need(await db.userProfile.findUnique({ where: { handle: handle.toLowerCase() }, select: { userId: true, user: { select: { status: true } } } }), "Profil nicht gefunden.");
  if (prof.user.status === "BANNED" || prof.user.status === "DELETED") throw fail.notFound("Profil nicht gefunden.");
  const vid = await viewerId();
  const blocked = !!vid && vid !== prof.userId && (await isBlockedBetween(vid, prof.userId));
  return { prof, vid, blocked };
}

async function listFollows(handle: string, dir: "followers" | "following", rawCursor?: string) {
  const { prof, vid, blocked } = await visibleProfile(handle);
  if (blocked) return { items: [], nextCursor: null };
  const rel = await relationsFor(vid);
  const take = 40;
  // Manipulierter/alter Cursor → von vorn beginnen statt 500
  const cursor = decodeFollowCursor(rawCursor);
  // Gesperrte/gelöschte Konten und Blockierungen (beide Richtungen) schon in der Abfrage ausfiltern,
  // damit Seiten nicht leer laufen
  const other: Prisma.UserWhereInput = { status: { in: ["ACTIVE", "SUSPENDED"] }, profile: { isNot: null }, ...(rel.blocked.length ? { id: { notIn: rel.blocked } } : {}) };
  const rows = await db.follow.findMany({
    where: dir === "followers" ? { followeeId: prof.userId, follower: other } : { followerId: prof.userId, followee: other },
    orderBy: [{ createdAt: "desc" }, { followerId: "desc" }, { followeeId: "desc" }],
    take: take + 1,
    ...(cursor ? { cursor: { followerId_followeeId: cursor }, skip: 1 } : {}),
    select: {
      followerId: true,
      followeeId: true,
      follower: { select: { status: true, profile: { select: { handle: true, displayName: true, avatarUrl: true, bio: true } } } },
      followee: { select: { status: true, profile: { select: { handle: true, displayName: true, avatarUrl: true, bio: true } } } },
    },
  });
  const page = rows.slice(0, take);
  const items = page
    .map((r) => {
      const u = dir === "followers" ? r.follower : r.followee;
      const id = dir === "followers" ? r.followerId : r.followeeId;
      if (!u.profile || u.status === "DELETED" || u.status === "BANNED" || rel.blocked.includes(id)) return null;
      return { userId: id, ...u.profile, following: rel.following.includes(id), isSelf: id === vid };
    })
    .filter(Boolean);
  const last = page[page.length - 1];
  return {
    items,
    nextCursor: rows.length > take && last ? encodeFollowCursor(last) : null,
  };
}
