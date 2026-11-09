import "server-only";
import * as comp from "@/server/communities/competitions";
import { fail } from "@/server/errors";
import { requireCommunityModerator } from "@/server/authz";
import * as cs from "@/server/communities/service";
import * as ev from "@/server/communities/events";
import * as blog from "@/server/blog/service";
import { recordViewAfter } from "@/server/analytics/service";
import * as msg from "@/server/messaging/service";
import * as groups from "@/server/messaging/groups";
import { listNotifications, markNotificationsRead, unreadByFilter } from "@/server/notifications-inbox";
import { browseCategories, categoryOptions, effectiveCategories } from "@/server/categories/settings";
import { z } from "zod";
import { DELETE, GET, PATCH, POST, PUT, me, meAllowSuspended, need, str, takeParam, viewer, viewerId, zBool, zId, zIds, zStr, type RouteDef } from "../router";

type RoleKind = "ADMIN" | "MODERATOR" | "MEMBER";

/** Communities, Blog, Nachrichten, Benachrichtigungen (PRD §14, §15, §16, §19). */
export const communityRoutes: RouteDef[] = [
  // ── Communities ──
  GET("/communities/home", async () => {
    const vid = await viewerId();
    const [mine, invites, featured, all, counts, categories] = await Promise.all([
      vid ? cs.listCommunities({ memberOf: vid, viewerId: vid, take: 20 }) : Promise.resolve({ items: [], nextCursor: null }),
      vid ? cs.viewerInvitations(vid) : Promise.resolve([]),
      cs.listCommunities({ featured: true, viewerId: vid, take: 6 }),
      cs.listCommunities({ viewerId: vid, take: 60 }),
      cs.communityCategoryCounts(),
      browseCategories(),
    ]);
    return { mine: mine.items, invites, featured: featured.items, all: all.items, counts, categories };
  }),
  GET("/communities", async (c) => cs.listCommunities({ q: str(c.q, "q"), category: str(c.q, "category"), viewerId: await viewerId(), take: takeParam(c.q, "take", 24) }, str(c.q, "cursor") ?? null)),
  POST("/communities", async (c) => cs.createCommunity(await me(), await c.json())),
  GET("/communities/by-slug/:slug", async (c) => {
    const v = await viewer();
    const data = need(await cs.getCommunityPage(c.p.slug!, v), "Community nicht gefunden.");
    const d = data as unknown as { community?: { id: string }; canView?: boolean };
    const id = d.community?.id;
    let pinned: unknown[] = [];
    let feed: unknown = { items: [], nextCursor: null };
    if (id && (await cs.canViewCommunityPost(id, v))) {
      [pinned, feed] = await Promise.all([cs.listPinnedPosts(id, v?.id ?? null), cs.listCommunityPosts(id, v?.id ?? null)]);
    }
    return { ...(data as object), pinned, feed };
  }),
  GET("/communities/:id/posts", async (c) => {
    const v = await viewer();
    if (!(await cs.canViewCommunityPost(c.p.id!, v))) return { items: [], nextCursor: null };
    return cs.listCommunityPosts(c.p.id!, v?.id ?? null, str(c.q, "cursor") ?? null);
  }),
  GET("/communities/:id/members", async (c) => {
    // Mitgliederliste nur, wenn die Community für diese Person sichtbar ist (private Communities)
    if (!(await cs.canViewCommunityPost(c.p.id!, await viewer()))) return { items: [], nextCursor: null };
    return cs.listMembers(c.p.id!, { q: str(c.q, "q"), take: takeParam(c.q, "take", 60, 100), cursor: str(c.q, "cursor") ?? null, viewerId: await viewerId() });
  }),
  GET("/communities/:id/projects", async (c) => {
    const v = await viewer();
    if (!(await cs.canViewCommunityPost(c.p.id!, v))) return { projects: [], shareable: [] };
    const [projects, shareable] = await Promise.all([cs.listCommunityProjects(c.p.id!, v?.id ?? null), v ? cs.shareableProjects(v.id, c.p.id!) : Promise.resolve([])]);
    return { projects, shareable };
  }),
  // Wettbewerbe
  GET("/competitions", async () => comp.listCompetitions(await viewer())),
  GET("/competitions/:id", async (c) => need(await comp.getCompetition(c.p.id!, await viewer()), "Wettbewerb nicht gefunden.")),
  GET("/competitions/:id/project-options", async () => comp.entryProjectOptions((await me()).id)),
  POST("/competitions/:id/entry", async (c) => comp.submitEntry(await me(), c.p.id!, await c.json<unknown>())),
  DELETE("/competitions/:id/entry", async (c) => comp.withdrawEntry(await me(), c.p.id!)),
  POST("/competitions/:id/results", async (c) => {
    const { places } = await c.body({ places: z.array(z.object({ entryId: zId, place: z.number().int() })).max(100).optional() });
    return comp.publishJuryResult(await me(), c.p.id!, places ?? []);
  }),
  POST("/competition-entries/:id/vote", async (c) => {
    const { on } = await c.body({ on: zBool });
    return comp.voteEntry(await me(), c.p.id!, on !== false);
  }),
  DELETE("/competition-entries/:id", async (c) => comp.removeEntry(await me(), c.p.id!)),
  GET("/communities/:id/challenges", async (c) => ((await cs.canViewCommunityPost(c.p.id!, await viewer())) ? cs.listChallenges(c.p.id!) : [])),
  GET("/communities/:id/manage", async (c) => {
    // Nur Community-Leitung bzw. Plattform-Moderation (wie /c/[slug]/verwalten im Web)
    const u = await requireCommunityModerator(c.p.id!);
    const [requests, invited, banned, hidden, challenges, log, members, categories] = await Promise.all([
      cs.listByState(c.p.id!, "PENDING"),
      cs.listByState(c.p.id!, "INVITED"),
      cs.listByState(c.p.id!, "BANNED"),
      cs.listHiddenPosts(c.p.id!, u.id),
      cs.listChallenges(c.p.id!),
      cs.moderationLog(c.p.id!),
      cs.listMembers(c.p.id!, { q: str(c.q, "q"), take: 100 }),
      categoryOptions(),
    ]);
    return { requests, invited, banned, hidden, challenges, log, members, categories };
  }),
  PATCH("/communities/:id", async (c) => cs.updateCommunity(c.p.id!, await c.json())),
  DELETE("/communities/:id", async (c) => {
    const { confirm } = await c.body({ confirm: zStr });
    return cs.deleteCommunity(await me(), c.p.id!, String(confirm ?? ""));
  }),
  PUT("/communities/:id/rules", async (c) => {
    const { rules } = await c.body({ rules: z.unknown() });
    await cs.setRules(c.p.id!, rules ?? []);
    return { ok: true };
  }),
  // ── Events ──
  GET("/events", async (c) => {
    const mode = str(c.q, "mode");
    return ev.eventsOverview(await viewer(), { mode: mode === "ONLINE" || mode === "IN_PERSON" ? mode : null, category: str(c.q, "category") ?? null });
  }),
  GET("/events/:id", async (c) => need(await ev.getEvent(c.p.id!, await viewer()), "Event nicht gefunden.")),
  GET("/communities/:id/events", async (c) => {
    // Wie im Web: Events privater/versteckter Communities nur für Berechtigte
    const v = await viewer();
    if (!(await cs.canViewCommunityPost(c.p.id!, v))) return [];
    return ev.listCommunityEvents(c.p.id!, v, str(c.q, "when") === "past" ? "past" : "upcoming");
  }),
  POST("/communities/:id/events", async (c) => ev.createEvent(await me(), c.p.id!, await c.json())),
  PATCH("/events/:id", async (c) => ev.updateEvent(await me(), c.p.id!, await c.json())),
  POST("/events/:id/cancel", async (c) => ev.cancelEvent(await me(), c.p.id!, (await c.body({ reason: zStr })).reason ?? "")),
  // { status: "GOING" | "INTERESTED" | null }
  POST("/events/:id/rsvp", async (c) => {
    const s = (await c.body({ status: z.string().nullish() })).status;
    return ev.setAttendance(await me(), c.p.id!, s === "GOING" || s === "INTERESTED" ? s : null);
  }),

  POST("/communities/:id/join", async (c) => cs.joinCommunity(await me(), c.p.id!)),
  POST("/communities/:id/leave", async (c) => cs.leaveCommunity(await me(), c.p.id!)),
  POST("/communities/:id/requests/:userId", async (c) => {
    const { approve } = await c.body({ approve: zBool });
    await cs.decideRequest(c.p.id!, c.p.userId!, !!approve);
    return { ok: true };
  }),
  POST("/communities/:id/invite", async (c) => {
    const { handle } = await c.body({ handle: zStr });
    return cs.inviteMember(c.p.id!, String(handle ?? ""));
  }),
  DELETE("/communities/:id/invite/:userId", async (c) => {
    await cs.revokeInvite(c.p.id!, c.p.userId!);
    return { ok: true };
  }),
  POST("/communities/:id/members/:userId/role", async (c) => {
    const { role } = await c.body({ role: z.string().optional() });
    if (!["ADMIN", "MODERATOR", "MEMBER"].includes(role ?? "")) throw fail.invalid("Unbekannte Rolle.");
    await cs.setMemberRole(c.p.id!, c.p.userId!, role as RoleKind);
    return { ok: true };
  }),
  POST("/communities/:id/members/:userId/transfer", async (c) => cs.transferOwnership(c.p.id!, c.p.userId!)),
  POST("/communities/:id/members/:userId/remove", async (c) => {
    const b = await c.body({ ban: zBool, reason: zStr });
    await cs.removeMember(c.p.id!, c.p.userId!, { ban: !!b.ban, reason: b.reason });
    return { ok: true };
  }),
  POST("/communities/:id/members/:userId/unban", async (c) => {
    await cs.unbanMember(c.p.id!, c.p.userId!);
    return { ok: true };
  }),
  POST("/communities/:id/members/:userId/mute", async (c) => {
    const b = await c.body({ until: z.string().max(64).nullish(), reason: zStr });
    const d = b.until ? new Date(b.until) : null;
    if (d && Number.isNaN(d.getTime())) throw fail.invalid("Ungültiges Datum.");
    await cs.muteMember(c.p.id!, c.p.userId!, d, b.reason);
    return { ok: true };
  }),
  POST("/communities/:id/posts", async (c) => cs.createCommunityPost(await me(), c.p.id!, await c.json())),
  POST("/communities/:id/posts/:postId/pinned", async (c) => {
    const { on } = await c.body({ on: zBool });
    await cs.setPostPinned(c.p.id!, c.p.postId!, !!on);
    return { ok: true };
  }),
  POST("/communities/:id/posts/:postId/hidden", async (c) => {
    const { on, reason } = await c.body({ on: zBool, reason: zStr });
    await cs.setPostHidden(c.p.id!, c.p.postId!, !!on, reason);
    return { ok: true };
  }),
  POST("/communities/:id/posts/:postId/announcement", async (c) => {
    const { on } = await c.body({ on: zBool });
    await cs.setPostAnnouncement(c.p.id!, c.p.postId!, !!on);
    return { ok: true };
  }),
  POST("/communities/:id/projects", async (c) => {
    const { projectId } = await c.body({ projectId: zId.optional() });
    if (!projectId) throw fail.invalid("projectId fehlt.");
    await cs.addCommunityProject(await me(), c.p.id!, projectId);
    return { ok: true };
  }),
  DELETE("/communities/:id/projects/:projectId", async (c) => {
    await cs.removeCommunityProject(await me(), c.p.id!, c.p.projectId!);
    return { ok: true };
  }),
  POST("/communities/:id/challenges", async (c) => cs.createChallenge(c.p.id!, await c.json())),
  DELETE("/communities/:id/challenges/:challengeId", async (c) => {
    await cs.deleteChallenge(c.p.id!, c.p.challengeId!);
    return { ok: true };
  }),

  // ── Blog (§14) ──
  GET("/blog/home", async () => {
    const vid = await viewerId();
    const [index, categories] = await Promise.all([blog.getBlogIndex(vid), blog.listArticleCategories()]);
    return { ...(index as object), categories };
  }),
  GET("/blog/categories", async () => blog.listArticleCategories()),
  GET("/blog/articles", async (c) => blog.listArticles({ q: str(c.q, "q"), category: str(c.q, "category"), tag: str(c.q, "tag"), viewerId: await viewerId(), take: takeParam(c.q, "take", 18) }, str(c.q, "cursor") ?? null)),
  GET("/blog/read/:handle/:slug", async (c) => {
    const vid = await viewerId();
    const res = need(await blog.getArticleForReader(c.p.handle!, c.p.slug!, vid), "Artikel nicht gefunden.");
    if (res.kind === "redirect") return { redirect: res.to };
    const r = res as unknown as { article: { id: string; authorId: string; categoryId: string | null; tags: string[]; projects: { projectId: string }[] }; isLive: boolean; isAuthor: boolean };
    const [related, projects] = await Promise.all([r.isLive ? blog.relatedArticles(r.article, vid) : Promise.resolve([]), blog.linkedProjects(r.article.projects.map((p) => p.projectId))]);
    if (r.isLive && !r.isAuthor) await recordViewAfter({ viewerId: vid, targetType: "ARTICLE", targetId: r.article.id, ref: "ios" });
    return { ...(res as object), related, linkedProjects: projects };
  }),
  GET("/studio/articles", async (c) => blog.listMyArticles((await me()).id, str(c.q, "state") as never)),
  GET("/studio/articles/editor", async (c) => {
    const u = await me();
    const id = str(c.q, "id");
    const [article, categories, projects] = await Promise.all([id ? blog.getArticleForEdit(u, id) : Promise.resolve(null), blog.listArticleCategories(), blog.myProjectOptions(u.id)]);
    if (id && !article) throw fail.notFound("Artikel nicht gefunden.");
    return { article, categories, projects };
  }),
  POST("/studio/articles", async (c) => blog.saveArticle(await me(), null, await c.json())),
  PUT("/studio/articles/:id", async (c) => blog.saveArticle(await me(), c.p.id!, await c.json())),
  POST("/studio/articles/:id/publish", async (c) => blog.publishArticle(await me(), c.p.id!, await c.json())),
  POST("/studio/articles/:id/unpublish", async (c) => blog.unpublishArticle(await me(), c.p.id!)),
  DELETE("/studio/articles/:id", async (c) => {
    await blog.deleteArticle(await me(), c.p.id!);
    return { ok: true };
  }),
  GET("/studio/articles/:id/revisions", async (c) => blog.listRevisions(await me(), c.p.id!)),
  POST("/studio/articles/:id/revisions/:revisionId/restore", async (c) => blog.restoreRevision(await me(), c.p.id!, c.p.revisionId!)),
  GET("/embeds", async (c) => blog.searchOwnEmbeds(await me(), str(c.q, "type") ?? "", str(c.q, "q") ?? "")),

  // ── Nachrichten (§16) ──
  GET("/conversations", async (c) => {
    const u = await me();
    const box = (["inbox", "requests", "archived"].includes(c.q.get("box") ?? "") ? c.q.get("box") : "inbox") as msg.InboxBox;
    const [items, counts] = await Promise.all([msg.listConversations(u.id, box), msg.inboxCounts(u.id)]);
    return { items, counts };
  }),
  POST("/conversations", async (c) => msg.startConversation(await me(), await c.json())),
  // ── Gruppenchats ──
  // { title, handles: string[], body? }
  POST("/conversations/groups", async (c) => groups.createGroup(await me(), await c.json())),
  GET("/conversations/groups/candidates", async () => groups.groupCandidates(await me())),
  POST("/conversations/:id/members", async (c) => groups.addGroupMembers(await me(), c.p.id!, await c.json())),
  DELETE("/conversations/:id/members/:userId", async (c) => groups.removeGroupMember(await me(), c.p.id!, c.p.userId!)),
  POST("/conversations/:id/members/:userId/admin", async (c) => groups.setGroupAdmin(await me(), c.p.id!, c.p.userId!, !!(await c.body({ admin: zBool })).admin)),
  POST("/conversations/:id/leave", async (c) => groups.leaveGroup(await me(), c.p.id!)),
  PATCH("/conversations/:id", async (c) => groups.renameGroup(await me(), c.p.id!, (await c.body({ title: zStr })).title)),
  GET("/conversations/prepare", async (c) => {
    const handle = str(c.q, "handle");
    if (!handle) throw fail.invalid("handle fehlt.");
    return msg.prepareConversation(await me(), { handle, orderId: str(c.q, "orderId") ?? null, productId: str(c.q, "productId") ?? null });
  }),
  GET("/conversations/:id", async (c) => msg.getThread(await me(), c.p.id!, { before: str(c.q, "before") })),
  GET("/conversations/:id/messages", async (c) => msg.messagesSince(await me(), c.p.id!, str(c.q, "after") ?? null)),
  POST("/conversations/:id/messages", async (c) => msg.sendMessage(await me(), c.p.id!, await c.json())),
  POST("/conversations/:id/read", async (c) => msg.markRead(await me(), c.p.id!)),
  POST("/conversations/:id/archive", async (c) => {
    const { archived } = await c.body({ archived: zBool });
    return msg.setArchived(await me(), c.p.id!, archived !== false);
  }),
  POST("/conversations/:id/respond", async (c) => {
    const { accept } = await c.body({ accept: zBool });
    return msg.respondToRequest(await me(), c.p.id!, !!accept);
  }),

  // ── Benachrichtigungen (§19) ──
  GET("/notifications", async (c) => {
    const u = await meAllowSuspended();
    const [page, unread] = await Promise.all([
      listNotifications(u.id, { filter: str(c.q, "filter") ?? null, cursor: str(c.q, "cursor") ?? null, limit: takeParam(c.q, "limit", 30, 100), unreadOnly: c.q.get("unread") === "1" }),
      unreadByFilter(u.id),
    ]);
    return { ...page, unread };
  }),
  POST("/notifications/read", async (c) => {
    const u = await meAllowSuspended();
    const b = await c.body({ all: zBool, ids: zIds });
    if (b.all) return markNotificationsRead(u.id, "all");
    if (!b.ids?.length) throw fail.invalid("ids fehlen.");
    return markNotificationsRead(u.id, b.ids.slice(0, 200));
  }),

  GET("/categories/all", async () => effectiveCategories()),
];
