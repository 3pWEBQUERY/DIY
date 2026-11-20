/**
 * Hashtags (#DIY, #Möbelbau): Erkennung im Text, Normalisierung und Link-Ziel.
 * Gleiche Regeln auf Server, Web und iOS (Gegenstück: `apps/ios/Werkuno/Core/Hashtags.swift`).
 *
 * - Ein Hashtag beginnt mit `#` und besteht aus Buchstaben (inkl. Umlaute), Ziffern und `_`.
 * - Mindestens ein Buchstabe (`#2026` ist kein Hashtag), höchstens 50 Zeichen.
 * - Nicht mitten in Wörtern, Links oder HTML-Entitäten (`seite#abschnitt`, `/#top`, `&#38;`).
 * - Normalisiert wird klein geschrieben: `#DIY` und `#diy` sind derselbe Hashtag.
 */
export const HASHTAG_MAX_LENGTH = 50;
/** Höchstens so viele Hashtags je Text werden gespeichert (gegen Hashtag-Spam). */
export const HASHTAG_MAX_PER_TEXT = 30;

const BODY = "[\\p{L}\\p{M}\\p{N}_]";
/** Ohne Erfassungsgruppe, für `String.split` mit anderen Mustern (Erwähnungen, Links). */
export const HASHTAG_SOURCE = `(?<![\\p{L}\\p{M}\\p{N}_&#/=?.\\-])#${BODY}{1,${HASHTAG_MAX_LENGTH}}(?!${BODY})`;

const HAS_LETTER = /\p{L}/u;

export type HashtagToken = { name: string; display: string };

/** Normalform für Speicherung und Links: Unicode-NFKC, klein geschrieben, ohne führendes `#`. */
export function normalizeHashtag(tag: string) {
  return tag.replace(/^#+/, "").normalize("NFKC").toLowerCase();
}

/** Prüft einen einzelnen Hashtag (mit oder ohne `#`). */
export function isValidHashtag(tag: string) {
  const t = tag.replace(/^#/, "");
  return t.length > 0 && t.length <= HASHTAG_MAX_LENGTH && new RegExp(`^${BODY}+$`, "u").test(t) && HAS_LETTER.test(t);
}

/** Alle Hashtags eines Texts in Reihenfolge, ohne Doppelte (die erste Schreibweise gilt). */
export function extractHashtags(...texts: (string | null | undefined)[]): HashtagToken[] {
  const seen = new Map<string, HashtagToken>();
  const re = new RegExp(HASHTAG_SOURCE, "gu");
  for (const text of texts) {
    if (!text) continue;
    for (const m of text.matchAll(re)) {
      const display = m[0].slice(1);
      if (!HAS_LETTER.test(display)) continue;
      const name = normalizeHashtag(display);
      if (!seen.has(name)) seen.set(name, { name, display });
      if (seen.size >= HASHTAG_MAX_PER_TEXT) return [...seen.values()];
    }
  }
  return [...seen.values()];
}

/**
 * Schlagwort (z. B. Projekt-Tag „Eiche massiv“) als Hashtag: Leerzeichen und Satzzeichen fallen weg.
 * Liefert null, wenn kein gültiger Hashtag übrig bleibt.
 */
export function tagToHashtag(tag: string): HashtagToken | null {
  const display = tag.replace(/^#/, "").replace(/[^\p{L}\p{M}\p{N}_]+/gu, "").slice(0, HASHTAG_MAX_LENGTH);
  return isValidHashtag(display) ? { name: normalizeHashtag(display), display } : null;
}

/** Ist dieses Textstück (aus einem `split` mit HASHTAG_SOURCE) ein Hashtag? */
export function isHashtagToken(part: string) {
  return part.startsWith("#") && isValidHashtag(part);
}

/** Pfad der Hashtag-Seite, z. B. `/hashtag/möbelbau` (Umlaute kodiert). */
export function hashtagHref(tag: string) {
  return `/hashtag/${encodeURIComponent(normalizeHashtag(tag))}`;
}
