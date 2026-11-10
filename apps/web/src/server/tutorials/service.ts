import "server-only";
import { track } from "@/server/analytics/service";
import { cache } from "react";
import { tutorialSaveSchema, SAFETY_KINDS, type SafetyKind } from "@werkraum/shared";
import { db, type Prisma, type Tx } from "@/server/db";
import { fail } from "@/server/errors";
import { emit } from "@/server/events";
import { limit } from "@/server/ratelimit";
import { audit } from "@/server/audit";
import { relationsFor, canViewContent } from "@/server/visibility";
import { hasRole } from "@/server/authz";
import type { SessionUser } from "@/server/auth/session";
import { requireAdult } from "@/server/auth/adult";
import { attachMedia, mediaCoverUrl, patchFrozenMediaRefsLater, releaseMedia } from "@/server/media/service";
import { createPost } from "@/server/social/posts";
import { listCommentPage } from "@/server/social/interactions";
import { slugify } from "@/lib/utils";
import { slugSuffix, withSlugRetry } from "@/lib/unique-retry";
import { assertCategoryAllowed } from "@/server/categories/settings";
import { publicProductWhere } from "@/server/commerce/restock";

/**
 * Anleitungen (PRD §11).
 *
 * Versionierung: Jede Veröffentlichung friert eine neue TutorialVersion (n+1) mit eigenen
 * TutorialStep-Zeilen ein. Die Arbeitskopie lebt als Version 0 („Entwurf“) und wird bei jedem
 * Speichern ersetzt – sie ist nie öffentlich. Schritte tragen einen `stableKey`, der beim
 * Bearbeiten gleich bleibt, damit TutorialProgress.completedKeys neue Versionen überlebt.
 * Metadaten (Titel, Kategorie, Cover …) gelten sofort; Schritte & Materialien erst mit der
 * nächsten veröffentlichten Version.
 */

export const DRAFT_VERSION = 0;

type Variants = Record<string, string>;
export type StepMedia = { mediaId: string; url: string | null; alt: string };
export type MaterialLine = { name: string; quantity: string; note: string; materialId?: string };

const KEY_RE = /^[A-Za-z0-9_-]{1,64}$/;

/** `attempt` > 0: Wiederholung nach Slug-Kollision (gleichzeitige Anlage) → Zufallssuffix. */
async function uniqueTutorialSlug(client: Tx | typeof db, title: string, excludeId?: string, attempt = 0) {
  const root = slugify(title, 70);
  if (attempt > 0) return `${root}-${slugSuffix()}`;
  const rows = await client.tutorial.findMany({ where: { slug: { startsWith: root }, ...(excludeId ? { id: { not: excludeId } } : {}) }, select: { slug: true } });
  const taken = new Set(rows.map((r) => r.slug));
  if (!taken.has(root)) return root;
  for (let i = 2; i < 500; i++) if (!taken.has(`${root}-${i}`)) return `${root}-${i}`;
  return `${root}-${Date.now().toString(36)}`;
}

async function mediaUrls(ids: string[]) {
  if (!ids.length) return new Map<string, string | null>();
  const rows = await db.media.findMany({ where: { id: { in: ids } }, select: { id: true, variants: true } });
  return new Map(rows.map((r) => {
    const v = (r.variants ?? {}) as Variants;
    return [r.id, v.lg ?? v.md ?? v.sm ?? null] as const;
  }));
}

function asLines(json: unknown): MaterialLine[] {
  if (!Array.isArray(json)) return [];
  return json
    .filter((x): x is Record<string, unknown> => !!x && typeof x === "object" && typeof (x as { name?: unknown }).name === "string")
    .map((x) => ({ name: String(x.name), quantity: typeof x.quantity === "string" ? x.quantity : "", note: typeof x.note === "string" ? x.note : "", materialId: typeof x.materialId === "string" ? x.materialId : undefined }));
}

/**
 * Inhalt einer Version ohne zufällige Schlüssel – erkennt einen Doppelklick auf „Veröffentlichen“
 * (gleicher Inhalt kurz hintereinander), damit keine doppelte Version entsteht.
 */
export function versionFingerprint(v: {
  changeNote: string;
  isMajor: boolean;
  materials: unknown;
  tools: unknown;
  steps: { position: number; title: string; body: string; minutes: number | null; tip: string | null; safety: string | null; safetyKinds: string[]; media: unknown; materials: string[]; tools: string[] }[];
}) {
  const steps = [...v.steps]
    .sort((a, b) => a.position - b.position)
    .map((st) => [st.title, st.body, st.minutes ?? null, st.tip || null, st.safety || null, st.safetyKinds, asStepMedia(st.media).map((m) => [m.mediaId, m.alt]), st.materials, st.tools]);
  return JSON.stringify([v.changeNote, v.isMajor, asLines(v.materials), asLines(v.tools), steps]);
}

/** Zeitfenster, in dem identische Veröffentlichungen als Doppelklick gelten. */
const DUPLICATE_PUBLISH_MS = 2 * 60_000;

function asStepMedia(json: unknown): StepMedia[] {
  if (!Array.isArray(json)) return [];
  return json
    .filter((x): x is Record<string, unknown> => !!x && typeof x === "object")
    .map((x) => ({ mediaId: String(x.mediaId ?? ""), url: typeof x.url === "string" ? x.url : null, alt: typeof x.alt === "string" ? x.alt : "" }))
    .filter((m) => m.mediaId);
}

// ───────────────────────── Speichern & Veröffentlichen ─────────────────────────

export async function saveTutorial(user: SessionUser, tutorialId: string | null, input: unknown, opts: { publish: boolean }) {
  const data = tutorialSaveSchema.parse(input);
  await assertCategoryAllowed(data.category, tutorialId ? (await db.tutorial.findUnique({ where: { id: tutorialId }, select: { category: true } }))?.category : null);
  await requireAdult(user);
  if (!tutorialId || opts.publish) await limit("post", user.id);

  const existing = tutorialId
    ? await db.tutorial.findUnique({ where: { id: tutorialId }, select: { id: true, authorId: true, state: true, slug: true, title: true, publishedAt: true, currentVersionId: true } })
    : null;
  if (tutorialId && (!existing || existing.state === "REMOVED")) throw fail.notFound();
  if (existing && existing.authorId !== user.id) throw fail.forbidden();
  if (existing?.state === "HIDDEN" && opts.publish) throw fail.forbidden("Diese Anleitung wurde von der Moderation ausgeblendet.");

  if (data.projectId) {
    const pr = await db.project.findUnique({ where: { id: data.projectId }, select: { ownerId: true } });
    if (!pr || pr.ownerId !== user.id) throw fail.forbidden("Du kannst nur eigene Projekte verknüpfen.");
  }

  // Stabile Schlüssel: vorhandene behalten, neue/duplizierte neu vergeben
  const used = new Set<string>();
  const steps = data.steps.map((s, i) => {
    let key = s.stableKey && KEY_RE.test(s.stableKey) && !used.has(s.stableKey) ? s.stableKey : crypto.randomUUID();
    if (used.has(key)) key = crypto.randomUUID();
    used.add(key);
    return { ...s, stableKey: key, position: i };
  });
  const stepMediaIds = steps.flatMap((s) => s.media.map((m) => m.id));
  const [coverUrl, urls] = await Promise.all([mediaCoverUrl(data.coverMediaId), mediaUrls(stepMediaIds)]);
  const safetyKinds = SAFETY_KINDS.filter((k) => steps.some((s) => s.safetyKinds.includes(k)));
  const materials: MaterialLine[] = data.materials.map((m) => ({ name: m.name, quantity: m.quantity, note: m.note, ...(m.materialId ? { materialId: m.materialId } : {}) }));
  const tools: MaterialLine[] = data.tools.map((t) => ({ name: t.name, quantity: t.quantity, note: t.note }));
  const neverPublished = !existing?.currentVersionId;

  const stepRows = (versionId: string) =>
    steps.map((s) => ({
      versionId,
      stableKey: s.stableKey,
      position: s.position,
      title: s.title,
      body: s.body,
      minutes: s.minutes ?? null,
      tip: s.tip || null,
      safety: s.safety || null,
      safetyKinds: s.safetyKinds,
      media: s.media.map((m) => ({ mediaId: m.id, url: urls.get(m.id) ?? null, alt: m.alt })),
      materials: s.materials.filter(Boolean),
      tools: s.tools.filter(Boolean),
    }));

  const notifyReaders = data.isMajor && !!data.notifyReaders;
  const result = await withSlugRetry((attempt) => db.$transaction(async (tx) => {
    await attachMedia(tx, user.id, [...new Set([...stepMediaIds, ...(data.coverMediaId ? [data.coverMediaId] : [])])]);
    const meta = {
      title: data.title,
      summary: data.summary,
      category: data.category,
      difficulty: data.difficulty,
      minutes: data.minutes ?? (steps.reduce((a, s) => a + (s.minutes ?? 0), 0) || null),
      language: data.language,
      projectId: data.projectId ?? null,
      coverUrl,
    };
    let t: { id: string; slug: string };
    if (!existing) {
      t = await tx.tutorial.create({
        data: { ...meta, authorId: user.id, slug: await uniqueTutorialSlug(tx, data.title, undefined, attempt), state: "DRAFT", safetyKinds, isPaid: false, priceMinor: null },
        select: { id: true, slug: true },
      });
    } else {
      const slug = neverPublished && existing.title !== data.title ? await uniqueTutorialSlug(tx, data.title, existing.id, attempt) : existing.slug;
      t = await tx.tutorial.update({ where: { id: existing.id }, data: { ...meta, slug, ...(neverPublished ? { safetyKinds } : {}) }, select: { id: true, slug: true } });
    }

    // Cover als TutorialMedia (Position 0), damit der Editor es wiederherstellen kann
    await tx.tutorialMedia.deleteMany({ where: { tutorialId: t.id } });
    if (data.coverMediaId) await tx.tutorialMedia.create({ data: { tutorialId: t.id, mediaId: data.coverMediaId, position: 0 } });

    // Arbeitskopie (Version 0) ersetzen
    const draft = await tx.tutorialVersion.upsert({
      where: { tutorialId_version: { tutorialId: t.id, version: DRAFT_VERSION } },
      create: { tutorialId: t.id, version: DRAFT_VERSION, materials, tools, changeNote: data.changeNote ?? "" },
      update: { materials, tools, changeNote: data.changeNote ?? "", publishedAt: new Date() },
      select: { id: true },
    });
    await tx.tutorialStep.deleteMany({ where: { versionId: draft.id } });
    await tx.tutorialStep.createMany({ data: stepRows(draft.id) });

    if (!opts.publish) return { id: t.id, slug: t.slug, version: null as number | null, duplicate: false };

    // Gleichzeitige/doppelte Veröffentlichungen derselben Anleitung nacheinander abarbeiten
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`tutorial-publish:${t.id}`}))`;
    const last = await tx.tutorialVersion.findFirst({
      where: { tutorialId: t.id, version: { gt: DRAFT_VERSION } },
      orderBy: { version: "desc" },
      select: { version: true, publishedAt: true, changeNote: true, isMajor: true, materials: true, tools: true, steps: true },
    });
    const n = (last?.version ?? 0) + 1;
    // Doppelklick (z. B. nach einem Timeout erneut geklickt): identische Version kurz zuvor → keine neue
    if (last && Date.now() - last.publishedAt.getTime() < DUPLICATE_PUBLISH_MS) {
      // So, wie `last` gespeichert worden wäre (Version 1: Standard-Notiz, nie „wesentlich“)
      const first = last.version === 1;
      const candidate = { changeNote: data.changeNote ?? (first ? "Erstveröffentlichung" : ""), isMajor: first ? false : data.isMajor, materials, tools, steps: stepRows("") };
      if (versionFingerprint(last) === versionFingerprint(candidate)) return { id: t.id, slug: t.slug, version: last.version, duplicate: true };
    }
    const v = await tx.tutorialVersion.create({
      data: { tutorialId: t.id, version: n, changeNote: data.changeNote ?? (n === 1 ? "Erstveröffentlichung" : ""), isMajor: n === 1 ? false : data.isMajor, materials, tools },
      select: { id: true },
    });
    await tx.tutorialStep.createMany({ data: stepRows(v.id) });
    await tx.tutorial.update({
      where: { id: t.id },
      data: {
        currentVersionId: v.id,
        state: "PUBLISHED",
        publishedAt: existing?.publishedAt ?? new Date(),
        safetyKinds,
        qualityScore: 0.4 + (coverUrl ? 0.15 : 0) + Math.min(0.25, steps.length / 40) + (safetyKinds.length ? 0.05 : 0) + (stepMediaIds.length ? 0.15 : 0),
      },
    });
    // Leser:innen benachrichtigen (bis zu Tausende) läuft im Worker (Outbox → Job mit notifyMany),
    // nicht in dieser Anfrage – sonst Timeout, obwohl die Version schon gespeichert ist
    await emit({ type: "TutorialPublished", tutorialId: t.id, authorId: user.id, version: n, major: data.isMajor, notifyReaders: n > 1 && notifyReaders }, tx);
    return { id: t.id, slug: t.slug, version: n, duplicate: false };
  }));

  // Medien, die beim Einfrieren noch in Verarbeitung waren, nachtragen, falls sie inzwischen fertig sind
  await patchFrozenMediaRefsLater([...stepMediaIds.filter((id) => !urls.get(id)), ...(data.coverMediaId && !coverUrl ? [data.coverMediaId] : [])]);

  const href = `/anleitungen/${result.slug}`;
  if (opts.publish && result.version && !result.duplicate) {
    if (data.shareToFeed) {
      const body =
        result.version === 1
          ? [`Neue Anleitung: ${data.title}`, data.summary].filter(Boolean).join("\n\n")
          : [`Anleitung aktualisiert – Version ${result.version}: ${data.title}`, data.changeNote].filter(Boolean).join("\n\n");
      await createPost(
        user,
        { body: body.slice(0, 5000), media: data.coverMediaId ? [{ id: data.coverMediaId, alt: data.title }] : [], category: data.category, projectId: data.projectId, visibility: "PUBLIC" },
        { tutorialId: result.id },
      );
    }
  }
  const { duplicate: _duplicate, ...out } = result;
  return { ...out, href };
}

/** Leser:innen über eine wesentliche neue Version informieren (Worker, aus dem Ereignis TutorialPublished). */
export async function notifyTutorialReaders(tutorialId: string, authorId: string, version: number) {
  const { notifyMany } = await import("@/server/notifications");
  const t = await db.tutorial.findUnique({ where: { id: tutorialId }, select: { title: true, slug: true, state: true, versions: { where: { version }, select: { changeNote: true } } } });
  if (!t || t.state !== "PUBLISHED") return { notified: 0 };
  const href = `/anleitungen/${t.slug}`;
  const data = { title: t.title, href, version, changeNote: t.versions[0]?.changeNote ?? "" };
  let cursor: string | undefined;
  let n = 0;
  for (;;) {
    const readers = await db.tutorialProgress.findMany({
      where: { tutorialId, userId: { not: authorId } },
      orderBy: { userId: "asc" },
      take: 500,
      ...(cursor ? { cursor: { userId_tutorialId: { userId: cursor, tutorialId } }, skip: 1 } : {}),
      select: { userId: true },
    });
    if (!readers.length) break;
    await notifyMany(readers.map((r) => r.userId), { type: "TUTORIAL_UPDATED", actorId: authorId, targetType: "TUTORIAL", targetId: tutorialId, data });
    n += readers.length;
    cursor = readers[readers.length - 1]!.userId;
    if (readers.length < 500) break;
  }
  return { notified: n };
}

/** Veröffentlichte Anleitung zurückziehen (wieder Entwurf) bzw. erneut freigeben. */
export async function setTutorialPublished(user: SessionUser, tutorialId: string, published: boolean) {
  const t = await db.tutorial.findUnique({ where: { id: tutorialId }, select: { authorId: true, state: true, currentVersionId: true } });
  if (!t || t.state === "REMOVED") throw fail.notFound();
  if (t.authorId !== user.id) throw fail.forbidden();
  if (t.state === "HIDDEN") throw fail.forbidden("Diese Anleitung wurde von der Moderation ausgeblendet.");
  if (published && !t.currentVersionId) throw fail.invalid("Veröffentliche zuerst eine erste Version.");
  await db.tutorial.update({ where: { id: tutorialId }, data: { state: published ? "PUBLISHED" : "DRAFT" } });
  return { published };
}

export async function deleteTutorial(user: SessionUser, tutorialId: string) {
  const t = await db.tutorial.findUnique({ where: { id: tutorialId }, select: { authorId: true, state: true } });
  if (!t || t.state === "REMOVED") throw fail.notFound();
  if (t.authorId !== user.id) {
    if (!hasRole(user, "PLATFORM_MODERATOR")) throw fail.forbidden();
    await db.$transaction(async (tx) => {
      await tx.tutorial.update({ where: { id: tutorialId }, data: { state: "REMOVED" } });
      await audit({ actorId: user.id, action: "tutorial.remove", targetType: "TUTORIAL", targetId: tutorialId }, tx);
    });
    return;
  }
  // Ausgeblendete Anleitungen bleiben als Nachweis für Einspruch und Fallakte erhalten
  if (t.state === "HIDDEN") throw fail.forbidden("Diese Anleitung wurde von der Moderation ausgeblendet und kann nicht gelöscht werden.");
  // Medien (Cover + Schritte aller Versionen) merken, um sie nach dem Löschen freizugeben
  const [cover, steps] = await Promise.all([
    db.tutorialMedia.findMany({ where: { tutorialId }, select: { mediaId: true } }),
    db.tutorialStep.findMany({ where: { version: { tutorialId } }, select: { media: true } }),
  ]);
  const mediaIds = [...cover.map((c) => c.mediaId), ...steps.flatMap((st) => asStepMedia(st.media).map((m) => m.mediaId))];
  await db.$transaction(async (tx) => {
    await tx.bookmark.deleteMany({ where: { targetType: "TUTORIAL", targetId: tutorialId } });
    await tx.reaction.deleteMany({ where: { targetType: "TUTORIAL", targetId: tutorialId } });
    await tx.comment.deleteMany({ where: { targetType: "TUTORIAL", targetId: tutorialId } });
    await tx.tutorial.update({ where: { id: tutorialId }, data: { currentVersionId: null } });
    await tx.tutorial.delete({ where: { id: tutorialId } });
  });
  await releaseMedia(mediaIds);
}

// ───────────────────────── Fortschritt ─────────────────────────

async function viewableTutorial(user: SessionUser, tutorialId: string) {
  const t = await db.tutorial.findUnique({
    where: { id: tutorialId },
    select: { id: true, authorId: true, state: true, completionCount: true, currentVersion: { select: { version: true, steps: { select: { stableKey: true } } } } },
  });
  if (!t || !t.currentVersion || !(await canViewContent(user.id, { ownerId: t.authorId, visibility: "PUBLIC", state: t.state }))) throw fail.notFound();
  return { ...t, version: t.currentVersion.version, keys: new Set(t.currentVersion.steps.map((s) => s.stableKey)) };
}

export async function toggleTutorialStep(user: SessionUser, tutorialId: string, stableKey: string, done: boolean) {
  const t = await viewableTutorial(user, tutorialId);
  if (!t.keys.has(stableKey)) throw fail.invalid("Dieser Schritt existiert in der aktuellen Version nicht mehr.");
  const keys = await db.$transaction(async (tx) => {
    // Schnelle Klicks auf mehrere Schritte nacheinander verarbeiten (sonst geht einer verloren)
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`tutorial-progress:${tutorialId}:${user.id}`}))`;
    const p = await tx.tutorialProgress.findUnique({ where: { userId_tutorialId: { userId: user.id, tutorialId } }, select: { completedKeys: true } });
    const set = new Set((p?.completedKeys ?? []).filter((k) => t.keys.has(k)));
    if (done) set.add(stableKey);
    else set.delete(stableKey);
    const completedKeys = [...set];
    await tx.tutorialProgress.upsert({
      where: { userId_tutorialId: { userId: user.id, tutorialId } },
      create: { userId: user.id, tutorialId, completedKeys, versionSeen: t.version },
      update: { completedKeys },
    });
    return completedKeys;
  });
  return { completedKeys: keys, total: t.keys.size };
}

/** Als nachgebaut markieren: zählt einmal je Konto in completionCount. */
export async function completeTutorial(user: SessionUser, tutorialId: string) {
  const t = await viewableTutorial(user, tutorialId);
  await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`tutorial-progress:${tutorialId}:${user.id}`}))`;
    const p = await tx.tutorialProgress.findUnique({ where: { userId_tutorialId: { userId: user.id, tutorialId } }, select: { completedAt: true } });
    await tx.tutorialProgress.upsert({
      where: { userId_tutorialId: { userId: user.id, tutorialId } },
      create: { userId: user.id, tutorialId, completedKeys: [...t.keys], versionSeen: t.version, completedAt: new Date() },
      update: { completedKeys: [...t.keys], completedAt: p?.completedAt ?? new Date(), versionSeen: t.version },
    });
    if (!p?.completedAt && t.authorId !== user.id) {
      await tx.tutorial.update({ where: { id: tutorialId }, data: { completionCount: { increment: 1 } } });
      await track("tutorial_completed", { userId: user.id, ownerId: t.authorId, targetType: "TUTORIAL", targetId: tutorialId }, tx);
    }
  });
  return { completed: true };
}

export async function resetTutorialProgress(user: SessionUser, tutorialId: string) {
  await db.tutorialProgress.updateMany({ where: { userId: user.id, tutorialId }, data: { completedKeys: [] } });
  return { completedKeys: [] as string[] };
}

export async function markTutorialVersionSeen(user: SessionUser, tutorialId: string) {
  const t = await viewableTutorial(user, tutorialId);
  await db.tutorialProgress.updateMany({ where: { userId: user.id, tutorialId }, data: { versionSeen: t.version } });
  return { versionSeen: t.version };
}

// ───────────────────────── Karten & Listen ─────────────────────────

export const tutorialCardSelect = {
  id: true,
  slug: true,
  title: true,
  summary: true,
  category: true,
  difficulty: true,
  minutes: true,
  coverUrl: true,
  isPaid: true,
  priceMinor: true,
  safetyKinds: true,
  completionCount: true,
  saveCount: true,
  likeCount: true,
  state: true,
  publishedAt: true,
  updatedAt: true,
  author: { select: { id: true, profile: { select: { handle: true, displayName: true, avatarUrl: true } } } },
  currentVersion: { select: { version: true, publishedAt: true, _count: { select: { steps: true } } } },
  project: { select: { slug: true, title: true, visibility: true, state: true, owner: { select: { profile: { select: { handle: true } } } } } },
} satisfies Prisma.TutorialSelect;

type TutorialCardRow = Prisma.TutorialGetPayload<{ select: typeof tutorialCardSelect }>;

export type TutorialCardData = {
  id: string;
  slug: string;
  href: string;
  title: string;
  summary: string;
  category: string;
  difficulty: number;
  minutes: number | null;
  coverUrl: string | null;
  isPaid: boolean;
  priceMinor: number | null;
  safetyKinds: SafetyKind[];
  state: "PUBLISHED" | "DRAFT" | "HIDDEN" | "REMOVED";
  steps: number;
  version: number | null;
  counts: { completions: number; saves: number; likes: number };
  author: { id: string; handle: string; displayName: string; avatarUrl: string | null };
  project: { title: string; href: string } | null;
  publishedAt: string | null;
  updatedAt: string;
};

export function toTutorialCard(t: TutorialCardRow): TutorialCardData {
  const pr = t.project && t.project.state === "PUBLISHED" && t.project.visibility === "PUBLIC" ? t.project : null;
  return {
    id: t.id,
    slug: t.slug,
    href: `/anleitungen/${t.slug}`,
    title: t.title,
    summary: t.summary,
    category: t.category,
    difficulty: t.difficulty,
    minutes: t.minutes,
    coverUrl: t.coverUrl,
    isPaid: t.isPaid,
    priceMinor: t.priceMinor,
    safetyKinds: t.safetyKinds.filter((k): k is SafetyKind => (SAFETY_KINDS as readonly string[]).includes(k)),
    state: t.state,
    steps: t.currentVersion?._count.steps ?? 0,
    version: t.currentVersion?.version ?? null,
    counts: { completions: t.completionCount, saves: t.saveCount, likes: t.likeCount },
    author: { id: t.author.id, handle: t.author.profile?.handle ?? "unbekannt", displayName: t.author.profile?.displayName ?? "Unbekannt", avatarUrl: t.author.profile?.avatarUrl ?? null },
    project: pr ? { title: pr.title, href: `/u/${pr.owner.profile?.handle}/${pr.slug}` } : null,
    publishedAt: t.publishedAt?.toISOString() ?? null,
    updatedAt: t.updatedAt.toISOString(),
  };
}

export const DURATIONS = [
  { key: "kurz", label: "Bis 30 Min.", min: 0, max: 30 },
  { key: "mittel", label: "30 Min. – 2 Std.", min: 31, max: 120 },
  { key: "lang", label: "2 – 8 Std.", min: 121, max: 480 },
  { key: "projekt", label: "Mehrere Tage", min: 481, max: 1_000_000 },
] as const;
export type DurationKey = (typeof DURATIONS)[number]["key"];

export type TutorialFilters = {
  authorId?: string;
  category?: string;
  difficulty?: number;
  duration?: DurationKey;
  projectId?: string;
  q?: string;
  sort?: "new" | "popular" | "updated";
};

async function visibleTutorialsWhere(viewerId: string | null | undefined): Promise<Prisma.TutorialWhereInput> {
  const rel = await relationsFor(viewerId);
  const hidden = rel.hidden.filter((h) => h.targetType === "TUTORIAL").map((h) => h.targetId);
  return {
    state: "PUBLISHED",
    currentVersionId: { not: null },
    author: { status: { in: ["ACTIVE", "SUSPENDED"] } },
    ...(rel.blocked.length ? { authorId: { notIn: rel.blocked } } : {}),
    ...(hidden.length ? { id: { notIn: hidden } } : {}),
  };
}

const TUTORIAL_SORTS = ["new", "popular", "updated"] as const;
const optStr = (v: unknown, max = 200) => (typeof v === "string" && v.trim() ? v.slice(0, max) : undefined);

/** Filter aus Query-Strings/Server-Actions bereinigen: unbekannte Werte fallen weg (400/leer statt 500). */
export function sanitizeTutorialFilters(f: unknown): TutorialFilters {
  const x = (f && typeof f === "object" ? f : {}) as Record<string, unknown>;
  const difficulty = Number(x.difficulty);
  return {
    authorId: optStr(x.authorId, 64),
    category: optStr(x.category, 80),
    difficulty: Number.isInteger(difficulty) && difficulty >= 1 && difficulty <= 5 ? difficulty : undefined,
    duration: DURATIONS.find((d) => d.key === x.duration)?.key,
    projectId: optStr(x.projectId, 64),
    q: optStr(x.q, 200),
    sort: TUTORIAL_SORTS.find((s) => s === x.sort),
  };
}

/** Anleitungsliste mit Filtern und Cursor-Pagination – kartenfertig. */
export async function listTutorials(rawFilters: TutorialFilters, viewerId: string | null | undefined, opts: { cursor?: string | null; take?: number } = {}) {
  const filters = sanitizeTutorialFilters(rawFilters);
  if (typeof opts.cursor !== "string") opts = { ...opts, cursor: null };
  const take = Math.min(opts.take ?? 24, 60);
  const own = !!filters.authorId && filters.authorId === viewerId;
  const and: Prisma.TutorialWhereInput[] = [own ? { authorId: filters.authorId, state: { not: "REMOVED" } } : await visibleTutorialsWhere(viewerId)];
  if (filters.authorId && !own) and.push({ authorId: filters.authorId });
  if (filters.category) and.push({ category: filters.category });
  if (filters.difficulty) and.push({ difficulty: filters.difficulty });
  if (filters.projectId) and.push({ projectId: filters.projectId });
  const d = DURATIONS.find((x) => x.key === filters.duration);
  if (d) and.push({ minutes: { gte: d.min, lte: d.max } });
  if (filters.q?.trim()) {
    const q = filters.q.trim().slice(0, 80);
    and.push({ OR: [{ title: { contains: q, mode: "insensitive" } }, { summary: { contains: q, mode: "insensitive" } }] });
  }
  const orderBy: Prisma.TutorialOrderByWithRelationInput[] =
    filters.sort === "popular"
      ? [{ completionCount: "desc" }, { saveCount: "desc" }, { id: "desc" }]
      : filters.sort === "updated"
        ? [{ updatedAt: "desc" }, { id: "desc" }]
        : [{ publishedAt: { sort: "desc", nulls: "last" } }, { id: "desc" }];
  const rows = await db.tutorial.findMany({
    where: { AND: and },
    select: tutorialCardSelect,
    orderBy,
    take: take + 1,
    ...(opts.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
  });
  const page = rows.slice(0, take);
  return { items: page.map(toTutorialCard), nextCursor: rows.length > take ? page[page.length - 1]!.id : null };
}

export async function getTutorialCards(ids: string[], viewerId: string | null | undefined) {
  if (!ids.length) return [];
  const rows = await db.tutorial.findMany({ where: { AND: [{ id: { in: ids } }, await visibleTutorialsWhere(viewerId)] }, select: tutorialCardSelect });
  const byId = new Map(rows.map((r) => [r.id, r]));
  return ids.map((id) => byId.get(id)).filter((r): r is TutorialCardRow => !!r).map(toTutorialCard);
}

/** Werkuno Studio: eigene Anleitungen. */
export async function listStudioTutorials(userId: string) {
  const rows = await db.tutorial.findMany({
    where: { authorId: userId, state: { not: "REMOVED" } },
    orderBy: { updatedAt: "desc" },
    take: 200,
    select: {
      id: true, slug: true, title: true, state: true, category: true, viewCount: true, completionCount: true, saveCount: true, likeCount: true, updatedAt: true, publishedAt: true,
      currentVersion: { select: { version: true, publishedAt: true } },
      versions: { where: { version: DRAFT_VERSION }, select: { publishedAt: true } },
      _count: { select: { progress: true } },
    },
  });
  return rows.map((r) => {
    const draftAt = r.versions[0]?.publishedAt ?? null;
    return {
      ...r,
      /** Arbeitskopie wurde nach der letzten Veröffentlichung geändert. */
      hasUnpublishedChanges: !!draftAt && (!r.currentVersion || draftAt.getTime() > r.currentVersion.publishedAt.getTime() + 1000),
    };
  });
}

// ───────────────────────── Detailseite ─────────────────────────

const stepSelect = { id: true, stableKey: true, position: true, title: true, body: true, minutes: true, tip: true, safety: true, safetyKinds: true, media: true, materials: true, tools: true } satisfies Prisma.TutorialStepSelect;

function mapStep(s: Prisma.TutorialStepGetPayload<{ select: typeof stepSelect }>) {
  return {
    id: s.id,
    stableKey: s.stableKey,
    position: s.position,
    title: s.title,
    body: s.body,
    minutes: s.minutes,
    tip: s.tip,
    safety: s.safety,
    safetyKinds: s.safetyKinds.filter((k): k is SafetyKind => (SAFETY_KINDS as readonly string[]).includes(k)),
    media: asStepMedia(s.media).filter((m) => m.url),
    materials: s.materials,
    tools: s.tools,
  };
}
export type TutorialStepView = ReturnType<typeof mapStep>;

export const getTutorialPage = cache(async (slug: string, viewerId: string | null) => {
  const t = await db.tutorial.findUnique({
    where: { slug: (() => { try { return decodeURIComponent(slug); } catch { return slug; } })() },
    include: {
      author: { select: { id: true, status: true, profile: { select: { handle: true, displayName: true, avatarUrl: true, bio: true, followerCount: true } } } },
      currentVersion: { include: { steps: { orderBy: { position: "asc" }, select: stepSelect } } },
      versions: { where: { version: { gt: DRAFT_VERSION } }, orderBy: { version: "desc" }, take: 30, select: { version: true, changeNote: true, isMajor: true, publishedAt: true } },
      project: { select: { id: true, slug: true, title: true, status: true, coverUrl: true, category: true, ownerId: true, visibility: true, state: true, owner: { select: { profile: { select: { handle: true, displayName: true } } } } } },
      products: { where: { ...publicProductWhere, shop: { status: "ACTIVE" } }, take: 6, select: { id: true, slug: true, title: true, kind: true, priceMinor: true, currency: true, coverUrl: true, status: true, shop: { select: { slug: true, name: true } } } },
    },
  });
  if (!t) return null;
  const isOwner = viewerId === t.authorId;
  if (!isOwner && (t.author.status === "BANNED" || t.author.status === "DELETED")) return null;
  if (!(await canViewContent(viewerId, { ownerId: t.authorId, visibility: "PUBLIC", state: t.state }))) return null;

  // Ohne veröffentlichte Version sieht nur der Autor die Arbeitskopie als Vorschau
  let version = t.currentVersion;
  let preview = false;
  if (!version) {
    if (!isOwner) return null;
    version = await db.tutorialVersion.findUnique({ where: { tutorialId_version: { tutorialId: t.id, version: DRAFT_VERSION } }, include: { steps: { orderBy: { position: "asc" }, select: stepSelect } } });
    if (!version) return null;
    preview = true;
  }

  const [progress, liked, saved, followingAuthor, commentPage, project] = await Promise.all([
    viewerId ? db.tutorialProgress.findUnique({ where: { userId_tutorialId: { userId: viewerId, tutorialId: t.id } }, select: { completedKeys: true, versionSeen: true, completedAt: true } }) : null,
    viewerId ? db.reaction.findFirst({ where: { userId: viewerId, targetType: "TUTORIAL", targetId: t.id }, select: { userId: true } }) : null,
    viewerId ? db.bookmark.findFirst({ where: { userId: viewerId, targetType: "TUTORIAL", targetId: t.id }, select: { userId: true } }) : null,
    viewerId && !isOwner ? db.follow.findUnique({ where: { followerId_followeeId: { followerId: viewerId, followeeId: t.authorId } }, select: { followerId: true } }) : null,
    listCommentPage("TUTORIAL", t.id, viewerId),
    t.project && (await canViewContent(viewerId, { ownerId: t.project.ownerId, visibility: t.project.visibility, state: t.project.state }))
      ? t.project
      : null,
  ]);

  const steps = version.steps.map(mapStep);
  const keys = new Set(steps.map((s) => s.stableKey));
  return {
    id: t.id,
    slug: t.slug,
    href: `/anleitungen/${t.slug}`,
    title: t.title,
    summary: t.summary,
    category: t.category,
    difficulty: t.difficulty,
    minutes: t.minutes,
    coverUrl: t.coverUrl,
    language: t.language,
    isPaid: t.isPaid,
    priceMinor: t.priceMinor,
    state: t.state,
    safetyKinds: t.safetyKinds.filter((k): k is SafetyKind => (SAFETY_KINDS as readonly string[]).includes(k)),
    counts: { views: t.viewCount, saves: t.saveCount, likes: t.likeCount, completions: t.completionCount },
    publishedAt: t.publishedAt?.toISOString() ?? null,
    updatedAt: t.updatedAt.toISOString(),
    preview,
    version: { number: preview ? 0 : version.version, changeNote: version.changeNote, isMajor: version.isMajor, publishedAt: version.publishedAt.toISOString() },
    versions: t.versions.map((v) => ({ ...v, publishedAt: v.publishedAt.toISOString() })),
    materials: asLines(version.materials),
    tools: asLines(version.tools),
    steps,
    author: { id: t.authorId, handle: t.author.profile?.handle ?? "unbekannt", displayName: t.author.profile?.displayName ?? "Unbekannt", avatarUrl: t.author.profile?.avatarUrl ?? null, bio: t.author.profile?.bio ?? "", followerCount: t.author.profile?.followerCount ?? 0 },
    project: project ? { id: project.id, title: project.title, status: project.status, coverUrl: project.coverUrl, category: project.category, href: `/u/${project.owner.profile?.handle}/${project.slug}`, ownerName: project.owner.profile?.displayName ?? "" } : null,
    products: t.products.map((p) => ({ id: p.id, title: p.title, kind: p.kind, priceMinor: p.priceMinor, currency: p.currency, coverUrl: p.coverUrl, soldOut: p.status === "SOLD_OUT", href: `/markt/${p.shop.slug}/${p.slug}`, shopName: p.shop.name })),
    comments: commentPage.items,
    /** Cursor für ältere Kommentare (null = alle geladen) */
    commentsCursor: commentPage.nextCursor,
    viewer: {
      isOwner,
      signedIn: !!viewerId,
      liked: !!liked,
      saved: !!saved,
      followingAuthor: !!followingAuthor,
      completedKeys: (progress?.completedKeys ?? []).filter((k) => keys.has(k)),
      completedAt: progress?.completedAt?.toISOString() ?? null,
      versionSeen: progress?.versionSeen ?? null,
      hasProgress: !!progress,
    },
  };
});

export type TutorialPageView = NonNullable<Awaited<ReturnType<typeof getTutorialPage>>>;

// ───────────────────────── Editor ─────────────────────────

export async function getTutorialForEdit(user: SessionUser, tutorialId: string) {
  const t = await db.tutorial.findUnique({
    where: { id: tutorialId },
    include: {
      versions: { where: { version: DRAFT_VERSION }, include: { steps: { orderBy: { position: "asc" }, select: stepSelect } } },
      currentVersion: { include: { steps: { orderBy: { position: "asc" }, select: stepSelect } } },
      media: { orderBy: { position: "asc" }, take: 1, include: { media: { select: { id: true, variants: true } } } },
    },
  });
  if (!t || t.state === "REMOVED" || t.authorId !== user.id) return null;
  const source = t.versions[0] ?? t.currentVersion;
  const cover = t.media[0];
  const coverVariants = (cover?.media.variants ?? {}) as Variants;
  const lastPublished = await db.tutorialVersion.findFirst({ where: { tutorialId, version: { gt: DRAFT_VERSION } }, orderBy: { version: "desc" }, select: { version: true } });
  return {
    id: t.id,
    slug: t.slug,
    state: t.state,
    currentVersion: lastPublished?.version ?? null,
    values: {
      title: t.title,
      summary: t.summary,
      category: t.category,
      difficulty: t.difficulty,
      minutes: t.minutes,
      projectId: t.projectId,
      language: t.language,
      cover: cover ? { id: cover.mediaId, alt: "", preview: coverVariants.sm ?? coverVariants.md ?? t.coverUrl ?? "" } : null,
      materials: asLines(source?.materials),
      tools: asLines(source?.tools),
      steps: (source?.steps ?? []).map((s) => {
        const m = mapStep(s);
        return {
          stableKey: m.stableKey,
          title: m.title,
          body: m.body,
          minutes: m.minutes,
          tip: m.tip ?? "",
          safety: m.safety ?? "",
          safetyKinds: m.safetyKinds,
          media: asStepMedia(s.media).map((x) => ({ id: x.mediaId, alt: x.alt, preview: x.url ?? "" })),
          materials: m.materials,
          tools: m.tools,
        };
      }),
    },
  };
}

export type TutorialEditData = NonNullable<Awaited<ReturnType<typeof getTutorialForEdit>>>;

/** Vorbelegung für „Anleitung zu diesem Projekt schreiben“ (nur eigene Projekte). */
export async function getTutorialSeedFromProject(userId: string, projectId: string): Promise<Values | null> {
  const p = await db.project.findUnique({
    where: { id: projectId },
    select: {
      id: true, ownerId: true, title: true, category: true, difficulty: true, estimatedMinutes: true,
      materials: { orderBy: { position: "asc" }, select: { name: true, quantity: true, note: true, materialId: true } },
      tools: { orderBy: { position: "asc" }, select: { name: true, note: true } },
    },
  });
  if (!p || p.ownerId !== userId) return null;
  return {
    title: `${p.title} – Schritt für Schritt`.slice(0, 140),
    summary: "",
    category: p.category,
    difficulty: p.difficulty,
    minutes: p.estimatedMinutes,
    projectId: p.id,
    language: "de-CH",
    cover: null,
    materials: p.materials.map((m) => ({ name: m.name, quantity: m.quantity, note: m.note, materialId: m.materialId ?? undefined })),
    tools: p.tools.map((t) => ({ name: t.name, quantity: "", note: t.note })),
    steps: [],
  };
}
type Values = TutorialEditData["values"];
