import "server-only";
import { z } from "zod";
import { ROLES } from "@werkraum/shared";
import { db, type AccountStatus, type PlatformRole, type Prisma } from "@/server/db";
import { fail } from "@/server/errors";
import { audit } from "@/server/audit";
import { notify } from "@/server/notifications";
import { hasRole } from "@/server/authz";
import type { SessionUser } from "@/server/auth/session";
import { BRAND } from "@/config/brand";

type Actor = Pick<SessionUser, "id" | "role">;
const DAY = 86_400_000;
const RANK: Record<PlatformRole, number> = { MEMBER: 0, PLATFORM_MODERATOR: 1, ADMIN: 2, SUPERADMIN: 3 };

export async function listUsers(actor: Actor, opts: { q?: string | null; status?: string | null; role?: string | null; page?: number }) {
  if (!hasRole(actor, "PLATFORM_MODERATOR")) throw fail.forbidden();
  const page = Math.max(1, opts.page ?? 1);
  const q = opts.q?.trim().toLowerCase();
  const where: Prisma.UserWhereInput = {
    ...(opts.status && ["ACTIVE", "SUSPENDED", "BANNED", "DELETED"].includes(opts.status) ? { status: opts.status as AccountStatus } : {}),
    ...(opts.role && (ROLES as readonly string[]).includes(opts.role) ? { role: opts.role as PlatformRole } : {}),
    ...(q
      ? {
          OR: [
            { profile: { handle: { contains: q.replace(/^@/, ""), mode: "insensitive" } } },
            { profile: { displayName: { contains: q, mode: "insensitive" } } },
            // E-Mail-Suche nur als exakter Treffer – keine Teilstring-Enumeration
            { email: q },
            { id: q },
          ],
        }
      : {}),
  };
  const [rows, total] = await Promise.all([
    db.user.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * 40,
      take: 40,
      select: {
        id: true,
        email: true,
        role: true,
        status: true,
        emailVerifiedAt: true,
        lastSeenAt: true,
        createdAt: true,
        profile: { select: { handle: true, displayName: true, avatarUrl: true, followerCount: true, projectCount: true } },
        shop: { select: { status: true } },
        _count: { select: { moderationSubject: true } },
      },
    }),
    db.user.count({ where }),
  ]);
  return { rows, total, page, pages: Math.max(1, Math.ceil(total / 40)) };
}

export async function getUserDetail(actor: Actor, userId: string) {
  if (!hasRole(actor, "PLATFORM_MODERATOR")) throw fail.forbidden();
  const u = await db.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      role: true,
      status: true,
      suspendedUntil: true,
      messagingRestrictedUntil: true,
      emailVerifiedAt: true,
      totpEnabledAt: true,
      adultConfirmedAt: true,
      onboardedAt: true,
      lastSeenAt: true,
      createdAt: true,
      deletedAt: true,
      profile: true,
      roleAssignments: { select: { id: true, role: true, scopeType: true, scopeId: true, createdAt: true } },
      shop: { select: { id: true, name: true, slug: true, status: true, sellerType: true } },
      authAccounts: { select: { provider: true } },
    },
  });
  if (!u) throw fail.notFound();
  const now = new Date();
  const [sessions, posts, projects, tutorials, articles, comments, products, reportsFiled] = await Promise.all([
    db.session.count({ where: { userId, revokedAt: null, expiresAt: { gt: now } } }),
    db.post.count({ where: { authorId: userId } }),
    db.project.count({ where: { ownerId: userId } }),
    db.tutorial.count({ where: { authorId: userId } }),
    db.blogArticle.count({ where: { authorId: userId } }),
    db.comment.count({ where: { authorId: userId } }),
    u.shop ? db.product.count({ where: { shopId: u.shop.id } }) : Promise.resolve(0),
    db.report.count({ where: { reporterId: userId } }),
  ]);
  const recentAudit = await db.auditEvent.findMany({
    // "User": ältere Pro-Einträge (vor der Vereinheitlichung auf "USER")
    where: { targetType: { in: ["USER", "User"] }, targetId: userId },
    orderBy: { seq: "desc" },
    take: 12,
    select: { seq: true, action: true, createdAt: true, actor: { select: { profile: { select: { handle: true } } } } },
  });
  return { user: u, counts: { sessions, posts, projects, tutorials, articles, comments, products, reportsFiled }, recentAudit };
}

/**
 * Serialisiert alle Änderungen, die eine Superadministration entfernen könnten (Rolle, Sperre), und prüft
 * danach unter der Sperre, ob ausser `userId` noch eine aktive Superadministration bleibt. Ohne Sperre
 * könnten sich zwei Superadmins gleichzeitig gegenseitig herabstufen – danach gäbe es keine mehr.
 */
export async function assertOtherSuperadminRemains(tx: Prisma.TransactionClient, userId: string) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('werkuno.superadmin_guard'))`;
  const remaining = await tx.user.count({ where: { role: "SUPERADMIN", status: "ACTIVE", id: { not: userId } } });
  if (remaining === 0) throw fail.conflict("Es muss mindestens eine Superadministration bestehen bleiben.");
}

/**
 * Rollenänderung (§7.2): Admin-Rollen nur durch SUPERADMIN, nie an sich selbst. Gesperrte oder gelöschte
 * Konten erhalten keine höhere Rolle (Herabstufen bleibt möglich).
 */
export async function changeRole(actor: Actor, userId: string, role: PlatformRole, reason: string) {
  if (!hasRole(actor, "ADMIN")) throw fail.forbidden("Rollen ändern darf nur die Administration.");
  if (actor.id === userId) throw fail.forbidden("Die eigene Rolle kann nicht geändert werden.");
  if (!(ROLES as readonly string[]).includes(role)) throw fail.invalid("Unbekannte Rolle.");
  const r = z.string().trim().min(5, "Bitte begründe die Änderung").max(500).parse(reason);
  return db.$transaction(async (tx) => {
    // Bei Superadmin-Beteiligung zuerst sperren, damit der gelesene Zustand nicht mehr veraltet
    const before = await tx.user.findUnique({ where: { id: userId }, select: { role: true } });
    if (before?.role === "SUPERADMIN") await assertOtherSuperadminRemains(tx, userId);
    const target = await tx.user.findUnique({ where: { id: userId }, select: { role: true, status: true } });
    if (!target) throw fail.notFound();
    if (target.status === "DELETED") throw fail.conflict("Gelöschte Konten können keine Rolle erhalten.");
    const touchesAdmin = RANK[role] >= RANK.ADMIN || RANK[target.role] >= RANK.ADMIN;
    if (touchesAdmin && !hasRole(actor, "SUPERADMIN")) throw fail.forbidden("Administrationsrollen vergibt und entzieht nur die Superadministration.");
    if (target.role === role) return { changed: false };
    if (RANK[role] > RANK[target.role] && target.status !== "ACTIVE") throw fail.conflict("Gesperrte Konten können keine höhere Rolle erhalten.");
    // Zwischen erster Abfrage und Sperre zur Superadministration geworden → jetzt noch prüfen
    if (target.role === "SUPERADMIN" && before?.role !== "SUPERADMIN") await assertOtherSuperadminRemains(tx, userId);
    await tx.user.update({ where: { id: userId }, data: { role } });
    // Rechte wirken sofort: bestehende Sitzungen neu anmelden lassen, wenn Rechte entzogen werden
    if (RANK[role] < RANK[target.role]) await tx.session.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
    await audit({ actorId: actor.id, action: "admin.role_changed", targetType: "USER", targetId: userId, meta: { from: target.role, to: role, reason: r } }, tx);
    return { changed: true };
  });
}

async function assertCanSanction(actor: Actor, userId: string) {
  if (actor.id === userId) throw fail.forbidden("Diese Aktion kannst du nicht auf dein eigenes Konto anwenden.");
  const t = await db.user.findUnique({ where: { id: userId }, select: { role: true, status: true } });
  if (!t) throw fail.notFound();
  if (RANK[t.role] >= RANK[actor.role] && actor.role !== "SUPERADMIN") throw fail.forbidden("Dafür ist eine höhere Rolle nötig.");
  return t;
}

export async function suspendUser(actor: Actor, userId: string, input: { days: number | null; reason: string; publicNote: string }) {
  if (!hasRole(actor, "PLATFORM_MODERATOR")) throw fail.forbidden();
  const data = z
    .object({
      days: z.coerce.number().int().min(1).max(365).nullable(),
      reason: z.string().trim().min(10, "Bitte begründe die Sperre (mind. 10 Zeichen)").max(1000),
      publicNote: z.string().trim().min(10, "Bitte formuliere eine Nachricht an die Person").max(1000),
    })
    .parse(input);
  const t = await assertCanSanction(actor, userId);
  if (t.status === "DELETED" || t.status === "BANNED") throw fail.conflict("Das Konto ist bereits gesperrt oder gelöscht.");
  const until = data.days ? new Date(Date.now() + data.days * DAY) : null;
  await db.$transaction(async (tx) => {
    // Auch eine Sperre darf nicht die letzte aktive Superadministration treffen (gegenseitige Sperre)
    if (t.role === "SUPERADMIN") await assertOtherSuperadminRemains(tx, userId);
    await tx.user.update({ where: { id: userId }, data: { status: "SUSPENDED", suspendedUntil: until } });
    await tx.session.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
    await audit({ actorId: actor.id, action: "admin.user_suspended", targetType: "USER", targetId: userId, meta: { days: data.days, reason: data.reason } }, tx);
    await notify(
      {
        recipientId: userId,
        type: "MODERATION",
        bundle: false,
        data: {
          kind: "ACCOUNT",
          message: until ? `Dein Konto ist bis ${until.toLocaleDateString("de-CH", { timeZone: "Europe/Zurich" })} gesperrt.` : "Dein Konto ist bis auf Weiteres gesperrt.",
          publicNote: data.publicNote,
          href: "/einstellungen/hilfe-support",
        },
      },
      tx,
    );
  });
}

export async function unsuspendUser(actor: Actor, userId: string, reason: string) {
  if (!hasRole(actor, "PLATFORM_MODERATOR")) throw fail.forbidden();
  const r = z.string().trim().min(5, "Bitte begründe die Aufhebung").max(1000).parse(reason);
  const t = await assertCanSanction(actor, userId);
  if (t.status !== "SUSPENDED" && t.status !== "BANNED") throw fail.conflict("Das Konto ist nicht gesperrt.");
  if (t.status === "BANNED" && !hasRole(actor, "ADMIN")) throw fail.forbidden("Dauerhafte Sperren hebt nur die Administration auf.");
  await db.$transaction(async (tx) => {
    await tx.user.update({ where: { id: userId }, data: { status: "ACTIVE", suspendedUntil: null } });
    await audit({ actorId: actor.id, action: "admin.user_unsuspended", targetType: "USER", targetId: userId, meta: { from: t.status, reason: r } }, tx);
    await notify({ recipientId: userId, type: "MODERATION", bundle: false, data: { kind: "ACCOUNT", message: "Die Sperre deines Kontos wurde aufgehoben. Willkommen zurück.", href: "/feed" } }, tx);
  });
}

/**
 * Adresse ohne Link als bestätigt markieren. Gleiche Regel wie „direkt bestätigt“ beim Ändern der Adresse:
 * nur Superadministration – sonst liesse sich die Regel umgehen (Adresse ändern, danach hier bestätigen,
 * dann „Passwort vergessen“ an die neue Adresse → Kontoübernahme). Nie das eigene Konto.
 */
export async function verifyEmailManually(actor: Actor, userId: string) {
  if (!hasRole(actor, "SUPERADMIN")) throw fail.forbidden("E-Mail-Adressen manuell bestätigen darf nur die Superadministration – sonst bestätigt die Person ihre Adresse über den Link.");
  if (actor.id === userId) throw fail.forbidden("Deine eigene Adresse bestätigst du über den Link in der E-Mail.");
  const t = await db.user.findUnique({ where: { id: userId }, select: { emailVerifiedAt: true, status: true } });
  if (!t) throw fail.notFound();
  if (t.status === "DELETED") throw fail.conflict("Gelöschte Konten können nicht geändert werden.");
  if (t.emailVerifiedAt) return;
  await db.$transaction(async (tx) => {
    await tx.user.update({ where: { id: userId }, data: { emailVerifiedAt: new Date() } });
    await audit({ actorId: actor.id, action: "admin.email_verified_manually", targetType: "USER", targetId: userId }, tx);
  });
}

export async function revokeUserSessions(actor: Actor, userId: string) {
  if (!hasRole(actor, "PLATFORM_MODERATOR")) throw fail.forbidden();
  if (actor.id !== userId) await assertCanSanction(actor, userId);
  const res = await db.$transaction(async (tx) => {
    const r = await tx.session.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
    await audit({ actorId: actor.id, action: "admin.sessions_revoked", targetType: "USER", targetId: userId, meta: { count: r.count } }, tx);
    return r;
  });
  if (res.count) await notify({ recipientId: userId, type: "SECURITY", bundle: false, data: { message: "Aus Sicherheitsgründen wurden alle Sitzungen deines Kontos beendet. Bitte melde dich erneut an.", href: "/einstellungen/sicherheit" } });
  return { count: res.count };
}

const changeEmailSchema = z.object({
  email: z.string().trim().toLowerCase().email("Bitte gib eine gültige E-Mail-Adresse ein.").max(254),
  reason: z.string().trim().min(10, "Bitte begründe die Änderung (mind. 10 Zeichen), z. B. Ticketnummer und Art der Identitätsprüfung.").max(1000),
  markVerified: z.boolean().default(false),
});

/**
 * E-Mail-Adresse eines Kontos ändern (Support, z. B. Tippfehler bei der Registrierung oder verlorene Adresse).
 * Nur Administration; Konten mit gleicher oder höherer Rolle nur durch die Superadministration; nie das eigene.
 * Offene Bestätigungs- und Passwort-Links verfallen. Alte und neue Adresse werden informiert; ohne
 * „bestätigt“ geht ein Bestätigungslink an die neue Adresse.
 */
export async function changeUserEmail(actor: Actor, userId: string, input: unknown) {
  if (!hasRole(actor, "ADMIN")) throw fail.forbidden("E-Mail-Adressen ändert nur die Administration.");
  if (actor.id === userId) throw fail.forbidden("Deine eigene Adresse änderst du in den Einstellungen.");
  const data = changeEmailSchema.parse(input);
  // Direkt bestätigen = sofort anmeldbar (z. B. über „Passwort vergessen“) → nur Superadministration.
  // Sonst muss die neue Adresse ihren Link selbst bestätigen.
  if (data.markVerified && !hasRole(actor, "SUPERADMIN")) throw fail.forbidden("Direkt bestätigen darf nur die Superadministration – ohne Häkchen erhält die neue Adresse einen Bestätigungslink.");
  const t = await db.user.findUnique({ where: { id: userId }, select: { email: true, role: true, status: true, subscription: { select: { customerId: true, provider: true } } } });
  if (!t) throw fail.notFound();
  if (t.status === "DELETED") throw fail.conflict("Gelöschte Konten können nicht geändert werden.");
  if (RANK[t.role] >= RANK[actor.role] && actor.role !== "SUPERADMIN") throw fail.forbidden("Die Adresse von Teammitgliedern mit gleicher oder höherer Rolle ändert nur die Superadministration.");
  if (t.email === data.email) throw fail.invalid("Das ist bereits die aktuelle Adresse.", { email: "Unverändert" });
  const taken = await db.user.findUnique({ where: { email: data.email }, select: { id: true } });
  if (taken) throw fail.invalid("Diese Adresse wird bereits von einem anderen Konto verwendet.", { email: "Bereits vergeben" });

  const oldEmail = t.email;
  try {
    await db.$transaction(async (tx) => {
      await tx.user.update({ where: { id: userId }, data: { email: data.email, emailVerifiedAt: data.markVerified ? new Date() : null } });
      // Links, die an die alte Adresse gingen, dürfen nicht mehr funktionieren
      await tx.verificationToken.deleteMany({ where: { userId, usedAt: null } });
      // Anmelde-Identität geändert → alle Sitzungen neu anmelden lassen
      await tx.session.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
      // Keine Adressen im Audit (Datensparsamkeit) – nur Grund und Art der Änderung
      await audit({ actorId: actor.id, action: "admin.email_changed", targetType: "USER", targetId: userId, meta: { reason: data.reason, markVerified: data.markVerified } }, tx);
      await notify(
        { recipientId: userId, type: "SECURITY", bundle: false, data: { kind: "email_changed", message: `Deine E-Mail-Adresse wurde vom ${BRAND.name}-Support geändert.`, href: "/einstellungen/konto" } },
        tx,
      );
    });
  } catch (e) {
    // Gleichzeitig vergeben (Unique-Index)
    if ((e as { code?: string }).code === "P2002") throw fail.invalid("Diese Adresse wird bereits von einem anderen Konto verwendet.", { email: "Bereits vergeben" });
    throw e;
  }

  // Mails nach dem Speichern – ein Versandfehler macht die Änderung nicht rückgängig
  const { sendMail } = await import("@/server/mail");
  const { env } = await import("@/server/env");
  const { sendVerification } = await import("@/server/identity/service");
  await sendMail(
    oldEmail,
    `Deine E-Mail-Adresse bei ${BRAND.name} wurde geändert`,
    `Der ${BRAND.name}-Support hat die E-Mail-Adresse deines Kontos auf ${data.email.replace(/(.{2}).*@/, "$1…@")} geändert.\n\nWarst du das nicht oder hast du das nicht angefragt? Antworte bitte sofort auf diese E-Mail oder schreib uns über die Hilfe-Seite.`,
    { eyebrow: "Konto & Sicherheit", cta: { label: "Hilfe & Support", url: `${env().APP_URL}/hilfe` } },
  ).catch(() => {});
  if (data.markVerified) {
    await sendMail(data.email, `Deine E-Mail-Adresse bei ${BRAND.name}`, `Diese Adresse ist jetzt mit deinem ${BRAND.name}-Konto verknüpft. Du meldest dich ab sofort damit an.`, { eyebrow: "Konto & Sicherheit", cta: { label: `Zu ${BRAND.name}`, url: `${env().APP_URL}/anmelden` } }).catch(() => {});
  } else {
    await sendVerification(userId, data.email).catch(() => {});
  }
  // Stripe-Kundenkonto (Creator Pro) mitführen, damit Rechnungen an die neue Adresse gehen
  if (t.subscription?.provider === "stripe" && t.subscription.customerId) {
    const { stripe, paymentsMode } = await import("@/server/commerce/stripe");
    if (paymentsMode() === "stripe") await stripe().customers.update(t.subscription.customerId, { email: data.email }).catch(() => {});
  }
  return { email: data.email, verified: data.markVerified };
}
