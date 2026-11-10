import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { AppError, fail, httpStatus, toResult } from "@/server/errors";
import { currentUser, getSession, requireUser } from "@/server/auth/session";
import { requireFlag } from "@/server/flags";
import { requireAdult } from "@/server/auth/adult";
import { clampInt, optInt, parseJsonObject } from "./params";
import { withAppPricing } from "@/server/commerce/appstore";

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
  /** JSON-Body als Objekt (leer → {}; kein JSON/kein Objekt → 400) */
  json: <T = Record<string, unknown>>() => Promise<T>;
  /** JSON-Body gegen ein zod-Schema prüfen (unbekannte Felder werden verworfen; falsche Typen → 422) */
  body: <S extends z.ZodRawShape>(shape: S) => Promise<z.infer<z.ZodObject<S>>>;
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
const MARKET_PREFIXES = new Set(["market", "cart", "checkout"]);
/**
 * Schreibende Endpunkte, die auch ohne bestätigtes Mindestalter (18+) erlaubt sind: Anmeldung,
 * Onboarding (dort wird es bestätigt – inkl. Folgen/Beitreten aus den Vorschlägen), Konto &
 * Einstellungen, Support, Einspruch, Melden/Blockieren/Stummschalten.
 */
const ADULT_FREE_PREFIXES = new Set(["auth", "onboarding", "settings", "me", "devices", "support", "appeals", "notifications", "reports", "track", "hide"]);
const adultFree = (parts: string[]) =>
  ADULT_FREE_PREFIXES.has(parts[0] ?? "") ||
  (parts[0] === "users" && ["block", "mute", "follow"].includes(parts[2] ?? "")) ||
  (parts[0] === "communities" && parts.length === 3 && ["join", "leave"].includes(parts[2] ?? ""));
/** Bereiche, in denen digitale Produkte mit ihrem Web-Preis erscheinen (Shop-Verwaltung, Bestellungen). */
const APP_PRICING_EXCLUDED = new Set(["studio", "admin", "orders", "cart", "checkout"]);

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
/** Optionale Ganzzahl, auf [min, max] geklemmt (Standard: nicht-negativ, ≤ 1 Mio.). */
export function int(q: URLSearchParams, key: string, range: { min?: number; max?: number } = {}) {
  return optInt(q.get(key), { min: range.min ?? 0, max: range.max ?? 1_000_000 });
}
/** Seitengrösse (take/limit): fehlend/NaN → def, sonst auf [1, max] geklemmt. */
export function takeParam(q: URLSearchParams, key: string, def: number, max = 50) {
  return clampInt(q.get(key), { def, min: 1, max: Math.max(max, def) });
}
/** Seitennummer (1-basiert), auf [1, 500] geklemmt. */
export function pageParam(q: URLSearchParams, key = "page") {
  return clampInt(q.get(key), { def: 1, min: 1, max: 500 });
}

// Häufige Body-Felder für c.body({...})
export const zBool = z.boolean().optional();
export const zStr = z.string().max(10_000).optional();
export const zId = z.string().min(1).max(200);
export const zIds = z.array(z.string().max(200)).max(500).optional();
export function bool(q: URLSearchParams, key: string) {
  const v = q.get(key);
  return v === "1" || v === "true" || v === "ja";
}
export function need<T>(v: T | null | undefined, msg = "Nicht gefunden."): T {
  if (v == null) throw fail.notFound(msg);
  return v;
}

// ───────────────────────── Dispatcher ─────────────────────────

const JSON_HEADERS = { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" };

function errorResponse(e: unknown, req: NextRequest, headers?: Record<string, string>) {
  const r = toResult(e, { path: req.nextUrl.pathname, method: req.method });
  if (r.ok) return NextResponse.json({ data: null });
  return NextResponse.json({ error: { code: r.code, message: r.error, fields: r.fields } }, { status: httpStatus(e, r.code), headers });
}

function sameOrigin(origin: string, host: string) {
  try {
    return new URL(origin).host === host;
  } catch {
    // z. B. „Origin: null“ aus Sandbox-Frames
    return false;
  }
}

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
      if (origin && host && !sameOrigin(origin, host)) throw new AppError("FORBIDDEN", "Ungültige Herkunft der Anfrage.");
    }
    let params: Record<string, string> | null = null;
    let found: RouteDef | null = null;
    const allowed = new Set<string>();
    // HEAD wie GET behandeln (Next.js leitet HEAD an den GET-Handler weiter)
    const method = req.method === "HEAD" ? "GET" : req.method;
    for (const def of routes) {
      const m = match(def, parts);
      if (!m) continue;
      allowed.add(def.method);
      if (def.method === method) {
        params = m;
        found = def;
        break;
      }
    }
    if (!found || !params) {
      // Pfad existiert, aber nicht mit dieser Methode → 405 mit Allow-Header (HEAD folgt GET)
      if (allowed.size) {
        const allow = [...allowed].flatMap((m) => (m === "GET" ? ["GET", "HEAD"] : [m]));
        return errorResponse(new AppError("VALIDATION", "Methode nicht erlaubt.", undefined, 405), req, { Allow: allow.join(", ") });
      }
      throw fail.notFound("Unbekannter Endpunkt.");
    }
    // Marktplatz per Feature-Flag pausiert → Kauf- und Shop-Endpunkte gesperrt (Bestellungen bleiben lesbar)
    if (MARKET_PREFIXES.has(parts[0] ?? "") || (parts[0] === "studio" && (parts[1] === "products" || parts[1] === "shop"))) {
      await requireFlag("marketplace", await viewerId());
    }
    // 18+ zentral für alle übrigen schreibenden Endpunkte (Konten über „Mit Apple anmelden“ bis zum Onboarding)
    if (method !== "GET" && !adultFree(parts)) {
      const u = await currentUser();
      if (u) await requireAdult(u);
    }
    let cached: Record<string, unknown> | undefined;
    const json = async <T,>() => {
      if (cached !== undefined) return cached as T;
      const r = parseJsonObject(await req.text());
      if (!r.ok) throw fail.badRequest(r.reason === "syntax" ? "Ungültiger JSON-Body." : "Der Body muss ein JSON-Objekt sein.");
      return (cached = r.value) as T;
    };
    const ctx: Ctx = {
      req,
      p: params,
      q: req.nextUrl.searchParams,
      json,
      body: async (shape) => z.object(shape).parse(await json()),
    };
    let data = await found.handler(ctx);
    if (data instanceof Response) return data;
    // Digitale Produkte: in der App gilt der App-Preis (Kauf über Apple). Studio/Verwaltung zeigen Web-Preise.
    if (!APP_PRICING_EXCLUDED.has(parts[0] ?? "")) data = await withAppPricing(data);
    return new NextResponse(serialize(data), { headers: JSON_HEADERS });
  } catch (e) {
    return errorResponse(e, req);
  }
}
