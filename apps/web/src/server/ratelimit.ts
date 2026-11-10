import "server-only";
import { db } from "@/server/db";
import { fail } from "@/server/errors";

/**
 * Fixed-Window-Rate-Limit auf Postgres (kein Redis nötig, §25.3).
 * Atomar über INSERT … ON CONFLICT. Für hohe Last später durch Redis-Adapter ersetzbar.
 */
export async function rateLimit(key: string, limit: number, windowSec: number) {
  const rows = await db.$queryRaw<{ count: number }[]>`
    INSERT INTO "RateLimitBucket" ("key", "count", "resetAt")
    VALUES (${key}, 1, now() + make_interval(secs => ${windowSec}))
    ON CONFLICT ("key") DO UPDATE SET
      "count" = CASE WHEN "RateLimitBucket"."resetAt" < now() THEN 1 ELSE "RateLimitBucket"."count" + 1 END,
      "resetAt" = CASE WHEN "RateLimitBucket"."resetAt" < now() THEN now() + make_interval(secs => ${windowSec}) ELSE "RateLimitBucket"."resetAt" END
    RETURNING "count"`;
  const count = rows[0]?.count ?? 0;
  if (count > limit) throw fail.rate();
  return { remaining: Math.max(0, limit - count) };
}

/** Vordefinierte Limits je Aktion. */
export const LIMITS = {
  signIn: [10, 600],
  // Unabhängig von der IP: schützt ein einzelnes Konto auch bei wechselnden Absenderadressen
  signInAccount: [30, 3600],
  // Zweiter Faktor: wenige Versuche, damit 6-stellige Codes nicht durchprobiert werden können
  mfaFail: [10, 900],
  mfaFailDay: [30, 86400],
  mfaManage: [20, 3600],
  signUp: [5, 3600],
  passwordReset: [5, 3600],
  post: [30, 3600],
  comment: [60, 3600],
  like: [300, 3600],
  follow: [120, 3600],
  message: [60, 600],
  newConversation: [20, 86400],
  report: [30, 3600],
  upload: [120, 3600],
  checkout: [20, 3600],
  restockRequest: [30, 86400],
} as const satisfies Record<string, readonly [number, number]>;

export function limit(action: keyof typeof LIMITS, subject: string) {
  const [n, w] = LIMITS[action];
  return rateLimit(`${action}:${subject}`, n, w);
}

/** Ist das Limit für eine Aktion bereits erreicht? (zählt nicht hoch) */
export async function isLimited(action: keyof typeof LIMITS, subject: string) {
  const [n] = LIMITS[action];
  const b = await db.rateLimitBucket.findUnique({ where: { key: `${action}:${subject}` }, select: { count: true, resetAt: true } });
  return !!b && b.resetAt > new Date() && b.count >= n;
}
