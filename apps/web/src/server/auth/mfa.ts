import "server-only";
import QRCode from "qrcode";
import { db } from "@/server/db";
import { fail } from "@/server/errors";
import { isLimited, limit } from "@/server/ratelimit";
import { audit } from "@/server/audit";
import { notify } from "@/server/notifications";
import { hasRole, hasRoleIgnoringMfa } from "@/server/authz";
import type { SessionUser } from "./session";
import { deviceLabel, getPendingMfaSession, isKnownDevice } from "./session";
import { assertReauthenticated, type ReauthProof } from "./reauth";
import { securityReset } from "./security";
import { warnNewDevice } from "./new-device";
import { decryptSecret, encryptSecret, generateRecoveryCodes, generateTotpSecret, hashRecoveryCode, otpauthUri, verifyTotp } from "./totp";

/**
 * Zwei-Faktor-Anmeldung (TOTP + Wiederherstellungscodes).
 * Für Plattform-Moderation und Administration Pflicht (siehe `requireRole`/`adminPage`),
 * für alle anderen Konten freiwillig.
 */

type U = Pick<SessionUser, "id" | "email" | "role">;

/** Muss dieses Konto 2FA nutzen? (Moderation und höher) */
export const mfaRequiredFor = (u: Pick<SessionUser, "role"> | null | undefined) => hasRoleIgnoringMfa(u, "PLATFORM_MODERATOR");

async function securityNotice(userId: string, message: string) {
  await notify({ recipientId: userId, type: "SECURITY", data: { message }, bundle: false }).catch(() => {});
}

export async function mfaStatus(userId: string) {
  const u = await db.user.findUnique({ where: { id: userId }, select: { totpEnabledAt: true, passwordHash: true, _count: { select: { mfaRecoveryCodes: { where: { usedAt: null } } } } } });
  return { enabled: !!u?.totpEnabledAt, enabledAt: u?.totpEnabledAt ?? null, recoveryCodesLeft: u?._count.mfaRecoveryCodes ?? 0, hasPassword: !!u?.passwordHash };
}

/**
 * Schritt 1 der Einrichtung: Geheimnis erzeugen (noch nicht aktiv) und QR-Code liefern.
 * Nur mit Passwort (bzw. ohne Passwort: frischer Anmeldung mit Apple) – sonst könnte eine gestohlene
 * Sitzung eigene 2FA einrichten und die Inhaberin aussperren.
 */
export async function startMfaSetup(user: U, sessionId: string, proof: ReauthProof) {
  await limit("mfaManage", user.id);
  await assertReauthenticated(user.id, sessionId, proof);
  const current = await db.user.findUnique({ where: { id: user.id }, select: { totpEnabledAt: true } });
  if (current?.totpEnabledAt) throw fail.conflict("Die Zwei-Faktor-Anmeldung ist bereits aktiv.");
  const secret = generateTotpSecret();
  await db.user.update({ where: { id: user.id }, data: { totpSecret: encryptSecret(secret), totpLastStep: null } });
  const uri = otpauthUri(secret, user.email);
  const qrSvg = await QRCode.toString(uri, { type: "svg", margin: 0, errorCorrectionLevel: "M", color: { dark: "#262427", light: "#00000000" } });
  return { qrSvg, secret: secret.replace(/(.{4})/g, "$1 ").trim(), uri };
}

async function storeRecoveryCodes(userId: string) {
  const codes = generateRecoveryCodes();
  await db.$transaction([
    db.mfaRecoveryCode.deleteMany({ where: { userId } }),
    db.mfaRecoveryCode.createMany({ data: codes.map((c) => ({ userId, codeHash: hashRecoveryCode(c) })) }),
  ]);
  return codes;
}

/**
 * Schritt 2: ersten Code bestätigen → aktiv. Gibt die Wiederherstellungscodes einmalig zurück.
 * Diese Sitzung gilt damit als bestätigt; alle anderen Sitzungen und offenen Reset-/E-Mail-Wechsel-Links
 * werden beendet – sie haben den zweiten Faktor nie gesehen.
 */
export async function confirmMfaSetup(user: U, sessionId: string, code: string) {
  await reserveAttempt(user.id);
  const u = await db.user.findUnique({ where: { id: user.id }, select: { totpSecret: true, totpEnabledAt: true } });
  if (!u?.totpSecret) throw fail.invalid("Bitte starte die Einrichtung neu.");
  if (u.totpEnabledAt) throw fail.conflict("Die Zwei-Faktor-Anmeldung ist bereits aktiv.");
  const step = verifyTotp(decryptSecret(u.totpSecret), code, null);
  if (step == null) await recordFailure(user.id);
  else await releaseAttempt(user.id);
  if (step == null) {
    const msg = "Der Code stimmt nicht. Prüfe die Uhrzeit deines Handys und nimm den aktuellen Code.";
    throw fail.invalid(msg, { code: msg });
  }
  const now = new Date();
  const revoked = await db.$transaction(async (tx) => {
    await tx.user.update({ where: { id: user.id }, data: { totpEnabledAt: now, totpLastStep: step } });
    await tx.session.update({ where: { id: sessionId }, data: { mfaVerifiedAt: now } });
    return securityReset(user.id, { keepSessionId: sessionId, tx });
  });
  const codes = await storeRecoveryCodes(user.id);
  await audit({ actorId: user.id, action: "auth.mfa_enabled", targetType: "USER", targetId: user.id, meta: { revokedSessions: revoked.revokedSessions } });
  await securityNotice(user.id, "Die Zwei-Faktor-Anmeldung wurde für dein Konto aktiviert.");
  return { recoveryCodes: codes };
}

/**
 * Gezählt werden (am Ende) nur Fehlversuche: 10 je 15 Minuten und 30 je Tag. Jeder Versuch wird
 * aber schon VOR der Prüfung atomar gezählt und bei Erfolg wieder freigegeben – so können viele
 * gleichzeitige Anfragen die Sperre nicht umgehen (sonst sähen alle „noch nicht gesperrt“).
 */
async function reserveAttempt(userId: string) {
  await limit("mfaFailDay", userId);
  try {
    await limit("mfaFail", userId);
  } catch (e) {
    await releaseAttempt(userId, ["mfaFailDay"]);
    throw e;
  }
}

async function releaseAttempt(userId: string, keys: ("mfaFail" | "mfaFailDay")[] = ["mfaFail", "mfaFailDay"]) {
  for (const k of keys) await db.$executeRaw`UPDATE "RateLimitBucket" SET "count" = GREATEST("count" - 1, 0) WHERE "key" = ${`${k}:${userId}`}`;
}

/** Fehlversuch ist bereits gezählt (reserveAttempt) – hier nur die Warnung beim Erreichen der Sperre. */
async function recordFailure(userId: string) {
  if (await isLimited("mfaFail", userId)) {
    await securityNotice(userId, "Mehrere falsche Codes bei der Zwei-Faktor-Anmeldung. Weitere Versuche sind für 15 Minuten gesperrt. Warst du das nicht, ändere dein Passwort.");
  }
}

/** Prüft einen TOTP- oder Wiederherstellungscode für ein Konto (mit Wiederverwendungsschutz). */
async function checkSecondFactor(userId: string, code: string, kind: "totp" | "recovery") {
  await reserveAttempt(userId);
  const ok = await checkSecondFactorRaw(userId, code, kind);
  if (ok) await releaseAttempt(userId);
  else await recordFailure(userId);
  return ok;
}

async function checkSecondFactorRaw(userId: string, code: string, kind: "totp" | "recovery") {
  const u = await db.user.findUnique({ where: { id: userId }, select: { totpSecret: true, totpEnabledAt: true, totpLastStep: true } });
  if (!u?.totpEnabledAt || !u.totpSecret) return false;
  if (kind === "recovery") {
    const r = await db.mfaRecoveryCode.updateMany({ where: { userId, codeHash: hashRecoveryCode(code), usedAt: null }, data: { usedAt: new Date() } });
    return r.count === 1 ? "recovery" : false;
  }
  const step = verifyTotp(decryptSecret(u.totpSecret), code, u.totpLastStep);
  if (step == null) return false;
  // Atomar: nur übernehmen, wenn kein neuerer Schritt inzwischen verwendet wurde
  const r = await db.user.updateMany({ where: { id: userId, OR: [{ totpLastStep: null }, { totpLastStep: { lt: step } }] }, data: { totpLastStep: step } });
  return r.count === 1 ? "totp" : false;
}

/** Login, Schritt 2: ausstehende Session freischalten. */
export async function verifyMfaLogin(code: string, kind: "totp" | "recovery" = "totp") {
  const s = await getPendingMfaSession();
  if (!s) throw fail.auth();
  const ok = await checkSecondFactor(s.user.id, code, kind);
  if (!ok) {
    await audit({ actorId: s.user.id, action: "auth.mfa_failed", targetType: "USER", targetId: s.user.id, meta: { kind } });
    const msg = kind === "recovery" ? "Dieser Wiederherstellungscode ist ungültig oder wurde bereits verwendet." : "Der Code stimmt nicht. Nimm den aktuellen Code aus der App.";
    throw fail.invalid(msg, { code: msg });
  }
  const now = new Date();
  await db.session.update({ where: { id: s.id }, data: { mfaPending: false, mfaVerifiedAt: now, lastUsedAt: now } });
  await audit({ actorId: s.user.id, action: "auth.mfa_verified", targetType: "USER", targetId: s.user.id, meta: { kind } });
  // Warnung „neues Gerät“ erst jetzt – bei 2FA-Konten wurde sie beim Passwort-Schritt zurückgehalten
  if (!(await isKnownDevice(s.user.id, s.userAgent, s.ipHash ?? "", s.id))) {
    await warnNewDevice(s.user.id, s.deviceLabel ?? deviceLabel(s.userAgent));
  }
  if (ok === "recovery") {
    const left = await db.mfaRecoveryCode.count({ where: { userId: s.user.id, usedAt: null } });
    await securityNotice(s.user.id, `Du hast dich mit einem Wiederherstellungscode angemeldet. Noch ${left} Codes übrig – erzeuge bei Bedarf neue unter Sicherheit.`);
  }
  return { userId: s.user.id };
}

/** Neue Wiederherstellungscodes (alte werden ungültig). Bestätigung mit aktuellem Code. */
export async function regenerateRecoveryCodes(user: U, code: string) {
  if (!(await checkSecondFactor(user.id, code, "totp"))) throw fail.invalid("Der Code stimmt nicht.", { code: "Der Code stimmt nicht. Nimm den aktuellen Code aus der App." });
  const codes = await storeRecoveryCodes(user.id);
  await audit({ actorId: user.id, action: "auth.mfa_recovery_regenerated", targetType: "USER", targetId: user.id });
  return { recoveryCodes: codes };
}

/** Deaktivieren – für Moderation/Administration nicht erlaubt (Pflicht). Braucht Passwort UND Code. */
export async function disableMfa(user: U, sessionId: string, code: string, proof: ReauthProof) {
  if (mfaRequiredFor(user)) throw fail.forbidden("Für Moderations- und Admin-Konten ist die Zwei-Faktor-Anmeldung Pflicht.");
  await assertReauthenticated(user.id, sessionId, proof);
  if (!(await checkSecondFactor(user.id, code, "totp"))) throw fail.invalid("Der Code stimmt nicht.", { code: "Der Code stimmt nicht. Nimm den aktuellen Code aus der App." });
  await clearMfa(user.id);
  await audit({ actorId: user.id, action: "auth.mfa_disabled", targetType: "USER", targetId: user.id });
  await securityNotice(user.id, "Die Zwei-Faktor-Anmeldung wurde für dein Konto deaktiviert.");
}

/**
 * Step-up: Eine Sitzung, die vor dem Aktivieren von 2FA angemeldet wurde (bzw. vor dieser Prüfung je
 * Sitzung), hat den zweiten Faktor nie bestätigt und bekommt keine Plattformrechte. Mit dem aktuellen
 * Code aus der App wird sie nachträglich bestätigt.
 */
export async function verifySessionMfa(user: U, sessionId: string, code: string, kind: "totp" | "recovery" = "totp") {
  const ok = await checkSecondFactor(user.id, code, kind);
  if (!ok) {
    await audit({ actorId: user.id, action: "auth.mfa_failed", targetType: "USER", targetId: user.id, meta: { kind, stepUp: true } });
    const msg = kind === "recovery" ? "Dieser Wiederherstellungscode ist ungültig oder wurde bereits verwendet." : "Der Code stimmt nicht. Nimm den aktuellen Code aus der App.";
    throw fail.invalid(msg, { code: msg });
  }
  await db.session.updateMany({ where: { id: sessionId, userId: user.id, revokedAt: null }, data: { mfaVerifiedAt: new Date() } });
  await audit({ actorId: user.id, action: "auth.mfa_verified", targetType: "USER", targetId: user.id, meta: { kind, stepUp: true } });
}

async function clearMfa(userId: string) {
  await db.$transaction([
    db.user.update({ where: { id: userId }, data: { totpSecret: null, totpEnabledAt: null, totpLastStep: null } }),
    db.mfaRecoveryCode.deleteMany({ where: { userId } }),
  ]);
}

/**
 * Notfall: Superadministration setzt die 2FA eines Kontos zurück (Gerät verloren, keine Codes).
 * Alle Sitzungen werden beendet; die Person richtet 2FA beim nächsten Login neu ein.
 */
export async function adminResetMfa(actor: U, userId: string, reason: string) {
  if (!hasRole(actor, "SUPERADMIN")) throw fail.forbidden("Nur die Superadministration kann die Zwei-Faktor-Anmeldung zurücksetzen.");
  if (actor.id === userId) throw fail.invalid("Die eigene Zwei-Faktor-Anmeldung setzt du in den Einstellungen zurück.");
  const r = reason.trim();
  if (r.length < 5) throw fail.invalid("Bitte begründe den Eingriff (mind. 5 Zeichen).", { reason: "Begründung fehlt" });
  await clearMfa(userId);
  await db.session.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
  await audit({ actorId: actor.id, action: "admin.mfa_reset", targetType: "USER", targetId: userId, meta: { reason: r } });
  await securityNotice(userId, "Die Administration hat deine Zwei-Faktor-Anmeldung zurückgesetzt. Bitte richte sie nach der nächsten Anmeldung neu ein.");
}
