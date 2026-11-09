import { NextResponse, type NextRequest } from "next/server";
import { unsubscribeByToken } from "@/server/mail-unsubscribe";

export const dynamic = "force-dynamic";

/** Ein-Klick-Abmeldung aus dem Postfach (RFC 8058: POST mit „List-Unsubscribe=One-Click“). */
export async function POST(req: NextRequest) {
  const ok = await unsubscribeByToken(req.nextUrl.searchParams.get("t"));
  return new NextResponse(ok ? "Abbestellt" : "Ungültiger Link", { status: ok ? 200 : 400 });
}

/** Klick auf den Link in der Fusszeile: Bestätigungsseite (kein Abbestellen per GET – Link-Vorschauen würden sonst abmelden). */
export async function GET(req: NextRequest) {
  const url = new URL("/abbestellen", req.nextUrl.origin);
  const t = req.nextUrl.searchParams.get("t");
  if (t) url.searchParams.set("t", t);
  return NextResponse.redirect(url, 303);
}
