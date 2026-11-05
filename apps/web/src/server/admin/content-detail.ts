import "server-only";
import { z } from "zod";
import { CATEGORY_SLUGS, VISIBILITY } from "@werkraum/shared";
import { db, type ContentState, type Prisma, type TargetType, type Tx } from "@/server/db";
import { fail } from "@/server/errors";
import { audit } from "@/server/audit";
import { notify } from "@/server/notifications";
import { hasRole } from "@/server/authz";
import { bumpCounter } from "@/server/social/targets";
import { setContentHidden, setFeatured } from "@/server/admin/content";
import type { SessionUser } from "@/server/auth/session";

/**
 * Inhaltsverwaltung (Admin → Inhalte → Detail). Ergänzt `content.ts` um Beiträge
 * und Artikel, Detailansichten sowie begründete Eingriffe (Bearbeiten, Entfernen,
 * Kommentare). Jeder Eingriff wird protokolliert; Betroffene werden informiert.
 * Moderation darf bearbeiten, hervorheben und ausblenden – Entfernen und
 * Wiederherstellen ist der Administration vorbehalten.
 */

type Actor = Pick<SessionUser, "id" | "role">;
export type DetailKind = "PROJECT" | "TUTORIAL" | "POST" | "ARTICLE";
const PER_PAGE = 40;

function mod(actor: Actor) {
  if (!hasRole(actor, "PLATFORM_MODERATOR")) throw fail.forbidden();
}
function admin(actor: Actor, what = "Diese Aktion") {
  if (!hasRole(actor, "ADMIN")) throw fail.forbidden(`${what} ist der Administration vorbehalten.`);
}

const reasonSchema = z.string().trim().min(5, "Bitte begründe den Eingriff (mind. 5 Zeichen)").max(1000);
const kindSchema = z.enum(["PROJECT", "TUTORIAL", "POST", "ARTICLE"]);
const contentStateFilter = z.enum(["PUBLISHED", "DRAFT", "HIDDEN", "REMOVED"]).nullable().catch(null);
const articleStateFilter = z.enum(["PUBLISHED", "DRAFT", "SCHEDULED", "HIDDEN"]).nullable().catch(null);

/* ───────────────────────────── Listen ───────────────────────────── */

export async function listPosts(actor: Actor, opts: { q?: string | null; state?: string | null; page?: number }) {
  mod(actor);
  const page = Math.max(1, opts.page ?? 1);
  const state = contentStateFilter.parse(opts.state ?? null);
  const where: Prisma.PostWhereInput = {
    ...(state ? { state } : {}),
    ...(opts.q ? { OR: [{ body: { contains: opts.q, mode: "insensitive" } }, { id: opts.q }, { author: { profile: { handle: opts.q.replace(/^@/, "").toLowerCase() } } }] } : {}),
  };
  const [rows, total] = await Promise.all([
    db.post.findMany({
      where,
      orderBy: { publishedAt: "desc" },
      skip: (page - 1) * PER_PAGE,
      take: PER_PAGE,
      select: {
        id: true,
        kind: true,
        body: true,
        category: true,
        visibility: true,
        state: true,
        reachLimited: true,
        isCommercial: true,
        likeCount: true,
        commentCount: true,
        saveCount: true,
        repostCount: true,
        publishedAt: true,
        author: { select: { id: true, profile: { select: { handle: true, displayName: true } } } },
        community: { select: { name: true, slug: true } },
        _count: { select: { media: true } },
      },
    }),
    db.post.count({ where }),
  ]);
  return { rows, total, page, pages: Math.max(1, Math.ceil(total / PER_PAGE)) };
}

export async function listArticles(actor: Actor, opts: { q?: string | null; state?: string | null; featured?: boolean; page?: number }) {
  mod(actor);
  const page = Math.max(1, opts.page ?? 1);
  const state = articleStateFilter.parse(opts.state ?? null);
  const where: Prisma.BlogArticleWhereInput = {
    ...(state ? { state } : {}),
    ...(opts.featured ? { isFeatured: true } : {}),
    ...(opts.q ? { OR: [{ title: { contains: opts.q, mode: "insensitive" } }, { id: opts.q }, { author: { profile: { handle: opts.q.replace(/^@/, "").toLowerCase() } } }] } : {}),
  };
  const [rows, total] = await Promise.all([
    db.blogArticle.findMany({
      where,
      orderBy: [{ isFeatured: "desc" }, { updatedAt: "desc" }],
      skip: (page - 1) * PER_PAGE,
      take: PER_PAGE,
      select: {
        id: true,
        title: true,
        slug: true,
        state: true,
        isFeatured: true,
        commentsEnabled: true,
        viewCount: true,
        likeCount: true,
        readingMinutes: true,
        publishedAt: true,
        updatedAt: true,
        category: { select: { name: true } },
        author: { select: { id: true, profile: { select: { handle: true, displayName: true } } } },
      },
    }),
    db.blogArticle.count({ where }),
  ]);
  return { rows, total, page, pages: Math.max(1, Math.ceil(total / PER_PAGE)) };
}

/* ───────────────────────────── Detail: gemeinsamer Kontext ───────────────────────────── */

const authorSelect = { id: true, status: true, profile: { select: { handle: true, displayName: true, avatarUrl: true } } } as const;

/** Kommentare, Meldungen, Fälle und Audit-Verlauf eines Inhalts (inkl. seiner Kommentare/Schritte). */
async function targetContext(type: TargetType, id: string, extraTargets: { type: TargetType; ids: string[] }[] = []) {
  const [comments, commentStates, commentIds] = await Promise.all([
    db.comment.findMany({
      where: { targetType: type, targetId: id },
      orderBy: { createdAt: "desc" },
      take: 30,
      select: { id: true, body: true, state: true, parentId: true, isQuestion: true, isAnswer: true, likeCount: true, createdAt: true, editedAt: true, author: { select: authorSelect } },
    }),
    db.comment.groupBy({ by: ["state"], where: { targetType: type, targetId: id }, _count: { _all: true } }),
    db.comment.findMany({ where: { targetType: type, targetId: id }, select: { id: true }, take: 1000 }),
  ]);
  const cIds = commentIds.map((c) => c.id);
  const related: Prisma.ModerationCaseWhereInput[] = [{ targetType: type, targetId: id }];
  if (cIds.length) related.push({ targetType: "COMMENT", targetId: { in: cIds } });
  for (const t of extraTargets) if (t.ids.length) related.push({ targetType: t.type, targetId: { in: t.ids } });

  const [cases, reports] = await Promise.all([
    db.moderationCase.findMany({
      where: { OR: related },
      orderBy: { createdAt: "desc" },
      take: 30,
      select: {
        id: true,
        number: true,
        targetType: true,
        targetId: true,
        status: true,
        riskScore: true,
        primaryReason: true,
        reportCount: true,
        createdAt: true,
        actions: { orderBy: { createdAt: "desc" }, take: 1, select: { action: true } },
      },
    }),
    db.report.findMany({
      where: { targetType: type, targetId: id },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: { id: true, reason: true, details: true, createdAt: true, reporter: { select: { id: true, profile: { select: { handle: true } } } }, case: { select: { id: true, number: true } } },
    }),
  ]);
  const reportCount = await db.report.count({ where: { targetType: type, targetId: id } });

  const auditWhere: Prisma.AuditEventWhereInput[] = [{ targetType: type, targetId: id }];
  if (cIds.length) auditWhere.push({ targetType: "COMMENT", targetId: { in: cIds } });
  if (cases.length) auditWhere.push({ targetType: "MODERATION_CASE", targetId: { in: cases.map((c) => c.id) } });
  const recentAudit = await db.auditEvent.findMany({
    where: { OR: auditWhere },
    orderBy: { seq: "desc" },
    take: 25,
    select: { seq: true, action: true, targetType: true, meta: true, createdAt: true, actor: { select: { id: true, profile: { select: { handle: true } } } } },
  });

  const byState = Object.fromEntries(commentStates.map((s) => [s.state, s._count._all])) as Partial<Record<ContentState, number>>;
  return {
    comments,
    commentStats: { total: cIds.length, published: byState.PUBLISHED ?? 0, hidden: byState.HIDDEN ?? 0, removed: byState.REMOVED ?? 0 },
    cases,
    reports,
    reportCount,
    recentAudit: recentAudit.map((a) => ({ ...a, reason: typeof (a.meta as { reason?: unknown })?.reason === "string" ? ((a.meta as { reason: string }).reason as string) : null })),
  };
}
export type TargetContext = Awaited<ReturnType<typeof targetContext>>;

export async function getProjectDetail(actor: Actor, id: string) {
  mod(actor);
  const p = await db.project.findUnique({
    where: { id },
    select: {
      id: true,
      slug: true,
      title: true,
      description: true,
      category: true,
      subcategories: true,
      tags: true,
      coverUrl: true,
      difficulty: true,
      estimatedMinutes: true,
      actualMinutes: true,
      budgetMinor: true,
      currency: true,
      status: true,
      visibility: true,
      state: true,
      remixNote: true,
      viewCount: true,
      likeCount: true,
      saveCount: true,
      remixCount: true,
      commentCount: true,
      qualityScore: true,
      isFeatured: true,
      publishedAt: true,
      completedAt: true,
      createdAt: true,
      updatedAt: true,
      owner: { select: authorSelect },
      updates: { orderBy: { happenedAt: "desc" }, take: 3, select: { id: true, body: true, milestone: true, happenedAt: true } },
      outgoing: { take: 3, select: { kind: true, to: { select: { id: true, title: true } } } },
      _count: { select: { media: true, updates: true, materials: true, tools: true, contributors: true, followers: true, tutorials: true, posts: true, products: true, communityProjects: true } },
    },
  });
  if (!p) throw fail.notFound();
  return { project: p, ctx: await targetContext("PROJECT", id) };
}

export async function getTutorialDetail(actor: Actor, id: string) {
  mod(actor);
  const t = await db.tutorial.findUnique({
    where: { id },
    select: {
      id: true,
      slug: true,
      title: true,
      summary: true,
      category: true,
      difficulty: true,
      minutes: true,
      coverUrl: true,
      language: true,
      isPaid: true,
      priceMinor: true,
      state: true,
      safetyKinds: true,
      viewCount: true,
      saveCount: true,
      completionCount: true,
      likeCount: true,
      qualityScore: true,
      isFeatured: true,
      publishedAt: true,
      createdAt: true,
      updatedAt: true,
      currentVersionId: true,
      author: { select: authorSelect },
      project: { select: { id: true, title: true } },
      currentVersion: { select: { id: true, version: true, publishedAt: true, steps: { orderBy: { position: "asc" }, select: { id: true, position: true, title: true, minutes: true, safety: true, safetyKinds: true } } } },
      versions: { orderBy: { version: "desc" }, take: 12, select: { id: true, version: true, changeNote: true, isMajor: true, publishedAt: true, _count: { select: { steps: true } } } },
      _count: { select: { versions: true, media: true, assets: true, progress: true, posts: true, products: true } },
    },
  });
  if (!t) throw fail.notFound();
  const stepIds = t.currentVersion?.steps.map((s) => s.id) ?? [];
  return { tutorial: t, ctx: await targetContext("TUTORIAL", id, [{ type: "TUTORIAL_STEP", ids: stepIds }]) };
}

export async function getPostDetail(actor: Actor, id: string) {
  mod(actor);
  const p = await db.post.findUnique({
    where: { id },
    select: {
      id: true,
      kind: true,
      body: true,
      category: true,
      visibility: true,
      state: true,
      isCommercial: true,
      isPinned: true,
      isAnnouncement: true,
      reachLimited: true,
      qualityScore: true,
      likeCount: true,
      commentCount: true,
      saveCount: true,
      repostCount: true,
      editedAt: true,
      publishedAt: true,
      createdAt: true,
      updatedAt: true,
      author: { select: authorSelect },
      community: { select: { id: true, name: true, slug: true } },
      project: { select: { id: true, title: true } },
      tutorial: { select: { id: true, title: true } },
      article: { select: { id: true, title: true } },
      product: { select: { id: true, title: true } },
      repostOf: { select: { id: true, body: true } },
      media: { orderBy: { position: "asc" }, select: { alt: true, media: { select: { kind: true, variants: true } } } },
    },
  });
  if (!p) throw fail.notFound();
  return { post: p, ctx: await targetContext("POST", id) };
}

export async function getArticleDetail(actor: Actor, id: string) {
  mod(actor);
  const a = await db.blogArticle.findUnique({
    where: { id },
    select: {
      id: true,
      slug: true,
      title: true,
      dek: true,
      coverUrl: true,
      plainText: true,
      readingMinutes: true,
      categoryId: true,
      category: { select: { id: true, name: true } },
      tags: true,
      seoTitle: true,
      seoDescription: true,
      state: true,
      commentsEnabled: true,
      viewCount: true,
      likeCount: true,
      isFeatured: true,
      publishedAt: true,
      createdAt: true,
      updatedAt: true,
      author: { select: authorSelect },
      projects: { take: 6, select: { project: { select: { id: true, title: true } } } },
      _count: { select: { revisions: true, projects: true, posts: true, slugHistory: true } },
    },
  });
  if (!a) throw fail.notFound();
  const categories = await db.articleCategory.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } });
  return { article: a, categories, ctx: await targetContext("ARTICLE", id) };
}

/* ───────────────────────────── Benachrichtigung ───────────────────────────── */

async function inform(recipientId: string, message: string, publicNote = "", tx?: Tx) {
  await notify({ recipientId, type: "MODERATION", bundle: false, data: { kind: "ACCOUNT", message, publicNote, href: "/einstellungen/hilfe-support" } }, tx);
}

const postTitle = (body: string) => (body.trim().slice(0, 60) || "Beitrag") + (body.trim().length > 60 ? "…" : "");

async function syncProjectCount(tx: Tx, ownerId: string) {
  const n = await tx.project.count({ where: { ownerId, state: "PUBLISHED", visibility: "PUBLIC" } });
  await tx.userProfile.updateMany({ where: { userId: ownerId }, data: { projectCount: n } });
}

/* ───────────────────────────── Bearbeiten ───────────────────────────── */

const category = z.enum(CATEGORY_SLUGS, { message: "Bitte wähle eine Kategorie" });
const visibility = z.enum(VISIBILITY, { message: "Bitte wähle eine Sichtbarkeit" });
const editSchemas = {
  PROJECT: z.object({
    title: z.string().trim().min(3, "Titel ist zu kurz").max(120),
    summary: z.string().trim().max(10_000).default(""),
    category,
    visibility,
    reason: reasonSchema,
  }),
  TUTORIAL: z.object({
    title: z.string().trim().min(3, "Titel ist zu kurz").max(140),
    summary: z.string().trim().max(2000).default(""),
    category,
    difficulty: z.coerce.number().int().min(1).max(5),
    reason: reasonSchema,
  }),
  POST: z.object({
    category: z.union([category, z.literal("")]).transform((v) => v || null),
    visibility,
    reason: reasonSchema,
  }),
  ARTICLE: z.object({
    title: z.string().trim().min(3, "Titel ist zu kurz").max(160),
    summary: z.string().trim().max(400).default(""),
    categoryId: z.string().trim().max(64).transform((v) => v || null),
    reason: reasonSchema,
  }),
} as const;

export type EditInput = { title?: string; summary?: string; category?: string; categoryId?: string; visibility?: string; difficulty?: string | number; reason: string };

type Change = { field: string; from: unknown; to: unknown };
function diff(before: Record<string, unknown>, after: Record<string, unknown>, longText: string[] = []): Change[] {
  return Object.keys(after)
    .filter((k) => after[k] !== before[k])
    // Längere Texte nicht ins Protokoll kopieren – nur die Tatsache der Änderung
    .map((k) => (longText.includes(k) ? { field: k, from: null, to: null } : { field: k, from: before[k] ?? null, to: after[k] ?? null }));
}

/** Metadaten korrigieren (Titel, Kurztext, Kategorie, Sichtbarkeit, Niveau). Slugs bleiben stabil. */
export async function updateContentMeta(actor: Actor, kind: DetailKind, id: string, input: unknown) {
  mod(actor);
  const k = kindSchema.parse(kind);
  const res = await db.$transaction(async (tx) => {
    let ownerId: string;
    let title: string;
    let changes: Change[];
    let reason: string;
    if (k === "PROJECT") {
      const d = editSchemas.PROJECT.parse(input);
      reason = d.reason;
      const p = await tx.project.findUnique({ where: { id }, select: { title: true, description: true, category: true, visibility: true, ownerId: true, state: true } });
      if (!p) throw fail.notFound();
      if (p.state === "REMOVED") throw fail.conflict("Entfernte Inhalte können nicht bearbeitet werden.");
      changes = diff({ title: p.title, description: p.description, category: p.category, visibility: p.visibility }, { title: d.title, description: d.summary, category: d.category, visibility: d.visibility }, ["description"]);
      if (changes.length) {
        await tx.project.update({ where: { id }, data: { title: d.title, description: d.summary, category: d.category, visibility: d.visibility, ...(d.visibility !== "PUBLIC" ? { isFeatured: false } : {}) } });
        if (d.visibility !== p.visibility) await syncProjectCount(tx, p.ownerId);
      }
      ownerId = p.ownerId;
      title = d.title;
    } else if (k === "TUTORIAL") {
      const d = editSchemas.TUTORIAL.parse(input);
      reason = d.reason;
      const t = await tx.tutorial.findUnique({ where: { id }, select: { title: true, summary: true, category: true, difficulty: true, authorId: true, state: true } });
      if (!t) throw fail.notFound();
      if (t.state === "REMOVED") throw fail.conflict("Entfernte Inhalte können nicht bearbeitet werden.");
      changes = diff({ title: t.title, summary: t.summary, category: t.category, difficulty: t.difficulty }, { title: d.title, summary: d.summary, category: d.category, difficulty: d.difficulty }, ["summary"]);
      if (changes.length) await tx.tutorial.update({ where: { id }, data: { title: d.title, summary: d.summary, category: d.category, difficulty: d.difficulty } });
      ownerId = t.authorId;
      title = d.title;
    } else if (k === "POST") {
      const d = editSchemas.POST.parse(input);
      reason = d.reason;
      const p = await tx.post.findUnique({ where: { id }, select: { category: true, visibility: true, authorId: true, state: true, body: true } });
      if (!p) throw fail.notFound();
      if (p.state === "REMOVED") throw fail.conflict("Entfernte Inhalte können nicht bearbeitet werden.");
      changes = diff({ category: p.category, visibility: p.visibility }, { category: d.category, visibility: d.visibility });
      if (changes.length) await tx.post.update({ where: { id }, data: { category: d.category, visibility: d.visibility } });
      ownerId = p.authorId;
      title = postTitle(p.body);
    } else {
      const d = editSchemas.ARTICLE.parse(input);
      reason = d.reason;
      const a = await tx.blogArticle.findUnique({ where: { id }, select: { title: true, dek: true, categoryId: true, authorId: true } });
      if (!a) throw fail.notFound();
      if (d.categoryId && !(await tx.articleCategory.findUnique({ where: { id: d.categoryId }, select: { id: true } }))) throw fail.invalid("Unbekannte Kategorie.", { categoryId: "Unbekannte Kategorie" });
      changes = diff({ title: a.title, dek: a.dek, categoryId: a.categoryId }, { title: d.title, dek: d.summary, categoryId: d.categoryId }, ["dek"]);
      if (changes.length) await tx.blogArticle.update({ where: { id }, data: { title: d.title, dek: d.summary, categoryId: d.categoryId } });
      ownerId = a.authorId;
      title = d.title;
    }
    if (!changes.length) return { changed: false as const, ownerId, title };
    await audit({ actorId: actor.id, action: "admin.content_edited", targetType: k, targetId: id, meta: { reason, changes } }, tx);
    return { changed: true as const, ownerId, title };
  });
  if (res.changed && res.ownerId !== actor.id) await inform(res.ownerId, `Die Moderation hat Angaben zu deinem Inhalt „${res.title}“ angepasst.`);
  return { changed: res.changed };
}

/* ───────────────────────────── Hervorheben & Ausblenden ───────────────────────────── */

export async function setDetailFeatured(actor: Actor, kind: DetailKind, id: string, featured: boolean) {
  mod(actor);
  const k = kindSchema.parse(kind);
  if (k === "PROJECT" || k === "TUTORIAL") return setFeatured(actor, k, id, featured);
  if (k === "POST") throw fail.invalid("Beiträge können nicht hervorgehoben werden.");
  await db.$transaction(async (tx) => {
    const a = await tx.blogArticle.findUnique({ where: { id }, select: { state: true } });
    if (!a) throw fail.notFound();
    if (featured && a.state !== "PUBLISHED") throw fail.conflict("Nur veröffentlichte Artikel können hervorgehoben werden.");
    await tx.blogArticle.update({ where: { id }, data: { isFeatured: featured } });
    await audit({ actorId: actor.id, action: featured ? "admin.content_featured" : "admin.content_unfeatured", targetType: "ARTICLE", targetId: id }, tx);
  });
}

/** Ausblenden bzw. wieder anzeigen. Projekte/Anleitungen über `content.ts`, Beiträge/Artikel hier. */
export async function setDetailHidden(actor: Actor, kind: DetailKind, id: string, hidden: boolean, reason: string) {
  mod(actor);
  const k = kindSchema.parse(kind);
  if (k === "PROJECT" || k === "TUTORIAL") {
    await setContentHidden(actor, k, id, hidden, reason);
    if (k === "PROJECT") {
      const p = await db.project.findUnique({ where: { id }, select: { ownerId: true } });
      if (p) await db.$transaction((tx) => syncProjectCount(tx, p.ownerId));
    }
    return;
  }
  const r = reasonSchema.parse(reason);
  const owner = await db.$transaction(async (tx) => {
    let ownerId: string;
    let title: string;
    let from: string;
    if (k === "POST") {
      const p = await tx.post.findUnique({ where: { id }, select: { state: true, authorId: true, body: true } });
      if (!p) throw fail.notFound();
      if (p.state === "REMOVED" || (hidden && p.state === "HIDDEN") || (!hidden && p.state !== "HIDDEN")) throw fail.conflict("Dieser Zustand lässt sich hier nicht ändern.");
      await tx.post.update({ where: { id }, data: { state: hidden ? "HIDDEN" : "PUBLISHED" } });
      ownerId = p.authorId;
      title = postTitle(p.body);
      from = p.state;
    } else {
      const a = await tx.blogArticle.findUnique({ where: { id }, select: { state: true, authorId: true, title: true, publishedAt: true } });
      if (!a) throw fail.notFound();
      if ((hidden && a.state === "HIDDEN") || (!hidden && a.state !== "HIDDEN")) throw fail.conflict("Dieser Zustand lässt sich hier nicht ändern.");
      // Artikel kennen kein REMOVED; beim Wiederanzeigen zurück zu veröffentlicht bzw. Entwurf
      const next = hidden ? "HIDDEN" : a.publishedAt && a.publishedAt <= new Date() ? "PUBLISHED" : "DRAFT";
      await tx.blogArticle.update({ where: { id }, data: { state: next, ...(hidden ? { isFeatured: false } : {}) } });
      ownerId = a.authorId;
      title = a.title;
      from = a.state;
    }
    await audit({ actorId: actor.id, action: hidden ? "admin.content_hidden" : "admin.content_restored", targetType: k, targetId: id, meta: { reason: r, from } }, tx);
    return { ownerId, title };
  });
  await inform(owner.ownerId, hidden ? `Dein Inhalt „${owner.title}“ wurde vorübergehend ausgeblendet.` : `Dein Inhalt „${owner.title}“ ist wieder sichtbar.`, hidden ? r : "");
}

/* ───────────────────────────── Entfernen & Wiederherstellen (Admin) ───────────────────────────── */

const removeSchema = z.object({ reason: reasonSchema, publicNote: z.string().trim().min(10, "Bitte formuliere eine Nachricht an die Person (mind. 10 Zeichen)").max(1000) });

/** Endgültig entfernen (state REMOVED). Bleibt für Einsprüche und Audit erhalten. */
export async function removeContent(actor: Actor, kind: DetailKind, id: string, input: unknown) {
  admin(actor, "Entfernen");
  const k = kindSchema.parse(kind);
  const d = removeSchema.parse(input);
  if (k === "ARTICLE") throw fail.invalid("Artikel kennen keinen Zustand „entfernt“ – bitte ausblenden.");
  const owner = await db.$transaction(async (tx) => {
    let ownerId: string;
    let title: string;
    let from: string;
    if (k === "PROJECT") {
      const p = await tx.project.findUnique({ where: { id }, select: { state: true, ownerId: true, title: true } });
      if (!p) throw fail.notFound();
      if (p.state === "REMOVED") throw fail.conflict("Bereits entfernt.");
      await tx.project.update({ where: { id }, data: { state: "REMOVED", isFeatured: false } });
      await syncProjectCount(tx, p.ownerId);
      ({ ownerId, title, from } = { ownerId: p.ownerId, title: p.title, from: p.state });
    } else if (k === "TUTORIAL") {
      const t = await tx.tutorial.findUnique({ where: { id }, select: { state: true, authorId: true, title: true } });
      if (!t) throw fail.notFound();
      if (t.state === "REMOVED") throw fail.conflict("Bereits entfernt.");
      await tx.tutorial.update({ where: { id }, data: { state: "REMOVED", isFeatured: false } });
      ({ ownerId, title, from } = { ownerId: t.authorId, title: t.title, from: t.state });
    } else {
      const p = await tx.post.findUnique({ where: { id }, select: { state: true, authorId: true, body: true } });
      if (!p) throw fail.notFound();
      if (p.state === "REMOVED") throw fail.conflict("Bereits entfernt.");
      await tx.post.update({ where: { id }, data: { state: "REMOVED" } });
      await tx.userProfile.updateMany({ where: { userId: p.authorId, postCount: { gt: 0 } }, data: { postCount: { decrement: 1 } } });
      ({ ownerId, title, from } = { ownerId: p.authorId, title: postTitle(p.body), from: p.state });
    }
    await audit({ actorId: actor.id, action: "admin.content_removed", targetType: k, targetId: id, meta: { reason: d.reason, from } }, tx);
    return { ownerId, title };
  });
  await inform(owner.ownerId, `Dein Inhalt „${owner.title}“ wurde entfernt.`, d.publicNote);
}

/** Entfernten Inhalt wiederherstellen: veröffentlicht, falls er es schon einmal war, sonst Entwurf. */
export async function restoreContent(actor: Actor, kind: DetailKind, id: string, reason: string) {
  admin(actor, "Wiederherstellen");
  const k = kindSchema.parse(kind);
  const r = reasonSchema.parse(reason);
  if (k === "ARTICLE") throw fail.invalid("Artikel werden über „Wieder anzeigen“ wiederhergestellt.");
  const owner = await db.$transaction(async (tx) => {
    let ownerId: string;
    let title: string;
    let to: ContentState;
    if (k === "PROJECT") {
      const p = await tx.project.findUnique({ where: { id }, select: { state: true, ownerId: true, title: true, publishedAt: true } });
      if (!p) throw fail.notFound();
      if (p.state !== "REMOVED") throw fail.conflict("Der Inhalt ist nicht entfernt.");
      to = p.publishedAt ? "PUBLISHED" : "DRAFT";
      await tx.project.update({ where: { id }, data: { state: to } });
      await syncProjectCount(tx, p.ownerId);
      ({ ownerId, title } = { ownerId: p.ownerId, title: p.title });
    } else if (k === "TUTORIAL") {
      const t = await tx.tutorial.findUnique({ where: { id }, select: { state: true, authorId: true, title: true, currentVersionId: true } });
      if (!t) throw fail.notFound();
      if (t.state !== "REMOVED") throw fail.conflict("Der Inhalt ist nicht entfernt.");
      to = t.currentVersionId ? "PUBLISHED" : "DRAFT";
      await tx.tutorial.update({ where: { id }, data: { state: to } });
      ({ ownerId, title } = { ownerId: t.authorId, title: t.title });
    } else {
      const p = await tx.post.findUnique({ where: { id }, select: { state: true, authorId: true, body: true } });
      if (!p) throw fail.notFound();
      if (p.state !== "REMOVED") throw fail.conflict("Der Inhalt ist nicht entfernt.");
      to = "PUBLISHED";
      await tx.post.update({ where: { id }, data: { state: to } });
      await tx.userProfile.updateMany({ where: { userId: p.authorId }, data: { postCount: { increment: 1 } } });
      ({ ownerId, title } = { ownerId: p.authorId, title: postTitle(p.body) });
    }
    await audit({ actorId: actor.id, action: "admin.content_reinstated", targetType: k, targetId: id, meta: { reason: r, to } }, tx);
    return { ownerId, title, to };
  });
  await inform(owner.ownerId, owner.to === "PUBLISHED" ? `Dein Inhalt „${owner.title}“ wurde wiederhergestellt und ist wieder sichtbar.` : `Dein Inhalt „${owner.title}“ wurde als Entwurf wiederhergestellt.`);
}

/* ───────────────────────────── Kommentare ───────────────────────────── */

/** Kommentarfunktion eines Artikels sperren/freigeben (nur Artikel haben `commentsEnabled`). */
export async function setCommentsLocked(actor: Actor, articleId: string, locked: boolean, reason: string) {
  mod(actor);
  const r = reasonSchema.parse(reason);
  await db.$transaction(async (tx) => {
    const a = await tx.blogArticle.findUnique({ where: { id: articleId }, select: { commentsEnabled: true } });
    if (!a) throw fail.notFound();
    if (a.commentsEnabled === !locked) throw fail.conflict(locked ? "Kommentare sind bereits gesperrt." : "Kommentare sind bereits offen.");
    await tx.blogArticle.update({ where: { id: articleId }, data: { commentsEnabled: !locked } });
    await audit({ actorId: actor.id, action: locked ? "admin.comments_locked" : "admin.comments_unlocked", targetType: "ARTICLE", targetId: articleId, meta: { reason: r } }, tx);
  });
}

export type CommentDecision = "HIDE" | "REMOVE" | "RESTORE";

/**
 * Einzelnen Kommentar ausblenden, entfernen oder wiederherstellen. Zähler werden nur
 * beim Wechsel von/zu „veröffentlicht“ angepasst. Wiederherstellen entfernter
 * Kommentare ist der Administration vorbehalten.
 */
export async function moderateComment(actor: Actor, commentId: string, decision: CommentDecision, reason: string) {
  mod(actor);
  const dec = z.enum(["HIDE", "REMOVE", "RESTORE"]).parse(decision);
  const r = reasonSchema.parse(reason);
  const res = await db.$transaction(async (tx) => {
    const c = await tx.comment.findUnique({ where: { id: commentId }, select: { state: true, authorId: true, targetType: true, targetId: true, body: true } });
    if (!c) throw fail.notFound();
    const to: ContentState = dec === "HIDE" ? "HIDDEN" : dec === "REMOVE" ? "REMOVED" : "PUBLISHED";
    if (c.state === to) throw fail.conflict("Der Kommentar hat diesen Zustand bereits.");
    if (dec === "HIDE" && c.state !== "PUBLISHED") throw fail.conflict("Nur sichtbare Kommentare können ausgeblendet werden.");
    if (dec === "RESTORE" && c.state === "REMOVED" && !hasRole(actor, "ADMIN")) throw fail.forbidden("Entfernte Kommentare stellt nur die Administration wieder her.");
    await tx.comment.update({ where: { id: commentId }, data: { state: to } });
    if (c.state === "PUBLISHED" && to !== "PUBLISHED") await bumpCounter(tx, c.targetType, c.targetId, "comment", -1);
    if (c.state !== "PUBLISHED" && to === "PUBLISHED") await bumpCounter(tx, c.targetType, c.targetId, "comment", 1);
    await audit(
      {
        actorId: actor.id,
        action: dec === "HIDE" ? "admin.comment_hidden" : dec === "REMOVE" ? "admin.comment_removed" : "admin.comment_restored",
        targetType: "COMMENT",
        targetId: commentId,
        meta: { reason: r, from: c.state, parentType: c.targetType, parentId: c.targetId },
      },
      tx,
    );
    return c;
  });
  const excerpt = res.body.trim().slice(0, 50) + (res.body.trim().length > 50 ? "…" : "");
  const message =
    dec === "HIDE" ? `Dein Kommentar „${excerpt}“ wurde ausgeblendet.` : dec === "REMOVE" ? `Dein Kommentar „${excerpt}“ wurde entfernt.` : `Dein Kommentar „${excerpt}“ ist wieder sichtbar.`;
  await inform(res.authorId, message, dec === "RESTORE" ? "" : r);
  return { targetType: res.targetType, targetId: res.targetId };
}
