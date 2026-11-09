import "server-only";
import { db } from "@/server/db";
import { audit } from "@/server/audit";
import { notify } from "@/server/notifications";

/**
 * Befristete Sperren laufen von selbst ab: Status zurück auf ACTIVE, damit Nachrichten,
 * E-Mails, geplante Beiträge, Suche und Einladungen wieder funktionieren.
 * Bedingtes Update – eine zwischenzeitlich verlängerte oder in einen Bann
 * umgewandelte Sperre bleibt bestehen.
 */
export async function liftExpiredSuspension(userId: string, now = new Date()) {
  const r = await db.user.updateMany({ where: { id: userId, status: "SUSPENDED", suspendedUntil: { not: null, lte: now } }, data: { status: "ACTIVE", suspendedUntil: null } });
  if (!r.count) return false;
  await audit({ actorId: null, action: "system.suspension_expired", targetType: "USER", targetId: userId }).catch(() => {});
  await notify({ recipientId: userId, type: "MODERATION", bundle: false, data: { kind: "ACCOUNT", message: "Die befristete Sperre deines Kontos ist abgelaufen. Willkommen zurück.", href: "/feed" } }).catch(() => {});
  return true;
}

/** Worker (minütlich): alle abgelaufenen Sperren aufheben. */
export async function liftExpiredSuspensions(now = new Date()) {
  const due = await db.user.findMany({ where: { status: "SUSPENDED", suspendedUntil: { not: null, lte: now } }, select: { id: true }, take: 500 });
  let n = 0;
  for (const u of due) if (await liftExpiredSuspension(u.id, now)) n++;
  return n;
}
