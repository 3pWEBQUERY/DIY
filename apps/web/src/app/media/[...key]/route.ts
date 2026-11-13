import { NextResponse, type NextRequest } from "next/server";
import { storage } from "@/server/storage";

/**
 * Öffentliche Auslieferung verarbeiteter Medien aus dem privaten Railway Bucket.
 * Nur Schlüssel unter `m/` (verarbeitet, EXIF-frei) sind erlaubt; Rohdateien und
 * private Dateien sind hierüber nie erreichbar (§25.6 Zugriffsschutz).
 */
const TYPES: Record<string, string> = { webp: "image/webp", mp4: "video/mp4", mov: "video/quicktime", webm: "video/webm", jpg: "image/jpeg", png: "image/png" };

export async function GET(req: NextRequest, ctx: { params: Promise<{ key: string[] }> }) {
  const { key: parts } = await ctx.params;
  const key = parts.join("/");
  if (!key.startsWith("m/") || key.includes("..")) return new NextResponse(null, { status: 404 });
  const obj = await storage().get(key);
  if (!obj) return new NextResponse(null, { status: 404 });
  const ext = key.split(".").pop() ?? "";
  const etag = `"${key}"`;
  if (req.headers.get("if-none-match") === etag) return new NextResponse(null, { status: 304 });
  const body = new Uint8Array(obj.body);
  const size = body.byteLength;
  const headers: Record<string, string> = {
    "Content-Type": TYPES[ext] ?? obj.mime ?? "application/octet-stream",
    "Cache-Control": "public, max-age=31536000, immutable",
    ETag: etag,
    "X-Content-Type-Options": "nosniff",
    // Teilanfragen erlauben: iOS (AVPlayer/Safari) spielt Videos nur mit Byte-Ranges ab
    "Accept-Ranges": "bytes",
  };

  const range = parseRange(req.headers.get("range"), size);
  if (range === "invalid") {
    return new NextResponse(null, { status: 416, headers: { ...headers, "Content-Range": `bytes */${size}` } });
  }
  if (range) {
    const [start, end] = range;
    return new NextResponse(body.subarray(start, end + 1), {
      status: 206,
      headers: { ...headers, "Content-Range": `bytes ${start}-${end}/${size}`, "Content-Length": String(end - start + 1) },
    });
  }
  return new NextResponse(body, { headers: { ...headers, "Content-Length": String(size) } });
}

/** `Range: bytes=a-b` (eine Spanne) → [start, end] inklusive; null = keine/ungültige Angabe ignorieren. */
function parseRange(header: string | null, size: number): [number, number] | null | "invalid" {
  if (!header) return null;
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!m || (m[1] === "" && m[2] === "")) return null; // mehrere Spannen o. Ä. → ganze Datei
  let start: number;
  let end: number;
  if (m[1] === "") {
    // Suffix: die letzten n Bytes
    const n = Number(m[2]);
    if (n <= 0) return "invalid";
    start = Math.max(0, size - n);
    end = size - 1;
  } else {
    start = Number(m[1]);
    end = m[2] === "" ? size - 1 : Math.min(Number(m[2]), size - 1);
  }
  if (start >= size || start > end) return "invalid";
  return [start, end];
}
