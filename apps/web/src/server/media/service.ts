import "server-only";
import { db, type Tx } from "@/server/db";
import { fail } from "@/server/errors";
import { limit } from "@/server/ratelimit";
import { storage, ensureBucketCors } from "@/server/storage";
import { getSetting } from "@/server/settings";
import { isPro } from "@/server/pro/service";
import type { SessionUser } from "@/server/auth/session";
import { requireFlag } from "@/server/flags";

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

/** Video-Grenzen: Standard oder – mit Creator Pro – die grosszügigeren Pro-Werte. */
export async function videoLimits(userId: string) {
  const [sec, mb, pro] = await Promise.all([getSetting("media.maxVideoSeconds"), getSetting("media.maxVideoMb"), isPro(userId)]);
  if (!pro) return { maxSeconds: sec, maxMb: mb, pro };
  const [psec, pmb] = await Promise.all([getSetting("pro.maxVideoSeconds"), getSetting("pro.maxVideoMb")]);
  return { maxSeconds: Math.max(sec, psec), maxMb: Math.max(mb, pmb), pro };
}

/** Schritt 1–3 der Media Pipeline: Upload anfordern → Berechtigung & Typ prüfen → signierte Ziel-URL. */
export async function requestUpload(user: SessionUser, input: { mime: string; bytes: number; purpose?: "public" | "private"; durationSec?: number | null }) {
  await limit("upload", user.id);
  const mime = input.mime.toLowerCase();
  const isImage = IMAGE_TYPES.includes(mime);
  const isVideo = VIDEO_TYPES.includes(mime);
  const isFile = FILE_TYPES.includes(mime);
  if (!isImage && !isVideo && !isFile) throw fail.invalid("Dieser Dateityp wird nicht unterstützt.");
  if (isVideo) await requireFlag("uploads.video", user.id);
  if (isFile && input.purpose !== "private") throw fail.invalid("Dateien sind nur für digitale Produkte erlaubt.");
  // Dateien (PDF/ZIP) gibt es nur als digitale Produkte – also nur für Shop-Inhaber:innen
  if (isFile && !(await db.shop.findUnique({ where: { ownerId: user.id }, select: { id: true } }))) throw fail.forbidden("Dateien kannst du hochladen, sobald du einen Shop hast.");
  const limits = isVideo ? await videoLimits(user.id) : null;
  const maxMb = isImage ? await getSetting("media.maxImageMb") : limits ? limits.maxMb : 100;
  if (!Number.isFinite(input.bytes) || input.bytes <= 0 || input.bytes > maxMb * 1024 * 1024) {
    throw fail.invalid(`Die Datei ist zu gross (max. ${maxMb} MB).`);
  }
  // Frühe Prüfung mit der vom Browser gelesenen Länge; verbindlich prüft der Worker per ffprobe
  if (isVideo && typeof input.durationSec === "number" && Number.isFinite(input.durationSec)) {
    const maxSec = limits!.maxSeconds;
    if (input.durationSec > maxSec + 1) {
      throw fail.invalid(`Das Video ist zu lang (${Math.round(input.durationSec)} Sek.). Erlaubt sind höchstens ${maxSec >= 60 ? `${Math.round(maxSec / 60)} Min.` : `${maxSec} Sek.`}`);
    }
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

/** Laufende Server-Uploads je Person (im Prozess) – begrenzt parallele grosse Uploads. */
const activeUploads = new Map<string, number>();
const MAX_PARALLEL_SERVER_UPLOADS = 2;

/**
 * Upload über den Server in den Bucket – nur Eigentümer:in, nur angemeldete Grösse, nur einmal.
 * Die Datei wird durchgereicht (Stream), nicht im Arbeitsspeicher gesammelt; eine Datei, die
 * grösser als angemeldet ist, bricht den Upload ab.
 */
export async function uploadViaServer(user: SessionUser, mediaId: string, body: ReadableStream<Uint8Array> | null, contentLength: number) {
  const m = await db.media.findUnique({ where: { id: mediaId } });
  if (!m || m.ownerId !== user.id) throw fail.notFound();
  if (m.state !== "PENDING") throw fail.conflict("Dieses Medium wurde bereits hochgeladen.");
  if (!body) throw fail.invalid("Keine Datei erhalten.");
  if (contentLength && Math.abs(contentLength - m.bytes) > 1024) throw fail.invalid("Die Datei weicht von der Anmeldung ab.");
  const running = activeUploads.get(user.id) ?? 0;
  if (running >= MAX_PARALLEL_SERVER_UPLOADS) throw fail.rate();
  activeUploads.set(user.id, running + 1);
  try {
    const { Readable, Transform } = await import("node:stream");
    let size = 0;
    const guard = new Transform({
      transform(chunk: Buffer, _enc, done) {
        size += chunk.byteLength;
        if (size > m.bytes + 1024) return done(fail.invalid("Die Datei ist grösser als angemeldet."));
        done(null, chunk);
      },
    });
    const stream = Readable.fromWeb(body as import("node:stream/web").ReadableStream<Uint8Array>).pipe(guard);
    // Gestreamt braucht S3 die Länge vorab: die angemeldete Grösse (Abweichung prüft completeUpload)
    await storage().putStream(m.storageKey, stream, contentLength || m.bytes, m.mime, "private, no-store");
    return { ok: true };
  } finally {
    const n = (activeUploads.get(user.id) ?? 1) - 1;
    if (n <= 0) activeUploads.delete(user.id);
    else activeUploads.set(user.id, n);
  }
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
  const rows = await tx.media.findMany({ where: { id: { in: ids } }, select: { id: true, ownerId: true, state: true, processingError: true } });
  if (rows.length !== new Set(ids).size || rows.some((r) => r.ownerId !== ownerId)) throw fail.forbidden("Ungültige Medien.");
  const failed = rows.find((r) => r.state === "FAILED");
  if (failed) throw fail.invalid(failed.processingError ? `${failed.processingError} Entferne die Datei, um fortzufahren.` : "Eine Datei konnte nicht verarbeitet werden. Entferne sie, um fortzufahren.");
  if (rows.some((r) => r.state === "PENDING")) throw fail.invalid("Mindestens ein Medium ist noch nicht hochgeladen.");
  await tx.media.updateMany({ where: { id: { in: ids } }, data: { attachedAt: new Date() } });
}

export async function mediaCoverUrl(mediaId: string | undefined | null) {
  if (!mediaId) return null;
  const m = await db.media.findUnique({ where: { id: mediaId }, select: { variants: true } });
  const v = (m?.variants ?? {}) as Record<string, string>;
  return v.lg ?? v.md ?? null;
}

/** Verarbeitungsstand eines eigenen Mediums (Uploader fragt bei Videos nach). */
export async function mediaStatus(user: SessionUser, mediaId: string) {
  const m = await db.media.findUnique({ where: { id: mediaId }, select: { ownerId: true, state: true, processingError: true, variants: true } });
  if (!m || m.ownerId !== user.id) throw fail.notFound();
  return { state: m.state, error: m.processingError, variants: m.variants as Record<string, string> };
}
