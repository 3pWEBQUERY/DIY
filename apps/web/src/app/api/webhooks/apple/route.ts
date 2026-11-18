import { NextResponse } from "next/server";
import { handleAppStoreNotification } from "@/server/commerce/appstore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * App Store Server Notifications V2 (§13.7): Apple meldet hier Erstattungen und Widerrufe von
 * In-App-Käufen. Die Nutzlast ist von Apple signiert (JWS) und wird vollständig geprüft.
 * In App Store Connect als Produktions- und Sandbox-URL eintragen: https://werkuno.ch/api/webhooks/apple
 */
export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: { code: "INVALID" } }, { status: 400 });
  }
  // Gültiges JSON, aber kein Objekt (null, Zahl, Liste) → 400 statt TypeError (500)
  if (!body || typeof body !== "object" || Array.isArray(body)) return NextResponse.json({ error: { code: "INVALID" } }, { status: 400 });
  const status = await handleAppStoreNotification(body as { signedPayload?: unknown });
  return NextResponse.json({ received: status === 200 }, { status });
}
