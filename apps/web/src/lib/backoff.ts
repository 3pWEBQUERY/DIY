/** Exponentielles Backoff für Wiederholungen nach Netzwerkfehlern: base · 2^attempt, gedeckelt bei max. */
export function backoffDelay(attempt: number, opts: { base?: number; max?: number } = {}) {
  const base = opts.base ?? 2000;
  const max = opts.max ?? 30_000;
  const n = Math.max(0, Math.floor(Number.isFinite(attempt) ? attempt : 0));
  return Math.min(max, base * 2 ** Math.min(n, 20));
}

/** Vorübergehender Fehler (Netz weg, Überlast, Serverfehler) → erneut versuchen; sonst (4xx) aufgeben. */
export function isTransientStatus(status: number | null | undefined) {
  return status == null || status === 0 || status === 408 || status === 429 || status >= 500;
}
