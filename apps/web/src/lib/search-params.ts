/**
 * Suchparameter aus der URL: Next liefert bei mehrfach gesetztem Schlüssel (`?q=a&q=b`) ein Array.
 * Ungeprüft führt `sp.q.trim()` dann zu einem 500er – hier wird immer der erste Wert genommen.
 */
export type RawSearchParams = Record<string, string | string[] | undefined>;

/** Erster Wert eines Suchparameters (oder undefined). */
export function one(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

/** Alle Suchparameter auf je einen Wert reduzieren. */
export function flatSearchParams<K extends string>(sp: Partial<Record<K, string | string[]>>): Partial<Record<K, string>> {
  const out: Partial<Record<K, string>> = {};
  for (const k of Object.keys(sp) as K[]) {
    const v = one(sp[k]);
    if (v !== undefined) out[k] = v;
  }
  return out;
}
