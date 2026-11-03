import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { AppError, STATUS, toResult } from "@/server/errors";

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
        if (origin && host && new URL(origin).host !== host) throw new AppError("FORBIDDEN", "Ungültige Herkunft der Anfrage.");
      }
      const data = await handler(req, ctx);
      if (data instanceof Response) return data;
      return NextResponse.json({ data }, { headers: { "Cache-Control": "no-store" } });
    } catch (e) {
      const r = toResult(e);
      if (r.ok) return NextResponse.json({ data: null });
      return NextResponse.json({ error: { code: r.code, message: r.error, fields: r.fields } }, { status: STATUS[r.code] });
    }
  };
}

export async function body<T = Record<string, unknown>>(req: NextRequest): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw new AppError("VALIDATION", "Ungültiger JSON-Body.");
  }
}
