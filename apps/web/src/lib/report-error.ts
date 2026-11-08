"use client";

/**
 * Meldet Browserfehler an die Fehlerüberwachung (/api/v1/errors).
 * Fehler mit `digest` stammen vom Server und sind dort bereits erfasst.
 */
let sent = 0;
const seen = new Set<string>();

export function reportClientError(error: unknown, kind: "error" | "unhandledrejection" | "boundary" = "error") {
  try {
    const e = error instanceof Error ? error : new Error(typeof error === "string" ? error : "Unbekannter Fehler");
    if ((e as { digest?: string }).digest) return;
    const key = `${e.name}:${e.message}`;
    if (seen.has(key) || sent >= 10) return;
    seen.add(key);
    sent++;
    void fetch("/api/v1/errors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      keepalive: true,
      body: JSON.stringify({ name: e.name, message: e.message, stack: e.stack?.slice(0, 8000), path: location.pathname, kind }),
    }).catch(() => {});
  } catch {}
}
