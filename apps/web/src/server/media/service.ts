import "server-only";
import { db, type Tx } from "@/server/db";
import { fail } from "@/server/errors";
import { limit } from "@/server/ratelimit";
import { storage, ensureBucketCors } from "@/server/storage";
import { getSetting } from "@/server/settings";
import type { SessionUser } from "@/server/auth/session";

/** Erlaubte Typen (§25.6 Dateityp-Prüfung). SVG bewusst ausgeschlossen (XSS-Risiko). */
export const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif", "image/avif"];
export const VIDEO_TYPES = ["video/mp4", "video/quicktime", "video/webm"];
export const FILE_TYPES = ["application/pdf", "application/zip"];

const EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "image/heif": "heif",
  "image/avif": "avif",
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "video/webm": "webm",
  "application/pdf": "pdf",
  "application/zip": "zip",
};

/** Schritt 1–3 der Media Pipeline: Upload anfordern → Berechtigung & Typ prüfen → signierte Ziel-URL. */
export async function requestUpload(user: SessionUser, input: { mime: string; bytes: number; purpose?: "public" | "private" }) {
  await limit("upload", user.id);
  const mime = input.mime.toLowerCase();
  const isImage = IMAGE_TYPES.includes(mime);
  const isVideo = VIDEO_TYPES.includes(mime);
  const isFile = FILE_TYPES.includes(mime);
  if (!isImage && !isVideo && !isFile) throw fail.invalid("Dieser Dateityp wird nicht unterstützt.");
  if (isFile && input.purpose !== "private") throw fail.invalid("Dateien sind nur für digitale Produkte erlaubt.");
  const maxMb = isImage ? await getSetting("media.maxImageMb") : isVideo ? await getSetting("media.maxVideoMb") : 100;
  if (!Number.isFinite(input.bytes) || input.bytes <= 0 || input.bytes > maxMb * 1024 * 1024) {
    throw fail.invalid(`Die Datei ist zu gross (max. ${maxMb} MB).`);
  }
  const isPrivate = input.purpose === "private";
  const media = await db.media.create({
    data: {
      ownerId: user.id,
      kind: isImage ? "IMAGE" : isVideo ? "VIDEO" : "FILE",
      mime,
      bytes: Math.round(input.bytes),
      isPrivate,
      storageKey: `raw/${user.id}/${crypto.randomUUID()}.${EXT[mime]}`,
    },
  });
  await ensureBucketCors();
  const uploadUrl = await storage().presignPut(media.storageKey, mime, Math.round(input.bytes));
  // Fallback über den eigenen Server, falls der Direkt-Upload (z. B. wegen Netzwerk/CORS) scheitert
  return { mediaId: media.id, uploadUrl, fallbackUrl: `/api/v1/media/${media.id}/upload`, headers: { "Content-Type": mime } };
}

/** Upload über den Server in den Bucket – nur Eigentümer:in, nur angemeldete Grösse, nur einmal. */
export async function uploadViaServer(user: SessionUser, mediaId: string, body: ReadableStream<Uint8Array> | null, contentLength: number) {
  const m = await db.media.findUnique({ where: { id: mediaId } });
  if (!m || m.ownerId !== user.id) throw fail.notFound();
  if (m.state !== "PENDING") throw fail.conflict("Dieses Medium wurde bereits hochgeladen.");
  if (!body) throw fail.invalid("Keine Datei erhalten.");
  if (contentLength && Math.abs(contentLength - m.bytes) > 1024) throw fail.invalid("Die Datei weicht von der Anmeldung ab.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  const reader = body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > m.bytes + 1024) throw fail.invalid("Die Datei ist grösser als angemeldet.");
    chunks.push(value);
  }
  await storage().put(m.storageKey, Buffer.concat(chunks), m.mime, "private, no-store");
  return { ok: true };
}

/** Upload abgeschlossen → Verarbeitung asynchron im Worker (§25.6 Nr. 4). */
export async function completeUpload(user: SessionUser, mediaId: string) {
  const m = await db.media.findUnique({ where: { id: mediaId } });
  if (!m || m.ownerId !== user.id) throw fail.notFound();
  if (m.state !== "PENDING") return { state: m.state, variants: m.variants };
  const head = await storage().head(m.storageKey);
  if (!head) throw fail.invalid("Upload nicht gefunden. Bitte erneut versuchen.");
  if (Math.abs(head.bytes - m.bytes) > 1024) throw fail.invalid("Die hochgeladene Datei weicht von der Anmeldung ab.");
  await db.media.update({ where: { id: m.id }, data: { state: "PROCESSING" } });
  await db.outboxEvent.create({ data: { type: "MediaUploaded", payload: { mediaId: m.id } } });
  // Für sofortiges Feedback: Bilder direkt verarbeiten, falls der Worker (noch) nicht läuft
  if (m.kind === "IMAGE" && process.env.INLINE_MEDIA_PROCESSING !== "false") {
    const { processMedia } = await import("./process");
    await processMedia(m.id).catch((e) => console.error(JSON.stringify({ level: "warn", msg: "inline_media_failed", err: String(e) })));
  }
  const fresh = await db.media.findUniqueOrThrow({ where: { id: m.id }, select: { state: true, variants: true, width: true, height: true } });
  return fresh;
}

/** Medien einer Inhaltsentität zuordnen – nur eigene, verarbeitete Medien (§25.6 Nr. 7). */
export async function attachMedia(tx: Tx, ownerId: string, ids: string[]) {
  if (!ids.length) return;
  const rows = await tx.media.findMany({ where: { id: { in: ids } }, select: { id: true, ownerId: true, state: true } });
  if (rows.length !== new Set(ids).size || rows.some((r) => r.ownerId !== ownerId)) throw fail.forbidden("Ungültige Medien.");
  if (rows.some((r) => r.state === "FAILED" || r.state === "PENDING")) throw fail.invalid("Mindestens ein Medium ist noch nicht hochgeladen.");
  await tx.media.updateMany({ where: { id: { in: ids } }, data: { attachedAt: new Date() } });
}

export async function mediaCoverUrl(mediaId: string | undefined | null) {
  if (!mediaId) return null;
  const m = await db.media.findUnique({ where: { id: mediaId }, select: { variants: true } });
  const v = (m?.variants ?? {}) as Record<string, string>;
  return v.lg ?? v.md ?? null;
}
