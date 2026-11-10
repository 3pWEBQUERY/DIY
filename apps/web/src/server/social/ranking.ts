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

// ───────────────────────── Cursor „Für dich“ ─────────────────────────
//
// Das Ranking hängt an Live-Zählern (Likes, Kommentare, Follower), die sich zwischen zwei Seiten
// ändern. Ein reiner Offset auf ein neu berechnetes Ranking liefert dann Duplikate und Lücken.
// Deshalb trägt der Cursor neben dem Stichzeitpunkt `asOf` (fixiert die Kandidatenmenge) die bereits
// ausgelieferten Beiträge als kompakte 32-Bit-Hashes (≈5,3 Zeichen je Beitrag, höchstens 400 Kandidaten
// → ≤ ~2,2 KB). Folgeseiten ranken die *übrigen* Kandidaten neu – nichts kommt doppelt, und was
// zwischendurch aufsteigt, wird nicht übersprungen. Eine Hash-Kollision (≈ 400²/2³³) blendet höchstens
// einen Beitrag aus.

const CURSOR_PREFIX = "s1.";
const MAX_SEEN = 1000;

/** FNV-1a (32 Bit) – stabil, ohne Abhängigkeiten. */
export function feedIdHash(id: string) {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

export type FeedCursor = { asOf: Date; seen: Set<number>; legacyOffset: number };

export function encodeFeedCursor(asOf: Date, seen: Iterable<number>) {
  const list = [...new Set(seen)].slice(-MAX_SEEN);
  const buf = Buffer.alloc(list.length * 4);
  list.forEach((h, i) => buf.writeUInt32BE(h >>> 0, i * 4));
  return `${CURSOR_PREFIX}${asOf.getTime().toString(36)}.${buf.toString("base64url")}`;
}

/** Ungültige/manipulierte Cursor → von vorn beginnen statt Fehler. Das alte Format `asOf|offset` bleibt lesbar. */
export function decodeFeedCursor(cursor: string | null | undefined, now = new Date()): FeedCursor {
  const fresh: FeedCursor = { asOf: now, seen: new Set(), legacyOffset: 0 };
  if (!cursor) return fresh;
  if (cursor.startsWith(CURSOR_PREFIX)) {
    const [asOfRaw = "", seenRaw = "", ...rest] = cursor.slice(CURSOR_PREFIX.length).split(".");
    const ms = parseInt(asOfRaw, 36);
    if (rest.length || !/^[0-9a-z]+$/.test(asOfRaw) || !Number.isFinite(ms) || ms <= 0 || ms > now.getTime() + 60_000) return fresh;
    if (seenRaw.length > Math.ceil((MAX_SEEN * 4 * 4) / 3) || !/^[A-Za-z0-9_-]*$/.test(seenRaw)) return fresh;
    const buf = Buffer.from(seenRaw, "base64url");
    const seen = new Set<number>();
    for (let i = 0; i + 4 <= buf.length; i += 4) seen.add(buf.readUInt32BE(i));
    return { asOf: new Date(ms), seen, legacyOffset: 0 };
  }
  const [asOfRaw, offsetRaw] = cursor.split("|");
  const asOf = asOfRaw ? new Date(Number(asOfRaw)) : null;
  if (!asOf || Number.isNaN(asOf.getTime())) return fresh;
  return { asOf, seen: new Set(), legacyOffset: Math.max(0, Math.min(10_000, Math.floor(Number(offsetRaw ?? 0)) || 0)) };
}

/**
 * Nächste Seite aus einem (live) gerankten Ergebnis: bereits gesehene Beiträge überspringen,
 * die ersten `pageSize` übrigen ausliefern und den Cursor um sie erweitern.
 */
export function nextFeedPage(ranked: string[], cursor: FeedCursor, pageSize: number) {
  if (cursor.legacyOffset) {
    const ids = ranked.slice(cursor.legacyOffset, cursor.legacyOffset + pageSize);
    const more = cursor.legacyOffset + pageSize < ranked.length;
    // Altes Format: frühere Seiten nicht kennbar → ab hier mit den aktuellen IDs weiterführen
    const seen = [...ranked.slice(0, cursor.legacyOffset + pageSize).map(feedIdHash)];
    return { ids, nextCursor: more ? encodeFeedCursor(cursor.asOf, seen) : null };
  }
  const rest = ranked.filter((id) => !cursor.seen.has(feedIdHash(id)));
  const ids = rest.slice(0, pageSize);
  const more = rest.length > pageSize;
  return { ids, nextCursor: more ? encodeFeedCursor(cursor.asOf, [...cursor.seen, ...ids.map(feedIdHash)]) : null };
}
