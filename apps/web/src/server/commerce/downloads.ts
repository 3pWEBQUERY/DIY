import "server-only";
import { db } from "@/server/db";
import { fail } from "@/server/errors";
import { rateLimit } from "@/server/ratelimit";
import { storage } from "@/server/storage";
import { slugify } from "@/lib/utils";

const EXT: Record<string, string> = { "application/pdf": "pdf", "application/zip": "zip" };

/**
 * Geschützter Download digitaler Produkte (§13.7): nur Eigentümer:in der Berechtigung,
 * nicht widerrufen, Download-Limit eingehalten. Ausgeliefert wird eine 5-Minuten-URL.
 */
export async function resolveDownload(userId: string, entitlementId: string) {
  await rateLimit(`download:${userId}`, 60, 3600);
  const e = await db.digitalEntitlement.findUnique({
    where: { id: entitlementId },
    select: { id: true, userId: true, revokedAt: true, downloadCount: true, downloadLimit: true, product: { select: { slug: true, digitalKey: true } } },
  });
  if (!e || e.userId !== userId) throw fail.notFound();
  if (e.revokedAt) throw fail.forbidden("Diese Lizenz wurde widerrufen (z. B. nach einer Stornierung).");
  if (!e.product.digitalKey) throw fail.notFound("Die Datei ist derzeit nicht verfügbar. Bitte kontaktiere den Shop.");
  const media = await db.media.findUnique({ where: { id: e.product.digitalKey }, select: { storageKey: true, mime: true, state: true } });
  if (!media || media.state !== "READY") throw fail.unavailable("Die Datei wird gerade vorbereitet. Bitte versuche es in einigen Minuten erneut.");
  // Atomar zählen – das Limit kann auch bei parallelen Klicks nicht überschritten werden.
  const n = await db.$executeRaw`UPDATE "DigitalEntitlement" SET "downloadCount" = "downloadCount" + 1
    WHERE "id" = ${e.id} AND "revokedAt" IS NULL AND ("downloadLimit" IS NULL OR "downloadCount" < "downloadLimit")`;
  if (n === 0) throw fail.forbidden("Das Download-Limit für diese Lizenz ist erreicht. Bitte kontaktiere den Shop.");
  const filename = `${slugify(e.product.slug, 60)}.${EXT[media.mime] ?? media.storageKey.split(".").pop() ?? "bin"}`;
  return storage().presignGet(media.storageKey, 300, filename);
}
