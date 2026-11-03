import { NextResponse } from "next/server";
import { AppError } from "@/server/errors";
import { verifyWebhook } from "@/server/commerce/stripe";
import { processStripeWebhook } from "@/server/commerce/payments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Stripe-Webhook (§13.6, §25.7): Signatur gegen den unveränderten Body prüfen,
 * Event idempotent unter seiner ID speichern und verarbeiten. Fehler → 500, damit
 * Stripe erneut zustellt. Bestellungen werden ausschliesslich hier „bezahlt“.
 */
export async function POST(req: Request) {
  const raw = await req.text();
  let event;
  try {
    event = verifyWebhook(raw, req.headers.get("stripe-signature"));
  } catch (e) {
    const status = e instanceof AppError && e.code === "UNAVAILABLE" ? 503 : 400;
    console.error(JSON.stringify({ level: "warn", msg: "webhook_rejected", status, err: e instanceof Error ? e.message : String(e) }));
    return NextResponse.json({ error: { code: status === 503 ? "UNAVAILABLE" : "INVALID_SIGNATURE" } }, { status });
  }
  const r = await processStripeWebhook(event);
  return NextResponse.json({ received: true, duplicate: r.duplicate ?? false }, { status: r.status });
}
