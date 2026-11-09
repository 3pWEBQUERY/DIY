import "server-only";
import { db } from "@/server/db";
import { env } from "@/server/env";
import { notify } from "@/server/notifications";
import { sendMail } from "@/server/mail";

/**
 * Sicherheitswarnung bei Anmeldung von einem neuen Gerät (§8.1): Benachrichtigung + E-Mail.
 * Wird erst nach vollständiger Anmeldung verschickt – bei Zwei-Faktor-Konten also nach dem Code
 * (siehe verifyMfaLogin). Fehler beim Versand brechen die Anmeldung nie ab.
 */
export async function warnNewDevice(userId: string, deviceLabel: string) {
  const u = await db.user.findUnique({ where: { id: userId }, select: { email: true } });
  if (!u) return;
  await notify({ recipientId: userId, type: "SECURITY", data: { device: deviceLabel }, bundle: false }).catch(() => {});
  await sendMail(
    u.email,
    "Neue Anmeldung bei deinem Konto",
    `Wir haben eine Anmeldung von einem neuen Gerät festgestellt: ${deviceLabel}.\n\nWarst du das nicht? Ändere sofort dein Passwort und melde alle Sitzungen ab.`,
    { eyebrow: "Konto & Sicherheit", cta: { label: "Sitzungen prüfen", url: `${env().APP_URL}/einstellungen/sicherheit` } },
  ).catch(() => {});
}
