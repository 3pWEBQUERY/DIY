import "server-only";
import { assertAccountDeletable } from "@/server/account/deletion";
import { RESERVED_HANDLES, handleSchema, signUpSchema, signInSchema, passwordSchema } from "@werkraum/shared";
import { db } from "@/server/db";
import { hashPassword, verifyPassword, sha256, token } from "@/server/crypto";
import { fail, uniqueViolation } from "@/server/errors";
import { createSession, clientIpHash } from "@/server/auth/session";
import { isLimited, limit, rateLimit, releaseLimit } from "@/server/ratelimit";
import { securityReset } from "@/server/auth/security";
import { assertReauthenticated, type ReauthProof } from "@/server/auth/reauth";
import { warnNewDevice } from "@/server/auth/new-device";
import { APPLE_REVOKE_PROVIDER } from "@/server/identity/apple-token";
import { headers } from "next/headers";
import { after } from "next/server";
import { randomInt } from "node:crypto";
import { sendMail } from "@/server/mail";
import { audit } from "@/server/audit";
import { env } from "@/server/env";
import { requireFlag } from "@/server/flags";

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
    { eyebrow: "Willkommen", cta: { label: "E-Mail bestätigen", url: `${env().APP_URL}/verifizieren/${raw}` } },
  );
}

export async function signUp(input: unknown) {
  await requireFlag("signup");
  const data = signUpSchema.parse(input);
  await limit("signUp", await clientIpHash());
  const avail = await isHandleAvailable(data.handle);
  if (!avail.ok) throw fail.invalid(avail.reason, { handle: avail.reason });
  const exists = await db.user.findUnique({ where: { email: data.email }, select: { id: true } });
  if (exists) throw fail.invalid("Mit dieser E-Mail-Adresse besteht bereits ein Konto.", { email: "Bereits registriert – melde dich an." });

  const passwordHash = await hashPassword(data.password);
  const now = new Date();
  const user = await db.user
    .create({
      data: {
        email: data.email,
        passwordHash,
        adultConfirmedAt: now,
        termsAcceptedAt: now,
        profile: { create: { handle: avail.handle, displayName: data.displayName } },
        preference: { create: {} },
      },
      select: { id: true, email: true },
    })
    .catch((e: unknown) => {
      // Wettlauf: Adresse oder Handle wurde zwischen Prüfung und Anlage von einer parallelen Anfrage belegt
      const target = uniqueViolation(e);
      if (target?.includes("email")) throw fail.invalid("Mit dieser E-Mail-Adresse besteht bereits ein Konto.", { email: "Bereits registriert – melde dich an." });
      if (target?.includes("handle")) throw fail.invalid("Bereits vergeben", { handle: "Bereits vergeben" });
      throw e;
    });
  await sendVerification(user.id, user.email);
  const s = await createSession(user.id);
  // Token für Bearer-Clients (iOS-App); Web nutzt das gesetzte httpOnly-Cookie
  return { userId: user.id, token: s.rawToken };
}

/**
 * Fehlversuche je Netzwerkadresse über ALLE Konten (gegen Credential Stuffing). Jeder Versuch wird vorab
 * atomar gezählt (parallele Anfragen können die Sperre nicht umgehen) und bei Erfolg wieder freigegeben –
 * viele erfolgreiche Anmeldungen hinter derselben Adresse (Büro, Schule) sperren also niemanden aus.
 */
async function reserveIpAttempt(ipHash: string) {
  await limit("signInIpDay", ipHash);
  try {
    await limit("signInIp", ipHash);
  } catch (e) {
    await releaseLimit("signInIpDay", ipHash);
    throw e;
  }
}

async function releaseIpAttempt(ipHash: string) {
  await releaseLimit("signInIp", ipHash);
  await releaseLimit("signInIpDay", ipHash);
}

export async function signIn(input: unknown) {
  const data = signInSchema.parse(input);
  const ipHash = await clientIpHash();
  await limit("signIn", `${ipHash}:${data.email}`);
  await reserveIpAttempt(ipHash);
  const user = await db.user.findUnique({
    where: { email: data.email },
    select: { id: true, email: true, passwordHash: true, status: true, suspendedUntil: true },
  });
  // Konto-Limit (gegen verteiltes Durchprobieren) zählt nur Fehlversuche und gilt nicht für bekannte
  // Geräte (dieselbe IP und derselbe Browser wie bei einer früheren Anmeldung) – so kann niemand
  // ein fremdes Konto durch absichtliche Fehlversuche aussperren.
  const ua = (await headers()).get("user-agent")?.slice(0, 300) ?? null;
  const knownDevice = user ? !!(await db.session.findFirst({ where: { userId: user.id, ipHash, userAgent: ua, createdAt: { gt: new Date(Date.now() - 90 * 86400_000) } }, select: { id: true } })) : false;
  if (!knownDevice && (await isLimited("signInAccount", data.email))) throw fail.rate();
  const valid = await verifyPassword(data.password, user?.passwordHash);
  if (!user || !valid) {
    if (!knownDevice) await limit("signInAccount", data.email).catch(() => {});
    throw fail.invalid("E-Mail oder Passwort ist nicht korrekt.");
  }
  // Passwort korrekt → zählt nicht als Fehlversuch dieser Adresse
  await releaseIpAttempt(ipHash);
  if (user.status === "BANNED") throw fail.forbidden("Dieses Konto wurde dauerhaft gesperrt.");
  if (user.status === "DELETED") throw fail.invalid("E-Mail oder Passwort ist nicht korrekt.");
  const s = await createSession(user.id);
  // Sicherheitswarnung bei Anmeldung von neuem Gerät (§8.1) – mit 2FA erst nach dem Code (verifyMfaLogin)
  if (s.isNewDevice && !s.mfaRequired) await warnNewDevice(user.id, s.deviceLabel);
  // mfaRequired: Passwort korrekt, Session wartet auf den zweiten Faktor
  return { userId: user.id, token: s.rawToken, mfaRequired: s.mfaRequired };
}

export async function verifyEmail(raw: string) {
  const t = await db.verificationToken.findUnique({ where: { id: sha256(raw) } });
  if (!t || t.purpose !== "EMAIL_VERIFY" || t.usedAt || t.expiresAt < new Date()) return false;
  return db.$transaction(async (tx) => {
    // Einmal-Link: nur wer ihn zuerst einlöst (usedAt noch leer, nicht abgelaufen), bestätigt
    const now = new Date();
    const claimed = await tx.verificationToken.updateMany({ where: { id: t.id, purpose: "EMAIL_VERIFY", usedAt: null, expiresAt: { gt: now } }, data: { usedAt: now } });
    if (claimed.count !== 1) return false;
    await tx.user.update({ where: { id: t.userId }, data: { emailVerifiedAt: now } });
    return true;
  });
}

/**
 * Arbeit nach der Antwort erledigen (Next.js `after`): Die Antwortzeit verrät so nicht, ob dabei eine Mail
 * verschickt wurde. Ausserhalb eines Requests (Skripte, Tests) läuft sie einfach im Hintergrund.
 */
function afterResponse(task: () => Promise<unknown>) {
  const run = () => task().catch((err) => console.error(JSON.stringify({ level: "error", msg: "after_response_failed", error: String(err).slice(0, 200) })));
  try {
    after(run);
  } catch {
    void run();
  }
}

/**
 * Antwortet immer gleich – keine User-Enumeration, auch nicht über die Antwortzeit: Token und Mail (Resend)
 * entstehen erst nach der Antwort; vorher läuft für alle Adressen dieselbe Arbeit (Limits, eine Abfrage)
 * plus eine kleine zufällige Verzögerung, die Restunterschiede überdeckt.
 */
export async function requestPasswordReset(email: string) {
  const normalized = email.trim().toLowerCase();
  const ipHash = await clientIpHash();
  await limit("passwordReset", `${ipHash}:${normalized}`);
  // Je Netzwerkadresse über alle E-Mail-Adressen
  await limit("passwordResetIp", ipHash);
  // Zusätzlich je Adresse (unabhängig von der IP): schützt Postfächer vor Reset-Mail-Fluten.
  // Still abbrechen statt Fehler – die Antwort bleibt für alle Adressen gleich.
  try {
    await rateLimit(`pwreset-mail:${sha256(normalized)}`, 5, 3600);
  } catch {
    return;
  }
  const user = await db.user.findUnique({ where: { email: normalized }, select: { id: true, email: true, status: true } });
  const recipient = user && user.status !== "DELETED" && user.status !== "BANNED" ? user : null;
  afterResponse(async () => {
    if (!recipient) return;
    const raw = await issueToken(recipient.id, "PASSWORD_RESET", RESET_MINUTES);
    await sendMail(recipient.email, "Passwort zurücksetzen", "Du hast ein neues Passwort angefordert. Der Link ist 60 Minuten gültig.\n\nFalls du das nicht warst, kannst du diese E-Mail ignorieren.", {
      eyebrow: "Konto & Sicherheit",
      cta: { label: "Neues Passwort festlegen", url: `${env().APP_URL}/passwort-zuruecksetzen/${raw}` },
    });
  });
  await new Promise((r) => setTimeout(r, randomInt(20, 80)));
}

export async function resetPassword(raw: string, password: string) {
  const pw = passwordSchema.parse(password);
  const t = await db.verificationToken.findUnique({ where: { id: sha256(raw) } });
  const invalid = () => fail.invalid("Der Link ist abgelaufen oder ungültig. Fordere bitte einen neuen an.");
  if (!t || t.purpose !== "PASSWORD_RESET" || t.usedAt || t.expiresAt < new Date()) throw invalid();
  const passwordHash = await hashPassword(pw);
  await db.$transaction(async (tx) => {
    // Einmal-Link: nur wer ihn zuerst einlöst, setzt das Passwort
    const claimed = await tx.verificationToken.updateMany({ where: { id: t.id, usedAt: null }, data: { usedAt: new Date() } });
    if (!claimed.count) throw invalid();
    await tx.user.update({ where: { id: t.userId }, data: { passwordHash } });
    // Sessionwiderruf (§25.5): alle Sitzungen beenden, weitere Reset- und E-Mail-Wechsel-Links entwerten
    await securityReset(t.userId, { exceptTokenId: t.id, tx });
  });
  await audit({ actorId: t.userId, action: "auth.password_reset", targetType: "USER", targetId: t.userId });
  const s = await createSession(t.userId);
  return { mfaRequired: s.mfaRequired };
}

/**
 * Passwort ändern bzw. – bei Konten nur mit Apple – erstmals festlegen. Ein erstes Passwort braucht eine
 * erneute Anmeldung mit Apple (sonst könnte eine gestohlene Sitzung ein Passwort setzen und damit auch
 * die E-Mail-Adresse ändern). Andere Sitzungen und offene Links beendet `changePasswordEverywhere`.
 */
export async function changePassword(userId: string, current: string, next: string, ctx: { sessionId: string; appleIdentityToken?: string | null }) {
  const pw = passwordSchema.parse(next);
  const u = await db.user.findUniqueOrThrow({ where: { id: userId }, select: { passwordHash: true } });
  if (u.passwordHash) {
    if (!(await verifyPassword(current, u.passwordHash))) throw fail.invalid("Das aktuelle Passwort ist falsch.", { current: "Falsches Passwort" });
  } else {
    await assertReauthenticated(userId, ctx.sessionId, { appleIdentityToken: ctx.appleIdentityToken });
  }
  await db.user.update({ where: { id: userId }, data: { passwordHash: await hashPassword(pw) } });
  await audit({ actorId: userId, action: u.passwordHash ? "auth.password_changed" : "auth.password_set", targetType: "USER", targetId: userId });
}

/**
 * Accountlöschung (§23.1, §25.5): Profil pseudonymisieren, Inhalte entfernen,
 * Sitzungen widerrufen. Bestellungen bleiben aus Aufbewahrungspflichten erhalten
 * (Restrict-FK), werden aber vom Profil entkoppelt.
 */
export async function deleteAccount(userId: string, sessionId: string, proof: ReauthProof) {
  // Passwort bzw. (ohne Passwort) frische Anmeldung mit Apple – eine gestohlene Sitzung reicht nicht
  await assertReauthenticated(userId, sessionId, proof);
  await assertAccountDeletable(userId);
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
    // Apple-Verknüpfungen mit Refresh-Token lösen, aber für den Widerruf bei Apple im Aufräumjob behalten
    // (purgeDeletedAccount); die Apple-ID kann sofort wieder für ein neues Konto genutzt werden.
    await tx.$executeRaw`UPDATE "AuthAccount" SET "provider" = ${APPLE_REVOKE_PROVIDER}, "providerAccountId" = "providerAccountId" || ':' || "id" WHERE "userId" = ${userId} AND "provider" = 'apple' AND "refreshToken" IS NOT NULL`;
    await tx.authAccount.deleteMany({ where: { userId, provider: { not: APPLE_REVOKE_PROVIDER } } });
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

/** Datenexport (Auskunftsrecht, §23.1) – vollständig in account/export.ts. */
export { exportUserData } from "@/server/account/export";
