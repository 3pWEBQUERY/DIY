import "server-only";
import { db } from "@/server/db";
import { fail } from "@/server/errors";
import * as identity from "@/server/identity/service";
import * as account from "@/server/account/service";
import { completeOnboarding, skipOnboarding } from "@/server/identity/onboarding";
import { signInWithAppleIdToken } from "@/server/identity/apple";
import { suggestedCommunities, suggestedCreators } from "@/server/discovery/suggestions";
import { effectiveCategories } from "@/server/categories/settings";
import { unreadCount } from "@/server/notifications";
import { inboxCounts } from "@/server/messaging/service";
import { cartCount } from "@/server/commerce/cart";
import { paymentsMode } from "@/server/commerce/stripe";
import { getSetting } from "@/server/settings";
import { features } from "@/server/env";
import { hasRole } from "@/server/authz";
import { setBlock, setMute } from "@/server/social/interactions";
import { appealContext, submitAppeal } from "@/server/moderation/service";
import { rateLimit } from "@/server/ratelimit";
import { DELETE, GET, PATCH, POST, PUT, me, meAllowSuspended, session, viewer, type RouteDef } from "../router";

/** Identität, Onboarding, Bootstrap, Konto & Einstellungen (PRD §8, §23, §7). */
export const identityRoutes: RouteDef[] = [
  // ── Bootstrap: alles, was die App beim Start braucht ──
  GET("/bootstrap", async () => {
    const [u, categories] = await Promise.all([viewer(), effectiveCategories()]);
    const feeBps = await getSetting("commerce.feeBps");
    const base = {
      categories,
      payments: { mode: paymentsMode(), feeBps },
      features: { apple: features.apple(), appleNative: !!process.env.APPLE_IOS_CLIENT_ID },
      serverTime: new Date().toISOString(),
    };
    if (!u) return { ...base, me: null };
    const [notifications, inbox, cart, adultConfirmed] = await Promise.all([
      unreadCount(u.id),
      inboxCounts(u.id),
      cartCount(u.id),
      db.user.findUnique({ where: { id: u.id }, select: { adultConfirmedAt: true } }).then((r) => !!r?.adultConfirmedAt),
    ]);
    return {
      ...base,
      me: {
        id: u.id,
        email: u.email,
        role: u.role,
        status: u.status,
        suspendedUntil: u.suspendedUntil,
        emailVerified: !!u.emailVerifiedAt,
        onboarded: !!u.onboardedAt,
        adultConfirmed,
        createdAt: u.createdAt,
        profile: u.profile,
        shop: u.shop,
        isModerator: hasRole(u, "PLATFORM_MODERATOR"),
        isAdmin: hasRole(u, "ADMIN"),
        counts: { notifications, messages: inbox, cart },
      },
    };
  }),

  // ── Registrierung & Anmeldung ──
  POST("/auth/signup", async (c) => {
    const r = await identity.signUp(await c.json());
    return r;
  }),
  POST("/auth/handle-check", async (c) => {
    const { handle } = await c.json<{ handle?: string }>();
    const u = await viewer();
    return identity.isHandleAvailable(String(handle ?? ""), u?.id);
  }),
  POST("/auth/password-reset", async (c) => {
    const { email } = await c.json<{ email?: string }>();
    await identity.requestPasswordReset(String(email ?? ""));
    return { message: "Falls ein Konto existiert, haben wir dir eine E-Mail geschickt." };
  }),
  POST("/auth/apple", async (c) => {
    const b = await c.json<{ identityToken?: string; givenName?: string; familyName?: string }>();
    if (!b.identityToken) throw fail.invalid("identityToken fehlt.");
    return signInWithAppleIdToken(b.identityToken, [b.givenName, b.familyName].filter(Boolean).join(" ") || null);
  }),
  POST("/auth/resend-verification", async () => {
    await account.resendVerification(await meAllowSuspended());
    return { message: "Wir haben dir einen neuen Bestätigungslink geschickt." };
  }),

  // ── Onboarding (§8.2) ──
  GET("/onboarding", async () => {
    const u = await me();
    const full = await db.user.findUniqueOrThrow({ where: { id: u.id }, select: { adultConfirmedAt: true, onboardedAt: true } });
    return { profile: u.profile, adultConfirmed: !!full.adultConfirmedAt, onboarded: !!full.onboardedAt, categories: await effectiveCategories() };
  }),
  POST("/onboarding/suggestions", async (c) => {
    const u = await me();
    const { interests } = await c.json<{ interests?: string[] }>();
    const list = Array.isArray(interests) ? interests.map(String).slice(0, 15) : [];
    const [creators, communities] = await Promise.all([suggestedCreators(u.id, list, 6), suggestedCommunities(u.id, list, 4)]);
    return { creators, communities };
  }),
  POST("/onboarding/complete", async (c) => {
    await completeOnboarding(await me(), await c.json());
    return { ok: true };
  }),
  POST("/onboarding/skip", async () => {
    await skipOnboarding(await me());
    return { ok: true };
  }),

  // ── Einstellungen: Profil ──
  GET("/settings/profile", async () => {
    const u = await me();
    return account.getProfileSettings(u.id);
  }),
  PUT("/settings/profile", async (c) => account.updateProfile(await me(), await c.json())),
  POST("/settings/handle-check", async (c) => {
    const { handle } = await c.json<{ handle?: string }>();
    return account.checkHandle(String(handle ?? ""), (await me()).id);
  }),

  // ── Konto ──
  GET("/settings/account", async () => {
    const u = await meAllowSuspended();
    return account.accountOverview(u.id);
  }),
  POST("/settings/password", async (c) => {
    const s = await session();
    const b = await c.json<{ current?: string; next?: string; confirm?: string }>();
    if (b.next !== b.confirm) throw fail.invalid("Die Passwörter stimmen nicht überein.", { confirm: "Stimmt nicht überein" });
    return account.changePasswordEverywhere(s.user, s.sessionId, b.current ?? "", b.next ?? "");
  }),
  POST("/settings/delete-account", async (c) => {
    const u = await meAllowSuspended();
    const b = await c.json<{ password?: string; confirm?: string }>();
    if ((b.confirm ?? "").trim().toUpperCase() !== "LÖSCHEN") throw fail.invalid("Bitte tippe LÖSCHEN zur Bestätigung.", { confirm: "Bitte LÖSCHEN eintippen" });
    await identity.deleteAccount(u.id, b.password ?? null);
    return { ok: true };
  }),

  // ── Sicherheit: Sitzungen ──
  GET("/settings/security", async () => {
    const s = await session();
    const [sessions, events] = await Promise.all([account.listSessions(s.user.id, s.sessionId), account.securityEvents(s.user.id)]);
    return { sessions, events };
  }),
  DELETE("/settings/sessions/:key", async (c) => {
    const s = await session();
    await account.revokeSession(s.user, c.p.key!, s.sessionId);
    return { ok: true };
  }),
  POST("/settings/sessions/revoke-others", async () => {
    const s = await session();
    return account.revokeOtherSessions(s.user, s.sessionId);
  }),

  // ── Benachrichtigungen ──
  GET("/settings/notifications", async () => account.getNotificationSettings((await meAllowSuspended()).id)),
  PUT("/settings/notifications", async (c) => {
    await account.updateNotificationSettings(await meAllowSuspended(), await c.json());
    return { ok: true };
  }),

  // ── Feed ──
  GET("/settings/feed", async () => account.getFeedSettings((await me()).id)),
  PUT("/settings/feed", async (c) => {
    await account.updateFeedSettings(await me(), await c.json());
    return { ok: true };
  }),
  POST("/settings/feed/reset-hidden", async () => account.resetHiddenContent(await me())),
  POST("/settings/unmute/:userId", async (c) => {
    await setMute(await me(), c.p.userId!, false);
    return { ok: true };
  }),

  // ── Privatsphäre ──
  GET("/settings/privacy", async () => account.getPrivacySettings((await me()).id)),
  PUT("/settings/privacy", async (c) => {
    await account.updatePrivacySettings(await me(), await c.json());
    return { ok: true };
  }),
  POST("/settings/unblock/:userId", async (c) => {
    await setBlock(await me(), c.p.userId!, false);
    return { ok: true };
  }),

  // ── Hilfe & Support ──
  GET("/support/tickets", async () => account.listOwnTickets((await meAllowSuspended()).id)),
  POST("/support/tickets", async (c) => account.createSupportTicket(await meAllowSuspended(), await c.json())),

  // ── Einspruch (§24.1 Nr. 8) ──
  GET("/appeals/:caseId", async (c) => appealContext((await meAllowSuspended()).id, c.p.caseId!)),
  POST("/appeals/:caseId", async (c) => {
    const u = await meAllowSuspended();
    await rateLimit(`appeal:${u.id}`, 10, 86_400);
    await submitAppeal(u, c.p.caseId!, await c.json());
    return { message: "Dein Einspruch ist eingegangen. Wir melden uns, sobald er geprüft wurde." };
  }),

  // ── Push-Gerätetoken (vorbereitet; Versand folgt mit APNs-Schlüssel) ──
  PATCH("/devices/push", async (c) => {
    const u = await me();
    const { token } = await c.json<{ token?: string }>();
    if (!token || token.length > 200) throw fail.invalid("Ungültiges Gerätetoken.");
    console.info(JSON.stringify({ level: "info", msg: "push_token_registered", user: u.id.slice(-6) }));
    return { ok: true, delivery: "pending-apns-configuration" };
  }),
];
