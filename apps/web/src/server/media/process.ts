import { createReadStream, createWriteStream } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import sharp from "sharp";
import { db } from "@/server/db";
import { storage, publicMediaUrl } from "@/server/storage";
import { patchFrozenMediaRefs, videoLimits } from "./service";
import { notify } from "@/server/notifications";
import { VideoRejected, ffmpegAvailable, transcode } from "./video";
import { decodeHeic, isHevcHeif } from "./heic";

const SIZES = { thumb: 240, sm: 480, md: 960, lg: 1600 } as const;

type Storage = ReturnType<typeof storage>;
const PUBLIC_CACHE = "public, max-age=31536000, immutable";
const MAX_IMAGE_PIXELS = 80_000_000;

function hex(c: { r: number; g: number; b: number }) {
  return `#${[c.r, c.g, c.b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

/** Objekt streamend in eine lokale Datei laden (Videos bis 1 GB nie komplett im Speicher). */
async function download(st: Storage, key: string, file: string) {
  const obj = await st.getStream(key);
  if (!obj || obj === "unsatisfiable") return false;
  await pipeline(Readable.fromWeb(obj.body as import("node:stream/web").ReadableStream<Uint8Array>), createWriteStream(file));
  return true;
}

/** Objekt streamend kopieren (Speicher → Speicher). */
async function copyObject(st: Storage, from: string, to: string, mime: string, cacheControl: string) {
  const obj = await st.getStream(from);
  if (!obj || obj === "unsatisfiable") throw new Error("Quelldatei fehlt");
  await st.putStream(to, Readable.fromWeb(obj.body as import("node:stream/web").ReadableStream<Uint8Array>), obj.size, mime, cacheControl);
}

/** Bild für sharp öffnen; HEVC-HEIC (iPhone) vorher mit libheif dekodieren (siehe heic.ts). */
async function openImage(body: Buffer) {
  if (isHevcHeif(body)) {
    const img = await decodeHeic(body, MAX_IMAGE_PIXELS);
    return sharp(img.data, { raw: { width: img.width, height: img.height, channels: img.channels }, limitInputPixels: MAX_IMAGE_PIXELS });
  }
  return sharp(body, { failOn: "error", limitInputPixels: MAX_IMAGE_PIXELS }).rotate();
}

/**
 * Medienverarbeitung (§25.6 Nr. 4–6):
 * - Bilder: Auto-Rotation, EXIF/GPS-Entfernung (sharp verwirft Metadaten standardmässig),
 *   WebP-Varianten, Abmessungen, dominante Farbe. HEIC/HEIF (iPhone) über libheif (heic.ts).
 * - Videos: ffmpeg-Transkodierung nach MP4 (H.264/AAC, max. 1080p/30 fps, ohne Metadaten)
 *   plus Vorschaubild; Länge gemäss Einstellung „media.maxVideoSeconds“ (siehe video.ts).
 *   Ohne ffmpeg (lokale Entwicklung) wird das Original durchgereicht.
 *   Videos und Dateien laufen streamend über temporäre Dateien – nie als ganzer Puffer im Speicher.
 * - Private Dateien (digitale Produkte) wandern nach `private/…` und sind nie öffentlich.
 */
export async function processMedia(mediaId: string) {
  const m = await db.media.findUnique({ where: { id: mediaId } });
  if (!m || m.state === "READY") return;
  const st = storage();
  if (!(await st.head(m.storageKey))) {
    // Fehlt die Rohdatei, weil ein paralleler Lauf (Inline-Verarbeitung im Request ↔ Worker) fertig ist
    // und sie gelöscht hat, bleibt das Medium READY – nur sonst als FAILED markieren.
    await markFailed(m.id, {});
    return;
  }
  try {
    if (m.kind === "IMAGE") {
      // Bilder sind klein (media.maxImageMb) – als Puffer verarbeiten
      const raw = await st.get(m.storageKey);
      if (!raw) throw new Error("Quelldatei fehlt");
      const base = await openImage(raw.body);
      const meta = await base.metadata();
      const variants: Record<string, string> = {};
      for (const [name, width] of Object.entries(SIZES)) {
        const buf = await base.clone().resize({ width, withoutEnlargement: true }).webp({ quality: name === "thumb" ? 70 : 80 }).toBuffer();
        const key = `m/${m.id}/${name}.webp`;
        await st.put(key, buf, "image/webp", PUBLIC_CACHE);
        variants[name] = publicMediaUrl(key);
      }
      const { dominant } = await base.clone().stats();
      const oriented = (meta.orientation ?? 1) >= 5;
      await db.media.update({
        where: { id: m.id },
        data: {
          state: "READY",
          variants,
          width: oriented ? meta.height : meta.width,
          height: oriented ? meta.width : meta.height,
          dominant: hex(dominant),
        },
      });
    } else if (m.kind === "VIDEO") {
      if (!(await ffmpegAvailable())) {
        console.warn(JSON.stringify({ level: "warn", msg: "ffmpeg_missing", mediaId: m.id }));
        const ext = m.storageKey.split(".").pop();
        const key = `m/${m.id}/video.${ext}`;
        await copyObject(st, m.storageKey, key, m.mime, PUBLIC_CACHE);
        await db.media.update({ where: { id: m.id }, data: { state: "READY", variants: { video: publicMediaUrl(key) } } });
      } else {
        const { maxSeconds } = await videoLimits(m.ownerId);
        const work = await mkdtemp(join(tmpdir(), "werkuno-src-"));
        try {
          const src = join(work, "in");
          if (!(await download(st, m.storageKey, src))) throw new Error("Quelldatei fehlt");
          try {
            await transcode(src, { maxSeconds }, async (r) => {
              const videoKey = `m/${m.id}/video.mp4`;
              await st.putStream(videoKey, createReadStream(r.videoPath), r.videoBytes, "video/mp4", PUBLIC_CACHE);
              const variants: Record<string, string> = { video: publicMediaUrl(videoKey) };
              const posterImg = sharp(r.poster);
              for (const [name, width] of [["poster", 1280], ["sm", 480]] as const) {
                const buf = await posterImg.clone().resize({ width, withoutEnlargement: true }).webp({ quality: 78 }).toBuffer();
                const key = `m/${m.id}/${name}.webp`;
                await st.put(key, buf, "image/webp", PUBLIC_CACHE);
                variants[name] = publicMediaUrl(key);
              }
              const { dominant } = await posterImg.clone().stats();
              await db.media.update({
                where: { id: m.id },
                data: {
                  state: "READY",
                  mime: "video/mp4",
                  bytes: r.videoBytes,
                  variants,
                  width: r.width || null,
                  height: r.height || null,
                  durationMs: r.durationMs,
                  dominant: hex(dominant),
                  processingError: null,
                },
              });
            });
          } catch (e) {
            if (e instanceof VideoRejected) {
              // Fachlich abgelehnt (zu lang, kein Video) → kein erneuter Versuch, Person informieren
              await rejectVideo(m.id, m.ownerId, e.message);
              await st.del(m.storageKey).catch(() => {});
              return;
            }
            throw e;
          }
        } finally {
          await rm(work, { recursive: true, force: true }).catch(() => {});
        }
      }
    } else {
      const ext = m.storageKey.split(".").pop();
      const key = `private/${m.ownerId}/${m.id}.${ext}`;
      await copyObject(st, m.storageKey, key, m.mime, "private, no-store");
      await db.media.update({ where: { id: m.id }, data: { state: "READY", isPrivate: true, storageKey: key } });
    }
    if (!m.storageKey.startsWith("private/")) await st.del(m.storageKey).catch(() => {});
  } catch (e) {
    // Paralleler Lauf war schneller (Rohdatei schon gelöscht) → nicht als Fehler werten
    if (!(await markFailed(m.id, { processingError: m.kind === "VIDEO" ? "Das Video konnte nicht verarbeitet werden. Versuche es mit einem anderen Format (z. B. MP4)." : "Die Datei konnte nicht verarbeitet werden." }))) return;
    throw e;
  }
  // Beim Speichern eingefrorene `url: null` (Medium war noch in Verarbeitung) nachtragen
  await patchFrozenMediaRefs(m.id).catch((e) => console.warn(JSON.stringify({ level: "warn", msg: "media_ref_patch_failed", mediaId: m.id, err: String(e).slice(0, 200) })));
}

/**
 * Bedingt auf FAILED setzen: nie ein bereits fertiges (READY) Medium überschreiben. Inline-Verarbeitung
 * (completeUpload) und Worker können dasselbe Medium gleichzeitig bearbeiten; wer zuerst fertig ist,
 * löscht die Rohdatei – der andere Lauf scheitert dann am fehlenden Original. Gibt zurück, ob markiert wurde.
 */
async function markFailed(mediaId: string, data: { processingError?: string }) {
  const r = await db.media.updateMany({ where: { id: mediaId, state: { not: "READY" } }, data: { state: "FAILED", ...data } });
  return r.count > 0;
}

async function rejectVideo(mediaId: string, ownerId: string, reason: string) {
  if (!(await markFailed(mediaId, { processingError: reason }))) return;
  const post = await db.postMedia.findFirst({ where: { mediaId }, select: { postId: true } });
  await notify({
    recipientId: ownerId,
    type: "MODERATION",
    bundle: false,
    data: { kind: "MEDIA_FAILED", message: `Dein Video wurde nicht veröffentlicht: ${reason}`, href: post ? `/beitrag/${post.postId}` : "/studio/medien" },
  }).catch(() => {});
}
