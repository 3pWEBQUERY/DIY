import "server-only";
import type { Tx } from "@/server/db";

/**
 * Profilzähler aus dem tatsächlichen Bestand neu berechnen – statt blind zu erhöhen/verringern.
 * Robust gegen Mehrfachaufrufe und Wechsel zwischen Entwurf, ausgeblendet, entfernt und veröffentlicht.
 */
export async function syncPostCount(tx: Tx, userId: string) {
  const n = await tx.post.count({ where: { authorId: userId, state: "PUBLISHED" } });
  await tx.userProfile.updateMany({ where: { userId }, data: { postCount: n } });
}

export async function syncProjectCount(tx: Tx, ownerId: string) {
  const n = await tx.project.count({ where: { ownerId, state: "PUBLISHED", visibility: "PUBLIC" } });
  await tx.userProfile.updateMany({ where: { userId: ownerId }, data: { projectCount: n } });
}
