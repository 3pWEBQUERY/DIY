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

/**
 * Sicherheitswarnung, wenn eine weitere Anmeldemöglichkeit (Apple, Pinterest) mit dem Konto verknüpft
 * wurde: Benachrichtigung + E-Mail an die Kontoadresse – auch wenn E-Mails abbestellt sind, denn wer
 * eine Sitzung gestohlen hat, könnte sich so einen dauerhaften Zugang verschaffen.
 */
export async function warnLoginLinked(userId: string, provider: "Apple" | "Pinterest") {
  const u = await db.user.findUnique({ where: { id: userId }, select: { email: true } });
  if (!u) return;
  // Pinterest lässt sich selbst lösen; eine Apple-ID nur über den Support
  const undo = provider === "Pinterest" ? "löse die Verbindung unter Einstellungen → Konto" : "wende dich an den Support";
  const message = `${provider} wurde als Anmeldemöglichkeit mit deinem Konto verbunden. Warst du das nicht, ${undo} und ändere dein Passwort.`;
  await notify({ recipientId: userId, type: "SECURITY", bundle: false, data: { kind: "login_linked", message, href: "/einstellungen/konto" } }).catch(() => {});
  await sendMail(
    u.email,
    `${provider} mit deinem Konto verbunden`,
    `Ab sofort kann man sich mit diesem ${provider}-Konto bei deinem Konto anmelden.\n\nWarst du das nicht? ${undo[0]!.toUpperCase()}${undo.slice(1)}, ändere dein Passwort und melde alle Sitzungen ab.`,
    { eyebrow: "Konto & Sicherheit", cta: { label: "Konto prüfen", url: `${env().APP_URL}/einstellungen/konto` } },
  ).catch(() => {});
}
