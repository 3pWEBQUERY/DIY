/** Durchsuchbarer Eintrag des Hilfe-Centers (ohne Auszeichnungen, Werte bereits eingesetzt) */
export type HelpIndexEntry = {
  categoryId: string;
  categoryTitle: string;
  id: string;
  q: string;
  /** Antwort als Klartext */
  text: string;
  tags: string;
};

/** Kleinbuchstaben, Umlaute und Akzente vereinfacht („Rückgabe“ ≙ „ruckgabe“ ≙ „rueckgabe“) */
export function normalizeHelp(s: string) {
  return s
    .toLowerCase()
    .replace(/ä/g, "a")
    .replace(/ö/g, "o")
    .replace(/ü/g, "u")
    .replace(/ae/g, "a")
    .replace(/oe/g, "o")
    .replace(/ue/g, "u")
    .replace(/ß/g, "ss")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9#€ ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Treffer für eine Suchanfrage: alle Wörter müssen vorkommen (Frage, Antwort, Bereich oder Stichwörter).
 * Sortiert nach Gewicht – Treffer in der Frage zählen am meisten.
 */
export function searchHelp(index: HelpIndexEntry[], query: string, limit = 30) {
  // Einfache Wortstämme: „bezahlen“ findet auch „bezahle“, „Gutscheine“ auch „Gutschein“
  const terms = normalizeHelp(query)
    .split(" ")
    .filter((t) => t.length > 1 || /\d/.test(t))
    .map((t) => (t.length > 5 ? t.replace(/(en|n|e|st|s)$/, "") : t));
  if (!terms.length) return [];
  const scored: { e: HelpIndexEntry; score: number }[] = [];
  for (const e of index) {
    const q = normalizeHelp(e.q);
    const tags = normalizeHelp(`${e.tags} ${e.categoryTitle}`);
    const text = normalizeHelp(e.text);
    let score = 0;
    let all = true;
    for (const t of terms) {
      const inQ = q.includes(t);
      const inTags = tags.includes(t);
      const inText = text.includes(t);
      if (!inQ && !inTags && !inText) {
        all = false;
        break;
      }
      score += (inQ ? 6 : 0) + (inTags ? 3 : 0) + (inText ? 1 : 0);
    }
    if (all) scored.push({ e, score });
  }
  return scored.sort((a, b) => b.score - a.score).slice(0, limit).map((s) => s.e);
}
