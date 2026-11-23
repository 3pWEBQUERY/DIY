import { NextResponse, type NextRequest } from "next/server";
import { recordClick } from "@/server/pro/newsletter";

export const dynamic = "force-dynamic";

/** Link im Creator-Newsletter: Klick zählen und weiterleiten (nur http/https) */
export async function GET(req: NextRequest) {
  const target = await recordClick(req.nextUrl.searchParams.get("t"), req.nextUrl.searchParams.get("u")).catch(() => new URL("/", req.nextUrl.origin).toString());
  return NextResponse.redirect(target, 302);
}
