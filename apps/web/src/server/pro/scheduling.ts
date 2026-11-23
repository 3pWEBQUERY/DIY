import "server-only";
import { fail } from "@/server/errors";
import { isPro, PRO_NAME } from "@/server/pro/service";

/**
 * Geplante Veröffentlichung von Projekten und Anleitungen ist Teil von Creator Pro.
 * Beiträge und Blogartikel lassen sich wie bisher für alle planen.
 *
 * Läuft das Abo vor dem Termin aus, wird trotzdem veröffentlicht: Geplant wurde mit gültigem Abo,
 * und ein stilles Liegenbleiben wäre für die Creatorin überraschender.
 */
export async function requireProScheduling(userId: string) {
  if (!(await isPro(userId))) {
    throw fail.forbidden(`Projekte und Anleitungen zeitgesteuert veröffentlichen ist Teil von ${PRO_NAME}.`);
  }
}
