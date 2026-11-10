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
  let body: { signedPayload?: unknown } = {};
  try {
    body = (await req.json()) as { signedPayload?: unknown };
  } catch {
    return NextResponse.json({ error: { code: "INVALID" } }, { status: 400 });
  }
  const status = await handleAppStoreNotification(body);
  return NextResponse.json({ received: status === 200 }, { status });
}
