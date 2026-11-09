/**
 * Reine JWT-Zerlegung (ohne Signaturprüfung) für das Apple-identityToken: kaputte Tokens liefern
 * null statt einer Ausnahme aus JSON.parse/Buffer. Getestet in __tests__/jwt.test.ts.
 */

export type JwtParts = { header: Record<string, unknown>; claims: Record<string, unknown>; signingInput: string; signature: Buffer };

const B64URL = /^[A-Za-z0-9_-]+={0,2}$/;

export function b64urlDecode(s: string): Buffer | null {
  if (!s || !B64URL.test(s)) return null;
  return Buffer.from(s.replace(/=+$/, ""), "base64url");
}

/** Ein Header-/Payload-Segment als JSON-Objekt lesen; kein gültiges Objekt → null. */
export function decodeJwtSegment(seg: string): Record<string, unknown> | null {
  const buf = b64urlDecode(seg);
  if (!buf) return null;
  try {
    const v: unknown = JSON.parse(buf.toString("utf8"));
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** Token in Header, Claims und Signatur zerlegen; fehlerhafte Struktur → null. */
export function splitJwt(token: string): JwtParts | null {
  if (typeof token !== "string" || token.length > 16_384) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [h, p, sig] = parts as [string, string, string];
  const header = decodeJwtSegment(h);
  const claims = decodeJwtSegment(p);
  const signature = b64urlDecode(sig);
  if (!header || !claims || !signature?.length) return null;
  return { header, claims, signingInput: `${h}.${p}`, signature };
}
