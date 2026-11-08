import "server-only";
import type { PlatformRole } from "@/generated/prisma/client";
import { db } from "@/server/db";
import { fail } from "@/server/errors";
import { requireUser, type SessionUser } from "@/server/auth/session";

/**
 * Rollenmodell (PRD §7). Rechte werden ausschliesslich serverseitig geprüft.
 * Plattformrollen sind hierarchisch; Verkäufer- und Community-Rollen sind
 * zusätzliche, bereichsbezogene Berechtigungen (RoleAssignment / CommunityMember).
 */
const RANK: Record<PlatformRole, number> = { MEMBER: 0, PLATFORM_MODERATOR: 1, ADMIN: 2, SUPERADMIN: 3 };

/**
 * Plattformrecht prüfen. Für die angemeldete Person (Objekt mit `totpEnabledAt`) gelten
 * Moderations-/Adminrechte nur mit aktiver Zwei-Faktor-Anmeldung. Objekte ohne dieses Feld
 * (z. B. Rang-Vergleich mit anderen Konten) werden rein nach Rolle bewertet.
 */
export function hasRole(user: (Pick<SessionUser, "role"> & { totpEnabledAt?: Date | null }) | null | undefined, min: PlatformRole) {
  if (!user || RANK[user.role] < RANK[min]) return false;
  if (RANK[min] >= RANK.PLATFORM_MODERATOR && "totpEnabledAt" in user && !user.totpEnabledAt) return false;
  return true;
}

/** Nur die Rolle, ohne 2FA-Bedingung – für Hinweise wie „richte 2FA ein“ und die Navigation. */
export function hasRoleIgnoringMfa(user: Pick<SessionUser, "role"> | null | undefined, min: PlatformRole) {
  return !!user && RANK[user.role] >= RANK[min];
}

export async function requireRole(min: PlatformRole) {
  const u = await requireUser();
  if (!hasRole(u, min)) throw fail.forbidden();
  // Moderation/Administration nur mit Zwei-Faktor-Anmeldung (Session ist dann bereits bestätigt)
  if (RANK[min] >= RANK.PLATFORM_MODERATOR && !u.totpEnabledAt) {
    throw fail.forbidden("Für Moderation und Administration ist die Zwei-Faktor-Anmeldung erforderlich. Richte sie unter Einstellungen → Sicherheit ein.");
  }
  return u;
}

export function isOwner(user: { id: string } | null | undefined, ownerId: string) {
  return !!user && user.id === ownerId;
}

/** Eigentümer ODER Moderator darf. */
export function assertOwnerOrMod(user: Pick<SessionUser, "id" | "role">, ownerId: string) {
  if (user.id !== ownerId && !hasRole(user, "PLATFORM_MODERATOR")) throw fail.forbidden();
}

export async function isVerifiedSeller(userId: string) {
  const shop = await db.shop.findUnique({ where: { ownerId: userId }, select: { status: true } });
  return shop?.status === "ACTIVE";
}

export async function communityRole(communityId: string, userId: string | undefined) {
  if (!userId) return null;
  const m = await db.communityMember.findUnique({
    where: { communityId_userId: { communityId, userId } },
    select: { role: true, state: true, mutedUntil: true },
  });
  return m;
}

export async function requireCommunityModerator(communityId: string) {
  const u = await requireUser();
  // Plattform-Rechte nur mit 2FA; sonst wie normales Mitglied prüfen
  if (hasRole(u, "PLATFORM_MODERATOR") && u.totpEnabledAt) return u;
  const m = await communityRole(communityId, u.id);
  if (!m || m.state !== "ACTIVE" || !["OWNER", "ADMIN", "MODERATOR"].includes(m.role)) throw fail.forbidden();
  return u;
}

export function canMessage(user: Pick<SessionUser, "messagingRestrictedUntil">) {
  return !user.messagingRestrictedUntil || user.messagingRestrictedUntil < new Date();
}
