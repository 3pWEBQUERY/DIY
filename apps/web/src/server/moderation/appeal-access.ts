import "server-only";
import { db } from "@/server/db";
import { verifyAppealToken } from "@/server/moderation/appeal-link";

/**
 * Konto-ID für einen Einspruch über den signierten Mail-Link – nur wenn das Token zu genau diesem Fall
 * passt, die Person die Betroffene des Falls ist und das Konto nicht gelöscht wurde.
 */
export async function resolveAppealUser(caseId: string, token: string | null | undefined) {
  const userId = verifyAppealToken(caseId, token);
  if (!userId) return null;
  const c = await db.moderationCase.findUnique({ where: { id: caseId }, select: { subjectUserId: true, subjectUser: { select: { status: true } } } });
  if (!c || c.subjectUserId !== userId || !c.subjectUser || c.subjectUser.status === "DELETED") return null;
  return userId;
}
