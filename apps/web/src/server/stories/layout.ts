import "server-only";
import {
  STORY_LAYOUT_MAX_BYTES,
  isEmptyStoryLayout,
  parseStoryLayout,
  storyLayoutBytes,
  type StoryElementView,
  type StoryLayout,
  type StoryLayoutView,
  type StoryProjectRef,
} from "@werkraum/shared";
import { db } from "@/server/db";
import { fail } from "@/server/errors";
import { notify } from "@/server/notifications";
import { limit } from "@/server/ratelimit";
import { requireFlag } from "@/server/flags";
import { canViewContent, relationsFor } from "@/server/visibility";
import type { SessionUser } from "@/server/auth/session";

/**
 * Gestaltung einer Story (Story-Editor) – Prüfung beim Erstellen und Auflösung für die Anzeige.
 *
 * Beim Erstellen: Projekt-Sticker nur auf eigene Projekte, Erwähnungen nur auf bestehende, nicht
 * (wechselseitig) blockierte Konten – Unpassendes wird entfernt, die Story nicht abgelehnt. Die
 * Konto-ID der Erwähnten wird gespeichert, damit ein späterer Wechsel des Benutzernamens nichts bricht.
 * Bei der Anzeige: aktueller Benutzername, Projekt nur solange öffentlich.
 */

const VISIBLE_STATUS = new Set(["ACTIVE", "SUSPENDED"]);
/** Höchstens so viele Erwähnte werden benachrichtigt (wie bei Beiträgen). */
export const STORY_MENTION_NOTIFY_MAX = 10;

export type LayoutRefs = {
  /** Eigene, nicht entfernte Projekte der Autorin / des Autors */
  ownProjects: ReadonlySet<string>;
  /** Benutzername → Konto-ID der erwähnbaren Personen */
  mentions: ReadonlyMap<string, string>;
};

/**
 * Layout für die gewählte Story-Art bereinigen (rein, ohne Datenbank): Filter nur für Foto/Video,
 * Textstil nur für Text-Stories, Projekt-Sticker nur auf eigene Projekte, Erwähnungen nur auf
 * auflösbare Personen und je Person einmal. Ergibt `null`, wenn nichts zu speichern bleibt.
 */
export function cleanLayout(layout: StoryLayout, kind: "MEDIA" | "TEXT", refs: LayoutRefs): StoryLayout | null {
  const mentioned = new Set<string>();
  const elements = layout.elements.flatMap((e): StoryLayout["elements"] => {
    if (e.type === "projectLink") return refs.ownProjects.has(e.projectId) ? [e] : [];
    if (e.type === "mention") {
      const userId = refs.mentions.get(e.handle);
      if (!userId || mentioned.has(userId)) return [];
      mentioned.add(userId);
      return [{ ...e, userId }];
    }
    return [e];
  });
  const out: StoryLayout = {
    version: layout.version,
    ...(kind === "MEDIA" && layout.media ? { media: layout.media } : {}),
    ...(kind === "TEXT" && layout.text ? { text: layout.text } : {}),
    elements,
  };
  return isEmptyStoryLayout(out) ? null : out;
}

/** Projekte und Personen eines Layouts auflösen (für `cleanLayout`). */
export async function resolveLayoutRefs(authorId: string, layout: StoryLayout): Promise<LayoutRefs> {
  const projectIds = [...new Set(layout.elements.flatMap((e) => (e.type === "projectLink" ? [e.projectId] : [])))];
  const handles = [...new Set(layout.elements.flatMap((e) => (e.type === "mention" ? [e.handle] : [])))];
  const [projects, profiles, rel] = await Promise.all([
    projectIds.length ? db.project.findMany({ where: { id: { in: projectIds }, ownerId: authorId, state: { not: "REMOVED" } }, select: { id: true } }) : [],
    handles.length ? db.userProfile.findMany({ where: { handle: { in: handles } }, select: { handle: true, userId: true, user: { select: { status: true } } } }) : [],
    handles.length ? relationsFor(authorId) : { blocked: [] as string[] },
  ]);
  const blocked = new Set(rel.blocked);
  return {
    ownProjects: new Set(projects.map((p) => p.id)),
    mentions: new Map(profiles.filter((p) => VISIBLE_STATUS.has(p.user.status) && !blocked.has(p.userId)).map((p) => [p.handle, p.userId])),
  };
}

/** Layout aus der Eingabe prüfen und bereinigen – fertig zum Speichern (oder `null`). */
export async function prepareStoryLayout(authorId: string, kind: "MEDIA" | "TEXT", layout: StoryLayout | undefined) {
  if (!layout) return null;
  const cleaned = cleanLayout(layout, kind, await resolveLayoutRefs(authorId, layout));
  if (cleaned && storyLayoutBytes(cleaned) > STORY_LAYOUT_MAX_BYTES) throw fail.invalid("Die Gestaltung ist zu umfangreich. Entferne ein paar Striche oder Elemente.");
  return cleaned;
}

/** Wer über eine Erwähnung benachrichtigt wird (vor der Sichtbarkeitsprüfung): je Person einmal, nie die Autorin selbst. */
export function mentionTargets(layout: StoryLayout | null, authorId: string) {
  if (!layout) return [];
  const ids = layout.elements.flatMap((e) => (e.type === "mention" && e.userId && e.userId !== authorId ? [e.userId] : []));
  return [...new Set(ids)].slice(0, STORY_MENTION_NOTIFY_MAX);
}

/**
 * Erwähnte benachrichtigen – nur, wer die Story sehen darf („Nur Follower“, Blockierungen).
 * Fehler dürfen das Erstellen nicht kippen (die Story ist dann schon gespeichert).
 */
export async function notifyStoryMentions(story: { id: string; authorId: string; authorHandle: string; visibility: string }, layout: StoryLayout | null) {
  for (const userId of mentionTargets(layout, story.authorId)) {
    try {
      if (!(await canViewContent(userId, { ownerId: story.authorId, visibility: story.visibility, state: "PUBLISHED" }))) continue;
      await notify({
        recipientId: userId,
        type: "MENTION",
        actorId: story.authorId,
        targetType: "STORY",
        targetId: story.id,
        data: { href: `/stories/${story.authorHandle}?story=${story.id}` },
        bundle: false,
      });
    } catch {
      // nächste Person – eine fehlgeschlagene Benachrichtigung hält die anderen nicht auf
    }
  }
}

// ───────────────────────── Anzeige ─────────────────────────

/**
 * Gespeichertes Layout für die Anzeige aufbereiten (rein): Erwähnungen mit aktuellem Benutzernamen,
 * nicht mehr sichtbare Konten und nicht (mehr) öffentliche Projekte fallen weg.
 */
export function toLayoutView(
  layout: StoryLayout | null,
  users: ReadonlyMap<string, { handle: string; visible: boolean }>,
  projects: ReadonlyMap<string, StoryProjectRef>,
): StoryLayoutView | null {
  if (!layout) return null;
  const elements = layout.elements.flatMap((e): StoryElementView[] => {
    if (e.type === "mention") {
      const u = e.userId ? users.get(e.userId) : null;
      return u?.visible ? [{ ...e, handle: u.handle }] : [];
    }
    if (e.type === "projectLink") {
      const project = projects.get(e.projectId);
      return project ? [{ ...e, project }] : [];
    }
    return [e];
  });
  return { ...layout, elements };
}

/** Layouts mehrerer Stories auf einmal auflösen (eine Abfrage je Art). */
export async function layoutViews(rows: { id: string; layout: unknown }[]) {
  const parsed = rows.map((r) => [r.id, parseStoryLayout(r.layout)] as const);
  const userIds = new Set<string>();
  const projectIds = new Set<string>();
  for (const [, l] of parsed) {
    for (const e of l?.elements ?? []) {
      if (e.type === "mention" && e.userId) userIds.add(e.userId);
      if (e.type === "projectLink") projectIds.add(e.projectId);
    }
  }
  const [users, projects] = await Promise.all([
    userIds.size ? db.user.findMany({ where: { id: { in: [...userIds] } }, select: { id: true, status: true, profile: { select: { handle: true } } } }) : [],
    projectIds.size
      ? db.project.findMany({ where: { id: { in: [...projectIds] }, state: "PUBLISHED", visibility: "PUBLIC" }, select: { id: true, slug: true, title: true, owner: { select: { profile: { select: { handle: true } } } } } })
      : [],
  ]);
  const userMap = new Map(users.flatMap((u) => (u.profile ? [[u.id, { handle: u.profile.handle, visible: VISIBLE_STATUS.has(u.status) }] as const] : [])));
  const projectMap = new Map(projects.flatMap((p) => (p.owner.profile ? [[p.id, { title: p.title, href: `/u/${p.owner.profile.handle}/${p.slug}` }] as const] : [])));
  return new Map(parsed.map(([id, l]) => [id, toLayoutView(l, userMap, projectMap)]));
}

// ───────────────────────── Erwähnen ─────────────────────────

export type MentionSuggestion = { handle: string; displayName: string; avatarUrl: string | null };

/**
 * Vorschläge für den Erwähnungs-Sticker: Benutzername beginnt mit bzw. Name enthält die Eingabe.
 * Ohne (wechselseitig) blockierte, gesperrte und gelöschte Konten; Personen, denen man folgt, zuerst.
 */
export async function mentionSuggestions(user: SessionUser, query: string): Promise<MentionSuggestion[]> {
  await requireFlag("stories.editor", user.id);
  const q = query.trim().replace(/^@/, "").toLowerCase();
  if (!q || q.length > 24) return [];
  await limit("mentionSearch", user.id);
  const rel = await relationsFor(user.id);
  const rows = await db.userProfile.findMany({
    where: {
      OR: [{ handle: { startsWith: q } }, { displayName: { contains: q, mode: "insensitive" } }],
      user: { status: { in: ["ACTIVE", "SUSPENDED"] } },
      ...(rel.blocked.length ? { userId: { notIn: rel.blocked } } : {}),
    },
    orderBy: { followerCount: "desc" },
    take: 30,
    select: { userId: true, handle: true, displayName: true, avatarUrl: true },
  });
  const following = new Set(rel.following);
  const rank = (r: (typeof rows)[number]) => (following.has(r.userId) ? 0 : 2) + (r.handle.startsWith(q) ? 0 : 1);
  return rows
    .map((r, i) => ({ r, i }))
    .sort((a, b) => rank(a.r) - rank(b.r) || a.i - b.i)
    .slice(0, 8)
    .map(({ r }) => ({ handle: r.handle, displayName: r.displayName, avatarUrl: r.avatarUrl ?? null }));
}
