import { ZodError } from "zod";

/** Einheitliche Fehlerstruktur für Server Actions und API (§27.2). */
export type ErrorCode =
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "VALIDATION"
  | "CONFLICT"
  | "RATE_LIMITED"
  | "UNAVAILABLE"
  | "INTERNAL";

export class AppError extends Error {
  constructor(
    public code: ErrorCode,
    message: string,
    public fields?: Record<string, string>,
    /** Abweichender HTTP-Status (z. B. 400 für unlesbare Anfragen statt 422) */
    public status?: number,
  ) {
    super(message);
  }
}

/** HTTP-Status eines Fehlers für Route-Handler (berücksichtigt AppError.status). */
export function httpStatus(e: unknown, code: ErrorCode) {
  return e instanceof AppError && e.status ? e.status : STATUS[code];
}

function isPrismaNotFound(e: unknown) {
  return !!e && typeof e === "object" && (e as { name?: unknown }).name === "PrismaClientKnownRequestError" && (e as { code?: unknown }).code === "P2025";
}

/**
 * Unique-Verletzung (Prisma P2002), z. B. zwei gleichzeitige Registrierungen mit demselben Handle.
 * Gibt die betroffenen Spalten/den Index (klein geschrieben, z. B. "user_email_key") zurück oder null.
 * Prisma 7 mit Treiberadapter liefert den Index unter `meta.driverAdapterError.cause.constraint`,
 * ältere Varianten unter `meta.target`.
 */
export function uniqueViolation(e: unknown): string | null {
  if (!e || typeof e !== "object" || (e as { code?: unknown }).code !== "P2002") return null;
  if ((e as { name?: unknown }).name !== "PrismaClientKnownRequestError") return null;
  const meta = (e as { meta?: Record<string, unknown> }).meta ?? {};
  const parts: string[] = [];
  const target = meta.target;
  if (Array.isArray(target)) parts.push(...target.map(String));
  else if (typeof target === "string") parts.push(target);
  const constraint = (meta.driverAdapterError as { cause?: { constraint?: { index?: unknown; fields?: unknown } } } | undefined)?.cause?.constraint;
  if (typeof constraint?.index === "string") parts.push(constraint.index);
  if (Array.isArray(constraint?.fields)) parts.push(...constraint.fields.map(String));
  return parts.join(",").toLowerCase();
}

export const UNIQUE_CONFLICT_MESSAGE = "Das wurde gerade gleichzeitig geändert oder existiert bereits. Bitte lade die Seite neu und versuche es erneut.";

export type ActionResult<T = undefined> =
  | { ok: true; data: T; message?: string }
  | { ok: false; code: ErrorCode; error: string; fields?: Record<string, string> };

export const STATUS: Record<ErrorCode, number> = {
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  VALIDATION: 422,
  CONFLICT: 409,
  RATE_LIMITED: 429,
  UNAVAILABLE: 503,
  INTERNAL: 500,
};

export function zodFields(e: ZodError) {
  const fields: Record<string, string> = {};
  for (const issue of e.issues) {
    const k = issue.path.join(".") || "_";
    if (!fields[k]) fields[k] = issue.message;
  }
  return fields;
}

function isNextControlFlow(e: unknown) {
  if (!e || typeof e !== "object" || !("digest" in e)) return false;
  const d = (e as { digest: unknown }).digest;
  return typeof d === "string" && (d.startsWith("NEXT_REDIRECT") || d.startsWith("NEXT_HTTP_ERROR_FALLBACK") || d === "NEXT_NOT_FOUND");
}

/**
 * Wird beim Serverstart von der Fehlerüberwachung gesetzt (siehe instrumentation.ts).
 * Auf globalThis, weil Instrumentation und Routen in getrennten Bundles laufen.
 */
const REPORTER = Symbol.for("werkuno.unhandledReporter");
type Reporter = (e: unknown, ctx?: { path?: string; method?: string }) => void;
export function setUnhandledReporter(fn: Reporter) {
  (globalThis as Record<symbol, Reporter | undefined>)[REPORTER] = fn;
}

export function toResult(e: unknown, ctx?: { path?: string; method?: string }): ActionResult<never> {
  if (isNextControlFlow(e)) throw e;
  if (e instanceof AppError) return { ok: false, code: e.code, error: e.message, fields: e.fields };
  if (e instanceof ZodError) {
    const fields = zodFields(e);
    return { ok: false, code: "VALIDATION", error: Object.values(fields)[0] ?? "Ungültige Eingabe", fields };
  }
  // Datensatz existiert (nicht mehr): z. B. findUniqueOrThrow/update mit unbekannter ID → 404 statt 500
  if (isPrismaNotFound(e)) return { ok: false, code: "NOT_FOUND", error: "Nicht gefunden." };
  // Unique-Verletzung (meist ein Wettlauf zweier Anfragen) → 409 statt 500
  if (uniqueViolation(e) !== null) return { ok: false, code: "CONFLICT", error: UNIQUE_CONFLICT_MESSAGE };
  // Postgres lehnt Nullbytes/ungültige Kodierung ab – das ist eine fehlerhafte Eingabe, kein Serverfehler
  if (e instanceof Error && /invalid byte sequence for encoding|22021|22P05/.test(e.message)) {
    return { ok: false, code: "VALIDATION", error: "Die Anfrage enthält ungültige Zeichen." };
  }
  const unhandledReporter = (globalThis as Record<symbol, Reporter | undefined>)[REPORTER];
  if (unhandledReporter) unhandledReporter(e, ctx);
  else
    console.error(
      JSON.stringify({
        level: "error",
        msg: "unhandled",
        err: e instanceof Error ? e.message : String(e),
        stack: e instanceof Error ? e.stack : undefined,
      }),
    );
  return { ok: false, code: "INTERNAL", error: "Etwas ist schiefgelaufen. Bitte versuche es erneut." };
}

/** Wrapper für Server Actions: wirft nie unkontrolliert, liefert ActionResult. */
export async function act<T>(fn: () => Promise<T>, message?: string | ((data: T) => string)): Promise<ActionResult<T>> {
  try {
    const data = await fn();
    return { ok: true, data, message: typeof message === "function" ? message(data) : message };
  } catch (e) {
    return toResult(e);
  }
}

export const fail = {
  auth: () => new AppError("UNAUTHENTICATED", "Bitte melde dich an."),
  forbidden: (m = "Dafür fehlt dir die Berechtigung.") => new AppError("FORBIDDEN", m),
  notFound: (m = "Nicht gefunden.") => new AppError("NOT_FOUND", m),
  conflict: (m: string) => new AppError("CONFLICT", m),
  invalid: (m: string, fields?: Record<string, string>) => new AppError("VALIDATION", m, fields),
  /** Unlesbare Anfrage (kaputtes JSON, manipulierter Cursor/Token) → HTTP 400 */
  badRequest: (m: string) => new AppError("VALIDATION", m, undefined, 400),
  rate: () => new AppError("RATE_LIMITED", "Zu viele Anfragen. Bitte warte einen Moment."),
  unavailable: (m: string) => new AppError("UNAVAILABLE", m),
};
