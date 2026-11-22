import { z } from "zod";

/**
 * Wortfilter für Kommentare (Creator Pro). Kommentare auf eigenen Inhalten, die ein Wort der Liste
 * enthalten, werden automatisch ausgeblendet – sichtbar bleiben sie nur für die Person, die sie
 * geschrieben hat, und für die Creatorin.
 *
 * Vergleich ohne Gross-/Kleinschreibung und ohne Akzente (ä = a, ß = ss):
 * - Wörter ab 4 Zeichen treffen auch als Teil längerer Wörter („Mist“ → „Mistkerl“), weil im Deutschen
 *   vieles zusammengesetzt wird.
 * - Kürzere Wörter treffen nur als ganzes Wort („ass“ trifft nicht „Klasse“).
 * - Mehrere Wörter („gratis versand“) werden als Wortfolge gesucht.
 */
export const COMMENT_FILTER_MAX = 100;

export function normalizeFilterText(s: string) {
  return s
    .toLowerCase()
    .replace(/ß/g, "ss")
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

export const commentFilterWordsSchema = z
  .array(z.string())
  .max(COMMENT_FILTER_MAX * 2)
  .transform((list) => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const raw of list) {
      const w = normalizeFilterText(raw).slice(0, 40).trim();
      if (w.length < 2 || seen.has(w)) continue;
      seen.add(w);
      out.push(w);
    }
    return out;
  })
  .pipe(z.array(z.string()).max(COMMENT_FILTER_MAX, { error: `Höchstens ${COMMENT_FILTER_MAX} Wörter` }));

/** Erstes Wort der Liste, das im Text vorkommt (oder null) */
export function matchCommentFilter(body: string, words: readonly string[]): string | null {
  if (!words.length) return null;
  const text = ` ${normalizeFilterText(body)} `;
  for (const raw of words) {
    const w = normalizeFilterText(raw);
    if (w.length < 2) continue;
    if (w.replace(/ /g, "").length >= 4 ? text.includes(w) : text.includes(` ${w} `)) return raw;
  }
  return null;
}
