import "server-only";
import { db } from "@/server/db";
import { AppError } from "@/server/errors";

export const ADULT_REQUIRED_MESSAGE = "Bitte bestätige zuerst, dass du mindestens 18 Jahre alt bist (Profileinrichtung unter „Willkommen“).";

/**
 * Schreibende Aktionen (Beiträge, Kommentare, Likes, Folgen, Nachrichten, Käufe) nur mit bestätigtem
 * Mindestalter (18+). Konten über „Mit Apple anmelden“ bestätigen es erst im Onboarding; Lesen bleibt
 * ohne Bestätigung möglich. Objekte ohne das Feld werden in der Datenbank nachgeschlagen.
 */
export async function requireAdult(user: { id: string; adultConfirmedAt?: Date | null }) {
  const at = "adultConfirmedAt" in user ? user.adultConfirmedAt : (await db.user.findUnique({ where: { id: user.id }, select: { adultConfirmedAt: true } }))?.adultConfirmedAt;
  if (!at) throw new AppError("FORBIDDEN", ADULT_REQUIRED_MESSAGE, { adult: "Erforderlich" });
}
