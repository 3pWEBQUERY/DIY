import "server-only";
import { fail } from "@/server/errors";
import * as studio from "@/server/analytics/studio";
import { listStudioProjects } from "@/server/projects/service";
import { listStudioTutorials } from "@/server/tutorials/service";
import { hasRole } from "@/server/authz";
import * as moderation from "@/server/moderation/service";
import * as users from "@/server/admin/users";
import * as content from "@/server/admin/content";
import { adminNavCounts, dashboardKpis } from "@/server/admin/kpis";
import { z } from "zod";
import { DELETE, GET, PATCH, POST, PUT, me, pageParam, str, zBool, zIds, zStr, type RouteDef } from "../router";
import { db } from "@/server/db";
import { flagEnabled } from "@/server/flags";
import * as pro from "@/server/pro/service";
import * as proProfile from "@/server/pro/profile";

async function moderator() {
  const u = await me();
  if (!hasRole(u, "PLATFORM_MODERATOR")) throw fail.forbidden();
  return u;
}

/** Werkuno Studio (PRD §20) und Moderation/Administration (PRD §24, rollenbasiert). */
export const studioAdminRoutes: RouteDef[] = [
  // ── Werkuno Studio ──
  // Creator Pro: Status, Preise, Abschluss (Stripe Checkout im Browser), Kündigung, Profilwerkzeuge
  GET("/studio/pro", async () => {
    const u = await me();
    const [status, prices, enabled, profile] = await Promise.all([
      pro.getProStatus(u.id),
      pro.proPrices(),
      flagEnabled("pro", u.id),
      db.userProfile.findUnique({ where: { userId: u.id }, select: { featuredProjectIds: true, mediaKitPublic: true, handle: true } }),
    ]);
    return { status, prices, enabled, featuredProjectIds: profile?.featuredProjectIds ?? [], mediaKitPublic: !!profile?.mediaKitPublic, mediaKitUrl: profile ? `/u/${profile.handle}/medienkit` : null, featuredMax: proProfile.FEATURED_MAX };
  }),
  POST("/studio/pro/checkout", async (c) => {
    const { interval } = await c.body({ interval: z.string().max(20).optional() });
    return { url: await pro.startProCheckout(await me(), interval) };
  }),
  POST("/studio/pro/cancel", async (c) => {
    const { cancel } = await c.body({ cancel: zBool });
    return pro.setProCancel(await me(), cancel !== false);
  }),
  PUT("/studio/pro/featured", async (c) => {
    const { ids } = await c.body({ ids: zIds });
    return proProfile.setFeaturedProjects(await me(), ids ?? []);
  }),
  PUT("/studio/pro/media-kit", async (c) => {
    const { public: value } = await c.body({ public: zBool });
    return proProfile.setMediaKitPublic(await me(), !!value);
  }),
  GET("/studio/overview", async () => {
    const u = await me();
    const [overview, heat] = await Promise.all([studio.studioOverview(u.id), studio.publishingHeat(u.id, 12)]);
    return { overview, heat };
  }),
  GET("/studio/content", async (c) => {
    const u = await me();
    return studio.listOwnContent(u.id, u.profile.handle, { type: (str(c.q, "type") as studio.OwnContentType | undefined) ?? null, state: (str(c.q, "state") as studio.OwnContentState | undefined) ?? null } as never);
  }),
  GET("/studio/stats", async () => studio.contentStats((await me()).id)),
  GET("/studio/projects", async () => listStudioProjects((await me()).id)),
  GET("/studio/tutorials", async () => listStudioTutorials((await me()).id)),
  GET("/studio/media", async (c) => {
    const f = (["all", "unused", "images", "videos", "files"].includes(c.q.get("filter") ?? "") ? c.q.get("filter") : "all") as "all";
    return studio.listMedia((await me()).id, f);
  }),
  PATCH("/studio/media/:id", async (c) => {
    const { alt } = await c.body({ alt: zStr });
    await studio.updateMediaAlt((await me()).id, c.p.id!, String(alt ?? ""));
    return { ok: true };
  }),
  DELETE("/studio/media/:id", async (c) => {
    await studio.deleteUnusedMedia((await me()).id, c.p.id!);
    return { ok: true };
  }),

  // ── Moderation (§24) ──
  GET("/admin/dashboard", async () => {
    const u = await moderator();
    const [kpis, counts] = await Promise.all([dashboardKpis({ includeMoney: hasRole(u, "ADMIN") }), adminNavCounts()]);
    return { kpis, counts, role: u.role };
  }),
  GET("/admin/queue", async (c) => {
    const u = await moderator();
    return moderation.listQueue(
      u,
      { status: (str(c.q, "status") as never) ?? "ACTIVE", targetType: (str(c.q, "targetType") as never) ?? null, assignee: (str(c.q, "assignee") as never) ?? null, q: str(c.q, "q") ?? null },
      pageParam(c.q),
      30,
    );
  }),
  GET("/admin/cases/:id", async (c) => moderation.getCaseDetail(await moderator(), c.p.id!)),
  POST("/admin/cases/:id/assign", async (c) => {
    const { assign } = await c.body({ assign: zBool });
    return moderation.assignCase(await moderator(), c.p.id!, assign !== false);
  }),
  POST("/admin/cases/:id/decide", async (c) => moderation.decideCase(await moderator(), c.p.id!, await c.json())),
  GET("/admin/appeals", async (c) => {
    const s = (["OPEN", "UPHELD", "OVERTURNED", "ALL"].includes(c.q.get("status") ?? "") ? c.q.get("status") : "OPEN") as "OPEN";
    return moderation.listAppeals(await moderator(), s);
  }),
  POST("/admin/appeals/:id/decide", async (c) => moderation.decideAppeal(await moderator(), c.p.id!, await c.json())),
  GET("/admin/reports", async (c) => moderation.listReports(await moderator(), { reason: str(c.q, "reason") ?? null, targetType: (str(c.q, "targetType") as never) ?? null, page: pageParam(c.q) } as never)),

  // ── Nutzerverwaltung ──
  GET("/admin/users", async (c) => users.listUsers(await moderator(), { q: str(c.q, "q") ?? null, status: str(c.q, "status") ?? null, role: str(c.q, "role") ?? null, page: pageParam(c.q) } as never)),
  GET("/admin/users/:id", async (c) => {
    const u = await moderator();
    const [detail, history] = await Promise.all([users.getUserDetail(u, c.p.id!), moderation.userModerationHistory(c.p.id!)]);
    return { ...(detail as object), history };
  }),
  POST("/admin/users/:id/suspend", async (c) => {
    const b = await c.body({ days: z.union([z.number(), z.string().max(10)]).nullish(), reason: zStr, publicNote: zStr });
    return users.suspendUser(await moderator(), c.p.id!, { days: b.days ?? null, reason: b.reason ?? "", publicNote: b.publicNote ?? "" } as never);
  }),
  POST("/admin/users/:id/unsuspend", async (c) => {
    const { reason } = await c.body({ reason: zStr });
    return users.unsuspendUser(await moderator(), c.p.id!, reason ?? "");
  }),
  POST("/admin/users/:id/role", async (c) => {
    const { role, reason } = await c.body({ role: z.string().max(40).optional(), reason: zStr });
    return users.changeRole(await moderator(), c.p.id!, role as never, reason ?? "");
  }),
  POST("/admin/users/:id/verify-email", async (c) => users.verifyEmailManually(await moderator(), c.p.id!)),
  // { email, reason, markVerified }
  PUT("/admin/users/:id/email", async (c) => users.changeUserEmail(await moderator(), c.p.id!, await c.json<unknown>())),
  POST("/admin/users/:id/revoke-sessions", async (c) => users.revokeUserSessions(await moderator(), c.p.id!)),

  // ── Inhalte (Hervorheben/Ausblenden) ──
  GET("/admin/content/:kind", async (c) => {
    const u = await moderator();
    const opts = { q: str(c.q, "q") ?? null, state: str(c.q, "state") ?? null, page: pageParam(c.q) } as never;
    if (c.p.kind === "projects") return content.listProjects(u, opts);
    if (c.p.kind === "tutorials") return content.listTutorials(u, opts);
    if (c.p.kind === "communities") return content.listCommunities(u, opts);
    throw fail.notFound();
  }),
  POST("/admin/content/:kind/:id/featured", async (c) => {
    const { featured } = await c.body({ featured: zBool });
    const kind = c.p.kind === "projects" ? "PROJECT" : c.p.kind === "tutorials" ? "TUTORIAL" : null;
    if (!kind) throw fail.notFound();
    return content.setFeatured(await moderator(), kind as never, c.p.id!, !!featured);
  }),
  POST("/admin/content/:kind/:id/hidden", async (c) => {
    const { hidden, reason } = await c.body({ hidden: zBool, reason: zStr });
    const kind = c.p.kind === "projects" ? "PROJECT" : c.p.kind === "tutorials" ? "TUTORIAL" : null;
    if (!kind) throw fail.notFound();
    return content.setContentHidden(await moderator(), kind as never, c.p.id!, !!hidden, reason ?? "");
  }),
];
