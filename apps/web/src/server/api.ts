import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { AppError, fail, httpStatus, toResult } from "@/server/errors";
import { parseJsonObject } from "@/server/mobile/params";

/**
 * Route-Handler-Wrapper für /api/v1 (Web + iOS):
 * einheitliche Fehlerstruktur, CSRF-Schutz per Origin-Prüfung für Cookie-Sessions,
 * Bearer-Token-Clients (iOS) sind davon ausgenommen.
 */
export function api<C = unknown>(handler: (req: NextRequest, ctx: C) => Promise<unknown>) {
  return async (req: NextRequest, ctx: C) => {
    try {
      if (!["GET", "HEAD", "OPTIONS"].includes(req.method) && !req.headers.get("authorization")) {
        const origin = req.headers.get("origin");
        const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
        if (origin && host && URL.parse(origin)?.host !== host) throw new AppError("FORBIDDEN", "Ungültige Herkunft der Anfrage.");
      }
      const data = await handler(req, ctx);
      if (data instanceof Response) return data;
      return NextResponse.json({ data }, { headers: { "Cache-Control": "no-store" } });
    } catch (e) {
      const r = toResult(e, { path: req.nextUrl.pathname, method: req.method });
      if (r.ok) return NextResponse.json({ data: null });
      return NextResponse.json({ error: { code: r.code, message: r.error, fields: r.fields } }, { status: httpStatus(e, r.code) });
    }
  };
}

/**
 * JSON-Body als Objekt lesen – wie die Mobile-API (`parseJsonObject`): leer → {}, kein gültiges JSON oder
 * kein Objekt (`null`, Array, Zahl, Text …) → HTTP 400 statt eines 500 beim Zugriff auf `b.feld`.
 */
export async function body<T = Record<string, unknown>>(req: NextRequest): Promise<T> {
  let text: string;
  try {
    text = await req.text();
  } catch {
    throw fail.badRequest("Ungültiger JSON-Body.");
  }
  const r = parseJsonObject(text);
  if (!r.ok) throw fail.badRequest(r.reason === "syntax" ? "Ungültiger JSON-Body." : "Der Body muss ein JSON-Objekt sein.");
  return r.value as T;
}
