import { NextResponse, type NextRequest } from "next/server";
import { unsubscribeByToken } from "@/server/pro/newsletter";

export const dynamic = "force-dynamic";

/** Ein-Klick-Abmeldung vom Newsletter einer Creatorin (RFC 8058) */
export async function POST(req: NextRequest) {
  const r = await unsubscribeByToken(req.nextUrl.searchParams.get("t"));
  return new NextResponse(r ? "Abbestellt" : "Ungültiger Link", { status: r ? 200 : 400 });
}

/** Link in der Mail: Bestätigungsseite (kein Abmelden per GET – Link-Vorschauen würden sonst abmelden) */
export async function GET(req: NextRequest) {
  const url = new URL("/newsletter-abbestellen", req.nextUrl.origin);
  const t = req.nextUrl.searchParams.get("t");
  if (t) url.searchParams.set("t", t);
  return NextResponse.redirect(url, 303);
}
