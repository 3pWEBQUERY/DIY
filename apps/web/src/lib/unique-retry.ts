/**
 * Eindeutige Slugs unter Gleichzeitigkeit: `uniqueTutorialSlug`/`uniqueProjectSlug` prüfen vorab, welche
 * Slugs frei sind. Zwei gleichzeitige Anlagen mit demselben Titel sehen aber beide denselben Slug als frei –
 * die zweite scheitert am Unique-Index (P2002) und lieferte bisher einen 500er. Dann mit Zufallssuffix
 * erneut versuchen.
 */

/** Prisma-Fehler P2002 (Unique-Verletzung), optional nur für ein bestimmtes Feld. */
export function isUniqueViolation(e: unknown, field?: string) {
  if ((e as { code?: string } | null)?.code !== "P2002") return false;
  if (!field) return true;
  const meta = (e as { meta?: unknown }).meta;
  // Je nach Treiberadapter steht das Feld in meta.target oder in meta.driverAdapterError…constraint.fields
  return JSON.stringify(meta ?? {}).includes(field) || String((e as { message?: string }).message ?? "").includes(field);
}

/** `fn(attempt)` bis zu `attempts`-mal ausführen, solange der Slug kollidiert. */
export async function withSlugRetry<T>(fn: (attempt: number) => Promise<T>, attempts = 3): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn(attempt);
    } catch (e) {
      if (attempt + 1 >= attempts || !isUniqueViolation(e, "slug")) throw e;
    }
  }
}

/** Kurzer Zufallssuffix für Wiederholungsversuche (a–z0–9). */
export function slugSuffix() {
  return Math.random().toString(36).slice(2, 7).padEnd(5, "0");
}
