import "server-only";
import { RESERVED_HANDLES, handleSchema, signUpSchema, signInSchema, passwordSchema } from "@werkraum/shared";
import { db } from "@/server/db";
import { hashPassword, verifyPassword, sha256, token } from "@/server/crypto";
import { fail } from "@/server/errors";
import { createSession, clientIpHash } from "@/server/auth/session";
import { limit } from "@/server/ratelimit";
import { sendMail } from "@/server/mail";
import { notify } from "@/server/notifications";
import { audit } from "@/server/audit";
import { env } from "@/server/env";

const VERIFY_HOURS = 48;
const RESET_MINUTES = 60;

export async function isHandleAvailable(raw: string, exceptUserId?: string) {
  const parsed = handleSchema.safeParse(raw);
  if (!parsed.success) return { ok: false as const, reason: parsed.error.issues[0]?.message ?? "Ungültig" };
  const handle = parsed.data;
  if (RESERVED_HANDLES.has(handle)) return { ok: false as const, reason: "Dieser Name ist reserviert" };
  const [taken, redirect] = await Promise.all([
    db.userProfile.findUnique({ where: { handle }, select: { userId: true } }),
    db.handleRedirect.findUnique({ where: { oldHandle: handle }, select: { userId: true } }),
  ]);
  if (taken && taken.userId !== exceptUserId) return { ok: false as const, reason: "Bereits vergeben" };
  if (redirect && redirect.userId !== exceptUserId) return { ok: false as const, reason: "Bereits vergeben" };
  return { ok: true as const, handle };
}

async function issueToken(userId: string, purpose: "EMAIL_VERIFY" | "PASSWORD_RESET", minutes: number) {
  const raw = token(32);
  await db.verificationToken.create({
    data: { id: sha256(raw), userId, purpose, expiresAt: new Date(Date.now() + minutes * 60_000) },
  });
  return raw;
}

export async function sendVerification(userId: string, email: string) {
  const raw = await issueToken(userId, "EMAIL_VERIFY", VERIFY_HOURS * 60);
  await sendMail(
    email,
    "Bestätige deine E-Mail-Adresse",
    "Willkommen bei Werkuno! Bitte bestätige deine E-Mail-Adresse, damit wir dich bei wichtigen Ereignissen erreichen können.\n\nDer Link ist 48 Stunden gültig.",
    { cta: { label: "E-Mail bestätigen", url: `${env().APP_URL}/verifizieren/${raw}` } },
  );
}

export async function signUp(input: unknown) {
  const data = signUpSchema.parse(input);
  await limit("signUp", await clientIpHash());
  const avail = await isHandleAvailable(data.handle);
  if (!avail.ok) throw fail.invalid(avail.reason, { handle: avail.reason });
  const exists = await db.user.findUnique({ where: { email: data.email }, select: { id: true } });
  if (exists) throw fail.invalid("Mit dieser E-Mail-Adresse besteht bereits ein Konto.", { email: "Bereits registriert – melde dich an." });

  const passwordHash = await hashPassword(data.password);
  const now = new Date();
  const user = await db.user.create({
    data: {
      email: data.email,
      passwordHash,
      adultConfirmedAt: now,
      termsAcceptedAt: now,
      profile: { create: { handle: avail.handle, displayName: data.displayName } },
      preference: { create: {} },
    },
    select: { id: true, email: true },
  });
  await sendVerification(user.id, user.email);
  const s = await createSession(user.id);
  // Token für Bearer-Clients (iOS-App); Web nutzt das gesetzte httpOnly-Cookie
  return { userId: user.id, token: s.rawToken };
}

export async function signIn(input: unknown) {
  const data = signInSchema.parse(input);
  await limit("signIn", `${await clientIpHash()}:${data.email}`);
  const user = await db.user.findUnique({
    where: { email: data.email },
    select: { id: true, email: true, passwordHash: true, status: true, suspendedUntil: true },
  });
  const valid = await verifyPassword(data.password, user?.passwordHash);
  if (!user || !valid) throw fail.invalid("E-Mail oder Passwort ist nicht korrekt.");
  if (user.status === "BANNED") throw fail.forbidden("Dieses Konto wurde dauerhaft gesperrt.");
  if (user.status === "DELETED") throw fail.invalid("E-Mail oder Passwort ist nicht korrekt.");
  const s = await createSession(user.id);
  if (s.isNewDevice) {
    // Sicherheitswarnung bei Anmeldung von neuem Gerät (§8.1)
    await notify({ recipientId: user.id, type: "SECURITY", data: { device: s.deviceLabel }, bundle: false });
    await sendMail(
      user.email,
      "Neue Anmeldung bei deinem Konto",
      `Wir haben eine Anmeldung von einem neuen Gerät festgestellt: ${s.deviceLabel}.\n\nWarst du das nicht? Ändere sofort dein Passwort und melde alle Sitzungen ab.`,
      { cta: { label: "Sitzungen prüfen", url: `${env().APP_URL}/einstellungen/sicherheit` } },
    ).catch(() => {});
  }
  return { userId: user.id, token: s.rawToken };
}

export async function verifyEmail(raw: string) {
  const t = await db.verificationToken.findUnique({ where: { id: sha256(raw) } });
  if (!t || t.purpose !== "EMAIL_VERIFY" || t.usedAt || t.expiresAt < new Date()) return false;
  await db.$transaction([
    db.verificationToken.update({ where: { id: t.id }, data: { usedAt: new Date() } }),
    db.user.update({ where: { id: t.userId }, data: { emailVerifiedAt: new Date() } }),
  ]);
  return true;
}

/** Antwortet immer gleich – keine User-Enumeration. */
export async function requestPasswordReset(email: string) {
  const normalized = email.trim().toLowerCase();
  await limit("passwordReset", `${await clientIpHash()}:${normalized}`);
  const user = await db.user.findUnique({ where: { email: normalized }, select: { id: true, email: true, status: true } });
  if (!user || user.status === "DELETED" || user.status === "BANNED") return;
  const raw = await issueToken(user.id, "PASSWORD_RESET", RESET_MINUTES);
  await sendMail(user.email, "Passwort zurücksetzen", "Du hast ein neues Passwort angefordert. Der Link ist 60 Minuten gültig.\n\nFalls du das nicht warst, kannst du diese E-Mail ignorieren.", {
    cta: { label: "Neues Passwort festlegen", url: `${env().APP_URL}/passwort-zuruecksetzen/${raw}` },
  });
}

export async function resetPassword(raw: string, password: string) {
  const pw = passwordSchema.parse(password);
  const t = await db.verificationToken.findUnique({ where: { id: sha256(raw) } });
  if (!t || t.purpose !== "PASSWORD_RESET" || t.usedAt || t.expiresAt < new Date()) {
    throw fail.invalid("Der Link ist abgelaufen oder ungültig. Fordere bitte einen neuen an.");
  }
  const passwordHash = await hashPassword(pw);
  await db.$transaction([
    db.verificationToken.update({ where: { id: t.id }, data: { usedAt: new Date() } }),
    db.user.update({ where: { id: t.userId }, data: { passwordHash } }),
    // Sessionwiderruf: alle bestehenden Sitzungen beenden (§25.5)
    db.session.updateMany({ where: { userId: t.userId, revokedAt: null }, data: { revokedAt: new Date() } }),
  ]);
  await audit({ actorId: t.userId, action: "auth.password_reset", targetType: "USER", targetId: t.userId });
  await createSession(t.userId);
}

export async function changePassword(userId: string, current: string, next: string) {
  const pw = passwordSchema.parse(next);
  const u = await db.user.findUniqueOrThrow({ where: { id: userId }, select: { passwordHash: true } });
  if (u.passwordHash && !(await verifyPassword(current, u.passwordHash))) throw fail.invalid("Das aktuelle Passwort ist falsch.", { current: "Falsches Passwort" });
  await db.user.update({ where: { id: userId }, data: { passwordHash: await hashPassword(pw) } });
  await audit({ actorId: userId, action: "auth.password_changed", targetType: "USER", targetId: userId });
}

/**
 * Accountlöschung (§23.1, §25.5): Profil pseudonymisieren, Inhalte entfernen,
 * Sitzungen widerrufen. Bestellungen bleiben aus Aufbewahrungspflichten erhalten
 * (Restrict-FK), werden aber vom Profil entkoppelt.
 */
export async function deleteAccount(userId: string, password: string | null) {
  const u = await db.user.findUniqueOrThrow({ where: { id: userId }, select: { passwordHash: true, email: true } });
  if (u.passwordHash && !(await verifyPassword(password ?? "", u.passwordHash))) throw fail.invalid("Passwort ist falsch.", { password: "Falsches Passwort" });
  const tomb = `geloescht-${userId.slice(-8)}`;
  await db.$transaction(async (tx) => {
    await tx.post.updateMany({ where: { authorId: userId }, data: { state: "REMOVED" } });
    await tx.project.updateMany({ where: { ownerId: userId }, data: { state: "REMOVED" } });
    await tx.tutorial.updateMany({ where: { authorId: userId }, data: { state: "REMOVED" } });
    await tx.blogArticle.updateMany({ where: { authorId: userId }, data: { state: "HIDDEN" } });
    await tx.comment.updateMany({ where: { authorId: userId }, data: { state: "REMOVED", body: "" } });
    await tx.product.updateMany({ where: { shop: { ownerId: userId } }, data: { status: "DISABLED" } });
    await tx.shop.updateMany({ where: { ownerId: userId }, data: { status: "SUSPENDED" } });
    await tx.follow.deleteMany({ where: { OR: [{ followerId: userId }, { followeeId: userId }] } });
    await tx.session.updateMany({ where: { userId }, data: { revokedAt: new Date() } });
    await tx.authAccount.deleteMany({ where: { userId } });
    await tx.userProfile.update({
      where: { userId },
      data: { handle: tomb, displayName: "Gelöschtes Konto", bio: "", avatarUrl: null, coverUrl: null, links: [], website: null, region: null },
    });
    await tx.user.update({
      where: { id: userId },
      data: { status: "DELETED", deletedAt: new Date(), email: `${tomb}@deleted.invalid`, passwordHash: null },
    });
    await tx.outboxEvent.create({ data: { type: "UserDeleted", payload: { userId } } });
  });
  await audit({ actorId: userId, action: "account.deleted", targetType: "USER", targetId: userId });
}

/** Datenexport (Auskunftsrecht, §23.1). */
export async function exportUserData(userId: string) {
  const [user, posts, projects, tutorials, articles, comments, orders, follows, bookmarks, messages] = await Promise.all([
    db.user.findUniqueOrThrow({ where: { id: userId }, select: { id: true, email: true, createdAt: true, locale: true, profile: true, preference: true } }),
    db.post.findMany({ where: { authorId: userId }, select: { id: true, body: true, createdAt: true, visibility: true } }),
    db.project.findMany({ where: { ownerId: userId }, include: { updates: true, materials: true, tools: true } }),
    db.tutorial.findMany({ where: { authorId: userId }, include: { versions: { include: { steps: true } } } }),
    db.blogArticle.findMany({ where: { authorId: userId } }),
    db.comment.findMany({ where: { authorId: userId }, select: { id: true, body: true, createdAt: true, targetType: true, targetId: true } }),
    db.order.findMany({ where: { buyerId: userId }, include: { items: true } }),
    db.follow.findMany({ where: { followerId: userId }, select: { followeeId: true, createdAt: true } }),
    db.bookmark.findMany({ where: { userId } }),
    db.message.findMany({ where: { senderId: userId }, select: { id: true, conversationId: true, body: true, createdAt: true } }),
  ]);
  return { exportedAt: new Date().toISOString(), user, posts, projects, tutorials, articles, comments, orders, follows, bookmarks, messages };
}
