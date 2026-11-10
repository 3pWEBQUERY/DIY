import "server-only";
import { cache } from "react";
import { articlePublishSchema, articleUpsertSchema, type ArticleBlock } from "@werkraum/shared";
import { db, Prisma, type ArticleState } from "@/server/db";
import { fail } from "@/server/errors";
import { limit } from "@/server/ratelimit";
import { emit } from "@/server/events";
import { relationsFor } from "@/server/visibility";
import { attachMedia } from "@/server/media/service";
import { createPost } from "@/server/social/posts";
import type { SessionUser } from "@/server/auth/session";
import { readingMinutes, slugify } from "@/lib/utils";
import { stripInline } from "@/lib/inline-marks";
import { publicProductWhere } from "@/server/commerce/restock";

/**
 * Blogs (PRD §14): blockbasierte Artikel mit Entwürfen, Revisionen, geplanter
 * Veröffentlichung, Slug-Weiterleitungen und SEO-Feldern.
 */

const MAX_REVISIONS = 30;
const appUrl = () => (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");

export const DEFAULT_ARTICLE_CATEGORIES = [
  { slug: "werkstattbericht", name: "Werkstattbericht" },
  { slug: "technik", name: "Technik & Know-how" },
  { slug: "material", name: "Materialkunde" },
  { slug: "inspiration", name: "Inspiration" },
  { slug: "nachhaltigkeit", name: "Nachhaltigkeit" },
  { slug: "verkaufen", name: "Verkaufen & Business" },
  { slug: "portraet", name: "Porträt" },
];

export const listArticleCategories = cache(async () => {
  const count = await db.articleCategory.count();
  if (count === 0) await db.articleCategory.createMany({ data: DEFAULT_ARTICLE_CATEGORIES, skipDuplicates: true });
  return db.articleCategory.findMany({ orderBy: { name: "asc" }, select: { id: true, slug: true, name: true } });
});

export function articleHref(handle: string, slug: string) {
  return `/u/${handle}/blog/${slug}`;
}

export function parseBlocks(raw: unknown): ArticleBlock[] {
  if (!Array.isArray(raw)) return [];
  const out: ArticleBlock[] = [];
  for (const b of raw) {
    if (b && typeof b === "object" && "type" in b && "id" in b) out.push(b as ArticleBlock);
  }
  return out;
}

/** Klartext aller Blöcke (für Volltextsuche, Lesedauer, Auszüge). */
export function blocksToPlainText(blocks: ArticleBlock[]) {
  const parts: string[] = [];
  for (const b of blocks) {
    switch (b.type) {
      case "heading":
        parts.push(b.text);
        break;
      case "paragraph":
      case "callout":
        parts.push(stripInline(b.text));
        break;
      case "quote":
        parts.push(stripInline(b.text), b.cite);
        break;
      case "list":
        parts.push(...b.items.map(stripInline));
        break;
      case "table":
        parts.push(b.rows.map((r) => r.join(" ")).join("\n"));
        break;
      case "image":
      case "video":
        parts.push(b.caption);
        break;
      case "gallery":
        parts.push(...b.images.map((i) => i.caption));
        break;
      default:
        break;
    }
  }
  return parts.filter(Boolean).join("\n\n").trim();
}

function hasContent(blocks: ArticleBlock[]) {
  return blocks.some((b) => !["divider", "heading"].includes(b.type) && (b.type !== "paragraph" || b.text.trim().length > 0));
}

// ───────────────────────── Sitzungslose Akteure (Worker) ─────────────────────────

/** Lädt einen Nutzer in derselben Form wie die Session – für geplante Jobs ohne Request. */
async function loadActor(userId: string): Promise<SessionUser | null> {
  const u = await db.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      role: true,
      status: true,
      suspendedUntil: true,
      messagingRestrictedUntil: true,
      emailVerifiedAt: true,
      totpEnabledAt: true,
      onboardedAt: true,
      adultConfirmedAt: true,
      createdAt: true,
      profile: { select: { handle: true, displayName: true, avatarUrl: true, bio: true, categories: true, isCreatorPro: true } },
      shop: { select: { id: true, slug: true, status: true, name: true } },
    },
  });
  if (!u || u.status !== "ACTIVE" || !u.profile) return null;
  // Ohne Sitzung (Worker): Plattformrechte wie bisher allein nach aktiver 2FA
  return { ...u, mfaVerified: !!u.totpEnabledAt };
}

// ───────────────────────── Normalisierung ─────────────────────────

type MediaRow = { id: string; kind: string; state: string; variants: unknown; width: number | null; height: number | null };

function imageUrl(m: MediaRow | undefined) {
  const v = (m?.variants ?? {}) as Record<string, string>;
  return v.lg ?? v.md ?? v.sm ?? "";
}

/**
 * Prüft Medien und Einbettungen serverseitig und setzt URLs/Titel aus der Datenbank –
 * vom Client gelieferte URLs werden nie übernommen.
 */
async function normalizeBlocks(userId: string, blocks: ArticleBlock[]) {
  const mediaIds = new Set<string>();
  for (const b of blocks) {
    if (b.type === "image" || b.type === "video") mediaIds.add(b.mediaId);
    if (b.type === "gallery") b.images.forEach((i) => mediaIds.add(i.mediaId));
  }
  const media = mediaIds.size
    ? await db.media.findMany({ where: { id: { in: [...mediaIds] } }, select: { id: true, ownerId: true, kind: true, state: true, variants: true, width: true, height: true } })
    : [];
  if (media.length !== mediaIds.size || media.some((m) => m.ownerId !== userId)) throw fail.forbidden("Mindestens ein Medium gehört nicht zu deinem Konto.");
  const byId = new Map(media.map((m) => [m.id, m]));

  const projectIds = blocks.flatMap((b) => (b.type === "projectCard" ? [b.projectId] : []));
  const tutorialIds = blocks.flatMap((b) => (b.type === "tutorialCard" ? [b.tutorialId] : []));
  const productIds = blocks.flatMap((b) => (b.type === "productCard" ? [b.productId] : []));
  const [projects, tutorials, products] = await Promise.all([
    projectIds.length ? db.project.findMany({ where: { id: { in: projectIds }, state: { not: "REMOVED" }, OR: [{ ownerId: userId }, { visibility: "PUBLIC", state: "PUBLISHED" }] }, select: { id: true, title: true } }) : [],
    tutorialIds.length ? db.tutorial.findMany({ where: { id: { in: tutorialIds }, OR: [{ authorId: userId }, { state: "PUBLISHED" }] }, select: { id: true, title: true } }) : [],
    productIds.length ? db.product.findMany({ where: { id: { in: productIds }, OR: [{ shop: { ownerId: userId } }, { ...publicProductWhere }] }, select: { id: true, title: true } }) : [],
  ]);
  const titles = new Map<string, string>([...projects, ...tutorials, ...products].map((x) => [x.id, x.title]));

  const seen = new Set<string>();
  const out: ArticleBlock[] = [];
  for (const raw of blocks) {
    const b = { ...raw } as ArticleBlock;
    if (seen.has(b.id)) b.id = `${b.id}-${out.length}`;
    seen.add(b.id);
    switch (b.type) {
      case "image": {
        const m = byId.get(b.mediaId);
        if (m?.kind !== "IMAGE") throw fail.invalid("Ein Bildblock enthält kein Bild.");
        out.push({ ...b, url: imageUrl(m) });
        break;
      }
      case "gallery":
        out.push({
          ...b,
          images: b.images.map((i) => {
            const m = byId.get(i.mediaId);
            if (m?.kind !== "IMAGE") throw fail.invalid("Die Galerie enthält ungültige Medien.");
            return { ...i, url: imageUrl(m) };
          }),
        });
        break;
      case "video": {
        const m = byId.get(b.mediaId);
        if (m?.kind !== "VIDEO") throw fail.invalid("Ein Videoblock enthält kein Video.");
        out.push({ ...b, url: ((m.variants ?? {}) as Record<string, string>).video ?? "" });
        break;
      }
      case "projectCard":
      case "tutorialCard":
      case "productCard": {
        const id = b.type === "projectCard" ? b.projectId : b.type === "tutorialCard" ? b.tutorialId : b.productId;
        const t = titles.get(id);
        if (!t) throw fail.invalid("Eine eingebettete Karte verweist auf einen nicht verfügbaren Inhalt.");
        out.push({ ...b, title: t });
        break;
      }
      case "table": {
        const width = Math.max(...b.rows.map((r) => r.length));
        out.push({ ...b, rows: b.rows.map((r) => [...r, ...Array(width - r.length).fill("")]) });
        break;
      }
      case "list":
        out.push({ ...b, items: b.items.map((x) => x.trim()).filter(Boolean) });
        break;
      default:
        out.push(b);
    }
  }
  return { blocks: out, mediaIds: [...mediaIds] };
}

function normalizeTags(tags: string[]) {
  return [...new Set(tags.map((t) => slugify(t.replace(/^#/, ""), 30)).filter((t) => t && t !== "eintrag"))].slice(0, 10);
}

async function uniqueSlug(authorId: string, base: string, excludeId?: string) {
  let slug = base;
  for (let n = 2; n < 200; n++) {
    const clash = await db.blogArticle.findFirst({ where: { authorId, slug, id: excludeId ? { not: excludeId } : undefined }, select: { id: true } });
    if (!clash) return slug;
    slug = `${base.slice(0, 72)}-${n}`;
  }
  return `${base.slice(0, 60)}-${Date.now().toString(36)}`;
}

// ───────────────────────── Schreiben ─────────────────────────

async function ownArticle(user: Pick<SessionUser, "id">, id: string) {
  const a = await db.blogArticle.findUnique({ where: { id } });
  if (!a || a.authorId !== user.id) throw fail.notFound("Artikel nicht gefunden.");
  return a;
}

/**
 * Speichert einen Artikel (neu oder bestehend). Jede Speicherung erzeugt eine Revision
 * (identische Stände werden nicht doppelt abgelegt); es bleiben die letzten 30 erhalten.
 */
export async function saveArticle(user: SessionUser, id: string | null, input: unknown) {
  const data = articleUpsertSchema.parse(input);
  const existing = id ? await ownArticle(user, id) : null;
  // Wie Projekte/Anleitungen: neue Artikel zählen gegen das Beitragslimit (Speichern bestehender nicht – Autosave)
  if (!existing) await limit("post", user.id);
  if (existing?.state === "REMOVED") throw fail.forbidden("Dieser Artikel wurde von der Moderation entfernt und kann nicht mehr bearbeitet werden.");
  if (existing?.state === "HIDDEN") throw fail.forbidden("Dieser Artikel wurde von der Moderation ausgeblendet und kann nicht bearbeitet werden.");
  const { blocks, mediaIds } = await normalizeBlocks(user.id, data.blocks);
  const plainText = blocksToPlainText(blocks);
  const tags = normalizeTags(data.tags);

  if (data.categoryId) {
    const cat = await db.articleCategory.findUnique({ where: { id: data.categoryId }, select: { id: true } });
    if (!cat) throw fail.invalid("Unbekannte Kategorie.", { categoryId: "Unbekannte Kategorie" });
  }
  const projectIds = [...new Set(data.projectIds)];
  if (projectIds.length) {
    const own = await db.project.count({ where: { id: { in: projectIds }, ownerId: user.id, state: { not: "REMOVED" } } });
    if (own !== projectIds.length) throw fail.forbidden("Du kannst nur eigene Projekte verknüpfen.");
  }

  // Adresse (Slug)
  const everPublished = !!existing?.publishedAt && existing.state !== "SCHEDULED";
  let slug: string;
  if (data.slug) {
    slug = data.slug;
    const clash = await db.blogArticle.findFirst({ where: { authorId: user.id, slug, id: existing ? { not: existing.id } : undefined }, select: { id: true } });
    if (clash) throw fail.conflict("Diese Adresse verwendest du bereits für einen anderen Artikel.");
  } else if (existing && everPublished) {
    slug = existing.slug;
  } else {
    slug = await uniqueSlug(user.id, slugify(data.title, 72), existing?.id);
  }

  let coverUrl: string | null | undefined = undefined;
  if (data.coverMediaId === null) coverUrl = null;

  const result = await db.$transaction(async (tx) => {
    const attach = [...mediaIds, ...(data.coverMediaId ? [data.coverMediaId] : [])];
    if (attach.length) await attachMedia(tx, user.id, attach);
    if (data.coverMediaId) {
      const m = await tx.media.findUnique({ where: { id: data.coverMediaId }, select: { kind: true, variants: true } });
      if (m?.kind !== "IMAGE") throw fail.invalid("Das Titelbild muss ein Bild sein.");
      const v = (m.variants ?? {}) as Record<string, string>;
      coverUrl = v.lg ?? v.md ?? null;
    }
    const fields = {
      title: data.title,
      slug,
      dek: data.dek,
      blocks: blocks as unknown as Prisma.InputJsonValue,
      plainText,
      readingMinutes: readingMinutes(`${data.title} ${data.dek} ${plainText}`),
      categoryId: data.categoryId ?? null,
      tags,
      seoTitle: data.seoTitle || null,
      seoDescription: data.seoDescription || null,
      commentsEnabled: data.commentsEnabled,
      ...(coverUrl !== undefined ? { coverUrl } : {}),
    };
    const article = existing
      ? await tx.blogArticle.update({ where: { id: existing.id }, data: fields })
      : await tx.blogArticle.create({ data: { ...fields, authorId: user.id, state: "DRAFT" } });

    if (existing && existing.slug !== slug) {
      if (everPublished) {
        await tx.articleSlugRedirect.upsert({
          where: { authorId_oldSlug: { authorId: user.id, oldSlug: existing.slug } },
          create: { articleId: article.id, authorId: user.id, oldSlug: existing.slug },
          update: { articleId: article.id },
        });
      }
      await tx.articleSlugRedirect.deleteMany({ where: { authorId: user.id, oldSlug: slug } });
    }

    if (tags.length) {
      await tx.articleTag.createMany({ data: tags.map((t) => ({ slug: t, name: t.replace(/-/g, " ") })), skipDuplicates: true });
    }

    await tx.articleProject.deleteMany({ where: { articleId: article.id, projectId: { notIn: projectIds } } });
    if (projectIds.length) await tx.articleProject.createMany({ data: projectIds.map((projectId) => ({ articleId: article.id, projectId })), skipDuplicates: true });

    const last = await tx.articleRevision.findFirst({ where: { articleId: article.id }, orderBy: { createdAt: "desc" }, select: { title: true, blocks: true } });
    const changed = !last || last.title !== data.title || JSON.stringify(last.blocks) !== JSON.stringify(blocks);
    if (changed) {
      await tx.articleRevision.create({ data: { articleId: article.id, title: data.title, blocks: blocks as unknown as Prisma.InputJsonValue } });
      const stale = await tx.articleRevision.findMany({ where: { articleId: article.id }, orderBy: { createdAt: "desc" }, skip: MAX_REVISIONS, select: { id: true } });
      if (stale.length) await tx.articleRevision.deleteMany({ where: { id: { in: stale.map((s) => s.id) } } });
    }
    return article;
  });
  return { id: result.id, slug: result.slug, state: result.state, updatedAt: result.updatedAt.toISOString(), coverUrl: result.coverUrl };
}

async function onFirstPublish(actor: SessionUser, article: { id: string; title: string; dek: string }, shareToFeed: boolean) {
  await emit({ type: "ArticlePublished", articleId: article.id, authorId: actor.id });
  if (!shareToFeed) return;
  try {
    await createPost(actor, { body: (article.dek || article.title).slice(0, 5000), media: [] }, { articleId: article.id });
  } catch (e) {
    // Veröffentlichung des Artikels darf nicht an der Feed-Ankündigung scheitern (z. B. Rate Limit).
    console.error(JSON.stringify({ level: "warn", msg: "article_announce_failed", articleId: article.id, err: e instanceof Error ? e.message : String(e) }));
  }
}

/**
 * Für geplante Artikel wird der Wunsch „im Feed ankündigen“ als unsichtbarer
 * Entwurfsbeitrag (Post.state = DRAFT, articleId) vorgemerkt und bei Veröffentlichung eingelöst.
 */
async function setAnnounceMarker(authorId: string, articleId: string, body: string, on: boolean) {
  await db.post.deleteMany({ where: { articleId, authorId, state: "DRAFT" } });
  if (on) await db.post.create({ data: { authorId, articleId, kind: "ARTICLE", state: "DRAFT", body: body.slice(0, 5000), visibility: "PUBLIC" } });
}

async function takeAnnounceMarker(authorId: string, articleId: string) {
  const r = await db.post.deleteMany({ where: { articleId, authorId, state: "DRAFT" } });
  return r.count > 0;
}

export async function publishArticle(user: SessionUser, id: string, input: unknown) {
  const opts = articlePublishSchema.parse(input ?? {});
  const a = await ownArticle(user, id);
  if (a.state === "HIDDEN" || a.state === "REMOVED") throw fail.forbidden("Dieser Artikel wurde von der Moderation ausgeblendet.");
  await limit("post", user.id);
  if (!hasContent(parseBlocks(a.blocks))) throw fail.invalid("Dein Artikel braucht noch Inhalt, bevor du ihn veröffentlichst.");
  const now = new Date();
  const at = opts.publishAt ? new Date(opts.publishAt) : null;
  const wasPublished = !!a.publishedAt && a.state !== "SCHEDULED";

  if (at && at.getTime() > now.getTime() + 60_000) {
    if (wasPublished) throw fail.invalid("Dieser Artikel war bereits veröffentlicht und kann nicht neu geplant werden. Veröffentliche ihn direkt.");
    if (at.getTime() > now.getTime() + 366 * 86400_000) throw fail.invalid("Plane höchstens ein Jahr im Voraus.");
    await db.blogArticle.update({ where: { id }, data: { state: "SCHEDULED", publishedAt: at } });
    await setAnnounceMarker(user.id, id, a.dek || a.title, opts.shareToFeed);
    return { state: "SCHEDULED" as ArticleState, publishedAt: at.toISOString() };
  }

  await db.blogArticle.update({ where: { id }, data: { state: "PUBLISHED", publishedAt: wasPublished ? a.publishedAt : now } });
  if (!wasPublished) {
    if (a.state === "SCHEDULED") await takeAnnounceMarker(user.id, id);
    await onFirstPublish(user, a, opts.shareToFeed);
  }
  return { state: "PUBLISHED" as ArticleState, publishedAt: (wasPublished ? a.publishedAt! : now).toISOString() };
}

export async function unpublishArticle(user: SessionUser, id: string) {
  const a = await ownArticle(user, id);
  if (a.state === "HIDDEN" || a.state === "REMOVED") throw fail.forbidden();
  if (a.state === "SCHEDULED") {
    await takeAnnounceMarker(user.id, id);
    await db.blogArticle.update({ where: { id }, data: { state: "DRAFT", publishedAt: null } });
  } else {
    await db.blogArticle.update({ where: { id }, data: { state: "DRAFT" } });
  }
  return { state: "DRAFT" as ArticleState };
}

/** Von der Moderation ausgeblendete/entfernte Artikel bleiben als Nachweis erhalten (Einspruch, Fallakte). */
function assertNotModerated(a: { state: ArticleState }) {
  if (a.state === "HIDDEN" || a.state === "REMOVED") throw fail.forbidden("Dieser Artikel wurde von der Moderation ausgeblendet und kann nicht verändert oder gelöscht werden.");
}

export async function deleteArticle(user: SessionUser, id: string) {
  assertNotModerated(await ownArticle(user, id));
  await db.$transaction([
    db.post.deleteMany({ where: { articleId: id, authorId: user.id, state: "DRAFT" } }),
    db.blogArticle.delete({ where: { id } }),
  ]);
}

export async function listRevisions(user: SessionUser, articleId: string) {
  await ownArticle(user, articleId);
  const rows = await db.articleRevision.findMany({ where: { articleId }, orderBy: { createdAt: "desc" }, take: MAX_REVISIONS, select: { id: true, title: true, createdAt: true, blocks: true } });
  return rows.map((r) => {
    const blocks = parseBlocks(r.blocks);
    const words = blocksToPlainText(blocks).split(/\s+/).filter(Boolean).length;
    return { id: r.id, title: r.title, createdAt: r.createdAt.toISOString(), blockCount: blocks.length, words };
  });
}

/** Stellt eine Revision wieder her (Titel + Blöcke) und legt den Stand selbst als neue Revision ab. */
export async function restoreRevision(user: SessionUser, articleId: string, revisionId: string) {
  const a = await ownArticle(user, articleId);
  assertNotModerated(a);
  const rev = await db.articleRevision.findUnique({ where: { id: revisionId } });
  if (!rev || rev.articleId !== articleId) throw fail.notFound("Revision nicht gefunden.");
  const blocks = parseBlocks(rev.blocks);
  const plainText = blocksToPlainText(blocks);
  await db.$transaction(async (tx) => {
    await tx.blogArticle.update({
      where: { id: articleId },
      data: { title: rev.title, blocks: rev.blocks as Prisma.InputJsonValue, plainText, readingMinutes: readingMinutes(`${rev.title} ${a.dek} ${plainText}`) },
    });
    await tx.articleRevision.create({ data: { articleId, title: rev.title, blocks: rev.blocks as Prisma.InputJsonValue } });
    const stale = await tx.articleRevision.findMany({ where: { articleId }, orderBy: { createdAt: "desc" }, skip: MAX_REVISIONS, select: { id: true } });
    if (stale.length) await tx.articleRevision.deleteMany({ where: { id: { in: stale.map((s) => s.id) } } });
  });
  return { title: rev.title, blocks };
}

/** Worker-Job: fällige geplante Artikel veröffentlichen (idempotent, mehrfach aufrufbar). */
export async function publishScheduledArticles(now = new Date()) {
  const due = await db.blogArticle.findMany({
    // Gesperrte/gebannte Konten veröffentlichen nichts – nach Ablauf einer Sperre geht der Artikel online
    where: { state: "SCHEDULED", publishedAt: { lte: now }, author: { status: "ACTIVE" } },
    select: { id: true, authorId: true, title: true, dek: true },
    orderBy: { publishedAt: "asc" },
    take: 200,
  });
  let published = 0;
  for (const a of due) {
    const claimed = await db.blogArticle.updateMany({ where: { id: a.id, state: "SCHEDULED" }, data: { state: "PUBLISHED" } });
    if (!claimed.count) continue;
    published++;
    const share = await takeAnnounceMarker(a.authorId, a.id);
    const actor = await loadActor(a.authorId);
    if (actor) await onFirstPublish(actor, a, share);
    else await emit({ type: "ArticlePublished", articleId: a.id, authorId: a.authorId });
  }
  return { published };
}

// ───────────────────────── Lesen ─────────────────────────

const cardSelect = {
  id: true,
  slug: true,
  title: true,
  dek: true,
  coverUrl: true,
  readingMinutes: true,
  publishedAt: true,
  likeCount: true,
  viewCount: true,
  tags: true,
  isFeatured: true,
  category: { select: { slug: true, name: true } },
  author: { select: { id: true, profile: { select: { handle: true, displayName: true, avatarUrl: true } } } },
} satisfies Prisma.BlogArticleSelect;

type CardRow = Prisma.BlogArticleGetPayload<{ select: typeof cardSelect }>;

function toCard(a: CardRow) {
  const handle = a.author.profile?.handle ?? "unbekannt";
  return {
    id: a.id,
    slug: a.slug,
    title: a.title,
    dek: a.dek,
    coverUrl: a.coverUrl,
    readingMinutes: a.readingMinutes,
    publishedAt: a.publishedAt?.toISOString() ?? null,
    likeCount: a.likeCount,
    viewCount: a.viewCount,
    tags: a.tags,
    isFeatured: a.isFeatured,
    category: a.category,
    author: { id: a.author.id, handle, displayName: a.author.profile?.displayName ?? "Unbekannt", avatarUrl: a.author.profile?.avatarUrl ?? null },
    href: articleHref(handle, a.slug),
  };
}

export type ArticleCardData = ReturnType<typeof toCard>;

export type ArticleFilters = {
  authorId?: string;
  category?: string;
  tag?: string;
  q?: string;
  featured?: boolean;
  excludeIds?: string[];
  viewerId?: string | null;
  take?: number;
};

async function searchArticleIds(q: string) {
  const term = q.trim().slice(0, 120);
  if (!term) return null;
  const rows = await db.$queryRaw<{ id: string }[]>`
    SELECT id FROM "BlogArticle"
    WHERE state = 'PUBLISHED' AND (
      search @@ websearch_to_tsquery('german', wr_unaccent(${term}))
      OR title ILIKE ${"%" + term.replace(/[%_\\]/g, "\\$&") + "%"}
    )
    ORDER BY ts_rank(search, websearch_to_tsquery('german', wr_unaccent(${term}))) DESC, "publishedAt" DESC
    LIMIT 300`;
  return rows.map((r) => r.id);
}

async function publicArticleWhere(f: ArticleFilters): Promise<Prisma.BlogArticleWhereInput> {
  const rel = await relationsFor(f.viewerId);
  const ids = f.q ? await searchArticleIds(f.q) : null;
  return {
    state: "PUBLISHED",
    publishedAt: { lte: new Date() },
    author: { status: "ACTIVE" },
    ...(f.authorId ? { authorId: f.authorId } : rel.blocked.length ? { authorId: { notIn: rel.blocked } } : {}),
    ...(f.category ? { category: { slug: f.category } } : {}),
    ...(f.tag ? { tags: { has: f.tag } } : {}),
    ...(f.featured ? { isFeatured: true } : {}),
    AND: [
      ...(ids ? [{ id: { in: ids } }] : []),
      ...(f.excludeIds?.length ? [{ id: { notIn: f.excludeIds } }] : []),
    ],
  };
}

/** Öffentliche Artikelliste mit Cursor-Pagination (neueste zuerst). */
export async function listArticles(filters: ArticleFilters = {}, cursor?: string | null) {
  const take = Math.min(filters.take ?? 12, 50);
  if (filters.authorId && filters.viewerId) {
    const rel = await relationsFor(filters.viewerId);
    if (rel.blocked.includes(filters.authorId)) return { items: [] as ArticleCardData[], nextCursor: null };
  }
  const rows = await db.blogArticle.findMany({
    where: await publicArticleWhere(filters),
    select: cardSelect,
    orderBy: [{ publishedAt: "desc" }, { id: "desc" }],
    take: take + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });
  const hasMore = rows.length > take;
  const page = rows.slice(0, take);
  return { items: page.map(toCard), nextCursor: hasMore ? page[page.length - 1]!.id : null };
}

/** Redaktionelle Startseite /blogs: Aufmacher, Neuestes, nach Kategorie, Autor:innen. */
export async function getBlogIndex(viewerId: string | null) {
  const [featured, latest, categories] = await Promise.all([
    listArticles({ featured: true, viewerId, take: 1 }),
    listArticles({ viewerId, take: 13 }),
    listArticleCategories(),
  ]);
  const hero = featured.items[0] ?? latest.items[0] ?? null;
  const rest = latest.items.filter((a) => a.id !== hero?.id).slice(0, 12);
  const used = new Set([hero?.id, ...rest.map((a) => a.id)].filter(Boolean) as string[]);
  const byCategory = (
    await Promise.all(
      categories.map(async (c) => ({ category: c, items: (await listArticles({ category: c.slug, viewerId, take: 4, excludeIds: [...used] })).items })),
    )
  ).filter((g) => g.items.length > 0);

  const authorRows = await db.blogArticle.groupBy({
    by: ["authorId"],
    where: { state: "PUBLISHED", publishedAt: { lte: new Date() }, author: { status: "ACTIVE" } },
    _count: { _all: true },
    _sum: { likeCount: true },
    orderBy: { _sum: { likeCount: "desc" } },
    take: 6,
  });
  const profiles = authorRows.length
    ? await db.userProfile.findMany({ where: { userId: { in: authorRows.map((r) => r.authorId) } }, select: { userId: true, handle: true, displayName: true, avatarUrl: true, bio: true } })
    : [];
  const pmap = new Map(profiles.map((p) => [p.userId, p]));
  const rel = await relationsFor(viewerId);
  const authors = authorRows
    .filter((r) => !rel.blocked.includes(r.authorId))
    .map((r) => ({ ...pmap.get(r.authorId)!, articles: r._count._all }))
    .filter((a) => a.handle);
  return { hero, latest: rest, byCategory, categories, authors };
}

export async function resolveHandle(handle: string) {
  const h = handle.toLowerCase();
  const p = await db.userProfile.findUnique({ where: { handle: h }, select: { userId: true, handle: true, displayName: true, avatarUrl: true, bio: true, followerCount: true, user: { select: { status: true } } } });
  if (p) return p.user.status === "ACTIVE" || p.user.status === "SUSPENDED" ? { kind: "ok" as const, profile: p } : null;
  const r = await db.handleRedirect.findUnique({ where: { oldHandle: h }, select: { profile: { select: { handle: true } } } });
  return r ? { kind: "redirect" as const, handle: r.profile.handle } : null;
}

/** Artikel für Lesende (inkl. Vorschau für Autor:innen). Liefert ggf. eine Weiterleitung. */
export async function getArticleForReader(handle: string, slug: string, viewerId: string | null) {
  const h = await resolveHandle(handle);
  if (!h) return null;
  if (h.kind === "redirect") return { kind: "redirect" as const, to: articleHref(h.handle, slug) };
  const author = h.profile;
  const article = await db.blogArticle.findUnique({
    where: { authorId_slug: { authorId: author.userId, slug } },
    include: { category: { select: { slug: true, name: true } }, projects: { select: { projectId: true } } },
  });
  if (!article) {
    const r = await db.articleSlugRedirect.findUnique({ where: { authorId_oldSlug: { authorId: author.userId, oldSlug: slug } }, select: { article: { select: { slug: true } } } });
    return r ? { kind: "redirect" as const, to: articleHref(author.handle, r.article.slug) } : null;
  }
  const isAuthor = viewerId === article.authorId;
  const isLive = article.state === "PUBLISHED" && !!article.publishedAt && article.publishedAt <= new Date();
  if (!isLive && !isAuthor) return null;
  if (article.state === "REMOVED") return null;
  if (article.state === "HIDDEN" && !isAuthor) return null;
  if (viewerId && !isAuthor) {
    const rel = await relationsFor(viewerId);
    if (rel.blocked.includes(article.authorId)) return null;
  }
  const [liked, saved, following, commentCount] = await Promise.all([
    viewerId ? db.reaction.findFirst({ where: { userId: viewerId, targetType: "ARTICLE", targetId: article.id }, select: { userId: true } }) : null,
    viewerId ? db.bookmark.findFirst({ where: { userId: viewerId, targetType: "ARTICLE", targetId: article.id }, select: { userId: true } }) : null,
    viewerId && !isAuthor ? db.follow.findUnique({ where: { followerId_followeeId: { followerId: viewerId, followeeId: article.authorId } }, select: { followerId: true } }) : null,
    db.comment.count({ where: { targetType: "ARTICLE", targetId: article.id, state: "PUBLISHED" } }),
  ]);
  return {
    kind: "ok" as const,
    isAuthor,
    isLive,
    // Effektiv: offen nur, wenn die Autorin/der Autor sie erlaubt und die Moderation sie nicht gesperrt hat
    article: { ...article, commentsEnabled: article.commentsEnabled && !article.commentsLockedAt, blocks: parseBlocks(article.blocks) },
    author,
    viewer: { liked: !!liked, saved: !!saved, following: !!following },
    commentCount,
  };
}

/** Verwandte Artikel: gleiche Kategorie oder gemeinsame Schlagwörter; sonst vom selben Autor. */
export async function relatedArticles(article: { id: string; authorId: string; categoryId: string | null; tags: string[] }, viewerId: string | null, take = 3) {
  const rel = await relationsFor(viewerId);
  const base: Prisma.BlogArticleWhereInput = {
    state: "PUBLISHED",
    publishedAt: { lte: new Date() },
    id: { not: article.id },
    author: { status: "ACTIVE" },
    ...(rel.blocked.length ? { authorId: { notIn: rel.blocked } } : {}),
  };
  const or: Prisma.BlogArticleWhereInput[] = [];
  if (article.categoryId) or.push({ categoryId: article.categoryId });
  if (article.tags.length) or.push({ tags: { hasSome: article.tags } });
  const primary = or.length ? await db.blogArticle.findMany({ where: { ...base, OR: or }, select: cardSelect, orderBy: [{ likeCount: "desc" }, { publishedAt: "desc" }], take }) : [];
  if (primary.length >= take) return primary.map(toCard);
  const more = await db.blogArticle.findMany({ where: { ...base, authorId: article.authorId, id: { notIn: [article.id, ...primary.map((p) => p.id)] } }, select: cardSelect, orderBy: { publishedAt: "desc" }, take: take - primary.length });
  return [...primary, ...more].map(toCard);
}

export async function linkedProjects(projectIds: string[]) {
  if (!projectIds.length) return [];
  const rows = await db.project.findMany({
    where: { id: { in: projectIds }, visibility: "PUBLIC", state: "PUBLISHED" },
    select: { id: true, slug: true, title: true, status: true, category: true, coverUrl: true, difficulty: true, owner: { select: { profile: { select: { handle: true } } } } },
  });
  return rows.map((p) => ({ ...p, href: `/u/${p.owner.profile?.handle}/${p.slug}` }));
}

/** Daten für eingebettete Karten und frische Medienvarianten eines Artikels. */
export async function resolveEmbeds(blocks: ArticleBlock[], viewerId: string | null) {
  const ids = { project: [] as string[], tutorial: [] as string[], product: [] as string[], media: [] as string[] };
  for (const b of blocks) {
    if (b.type === "projectCard") ids.project.push(b.projectId);
    if (b.type === "tutorialCard") ids.tutorial.push(b.tutorialId);
    if (b.type === "productCard") ids.product.push(b.productId);
    if (b.type === "image" || b.type === "video") ids.media.push(b.mediaId);
    if (b.type === "gallery") ids.media.push(...b.images.map((i) => i.mediaId));
  }
  const rel = await relationsFor(viewerId);
  const notBlocked = rel.blocked.length ? { notIn: rel.blocked } : undefined;
  const [projects, tutorials, products, media] = await Promise.all([
    ids.project.length
      ? db.project.findMany({
          where: { id: { in: ids.project }, OR: [{ visibility: "PUBLIC", state: "PUBLISHED" }, ...(viewerId ? [{ ownerId: viewerId, state: { not: "REMOVED" as const } }] : [])], ownerId: notBlocked },
          select: { id: true, slug: true, title: true, status: true, category: true, difficulty: true, coverUrl: true, likeCount: true, owner: { select: { profile: { select: { handle: true, displayName: true } } } } },
        })
      : [],
    ids.tutorial.length
      ? db.tutorial.findMany({
          where: { id: { in: ids.tutorial }, OR: [{ state: "PUBLISHED" }, ...(viewerId ? [{ authorId: viewerId }] : [])], authorId: notBlocked },
          select: { id: true, slug: true, title: true, summary: true, difficulty: true, minutes: true, category: true, coverUrl: true, author: { select: { profile: { select: { displayName: true } } } } },
        })
      : [],
    ids.product.length
      ? db.product.findMany({
          where: { id: { in: ids.product }, OR: [{ ...publicProductWhere }, ...(viewerId ? [{ shop: { ownerId: viewerId } }] : [])], shop: { ownerId: notBlocked } },
          select: { id: true, slug: true, title: true, priceMinor: true, currency: true, status: true, kind: true, coverUrl: true, category: true, shop: { select: { slug: true, name: true } } },
        })
      : [],
    ids.media.length ? db.media.findMany({ where: { id: { in: ids.media } }, select: { id: true, kind: true, state: true, variants: true, width: true, height: true } }) : [],
  ]);
  return {
    projects: new Map(projects.map((p) => [p.id, { ...p, href: `/u/${p.owner.profile?.handle}/${p.slug}` }])),
    tutorials: new Map(tutorials.map((t) => [t.id, { ...t, href: `/anleitungen/${t.slug}` }])),
    products: new Map(products.map((p) => [p.id, { ...p, href: `/markt/${p.shop.slug}/${p.slug}` }])),
    media: new Map(media.map((m) => [m.id, { ...m, variants: (m.variants ?? {}) as Record<string, string> }])),
  };
}
export type ResolvedEmbeds = Awaited<ReturnType<typeof resolveEmbeds>>;

// ───────────────────────── Studio ─────────────────────────

export async function listMyArticles(userId: string, state?: ArticleState) {
  const rows = await db.blogArticle.findMany({
    where: { authorId: userId, ...(state ? { state } : { state: { not: "REMOVED" } }) },
    orderBy: { updatedAt: "desc" },
    select: { id: true, slug: true, title: true, dek: true, state: true, coverUrl: true, viewCount: true, likeCount: true, readingMinutes: true, publishedAt: true, updatedAt: true, category: { select: { name: true } } },
    take: 200,
  });
  const comments = rows.length
    ? await db.comment.groupBy({ by: ["targetId"], where: { targetType: "ARTICLE", targetId: { in: rows.map((r) => r.id) }, state: "PUBLISHED" }, _count: { _all: true } })
    : [];
  const cmap = new Map(comments.map((c) => [c.targetId, c._count._all]));
  return rows.map((r) => ({ ...r, publishedAt: r.publishedAt?.toISOString() ?? null, updatedAt: r.updatedAt.toISOString(), commentCount: cmap.get(r.id) ?? 0 }));
}

export async function getArticleForEdit(user: SessionUser, id: string) {
  const a = await db.blogArticle.findUnique({ where: { id }, include: { projects: { select: { projectId: true } } } });
  if (!a || a.authorId !== user.id) return null;
  return {
    id: a.id,
    slug: a.slug,
    title: a.title,
    dek: a.dek,
    coverUrl: a.coverUrl,
    blocks: parseBlocks(a.blocks),
    categoryId: a.categoryId,
    tags: a.tags,
    seoTitle: a.seoTitle ?? "",
    seoDescription: a.seoDescription ?? "",
    commentsEnabled: a.commentsEnabled,
    commentsLocked: !!a.commentsLockedAt,
    projectIds: a.projects.map((p) => p.projectId),
    state: a.state,
    publishedAt: a.publishedAt?.toISOString() ?? null,
    updatedAt: a.updatedAt.toISOString(),
    readingMinutes: a.readingMinutes,
    everPublished: !!a.publishedAt && a.state !== "SCHEDULED",
  };
}
export type ArticleEditData = NonNullable<Awaited<ReturnType<typeof getArticleForEdit>>>;

export async function myProjectOptions(userId: string) {
  return db.project.findMany({ where: { ownerId: userId, state: { not: "REMOVED" } }, orderBy: { updatedAt: "desc" }, take: 60, select: { id: true, title: true } });
}

/** Suche nach eigenen Inhalten für Einbettungskarten im Editor. */
export async function searchOwnEmbeds(user: SessionUser, type: string, q: string) {
  const term = q.trim().slice(0, 80);
  const title = term ? { contains: term, mode: "insensitive" as const } : undefined;
  if (type === "project") {
    const rows = await db.project.findMany({ where: { ownerId: user.id, state: { not: "REMOVED" }, title }, orderBy: { updatedAt: "desc" }, take: 12, select: { id: true, title: true, status: true, coverUrl: true, category: true, visibility: true } });
    return rows.map((r) => ({ id: r.id, title: r.title, meta: r.visibility === "PUBLIC" ? "Projekt" : "Projekt · nicht öffentlich", coverUrl: r.coverUrl, category: r.category }));
  }
  if (type === "tutorial") {
    const rows = await db.tutorial.findMany({ where: { authorId: user.id, state: { not: "REMOVED" }, title }, orderBy: { updatedAt: "desc" }, take: 12, select: { id: true, title: true, state: true, coverUrl: true, category: true } });
    return rows.map((r) => ({ id: r.id, title: r.title, meta: r.state === "PUBLISHED" ? "Anleitung" : "Anleitung · Entwurf", coverUrl: r.coverUrl, category: r.category }));
  }
  if (type === "product") {
    const rows = await db.product.findMany({ where: { shop: { ownerId: user.id }, status: { not: "DISABLED" }, title }, orderBy: { updatedAt: "desc" }, take: 12, select: { id: true, title: true, status: true, coverUrl: true, category: true } });
    return rows.map((r) => ({ id: r.id, title: r.title, meta: r.status === "ACTIVE" ? "Produkt" : "Produkt · nicht aktiv", coverUrl: r.coverUrl, category: r.category }));
  }
  throw fail.invalid("Unbekannter Typ.");
}

// ───────────────────────── Sitemap ─────────────────────────

/** Einträge für app/sitemap.ts (gehört einem anderen Team): alle öffentlichen Artikel. */
export async function getArticleSitemapEntries() {
  const rows = await db.blogArticle.findMany({
    where: { state: "PUBLISHED", publishedAt: { lte: new Date() }, author: { status: "ACTIVE" } },
    select: { slug: true, updatedAt: true, author: { select: { profile: { select: { handle: true } } } } },
    orderBy: { publishedAt: "desc" },
    take: 45_000,
  });
  const base = appUrl();
  return [
    { url: `${base}/blogs`, lastModified: rows[0]?.updatedAt ?? new Date(), changeFrequency: "daily" as const, priority: 0.7 },
    ...rows
      .filter((r) => r.author.profile?.handle)
      .map((r) => ({ url: `${base}${articleHref(r.author.profile!.handle, r.slug)}`, lastModified: r.updatedAt, changeFrequency: "weekly" as const, priority: 0.6 })),
  ];
}

export { appUrl as articleBaseUrl };
