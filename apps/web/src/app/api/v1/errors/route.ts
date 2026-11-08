import type { NextRequest } from "next/server";
import { api, body } from "@/server/api";
import { captureError, requestContext } from "@/server/monitoring";
import { rateLimit } from "@/server/ratelimit";
import { clientIpHash } from "@/server/auth/session";

/**
 * Fehlerberichte aus dem Browser (window.onerror, unbehandelte Promises, Error Boundaries).
 * Ohne Anmeldung erlaubt, pro Adresse begrenzt; es werden keine Formularinhalte übertragen.
 */
const NOISE = [/ResizeObserver loop/i, /^Script error\.?$/i, /chrome-extension:|moz-extension:|safari-web-extension:/i, /Loading chunk \d+ failed/i, /NEXT_REDIRECT|NEXT_NOT_FOUND/];

export const POST = api(async (req: NextRequest) => {
  await rateLimit(`client-error:${await clientIpHash()}`, 30, 600);
  const b = await body<{ name?: string; message?: string; stack?: string; path?: string; digest?: string; kind?: string }>(req);
  const message = String(b.message ?? "").slice(0, 1000);
  const stack = String(b.stack ?? "").slice(0, 8000);
  if (!message || NOISE.some((r) => r.test(message) || r.test(stack))) return { ok: true };
  const e = new Error(message);
  e.name = String(b.name ?? "Error").slice(0, 120);
  e.stack = stack || `${e.name}: ${message}`;
  const ctx = await requestContext();
  await captureError(e, { ...ctx, source: "CLIENT", path: typeof b.path === "string" ? b.path : ctx.path, digest: b.digest ?? null, meta: { kind: String(b.kind ?? "error").slice(0, 30) } });
  return { ok: true };
});
