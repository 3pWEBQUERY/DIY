import { NextResponse, type NextRequest } from "next/server";
import { recordOpen } from "@/server/pro/newsletter";

export const dynamic = "force-dynamic";

// 1×1 transparentes GIF
const GIF = Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64");

/** Öffnungs-Pixel im Creator-Newsletter: zählt eine Öffnung je Empfänger:in */
export async function GET(req: NextRequest) {
  await recordOpen(req.nextUrl.searchParams.get("t")).catch(() => false);
  return new NextResponse(GIF, { headers: { "Content-Type": "image/gif", "Cache-Control": "no-store, max-age=0", "Content-Length": String(GIF.length) } });
}
