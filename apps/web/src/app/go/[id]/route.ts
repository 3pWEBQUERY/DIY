import { NextResponse, type NextRequest } from "next/server";
import { offerClick } from "@/server/materials/offers";
import { clientIpHash } from "@/server/auth/session";

/** Weiterleitung zu einer Bezugsquelle (Preisvergleich/Partnerlink) mit anonymer Klickzählung. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const url = /^[a-z0-9]{10,40}$/i.test(id) ? await offerClick(id, await clientIpHash().catch(() => null)) : null;
  if (!url) return NextResponse.redirect(new URL("/materialien", req.nextUrl.origin), 302);
  return new NextResponse(null, { status: 302, headers: { Location: url, "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow", "Referrer-Policy": "origin" } });
}
