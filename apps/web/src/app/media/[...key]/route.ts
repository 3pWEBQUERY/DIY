import { NextResponse, type NextRequest } from "next/server";
import { parseRange, storage } from "@/server/storage";
import { isMediaPublic } from "@/server/media/service";

/**
 * Öffentliche Auslieferung verarbeiteter Medien aus dem privaten Railway Bucket.
 * Nur Schlüssel unter `m/` (verarbeitet, EXIF-frei) sind erlaubt; Rohdateien und
 * private Dateien sind hierüber nie erreichbar (§25.6 Zugriffsschutz).
 */
const TYPES: Record<string, string> = { webp: "image/webp", mp4: "video/mp4", mov: "video/quicktime", webm: "video/webm", jpg: "image/jpeg", png: "image/png" };

/**
 * Caching: Der Browser darf jedes verarbeitete Medium lange behalten (Schlüssel = Inhalt). Geteilte Caches
 * (Proxy/CDN) nur Medien öffentlicher Inhalte – und auch die nur eine Woche, damit gelöschte oder privat
 * gestellte Inhalte nicht ein Jahr lang dort liegen. Medien aus Nachrichten, privaten Projekten, Entwürfen
 * oder gelöschten Inhalten: `private` (siehe isMediaPublic).
 */
const PRIVATE_CACHE = "private, max-age=31536000, immutable";
const PUBLIC_CACHE = "public, max-age=604800";
async function cacheControlFor(key: string) {
  const mediaId = key.split("/")[1];
  if (!mediaId) return PRIVATE_CACHE;
  return (await isMediaPublic(mediaId).catch(() => false)) ? PUBLIC_CACHE : PRIVATE_CACHE;
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ key: string[] }> }) {
  const { key: parts } = await ctx.params;
  const key = parts.join("/");
  if (!key.startsWith("m/") || key.includes("..")) return new NextResponse(null, { status: 404 });
  const ext = key.split(".").pop() ?? "";
  const etag = `"${key}"`;
  // Verarbeitete Medien sind unveränderlich (Schlüssel = Inhalt) → vor dem Laden aus dem Speicher prüfen
  if (req.headers.get("if-none-match") === etag) return new NextResponse(null, { status: 304, headers: { ETag: etag } });
  // Streamen statt die ganze Datei in den Speicher zu laden; Byte-Bereiche (206) für Video – Safari/iOS
  // spielen <video> nur mit Range-Unterstützung ab. If-Range: nur wenn das ETag passt, sonst ganze Datei.
  const ifRange = req.headers.get("if-range");
  const range = !ifRange || ifRange === etag ? parseRange(req.headers.get("range")) : null;
  const [obj, cacheControl] = await Promise.all([storage().getStream(key, range), cacheControlFor(key)]);
  if (!obj) return new NextResponse(null, { status: 404 });
  if (obj === "unsatisfiable") {
    const head = await storage().head(key);
    return new NextResponse(null, { status: 416, headers: { ...(head ? { "Content-Range": `bytes */${head.bytes}` } : {}), "Accept-Ranges": "bytes" } });
  }
  const headers: Record<string, string> = {
    "Content-Type": TYPES[ext] ?? obj.mime ?? "application/octet-stream",
    "Content-Length": String(obj.length),
    "Accept-Ranges": "bytes",
    "Cache-Control": cacheControl,
    ETag: etag,
    "X-Content-Type-Options": "nosniff",
  };
  if (obj.range) headers["Content-Range"] = `bytes ${obj.range.start}-${obj.range.end}/${obj.size}`;
  return new NextResponse(obj.body, { status: obj.range ? 206 : 200, headers });
}
