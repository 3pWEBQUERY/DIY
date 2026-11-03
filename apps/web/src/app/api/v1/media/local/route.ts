import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { isLocalStorage, signLocal, storage } from "@/server/storage";

/** Nur Entwicklung: Ersatz für Presigned-S3-URLs, wenn kein Bucket konfiguriert ist. */
function verify(req: NextRequest, op: "put" | "get") {
  const key = req.nextUrl.searchParams.get("key") ?? "";
  const exp = Number(req.nextUrl.searchParams.get("exp"));
  const sig = req.nextUrl.searchParams.get("sig") ?? "";
  if (!isLocalStorage() || !key || !exp || exp < Date.now()) return null;
  const expected = signLocal(key, exp, op);
  if (sig.length !== expected.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  return key;
}

export async function PUT(req: NextRequest) {
  const key = verify(req, "put");
  if (!key) return NextResponse.json({ error: { code: "FORBIDDEN" } }, { status: 403 });
  const buf = Buffer.from(await req.arrayBuffer());
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
