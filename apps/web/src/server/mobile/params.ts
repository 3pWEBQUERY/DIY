/**
 * Reine Eingabe-Helfer der Mobile-API (ohne DB/Session), damit fehlerhafte Eingaben nie zu
 * einem 500 führen. Getestet in __tests__/params.test.ts.
 */

/** Ganzzahl aus einem Query-Wert in [min, max]; fehlend/leer/NaN → `def` (ebenfalls geklemmt). */
export function clampInt(raw: string | null | undefined, opts: { def: number; min: number; max: number }): number {
  const clamp = (n: number) => Math.min(opts.max, Math.max(opts.min, n));
  if (raw == null || raw.trim() === "") return clamp(opts.def);
  const n = Number(raw);
  if (!Number.isFinite(n)) return clamp(opts.def);
  return clamp(Math.trunc(n));
}

/** Optionale Ganzzahl in [min, max]; fehlend/NaN → undefined (Filter wird dann nicht angewendet). */
export function optInt(raw: string | null | undefined, opts: { min: number; max: number }): number | undefined {
  if (raw == null || raw.trim() === "") return undefined;
  const n = Number(raw);
  if (!Number.isFinite(n)) return undefined;
  return Math.min(opts.max, Math.max(opts.min, Math.trunc(n)));
}

export type FollowCursor = { followerId: string; followeeId: string };

export function encodeFollowCursor(c: FollowCursor) {
  return Buffer.from(JSON.stringify({ followerId: c.followerId, followeeId: c.followeeId })).toString("base64url");
}

/** Cursor der Follower-/Following-Listen; manipuliert/ungültig → null. */
export function decodeFollowCursor(raw: string | null | undefined): FollowCursor | null {
  if (!raw || raw.length > 512) return null;
  try {
    const v: unknown = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
    if (!v || typeof v !== "object" || Array.isArray(v)) return null;
    const { followerId, followeeId } = v as Record<string, unknown>;
    if (typeof followerId !== "string" || typeof followeeId !== "string" || !followerId || !followeeId) return null;
    if (followerId.length > 64 || followeeId.length > 64) return null;
    return { followerId, followeeId };
  } catch {
    return null;
  }
}

export type JsonBodyResult = { ok: true; value: Record<string, unknown> } | { ok: false; reason: "syntax" | "type" };

/** Request-Body als JSON-Objekt lesen: leer → {}, kein gültiges JSON → syntax, kein Objekt (null, Array, Zahl …) → type. */
export function parseJsonObject(text: string): JsonBodyResult {
  if (!text.trim()) return { ok: true, value: {} };
  let v: unknown;
  try {
    v = JSON.parse(text);
  } catch {
    return { ok: false, reason: "syntax" };
  }
  if (!v || typeof v !== "object" || Array.isArray(v)) return { ok: false, reason: "type" };
  return { ok: true, value: v as Record<string, unknown> };
}
