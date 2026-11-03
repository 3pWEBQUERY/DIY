/**
 * Feed-Ranking „Für dich“ (PRD §9.5, §21.2). Reine Funktion → testbar.
 *
 * Grundsätze:
 * - Frische, Themenrelevanz, Qualität und Vielfalt – nicht reine Popularität.
 * - Interaktionen werden relativ zur Reichweite des Autors normalisiert,
 *   damit kleine Creator nicht systematisch verlieren.
 * - Autor-Deckel pro Seite verhindert Dominanz einzelner Profile.
 * - Verkaufsposts werden leicht gedämpft (Shop darf Community nicht dominieren, §1.4).
 */
export type Candidate = {
  id: string;
  authorId: string;
  category: string | null;
  publishedAt: Date;
  likeCount: number;
  commentCount: number;
  saveCount: number;
  qualityScore: number;
  isCommercial: boolean;
  authorFollowers: number;
  hasMedia: boolean;
  hasProject: boolean;
};

export type RankContext = {
  now: Date;
  interests: string[];
  following: Set<string>;
  authorAffinity?: Map<string, number>; // 0..1, aus gespeicherten/gelikten Inhalten
  hiddenCategories?: string[];
};

export function scoreCandidate(c: Candidate, ctx: RankContext) {
  const ageHours = Math.max(0, (ctx.now.getTime() - c.publishedAt.getTime()) / 3_600_000);
  const freshness = Math.pow(0.5, ageHours / 36); // Halbwertszeit 36 h
  const interest = c.category && ctx.interests.includes(c.category) ? 1 : 0;
  const follow = ctx.following.has(c.authorId) ? 1 : 0;
  const affinity = ctx.authorAffinity?.get(c.authorId) ?? 0;
  // Engagement pro Reichweite (log-gedämpft); Kommentare & Speichern zählen mehr als Likes
  const weighted = c.likeCount + 3 * c.commentCount + 4 * c.saveCount;
  const reach = Math.log10(10 + c.authorFollowers);
  const engagement = Math.min(1, Math.log1p(weighted / reach) / 4);
  const craft = (c.hasProject ? 0.12 : 0) + (c.hasMedia ? 0.06 : 0);
  let score =
    0.34 * freshness +
    0.22 * interest +
    0.14 * follow +
    0.08 * affinity +
    0.12 * c.qualityScore +
    0.1 * engagement +
    craft;
  if (c.isCommercial) score *= 0.8;
  if (c.category && ctx.hiddenCategories?.includes(c.category)) score *= 0.05;
  return score;
}

/** Sortiert, entfernt Duplikate und erzwingt Vielfalt (Autor-Deckel, Kategorie-Mix). */
export function rankFeed(candidates: Candidate[], ctx: RankContext, opts: { authorCap: number; pageSize: number }) {
  const seen = new Set<string>();
  const scored = candidates
    .filter((c) => (seen.has(c.id) ? false : (seen.add(c.id), true)))
    .map((c) => ({ c, s: scoreCandidate(c, ctx) }))
    .sort((a, b) => b.s - a.s || b.c.publishedAt.getTime() - a.c.publishedAt.getTime());

  const out: string[] = [];
  const deferred: typeof scored = [];
  let pageAuthors = new Map<string, number>();
  let lastCategory: string | null = null;
  let sameCatRun = 0;

  const place = (item: (typeof scored)[number]) => {
    out.push(item.c.id);
    pageAuthors.set(item.c.authorId, (pageAuthors.get(item.c.authorId) ?? 0) + 1);
    if (item.c.category === lastCategory) sameCatRun++;
    else {
      lastCategory = item.c.category;
      sameCatRun = 1;
    }
    if (out.length % opts.pageSize === 0) pageAuthors = new Map();
  };

  for (const item of scored) {
    const authorCount = pageAuthors.get(item.c.authorId) ?? 0;
    if (authorCount >= opts.authorCap || (sameCatRun >= 3 && item.c.category === lastCategory)) {
      deferred.push(item);
      continue;
    }
    place(item);
    // Zurückgestellte Einträge wieder einreihen, sobald sie passen
    for (let i = 0; i < deferred.length; i++) {
      const d = deferred[i]!;
      if ((pageAuthors.get(d.c.authorId) ?? 0) < opts.authorCap && !(sameCatRun >= 3 && d.c.category === lastCategory)) {
        place(d);
        deferred.splice(i, 1);
        i--;
      }
    }
  }
  for (const d of deferred) out.push(d.c.id);
  return out;
}
