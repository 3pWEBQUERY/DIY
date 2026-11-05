import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { AppError, STATUS, fail, toResult } from "@/server/errors";
import { currentUser, getSession, requireUser } from "@/server/auth/session";

/**
 * Mobile-API (iOS) unter /api/v1/app/* – dünne REST-Schicht über die bestehenden
 * Domänen-Services (PRD §25.4, §27). Alle Berechtigungen, Validierungen, Rate Limits,
 * Audit-Einträge und Benachrichtigungen bleiben in den Services. Antwortformat wie `api()`:
 * `{ data }` bzw. `{ error: { code, message, fields } }`.
 */

export type Ctx = {
  req: NextRequest;
  /** Pfadparameter (`:id` → p.id) */
  p: Record<string, string>;
  /** Query-Parameter */
  q: URLSearchParams;
  /** JSON-Body (leer → {}) */
  json: <T = Record<string, unknown>>() => Promise<T>;
};

export type Handler = (c: Ctx) => Promise<unknown>;
export type RouteDef = { method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE"; parts: string[]; handler: Handler };

export function route(method: RouteDef["method"], path: string, handler: Handler): RouteDef {
  return { method, parts: path.split("/").filter(Boolean), handler };
}

export const GET = (path: string, h: Handler) => route("GET", path, h);
export const POST = (path: string, h: Handler) => route("POST", path, h);
export const PUT = (path: string, h: Handler) => route("PUT", path, h);
export const PATCH = (path: string, h: Handler) => route("PATCH", path, h);
export const DELETE = (path: string, h: Handler) => route("DELETE", path, h);

// ───────────────────────── Helfer für Routen ─────────────────────────

export const me = () => requireUser();
export const meAllowSuspended = () => requireUser({ allowSuspended: true });
export const viewer = () => currentUser();
export async function viewerId() {
  return (await currentUser())?.id ?? null;
}
export async function session() {
  const s = await getSession();
  if (!s) throw fail.auth();
  return s;
}

export function str(q: URLSearchParams, key: string) {
  const v = q.get(key);
  return v && v.trim() !== "" ? v : undefined;
}
export function int(q: URLSearchParams, key: string) {
  const v = q.get(key);
  if (v == null || v === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : undefined;
}
export function bool(q: URLSearchParams, key: string) {
  const v = q.get(key);
  return v === "1" || v === "true" || v === "ja";
}
export function need<T>(v: T | null | undefined, msg = "Nicht gefunden."): T {
  if (v == null) throw fail.notFound(msg);
  return v;
}

// ───────────────────────── Dispatcher ─────────────────────────

function match(def: RouteDef, parts: string[]) {
  if (def.parts.length !== parts.length) return null;
  const p: Record<string, string> = {};
  for (let i = 0; i < parts.length; i++) {
    const d = def.parts[i]!;
    const s = parts[i]!;
    if (d.startsWith(":")) {
      try {
        p[d.slice(1)] = decodeURIComponent(s);
      } catch {
        p[d.slice(1)] = s;
      }
    } else if (d !== s) return null;
  }
  return p;
}

/** BigInt (z. B. aus Raw-SQL-Zählungen) sicher serialisieren. */
function serialize(data: unknown) {
  return JSON.stringify({ data: data === undefined ? null : data }, (_k, v) => (typeof v === "bigint" ? Number(v) : v));
}

export async function dispatch(routes: RouteDef[], req: NextRequest, parts: string[]) {
  try {
    // CSRF-Schutz wie api(): Cookie-Clients nur von derselben Herkunft; Bearer-Clients (iOS) ausgenommen.
    if (req.method !== "GET" && !req.headers.get("authorization")) {
      const origin = req.headers.get("origin");
      const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
      if (origin && host && new URL(origin).host !== host) throw new AppError("FORBIDDEN", "Ungültige Herkunft der Anfrage.");
    }
    let params: Record<string, string> | null = null;
    let found: RouteDef | null = null;
    let pathMatched = false;
    for (const def of routes) {
      const m = match(def, parts);
      if (!m) continue;
      pathMatched = true;
      if (def.method === req.method) {
        params = m;
        found = def;
        break;
      }
    }
    if (!found || !params) {
      if (pathMatched) throw new AppError("VALIDATION", "Methode nicht erlaubt.");
      throw fail.notFound("Unbekannter Endpunkt.");
    }
    let cached: unknown;
    const ctx: Ctx = {
      req,
      p: params,
      q: req.nextUrl.searchParams,
      json: async <T,>() => {
        if (cached !== undefined) return cached as T;
        const text = await req.text();
        if (!text) return (cached = {}) as T;
        try {
          return (cached = JSON.parse(text)) as T;
        } catch {
          throw new AppError("VALIDATION", "Ungültiger JSON-Body.");
        }
      },
    };
    const data = await found.handler(ctx);
    if (data instanceof Response) return data;
    return new NextResponse(serialize(data), { headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
  } catch (e) {
    const r = toResult(e);
    if (r.ok) return NextResponse.json({ data: null });
    return NextResponse.json({ error: { code: r.code, message: r.error, fields: r.fields } }, { status: STATUS[r.code] });
  }
}
