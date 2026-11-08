/**
 * Sicheres Weiterleitungsziel nach Login/Registrierung: nur relative Pfade dieser Seite.
 * Verhindert Open Redirects wie `//evil.com` oder `/\evil.com` (Browser werten `\` als `/`).
 */
export function safeNext(next: unknown, fallback: string | null = null): string | null {
  if (typeof next !== "string") return fallback;
  if (!/^\/(?![/\\])/.test(next)) return fallback;
  if (/[\u0000-\u001f\u007f]/.test(next)) return fallback;
  return next;
}
