import sharp from "sharp";
import { db } from "@/server/db";
import { storage, publicMediaUrl } from "@/server/storage";
import { videoLimits } from "./service";
import { notify } from "@/server/notifications";
import { VideoRejected, ffmpegAvailable, transcode } from "./video";

const SIZES = { thumb: 240, sm: 480, md: 960, lg: 1600 } as const;

/**
 * Medienverarbeitung (§25.6 Nr. 4–6):
 * - Bilder: Auto-Rotation, EXIF/GPS-Entfernung (sharp verwirft Metadaten standardmässig),
 *   WebP-Varianten, Abmessungen, dominante Farbe.
 * - Videos: ffmpeg-Transkodierung nach MP4 (H.264/AAC, max. 1080p/30 fps, ohne Metadaten)
 *   plus Vorschaubild; Länge gemäss Einstellung „media.maxVideoSeconds“ (siehe video.ts).
 *   Ohne ffmpeg (lokale Entwicklung) wird das Original durchgereicht.
 * - Private Dateien (digitale Produkte) wandern nach `private/…` und sind nie öffentlich.
 */
export async function processMedia(mediaId: string) {
  const m = await db.media.findUnique({ where: { id: mediaId } });
  if (!m || m.state === "READY") return;
  const st = storage();
  const raw = await st.get(m.storageKey);
  if (!raw) {
    await db.media.update({ where: { id: m.id }, data: { state: "FAILED" } });
    return;
  }
  try {
    if (m.kind === "IMAGE") {
      const base = sharp(raw.body, { failOn: "error", limitInputPixels: 80_000_000 }).rotate();
      const meta = await base.metadata();
      const variants: Record<string, string> = {};
      for (const [name, width] of Object.entries(SIZES)) {
        const buf = await base.clone().resize({ width, withoutEnlargement: true }).webp({ quality: name === "thumb" ? 70 : 80 }).toBuffer();
        const key = `m/${m.id}/${name}.webp`;
        await st.put(key, buf, "image/webp", "public, max-age=31536000, immutable");
        variants[name] = publicMediaUrl(key);
      }
      const { dominant } = await base.clone().stats();
      const hex = `#${[dominant.r, dominant.g, dominant.b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
      const oriented = (meta.orientation ?? 1) >= 5;
      await db.media.update({
        where: { id: m.id },
        data: {
          state: "READY",
          variants,
          width: oriented ? meta.height : meta.width,
          height: oriented ? meta.width : meta.height,
          dominant: hex,
        },
      });
    } else if (m.kind === "VIDEO") {
      if (!(await ffmpegAvailable())) {
        console.warn(JSON.stringify({ level: "warn", msg: "ffmpeg_missing", mediaId: m.id }));
        const ext = m.storageKey.split(".").pop();
        const key = `m/${m.id}/video.${ext}`;
        await st.put(key, raw.body, m.mime, "public, max-age=31536000, immutable");
        await db.media.update({ where: { id: m.id }, data: { state: "READY", variants: { video: publicMediaUrl(key) } } });
      } else {
        const { maxSeconds } = await videoLimits(m.ownerId);
        let r;
        try {
          r = await transcode(raw.body, { maxSeconds });
        } catch (e) {
          if (e instanceof VideoRejected) {
            // Fachlich abgelehnt (zu lang, kein Video) → kein erneuter Versuch, Person informieren
            await rejectVideo(m.id, m.ownerId, e.message);
            await st.del(m.storageKey).catch(() => {});
            return;
          }
          throw e;
        }
        const videoKey = `m/${m.id}/video.mp4`;
        await st.put(videoKey, r.video, "video/mp4", "public, max-age=31536000, immutable");
        const variants: Record<string, string> = { video: publicMediaUrl(videoKey) };
        const posterImg = sharp(r.poster);
        for (const [name, width] of [["poster", 1280], ["sm", 480]] as const) {
          const buf = await posterImg.clone().resize({ width, withoutEnlargement: true }).webp({ quality: 78 }).toBuffer();
          const key = `m/${m.id}/${name}.webp`;
          await st.put(key, buf, "image/webp", "public, max-age=31536000, immutable");
          variants[name] = publicMediaUrl(key);
        }
        const { dominant } = await posterImg.clone().stats();
        await db.media.update({
          where: { id: m.id },
          data: {
            state: "READY",
            mime: "video/mp4",
            bytes: r.video.length,
            variants,
            width: r.width || null,
            height: r.height || null,
            durationMs: r.durationMs,
            dominant: `#${[dominant.r, dominant.g, dominant.b].map((v) => v.toString(16).padStart(2, "0")).join("")}`,
            processingError: null,
          },
        });
      }
    } else {
      const ext = m.storageKey.split(".").pop();
      const key = `private/${m.ownerId}/${m.id}.${ext}`;
      await st.put(key, raw.body, m.mime, "private, no-store");
      await db.media.update({ where: { id: m.id }, data: { state: "READY", isPrivate: true, storageKey: key } });
    }
    if (!m.storageKey.startsWith("private/")) await st.del(m.storageKey).catch(() => {});
  } catch (e) {
    await db.media.update({ where: { id: m.id }, data: { state: "FAILED", processingError: m.kind === "VIDEO" ? "Das Video konnte nicht verarbeitet werden. Versuche es mit einem anderen Format (z. B. MP4)." : "Die Datei konnte nicht verarbeitet werden." } });
    throw e;
  }
}

async function rejectVideo(mediaId: string, ownerId: string, reason: string) {
  await db.media.update({ where: { id: mediaId }, data: { state: "FAILED", processingError: reason } });
  const post = await db.postMedia.findFirst({ where: { mediaId }, select: { postId: true } });
  await notify({
    recipientId: ownerId,
    type: "MODERATION",
    bundle: false,
    data: { kind: "MEDIA_FAILED", message: `Dein Video wurde nicht veröffentlicht: ${reason}`, href: post ? `/beitrag/${post.postId}` : "/studio/medien" },
  }).catch(() => {});
}
