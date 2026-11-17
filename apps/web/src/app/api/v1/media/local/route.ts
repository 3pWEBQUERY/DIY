import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { isLocalStorage, signLocal, storage } from "@/server/storage";

/** Nur Entwicklung: Ersatz für Presigned-S3-URLs, wenn kein Bucket konfiguriert ist. */
function verify(req: NextRequest, op: "put" | "get") {
  const key = req.nextUrl.searchParams.get("key") ?? "";
  const exp = Number(req.nextUrl.searchParams.get("exp"));
  const sig = req.nextUrl.searchParams.get("sig") ?? "";
  const bytes = req.nextUrl.searchParams.get("bytes") ?? "";
  if (!isLocalStorage() || !key || !exp || exp < Date.now()) return null;
  if (op === "put" && !/^\d+$/.test(bytes)) return null;
  const expected = signLocal(op === "put" ? `${key}:${bytes}` : key, exp, op);
  if (sig.length !== expected.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  return key;
}

export async function PUT(req: NextRequest) {
  const key = verify(req, "put");
  if (!key) return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  // Höchstens die angemeldete Grösse (+1 KB Spielraum) – gelesen in Stücken, nie mehr als nötig im Speicher
  const max = Number(req.nextUrl.searchParams.get("bytes")) + 1024;
  if (Number(req.headers.get("content-length") ?? 0) > max) return new NextResponse(null, { status: 413 });
  const chunks: Uint8Array[] = [];
  let size = 0;
  const reader = req.body?.getReader();
  for (;;) {
    const r = await reader?.read();
    if (!r || r.done) break;
    size += r.value.byteLength;
    if (size > max) {
      await reader?.cancel().catch(() => {});
      return new NextResponse(null, { status: 413 });
    }
    chunks.push(r.value);
  }
  const buf = Buffer.concat(chunks);
  await storage().put(key, buf, req.headers.get("content-type") ?? "application/octet-stream", "private");
  return new NextResponse(null, { status: 200 });
}

export async function GET(req: NextRequest) {
  const key = verify(req, "get");
  if (!key) return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  const obj = await storage().get(key);
  if (!obj) return new NextResponse(null, { status: 404 });
  return new NextResponse(new Uint8Array(obj.body), { headers: { "Content-Type": "application/octet-stream", "Content-Disposition": "attachment" } });
}
