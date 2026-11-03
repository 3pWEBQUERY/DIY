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
  return new NextResponse(new Uint8Array(obj.body), {
    headers: {
      "Content-Type": TYPES[ext] ?? obj.mime ?? "application/octet-stream",
      "Cache-Control": "public, max-age=31536000, immutable",
      ETag: etag,
      "X-Content-Type-Options": "nosniff",
    },
  });
}
