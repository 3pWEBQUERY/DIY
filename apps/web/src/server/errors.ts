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
  ) {
    super(message);
  }
}

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

export function toResult(e: unknown): ActionResult<never> {
  if (isNextControlFlow(e)) throw e;
  if (e instanceof AppError) return { ok: false, code: e.code, error: e.message, fields: e.fields };
  if (e instanceof ZodError) {
    const fields = zodFields(e);
    return { ok: false, code: "VALIDATION", error: Object.values(fields)[0] ?? "Ungültige Eingabe", fields };
  }
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
export async function act<T>(fn: () => Promise<T>, message?: string): Promise<ActionResult<T>> {
  try {
    const data = await fn();
    return { ok: true, data, message };
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
  rate: () => new AppError("RATE_LIMITED", "Zu viele Anfragen. Bitte warte einen Moment."),
  unavailable: (m: string) => new AppError("UNAVAILABLE", m),
};
