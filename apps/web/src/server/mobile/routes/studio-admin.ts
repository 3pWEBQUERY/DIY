import "server-only";
import { fail } from "@/server/errors";
import * as studio from "@/server/analytics/studio";
import { listStudioProjects } from "@/server/projects/service";
import { listStudioTutorials } from "@/server/tutorials/service";
import { hasRole } from "@/server/authz";
import * as moderation from "@/server/moderation/service";
import * as users from "@/server/admin/users";
import { maskEmail } from "@/server/admin/guard";
import * as content from "@/server/admin/content";
import { adminNavCounts, dashboardKpis } from "@/server/admin/kpis";
import { z } from "zod";
import { DELETE, GET, PATCH, POST, PUT, me, pageParam, str, zBool, zIds, zStr, type RouteDef } from "../router";
import { db, ModerationCaseStatus, TargetType } from "@/server/db";
import { flagEnabled } from "@/server/flags";
import * as pro from "@/server/pro/service";
import * as proProfile from "@/server/pro/profile";
import * as proApple from "@/server/pro/apple";

// Filter aus der Query: unbekannte Werte fallen auf den Standard zurück, statt ungeprüft in Prisma-Enums zu landen (500)
const queueStatus = z.enum([...Object.values(ModerationCaseStatus), "ACTIVE", "ALL"]).catch("ACTIVE");
const targetTypeFilter = z.enum(TargetType).nullable().catch(null);
const assigneeFilter = z.enum(["me", "none"]).nullable().catch(null);

async function moderator() {
  const u = await me();
  if (!hasRole(u, "PLATFORM_MODERATOR")) throw fail.forbidden();
  return u;
}

/** Werkuno Studio (PRD §20) und Moderation/Administration (PRD §24, rollenbasiert). */
export const studioAdminRoutes: RouteDef[] = [
  // ── Werkuno Studio ──
  // Creator Pro: Status, Abschluss über den App Store (In-App-Abo), Profilwerkzeuge
  GET("/studio/pro", async () => {
    const u = await me();
    const [status, prices, enabled, profile] = await Promise.all([
      pro.getProStatus(u.id),
      pro.proPrices(),
      flagEnabled("pro", u.id),
      db.userProfile.findUnique({ where: { userId: u.id }, select: { featuredProjectIds: true, mediaKitPublic: true, handle: true } }),
    ]);
    return {
      status,
      prices,
      enabled,
      // Abschluss in der App nur über Apple (Guideline 3.1.1): Produkte + Konto-Token für StoreKit
      apple: enabled ? await proApple.appleProOffer(u.id) : null,
      manageHint: status.provider === "apple" ? pro.APPLE_MANAGE_HINT : null,
      featuredProjectIds: profile?.featuredProjectIds ?? [],
      mediaKitPublic: !!profile?.mediaKitPublic,
      // Privat: mit Vorschau-Zusatz, weil die App das Medienkit in einem Browser-Fenster ohne Anmeldung öffnet
      mediaKitUrl: profile ? `/u/${profile.handle}/medienkit${profile.mediaKitPublic ? "" : `?vorschau=${proProfile.mediaKitPreviewToken(u.id)}`}` : null,
      featuredMax: proProfile.FEATURED_MAX,
    };
  }),
  // Web-Checkout (Stripe) ist in der App bewusst nicht erreichbar – Pro wird dort über den App Store gekauft
  POST("/studio/pro/checkout", async () => {
    await me();
    throw fail.invalid("Creator Pro schliesst du in der App über den App Store ab.");
  }),
  // Kauf, Wiederherstellen und Abgleich des App-Store-Abos
  POST("/studio/pro/apple", async (c) => {
    const u = await me();
    const body = await c.json<{ signedTransaction?: unknown; signedRenewalInfo?: unknown }>();
    await proApple.syncAppleProFromApp(u, body);
    return { status: await pro.getProStatus(u.id) };
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
      {
        status: queueStatus.parse(str(c.q, "status") ?? "ACTIVE"),
        targetType: targetTypeFilter.parse(str(c.q, "targetType") ?? null),
        assignee: assigneeFilter.parse(str(c.q, "assignee") ?? null),
        q: str(c.q, "q") ?? null,
      },
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
  GET("/admin/reports", async (c) => moderation.listReports(await moderator(), { reason: str(c.q, "reason") ?? null, targetType: targetTypeFilter.parse(str(c.q, "targetType") ?? null), page: pageParam(c.q) })),

  // ── Nutzerverwaltung ──
  // E-Mail-Adressen wie im Web: in Listen immer maskiert, im Detail nur für die Administration im Klartext
  GET("/admin/users", async (c) => {
    const r = await users.listUsers(await moderator(), { q: str(c.q, "q") ?? null, status: str(c.q, "status") ?? null, role: str(c.q, "role") ?? null, page: pageParam(c.q) } as never);
    return { ...r, rows: r.rows.map((row) => ({ ...row, email: maskEmail(row.email) })) };
  }),
  GET("/admin/users/:id", async (c) => {
    const u = await moderator();
    const [detail, history] = await Promise.all([users.getUserDetail(u, c.p.id!), moderation.userModerationHistory(c.p.id!)]);
    const user = hasRole(u, "ADMIN") ? detail.user : { ...detail.user, email: maskEmail(detail.user.email) };
    return { ...detail, user, history };
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
