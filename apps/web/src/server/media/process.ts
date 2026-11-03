import sharp from "sharp";
import { db } from "@/server/db";
import { storage, publicMediaUrl } from "@/server/storage";

const SIZES = { thumb: 240, sm: 480, md: 960, lg: 1600 } as const;

/**
 * Medienverarbeitung (§25.6 Nr. 4–6):
 * - Bilder: Auto-Rotation, EXIF/GPS-Entfernung (sharp verwirft Metadaten standardmässig),
 *   WebP-Varianten, Abmessungen, dominante Farbe.
 * - Videos: werden unverändert, aber unter neuem Schlüssel bereitgestellt. Transkodierung
 *   (ffmpeg) ist als eigener Worker-Schritt vorgesehen (Roadmap R5).
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
      const ext = m.storageKey.split(".").pop();
      const key = `m/${m.id}/video.${ext}`;
      await st.put(key, raw.body, m.mime, "public, max-age=31536000, immutable");
      await db.media.update({ where: { id: m.id }, data: { state: "READY", variants: { video: publicMediaUrl(key) } } });
    } else {
      const ext = m.storageKey.split(".").pop();
      const key = `private/${m.ownerId}/${m.id}.${ext}`;
      await st.put(key, raw.body, m.mime, "private, no-store");
      await db.media.update({ where: { id: m.id }, data: { state: "READY", isPrivate: true, storageKey: key } });
    }
    if (!m.storageKey.startsWith("private/")) await st.del(m.storageKey).catch(() => {});
  } catch (e) {
    await db.media.update({ where: { id: m.id }, data: { state: "FAILED" } });
    throw e;
  }
}
