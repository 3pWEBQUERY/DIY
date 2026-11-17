import "server-only";
import { db } from "@/server/db";

/**
 * Subdomain → Handle für den Proxy. Kurzer Speicher im Prozess, damit nicht jede Anfrage
 * (Seiten, Daten-Nachladen, Prefetch) die Datenbank trifft. Handle-Wechsel greifen nach spätestens einer Minute.
 */
const TTL_HIT = 60_000;
const TTL_MISS = 30_000;
const MAX = 5_000;
const cache = new Map<string, { handle: string | null; exp: number }>();

export async function handleForSubdomain(label: string): Promise<string | null> {
  const now = Date.now();
  const hit = cache.get(label);
  if (hit && hit.exp > now) return hit.handle;
  const p = await db.userProfile.findUnique({ where: { subdomain: label }, select: { handle: true, user: { select: { status: true } } } });
  const handle = p && p.user.status !== "DELETED" && p.user.status !== "BANNED" ? p.handle : null;
  if (cache.size >= MAX) cache.delete(cache.keys().next().value!);
  cache.set(label, { handle, exp: now + (handle ? TTL_HIT : TTL_MISS) });
  return handle;
}
