import "server-only";
import { extractHashtags, tagToHashtag, type HashtagToken } from "@werkraum/shared";
import { db, Prisma } from "@/server/db";
import { captureError } from "@/server/monitoring";

/**
 * Hashtag-Index: Welche Inhalte verwenden welchen Hashtag.
 *
 * Schreibpfade (Beitrag, Kommentar, Projekt, Anleitung, Artikel, Produkt) rufen `indexHashtags` direkt
 * nach dem Speichern auf. Der Worker gleicht zusätzlich alle paar Minuten geänderte Inhalte ab
 * (`reconcileHashtags`) – so landen auch Änderungen aus anderen Pfaden (Moderation, geplante
 * Veröffentlichung) und bestehende Inhalte (erster Lauf) im Index.
 */
export const HASHTAG_TARGETS = ["POST", "COMMENT", "PROJECT", "TUTORIAL", "ARTICLE", "PRODUCT"] as const;
export type HashtagTarget = (typeof HASHTAG_TARGETS)[number];

type Source = { tokens: HashtagToken[]; at: Date };

function fromTags(tags: string[]) {
  return tags.map(tagToHashtag).filter((t): t is HashtagToken => !!t);
}

function merge(...lists: HashtagToken[][]) {
  const seen = new Map<string, HashtagToken>();
  for (const t of lists.flat()) if (!seen.has(t.name)) seen.set(t.name, t);
  return [...seen.values()].slice(0, 40);
}

/** Text eines Inhalts laden und Hashtags darin finden. null = Inhalt existiert nicht (mehr). */
async function sourceFor(type: HashtagTarget, id: string): Promise<Source | null> {
  switch (type) {
    case "POST": {
      const p = await db.post.findUnique({ where: { id }, select: { body: true, publishedAt: true } });
      return p && { tokens: extractHashtags(p.body), at: p.publishedAt };
    }
    case "COMMENT": {
      const c = await db.comment.findUnique({ where: { id }, select: { body: true, createdAt: true } });
      return c && { tokens: extractHashtags(c.body), at: c.createdAt };
    }
    case "PROJECT": {
      const p = await db.project.findUnique({
        where: { id },
        select: {
          description: true,
          tags: true,
          createdAt: true,
          publishedAt: true,
          updates: { orderBy: { happenedAt: "desc" }, take: 100, select: { body: true, problem: true, solution: true } },
        },
      });
      if (!p) return null;
      // Schlagwörter des Projekts zählen als Hashtags (z. B. „Eiche“ → #Eiche); Journal-Einträge gehören zum Projekt
      const journal = p.updates.flatMap((u) => [u.body, u.problem, u.solution]);
      return { tokens: merge(fromTags(p.tags), extractHashtags(p.description, ...journal)), at: p.publishedAt ?? p.createdAt };
    }
    case "TUTORIAL": {
      const t = await db.tutorial.findUnique({
        where: { id },
        select: { summary: true, createdAt: true, publishedAt: true, currentVersion: { select: { steps: { orderBy: { position: "asc" }, select: { title: true, body: true, tip: true } } } } },
      });
      if (!t) return null;
      const steps = (t.currentVersion?.steps ?? []).flatMap((s) => [s.title, s.body, s.tip]);
      return { tokens: extractHashtags(t.summary, ...steps), at: t.publishedAt ?? t.createdAt };
    }
    case "ARTICLE": {
      const a = await db.blogArticle.findUnique({ where: { id }, select: { dek: true, plainText: true, tags: true, createdAt: true, publishedAt: true } });
      return a && { tokens: merge(fromTags(a.tags), extractHashtags(a.dek, a.plainText)), at: a.publishedAt ?? a.createdAt };
    }
    case "PRODUCT": {
      const p = await db.product.findUnique({ where: { id }, select: { description: true, createdAt: true, publishedAt: true } });
      return p && { tokens: extractHashtags(p.description), at: p.publishedAt ?? p.createdAt };
    }
  }
}

/** Index eines Inhalts neu aufbauen (idempotent). */
export async function syncHashtags(type: HashtagTarget, id: string) {
  const src = await sourceFor(type, id);
  const tokens = src?.tokens ?? [];
  await db.$transaction(async (tx) => {
    if (!tokens.length) {
      await tx.hashtagUse.deleteMany({ where: { targetType: type, targetId: id } });
      return;
    }
    await tx.hashtag.createMany({ data: tokens.map((t) => ({ name: t.name, display: t.display })), skipDuplicates: true });
    // Zuerst klein geschriebene Hashtags übernehmen die Schreibweise mit Grossbuchstaben (#diy → #DIY)
    for (const t of tokens) {
      if (t.display !== t.name) await tx.hashtag.updateMany({ where: { name: t.name, display: t.name }, data: { display: t.display } });
    }
    const tags = await tx.hashtag.findMany({ where: { name: { in: tokens.map((t) => t.name) } }, select: { id: true } });
    const ids = tags.map((t) => t.id);
    await tx.hashtagUse.deleteMany({ where: { targetType: type, targetId: id, hashtagId: { notIn: ids } } });
    await tx.hashtagUse.createMany({ data: ids.map((hashtagId) => ({ hashtagId, targetType: type, targetId: id, createdAt: src!.at })), skipDuplicates: true });
  });
  return tokens.length;
}

/**
 * Nach dem Speichern eines Inhalts aufrufen. Fehler im Index dürfen das Speichern nie scheitern
 * lassen – der Worker-Abgleich holt sie nach.
 */
export async function indexHashtags(type: HashtagTarget, id: string) {
  try {
    await syncHashtags(type, id);
  } catch (err) {
    void captureError(err, { source: "SERVER", meta: { where: "indexHashtags", type, id } });
  }
}

/* ───────────────────────── Abgleich im Worker ───────────────────────── */

const CURSOR_KEY = "hashtags.indexCursor";
type Cursor = Record<string, { at: string; id: string }>;

type Changed = { id: string; updatedAt: Date };
type Finder = (after: { at: Date; id: string }, take: number) => Promise<Changed[]>;

function changedWhere(after: { at: Date; id: string }) {
  return { OR: [{ updatedAt: { gt: after.at } }, { updatedAt: after.at, id: { gt: after.id } }] };
}
const order = [{ updatedAt: "asc" as const }, { id: "asc" as const }];
const sel = { id: true, updatedAt: true } as const;

/** Je Quelle: geänderte Zeilen seit dem letzten Lauf und welcher Inhalt neu indexiert werden muss. */
const SOURCES: { key: string; type: HashtagTarget; find: Finder; target?: (ids: string[]) => Promise<string[]> }[] = [
  { key: "POST", type: "POST", find: (a, take) => db.post.findMany({ where: changedWhere(a), orderBy: order, take, select: sel }) },
  { key: "COMMENT", type: "COMMENT", find: (a, take) => db.comment.findMany({ where: changedWhere(a), orderBy: order, take, select: sel }) },
  { key: "PROJECT", type: "PROJECT", find: (a, take) => db.project.findMany({ where: changedWhere(a), orderBy: order, take, select: sel }) },
  {
    // Journal-Einträge ändern das Projekt selbst nicht → eigener Zeiger, indexiert wird das Projekt
    key: "PROJECT_UPDATE",
    type: "PROJECT",
    find: (a, take) => db.projectUpdate.findMany({ where: changedWhere(a), orderBy: order, take, select: sel }),
    target: async (ids) => (await db.projectUpdate.findMany({ where: { id: { in: ids } }, select: { projectId: true } })).map((u) => u.projectId),
  },
  { key: "TUTORIAL", type: "TUTORIAL", find: (a, take) => db.tutorial.findMany({ where: changedWhere(a), orderBy: order, take, select: sel }) },
  { key: "ARTICLE", type: "ARTICLE", find: (a, take) => db.blogArticle.findMany({ where: changedWhere(a), orderBy: order, take, select: sel }) },
  { key: "PRODUCT", type: "PRODUCT", find: (a, take) => db.product.findMany({ where: changedWhere(a), orderBy: order, take, select: sel }) },
];

const TABLE: Record<HashtagTarget, string> = { POST: "Post", COMMENT: "Comment", PROJECT: "Project", TUTORIAL: "Tutorial", ARTICLE: "BlogArticle", PRODUCT: "Product" };

/**
 * Geänderte Inhalte seit dem letzten Lauf neu indexieren (beim ersten Lauf: alle, in Portionen)
 * und Verwendungen gelöschter Inhalte entfernen.
 */
export async function reconcileHashtags(batch = 400) {
  const row = await db.systemSetting.findUnique({ where: { key: CURSOR_KEY } });
  const cursor: Cursor = { ...((row?.value as Cursor | null) ?? {}) };
  let indexed = 0;
  for (const s of SOURCES) {
    const prev = cursor[s.key];
    const after = { at: prev ? new Date(prev.at) : new Date(0), id: prev?.id ?? "" };
    const changed = await s.find(after, batch);
    if (!changed.length) continue;
    const ids = s.target ? [...new Set(await s.target(changed.map((c) => c.id)))] : changed.map((c) => c.id);
    for (const id of ids) {
      try {
        await syncHashtags(s.type, id);
        indexed++;
      } catch (err) {
        void captureError(err, { source: "WORKER", meta: { where: "reconcileHashtags", type: s.type, id } });
      }
    }
    const last = changed[changed.length - 1]!;
    cursor[s.key] = { at: last.updatedAt.toISOString(), id: last.id };
  }
  await db.systemSetting.upsert({
    where: { key: CURSOR_KEY },
    create: { key: CURSOR_KEY, value: cursor as Prisma.InputJsonValue },
    update: { value: cursor as Prisma.InputJsonValue },
  });
  // Verwendungen gelöschter Inhalte entfernen (Löschen ruft den Index nicht überall auf)
  let removed = 0;
  for (const type of HASHTAG_TARGETS) {
    removed += await db.$executeRaw`
      DELETE FROM "HashtagUse" u
      WHERE u."targetType" = ${type}::"TargetType"
        AND NOT EXISTS (SELECT 1 FROM ${Prisma.raw(`"${TABLE[type]}"`)} t WHERE t.id = u."targetId")`;
  }
  return { indexed, removed };
}
