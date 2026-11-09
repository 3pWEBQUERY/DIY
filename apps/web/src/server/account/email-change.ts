import "server-only";
import { z } from "zod";
import { db } from "@/server/db";
import { fail } from "@/server/errors";
import { audit } from "@/server/audit";
import { notify } from "@/server/notifications";
import { rateLimit } from "@/server/ratelimit";
import { sendMail } from "@/server/mail";
import { env } from "@/server/env";
import { sha256, token, verifyPassword } from "@/server/crypto";

/**
 * E-Mail-Adresse selbst ändern: Passwort bestätigen → Link an die NEUE Adresse → erst nach
 * Klick wird umgestellt. Die bisherige Adresse wird bei Anfrage und bei Abschluss informiert,
 * damit eine Übernahme nicht unbemerkt bleibt.
 */
export const EMAIL_CHANGE_HOURS = 24;

const requestSchema = z.object({
  email: z.string().trim().toLowerCase().email("Bitte gib eine gültige E-Mail-Adresse ein.").max(254),
  password: z.string().max(200).default(""),
});

const mask = (e: string) => e.replace(/(.{2}).*@/, "$1…@");

export async function requestEmailChange(userId: string, input: unknown) {
  const d = requestSchema.parse(input);
  const u = await db.user.findUniqueOrThrow({ where: { id: userId }, select: { id: true, email: true, passwordHash: true } });
  if (!u.passwordHash) throw fail.invalid("Lege zuerst unten ein Passwort fest – damit bestätigst du die Änderung.", { password: "Kein Passwort festgelegt" });
  await rateLimit(`email-change:${userId}`, 5, 86_400);
  if (!(await verifyPassword(d.password, u.passwordHash))) throw fail.invalid("Das Passwort ist nicht korrekt.", { password: "Passwort nicht korrekt" });
  if (d.email === u.email) throw fail.invalid("Das ist bereits deine aktuelle Adresse.", { email: "Bereits deine Adresse" });
  if (await db.user.findUnique({ where: { email: d.email }, select: { id: true } })) {
    throw fail.invalid("Diese Adresse wird bereits von einem anderen Konto verwendet.", { email: "Bereits vergeben" });
  }
  const raw = token(32);
  await db.$transaction(async (tx) => {
    await tx.verificationToken.deleteMany({ where: { userId, purpose: "EMAIL_CHANGE", usedAt: null } });
    await tx.verificationToken.create({ data: { id: sha256(raw), userId, purpose: "EMAIL_CHANGE", payload: d.email, expiresAt: new Date(Date.now() + EMAIL_CHANGE_HOURS * 3600_000) } });
    await audit({ actorId: userId, action: "account.email_change_requested", targetType: "USER", targetId: userId }, tx);
  });
  const app = env().APP_URL;
  await sendMail(d.email, "Bestätige deine neue E-Mail-Adresse", `Du möchtest diese Adresse für dein Werkuno-Konto verwenden. Bestätige die Änderung mit dem Button – erst dann wird umgestellt.\n\nDer Link ist ${EMAIL_CHANGE_HOURS} Stunden gültig. Warst du das nicht, kannst du diese E-Mail ignorieren.`, {
    eyebrow: "Konto & Sicherheit",
    cta: { label: "Neue Adresse bestätigen", url: `${app}/e-mail-bestaetigen/${raw}` },
  });
  await sendMail(u.email, "Änderung deiner E-Mail-Adresse angefragt", `Für dein Werkuno-Konto wurde eine neue E-Mail-Adresse angegeben: ${mask(d.email)}. Sie wird erst aktiv, wenn der Bestätigungslink an die neue Adresse angeklickt wird.\n\nWarst du das nicht? Ändere sofort dein Passwort und beende alle Sitzungen.`, {
    eyebrow: "Konto & Sicherheit",
    cta: { label: "Sicherheit prüfen", url: `${app}/einstellungen/sicherheit` },
  }).catch(() => {});
  return { email: d.email };
}

/** Link aus der Mail an die neue Adresse. Gibt die neue Adresse zurück oder null (ungültig/abgelaufen/vergeben). */
export async function confirmEmailChange(raw: string) {
  const t = await db.verificationToken.findUnique({ where: { id: sha256(raw) } });
  if (!t || t.purpose !== "EMAIL_CHANGE" || t.usedAt || t.expiresAt < new Date() || !t.payload) return null;
  const newEmail = t.payload;
  const before = await db.user.findUnique({ where: { id: t.userId }, select: { email: true, status: true, subscription: { select: { provider: true, customerId: true } } } });
  if (!before || before.status === "DELETED" || before.status === "BANNED") return null;
  try {
    await db.$transaction(async (tx) => {
      // Einmal-Link: nur wer ihn zuerst einlöst, stellt um
      const claimed = await tx.verificationToken.updateMany({ where: { id: t.id, usedAt: null }, data: { usedAt: new Date() } });
      if (!claimed.count) throw fail.conflict("Link bereits verwendet.");
      await tx.user.update({ where: { id: t.userId }, data: { email: newEmail, emailVerifiedAt: new Date() } });
      await tx.verificationToken.deleteMany({ where: { userId: t.userId, purpose: { in: ["EMAIL_VERIFY", "PASSWORD_RESET"] }, usedAt: null } });
      await audit({ actorId: t.userId, action: "account.email_changed", targetType: "USER", targetId: t.userId }, tx);
      await notify({ recipientId: t.userId, type: "SECURITY", bundle: false, data: { kind: "email_changed", message: `Deine E-Mail-Adresse wurde auf ${mask(newEmail)} geändert.`, href: "/einstellungen/konto" } }, tx);
    });
  } catch (e) {
    // Inzwischen von einem anderen Konto belegt (Unique-Verletzung) oder bereits eingelöst
    if ((e as { code?: string }).code === "P2002" || (e as { code?: string }).code === "CONFLICT") return null;
    throw e;
  }
  await sendMail(before.email, "Deine E-Mail-Adresse wurde geändert", `Die E-Mail-Adresse deines Werkuno-Kontos lautet jetzt ${mask(newEmail)}. Diese Adresse erhält ab sofort keine Mails mehr zu deinem Konto.\n\nWarst du das nicht? Melde dich sofort beim Support.`, {
    eyebrow: "Konto & Sicherheit",
    cta: { label: "Hilfe & Support", url: `${env().APP_URL}/hilfe` },
  }).catch(() => {});
  if (before.subscription?.provider === "stripe" && before.subscription.customerId) {
    const { stripe, paymentsMode } = await import("@/server/commerce/stripe");
    if (paymentsMode() === "stripe") await stripe().customers.update(before.subscription.customerId, { email: newEmail }).catch(() => {});
  }
  return newEmail;
}
