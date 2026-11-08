import "server-only";
import { db } from "@/server/db";
import { fail } from "@/server/errors";
import { hasRole } from "@/server/authz";
import { audit } from "@/server/audit";
import type { SessionUser } from "@/server/auth/session";

/** Fehlerüberwachung im Admin-Bereich (nur Administration). */
type Actor = Pick<SessionUser, "id" | "role"> & { totpEnabledAt?: Date | null };
const admin = (a: Actor) => {
  if (!hasRole(a, "ADMIN")) throw fail.forbidden();
};

export type ErrorFilter = "open" | "resolved" | "ignored";

export async function listErrorGroups(actor: Actor, filter: ErrorFilter, source?: string | null) {
  admin(actor);
  const where = {
    ...(filter === "open" ? { resolvedAt: null, ignoredAt: null } : filter === "resolved" ? { resolvedAt: { not: null }, ignoredAt: null } : { ignoredAt: { not: null } }),
    ...(source ? { source } : {}),
  };
  const day = new Date(Date.now() - 86400_000);
  const [rows, open, resolved, ignored] = await Promise.all([
    db.errorGroup.findMany({ where, orderBy: { lastSeenAt: "desc" }, take: 200, select: { id: true, source: true, name: true, message: true, lastPath: true, count: true, usersHit: true, firstSeenAt: true, lastSeenAt: true, release: true } }),
    db.errorGroup.count({ where: { resolvedAt: null, ignoredAt: null } }),
    db.errorGroup.count({ where: { resolvedAt: { not: null }, ignoredAt: null } }),
    db.errorGroup.count({ where: { ignoredAt: { not: null } } }),
  ]);
  const recent = rows.length
    ? await db.errorOccurrence.groupBy({ by: ["groupId"], where: { groupId: { in: rows.map((r) => r.id) }, createdAt: { gte: day } }, _count: true })
    : [];
  const last24 = new Map(recent.map((r) => [r.groupId, r._count]));
  return { rows: rows.map((r) => ({ ...r, last24h: last24.get(r.id) ?? 0 })), counts: { open, resolved, ignored } };
}

export async function getErrorGroup(actor: Actor, id: string) {
  admin(actor);
  const g = await db.errorGroup.findUnique({ where: { id } });
  if (!g) throw fail.notFound();
  const occurrences = await db.errorOccurrence.findMany({ where: { groupId: id }, orderBy: { createdAt: "desc" }, take: 30 });
  const userIds = [...new Set(occurrences.map((o) => o.userId).filter(Boolean))] as string[];
  const users = userIds.length ? await db.user.findMany({ where: { id: { in: userIds } }, select: { id: true, profile: { select: { handle: true } } } }) : [];
  const handle = new Map(users.map((u) => [u.id, u.profile?.handle ?? null]));
  // Verlauf der letzten 14 Tage (Vorkommen pro Tag)
  const since = new Date(Date.now() - 14 * 86400_000);
  const perDay = await db.$queryRaw<{ day: Date; n: bigint }[]>`
    SELECT date_trunc('day', "createdAt") AS day, count(*) AS n FROM "ErrorOccurrence"
    WHERE "groupId" = ${id} AND "createdAt" >= ${since} GROUP BY 1 ORDER BY 1`;
  return { group: g, occurrences: occurrences.map((o) => ({ ...o, handle: o.userId ? handle.get(o.userId) ?? null : null })), perDay: perDay.map((d) => ({ day: d.day, n: Number(d.n) })) };
}

export async function setErrorState(actor: Actor & { id: string }, id: string, state: "resolve" | "reopen" | "ignore") {
  admin(actor);
  const now = new Date();
  const data = state === "resolve" ? { resolvedAt: now, ignoredAt: null } : state === "ignore" ? { ignoredAt: now, resolvedAt: null } : { resolvedAt: null, ignoredAt: null };
  await db.errorGroup.update({ where: { id }, data });
  await audit({ actorId: actor.id, action: `admin.error_${state}`, targetType: "ERROR", targetId: id });
}

/** Offene Fehler mit Vorkommen in den letzten 24 h (Badge in der Admin-Navigation). */
export async function openErrorCount() {
  return db.errorGroup.count({ where: { resolvedAt: null, ignoredAt: null, lastSeenAt: { gte: new Date(Date.now() - 86400_000) } } });
}
