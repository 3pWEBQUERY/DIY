import "server-only";
import { db, type Prisma } from "@/server/db";
import { sendMail } from "@/server/mail";
import { captureError } from "@/server/monitoring";
import { NOTIFICATION_LABEL, type NotificationType } from "@werkraum/shared";
import { notificationHref, notificationText } from "@/server/notifications-format";

/** E-Mail-Versand von Benachrichtigungen (sofort / täglich / wöchentlich gebündelt) – läuft im Worker. */

const warn = (msg: string, extra: Record<string, unknown> = {}) => console.warn(JSON.stringify({ level: "warn", svc: "worker", msg, ...extra }));

export const ALWAYS_INSTANT: NotificationType[] = ["SECURITY", "ORDER_NEW", "MODERATION", "ORDER_STATUS"];

type PendingMail = Awaited<ReturnType<typeof pendingMails>>[number];

/**
 * Offene Benachrichtigungen für genau diesen Lauf – die Bedingung steht in der Abfrage, damit
 * Digest-Einträge den Sofortversand nicht verstopfen (und umgekehrt). Seitenweise per Cursor.
 */
function pendingMails(mode: "instant" | "digest", before: Date, after: { createdAt: Date; id: string } | null) {
  const pref = (v: string) => ({ recipient: { preference: { is: { emailDigest: v } } } });
  const digestUsers: Prisma.NotificationWhereInput[] = [{ recipient: { preference: { is: null } } }, pref("DAILY")];
  // Wöchentlicher Digest nur montags (der Digest-Job läuft täglich)
  if (new Date().getUTCDay() === 1) digestUsers.push(pref("WEEKLY"));
  const where: Prisma.NotificationWhereInput = {
    emailedAt: null,
    createdAt: { lte: before },
    recipient: { status: "ACTIVE" },
    // Fortsetzung hinter dem letzten Eintrag (kein Prisma-Cursor: der Cursor-Eintrag ist nach dem Versand
    // bereits markiert und fiele aus dem Filter – dann würde eine Zeile übersprungen)
    ...(after ? { AND: [{ OR: [{ createdAt: { gt: after.createdAt } }, { createdAt: after.createdAt, id: { gt: after.id } }] }] } : {}),
    ...(mode === "instant"
      ? { OR: [{ type: { in: ALWAYS_INSTANT } }, { AND: [pref("INSTANT"), { recipient: { emailVerifiedAt: { not: null } } }] }] }
      : { type: { notIn: ALWAYS_INSTANT }, recipient: { status: "ACTIVE", emailVerifiedAt: { not: null } }, OR: digestUsers }),
  };
  return db.notification.findMany({
    where,
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: 500,
    include: { recipient: { select: { email: true, status: true, emailVerifiedAt: true, preference: { select: { emailDigest: true } } } }, actor: { select: { profile: { select: { displayName: true, handle: true } } } } },
  });
}

/** Einträge, die nie eine Mail bekommen (inaktive Konten, Digest aus, unbestätigte Adresse) als erledigt markieren. */
async function skipUnmailable() {
  const now = new Date();
  await db.notification.updateMany({
    where: {
      emailedAt: null,
      OR: [
        { recipient: { status: { not: "ACTIVE" } } },
        { type: { notIn: ALWAYS_INSTANT }, recipient: { preference: { is: { emailDigest: "OFF" } } } },
        { type: { notIn: ALWAYS_INSTANT }, recipient: { emailVerifiedAt: null } },
      ],
    },
    data: { emailedAt: now },
  });
}

export async function sendEmails(mode: "instant" | "digest") {
  await skipUnmailable();
  // Kurze Wartezeit erlaubt Bündelung (z. B. mehrere Likes in Folge)
  const before = new Date(Date.now() - (mode === "instant" ? 90_000 : 0));
  let after: { createdAt: Date; id: string } | null = null;
  for (let page = 0; page < 40; page++) {
    const batch: PendingMail[] = await pendingMails(mode, before, after);
    if (!batch.length) break;
    await mailBatch(batch);
    const last = batch[batch.length - 1]!;
    after = { createdAt: last.createdAt, id: last.id };
    if (batch.length < 500) break;
  }
}

async function mailBatch(pending: PendingMail[]) {
  const appUrl = process.env.APP_URL ?? "http://localhost:3000";
  const byUser = new Map<string, typeof pending>();
  for (const n of pending) {
    const list = byUser.get(n.recipientId) ?? [];
    list.push(n);
    byUser.set(n.recipientId, list);
  }
  for (const [, list] of byUser) {
    const to = list[0]!.recipient.email;
    if (to.endsWith(".invalid")) continue;
    // Vollständige Sätze inkl. Titel/Bestellnummer statt nur „Typ: Name“
    const lines = list.map((n) => {
      const d = (n.data ?? {}) as Record<string, unknown>;
      const excerpt = typeof d.excerpt === "string" && d.excerpt ? `\n  „${d.excerpt.slice(0, 140)}“` : "";
      return `• ${notificationText(n)}${excerpt}`;
    });
    const target = list.length === 1 ? notificationHref(list[0]!) : "/benachrichtigungen";
    const subject = list.length === 1 ? `${NOTIFICATION_LABEL[list[0]!.type as NotificationType] ?? "Neuigkeit"} auf Werkuno` : `${list.length} Neuigkeiten auf Werkuno`;
    try {
      const r = await sendMail(to, subject, `Das ist in deiner Werkstatt passiert:\n\n${lines.join("\n\n")}`, { cta: { label: "Ansehen", url: `${appUrl}${target}` } });
      // Bei Versandfehler offen lassen → nächster Lauf versucht es erneut; nach 48 Std. aufgeben
      // (sonst Endlosschleife, z.B. solange die Absender-Domain nicht bestätigt ist)
      const failed = "failed" in r && r.failed;
      const stale = list.filter((n) => n.createdAt.getTime() < Date.now() - 48 * 3600_000).map((n) => n.id);
      const done = failed ? stale : list.map((n) => n.id);
      if (done.length) await db.notification.updateMany({ where: { id: { in: done } }, data: { emailedAt: new Date() } });
    } catch (err) {
      warn("email_failed", { err: String(err) });
      await captureError(err, { source: "WORKER", path: "email" });
    }
  }
}

