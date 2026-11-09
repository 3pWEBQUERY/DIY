import "server-only";

/**
 * Echte Client-IP hinter dem Railway-Proxy. Railway setzt `X-Real-IP` selbst (nicht vom Client
 * fälschbar); der erste Eintrag von `X-Forwarded-For` dagegen stammt vom Client. Fallback lokal/ohne
 * Proxy: letzter Eintrag von X-Forwarded-For (vom nächstgelegenen Proxy angehängt).
 */
export function clientIp(h: Headers): string {
  const real = h.get("x-real-ip")?.trim();
  if (real) return real;
  const xff = h.get("x-forwarded-for");
  const last = xff?.split(",").map((s) => s.trim()).filter(Boolean).pop();
  return last ?? "0.0.0.0";
}
