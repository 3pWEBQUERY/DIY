/**
 * HEIC/HEIF-Fotos (iPhone-Standardformat) dekodieren.
 *
 * Das mit sharp gelieferte libvips liest HEIF nur als AVIF (AV1) – einen HEVC-Decoder darf es aus
 * Lizenzgründen nicht mitbringen. Auch das ffmpeg im Container (Debian bookworm, 5.1) kann
 * HEIF-Bilder nicht lesen (iPhone-Fotos sind Raster aus 512-px-Kacheln). Darum dekodieren wir
 * HEVC-HEIF mit libheif + libde265 als WebAssembly (`heic-decode`/`libheif-js`): ohne native
 * Abhängigkeiten, gleiches Ergebnis in Entwicklung, CI und Produktion. libheif wendet Drehung
 * und Zuschnitt (irot/imir/clap) selbst an; Metadaten (EXIF/GPS) gehen dabei verloren.
 */

/** Marken (ftyp), die HEVC-kodierte HEIF-Bilder kennzeichnen. AVIF (`avif`/`avis`) liest sharp selbst. */
const HEVC_BRANDS = new Set(["heic", "heix", "heim", "heis", "hevc", "hevx", "hevm", "hevs"]);

/** Ist der Puffer ein HEIF mit HEVC-Bild (also nichts, was sharp selbst lesen kann)? */
export function isHevcHeif(buf: Uint8Array) {
  if (buf.length < 16) return false;
  const str = (a: number, b: number) => String.fromCharCode(...buf.subarray(a, b));
  if (str(4, 8) !== "ftyp") return false;
  const boxSize = Math.min(((buf[0]! << 24) | (buf[1]! << 16) | (buf[2]! << 8) | buf[3]!) >>> 0, buf.length, 512);
  const major = str(8, 12);
  if (major === "avif" || major === "avis") return false;
  const brands = [major];
  for (let i = 16; i + 4 <= boxSize; i += 4) brands.push(str(i, i + 4));
  return brands.some((b) => HEVC_BRANDS.has(b));
}

// Erst bei Bedarf laden: das WebAssembly-Modul (≈ 2 MB) braucht nur, wer HEIC verarbeitet
let decoder: Promise<typeof import("heic-decode").default> | null = null;
const loadDecoder = () => (decoder ??= import("heic-decode").then((m) => m.default));

export class HeicTooLarge extends Error {}

/**
 * Dekodiert das Hauptbild (grösstes Bild der obersten Ebene) als RGBA.
 * `maxPixels` wird vor dem Dekodieren geprüft – wie `limitInputPixels` bei sharp.
 */
export async function decodeHeic(buf: Uint8Array, maxPixels: number): Promise<{ data: Buffer; width: number; height: number; channels: 4 }> {
  const { all } = await loadDecoder();
  const images = await all({ buffer: buf });
  try {
    if (!images.length) throw new Error("HEIF enthält kein Bild");
    const main = images.reduce((a, b) => (b.width * b.height > a.width * a.height ? b : a));
    if (main.width * main.height > maxPixels) throw new HeicTooLarge(`HEIF zu gross (${main.width}×${main.height})`);
    const { data, width, height } = await main.decode();
    return { data: Buffer.from(data.buffer, data.byteOffset, data.byteLength), width, height, channels: 4 };
  } finally {
    images.dispose();
  }
}
