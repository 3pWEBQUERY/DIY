import "server-only";
import { HIGHLIGHT_MAX_ITEMS, HIGHLIGHT_MAX_PER_PROFILE, highlightCreateSchema, highlightTitleSchema, highlightUpdateSchema } from "@werkraum/shared";
import { db, type Prisma, type Tx } from "@/server/db";
import { fail } from "@/server/errors";
import { isBlockedBetween } from "@/server/visibility";
import type { SessionUser } from "@/server/auth/session";
import { hydrateStories, storySelect, type StoryGroup } from "./service";

/**
 * Highlights: dauerhafte Story-Sammlungen auf dem Profil. Jede enthaltene Story behält ihre
 * Sichtbarkeit („Nur Follower“ bleibt nur für Follower sichtbar); moderierte Stories fallen heraus.
 */

const VISIBLE_STATUS = ["ACTIVE", "SUSPENDED"];

async function audienceFor(viewerId: string | null, ownerId: string) {
  if (viewerId === ownerId) return { own: true, blocked: false, follows: true };
  if (!viewerId) return { own: false, blocked: false, follows: false };
  const [blocked, f] = await Promise.all([
    isBlockedBetween(viewerId, ownerId),
    db.follow.findUnique({ where: { followerId_followeeId: { followerId: viewerId, followeeId: ownerId } }, select: { followerId: true } }),
  ]);
  return { own: false, blocked, follows: !!f };
}

function itemWhere(a: { own: boolean; follows: boolean }): Prisma.StoryHighlightItemWhereInput {
  if (a.own) return { story: { state: "PUBLISHED" } };
  return {
    story: {
      state: "PUBLISHED",
      OR: [{ kind: "TEXT" }, { media: { state: "READY" } }],
      visibility: a.follows ? { in: ["PUBLIC", "FOLLOWERS"] } : "PUBLIC",
    },
  };
}

const coverSelect = { id: true, kind: true, background: true, text: true, media: { select: { variants: true } } } as const;
type CoverRow = Prisma.StoryGetPayload<{ select: typeof coverSelect }>;

function coverView(s: CoverRow | undefined) {
  if (!s) return { thumb: null, background: null, text: null };
  const v = (s.media?.variants ?? {}) as Record<string, string>;
  return { thumb: v.thumb ?? v.sm ?? v.poster ?? null, background: s.kind === "TEXT" ? s.background : null, text: s.kind === "TEXT" ? s.text.slice(0, 40) : null };
}

/** Highlights eines Profils, so wie der Betrachter sie sehen darf (leere fallen weg). */
export async function listHighlights(viewerId: string | null, ownerId: string) {
  const a = await audienceFor(viewerId, ownerId);
  if (a.blocked) return [];
  const rows = await db.storyHighlight.findMany({
    where: { ownerId, owner: { status: { in: VISIBLE_STATUS as ("ACTIVE" | "SUSPENDED")[] } } },
    orderBy: [{ position: "asc" }, { createdAt: "desc" }],
    take: HIGHLIGHT_MAX_PER_PROFILE,
    select: { id: true, title: true, coverStoryId: true, items: { where: itemWhere(a), orderBy: { position: "asc" }, select: { story: { select: coverSelect } } } },
  });
  return rows
    .filter((r) => r.items.length > 0)
    .map((r) => ({
      id: r.id,
      title: r.title,
      count: r.items.length,
      cover: coverView(r.items.find((i) => i.story.id === r.coverStoryId)?.story ?? r.items[0]?.story),
    }));
}
export type HighlightSummary = Awaited<ReturnType<typeof listHighlights>>[number];

/** Ein Highlight im Story-Betrachter. */
export async function highlightGroup(viewerId: string | null, highlightId: string): Promise<StoryGroup | null> {
  const h = await db.storyHighlight.findUnique({
    where: { id: highlightId },
    select: { id: true, title: true, ownerId: true, owner: { select: { id: true, status: true, profile: { select: { handle: true, displayName: true, avatarUrl: true } } } } },
  });
  if (!h || !VISIBLE_STATUS.includes(h.owner.status)) return null;
  const a = await audienceFor(viewerId, h.ownerId);
  if (a.blocked) return null;
  const items = await db.storyHighlightItem.findMany({ where: { highlightId, ...itemWhere(a) }, orderBy: { position: "asc" }, select: { story: { select: storySelect } } });
  if (!items.length) return null;
  return {
    key: `h:${h.id}`,
    mode: "highlight",
    title: h.title,
    author: { id: h.owner.id, handle: h.owner.profile?.handle ?? "unbekannt", displayName: h.owner.profile?.displayName ?? "Unbekannt", avatarUrl: h.owner.profile?.avatarUrl ?? null },
    items: await hydrateStories(items.map((i) => i.story), viewerId),
    startIndex: 0,
  };
}

/** Eigene Highlights für die Auswahl „Zu Highlight hinzufügen“ – mit Markierung, ob die Story schon drin ist. */
export async function myHighlights(user: SessionUser, storyId?: string | null) {
  const rows = await db.storyHighlight.findMany({
    where: { ownerId: user.id },
    orderBy: [{ position: "asc" }, { createdAt: "desc" }],
    select: { id: true, title: true, coverStoryId: true, items: { orderBy: { position: "asc" }, select: { storyId: true, story: { select: coverSelect } } } },
  });
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    count: r.items.length,
    contains: !!storyId && r.items.some((i) => i.storyId === storyId),
    storyIds: r.items.map((i) => i.storyId),
    coverStoryId: r.coverStoryId,
    cover: coverView(r.items.find((i) => i.storyId === r.coverStoryId)?.story ?? r.items[0]?.story),
  }));
}
export type OwnHighlight = Awaited<ReturnType<typeof myHighlights>>[number];

async function assertOwnStories(tx: Tx, userId: string, ids: string[]) {
  const unique = [...new Set(ids)];
  const rows = await tx.story.findMany({ where: { id: { in: unique } }, select: { id: true, authorId: true, state: true } });
  if (rows.length !== unique.length || rows.some((r) => r.authorId !== userId || r.state === "REMOVED")) throw fail.forbidden("Du kannst nur eigene Stories in Highlights speichern.");
  return unique;
}

async function ownHighlight(tx: Tx, userId: string, id: string) {
  const h = await tx.storyHighlight.findUnique({ where: { id }, select: { id: true, ownerId: true } });
  if (!h || h.ownerId !== userId) throw fail.notFound("Highlight nicht gefunden.");
  return h;
}

export async function createHighlight(user: SessionUser, input: unknown) {
  const data = highlightCreateSchema.parse(input);
  return db.$transaction(async (tx) => {
    const count = await tx.storyHighlight.count({ where: { ownerId: user.id } });
    if (count >= HIGHLIGHT_MAX_PER_PROFILE) throw fail.invalid(`Du hast bereits ${HIGHLIGHT_MAX_PER_PROFILE} Highlights. Lösche zuerst eines.`);
    const ids = await assertOwnStories(tx, user.id, data.storyIds);
    // Neue Highlights erscheinen vorne
    await tx.storyHighlight.updateMany({ where: { ownerId: user.id }, data: { position: { increment: 1 } } });
    return tx.storyHighlight.create({
      data: { ownerId: user.id, title: data.title, position: 0, items: { create: ids.map((storyId, position) => ({ storyId, position })) } },
      select: { id: true },
    });
  });
}

export async function updateHighlight(user: SessionUser, highlightId: string, input: unknown) {
  const data = highlightUpdateSchema.parse(input);
  await db.$transaction(async (tx) => {
    await ownHighlight(tx, user.id, highlightId);
    let ids: string[] | null = null;
    if (data.storyIds) {
      ids = await assertOwnStories(tx, user.id, data.storyIds);
      await tx.storyHighlightItem.deleteMany({ where: { highlightId } });
      await tx.storyHighlightItem.createMany({ data: ids.map((storyId, position) => ({ highlightId, storyId, position })) });
    }
    if (data.coverStoryId) {
      const has = ids ? ids.includes(data.coverStoryId) : !!(await tx.storyHighlightItem.findUnique({ where: { highlightId_storyId: { highlightId, storyId: data.coverStoryId } }, select: { storyId: true } }));
      if (!has) throw fail.invalid("Das Titelbild muss eine Story aus diesem Highlight sein.");
    }
    const coverGone = ids && !data.coverStoryId ? { coverStoryId: { notIn: ids } } : null;
    await tx.storyHighlight.update({
      where: { id: highlightId },
      data: {
        ...(data.title !== undefined ? { title: data.title } : {}),
        ...(data.coverStoryId !== undefined ? { coverStoryId: data.coverStoryId } : {}),
      },
    });
    if (coverGone) await tx.storyHighlight.updateMany({ where: { id: highlightId, ...coverGone }, data: { coverStoryId: null } });
  });
}

/** Story zu einem bestehenden oder neuen Highlight hinzufügen (aus dem Betrachter bzw. Archiv). */
export async function addToHighlight(user: SessionUser, input: { storyId: string; highlightId?: string | null; title?: string | null }) {
  if (input.highlightId) {
    await db.$transaction(async (tx) => {
      await ownHighlight(tx, user.id, input.highlightId!);
      await assertOwnStories(tx, user.id, [input.storyId]);
      const count = await tx.storyHighlightItem.count({ where: { highlightId: input.highlightId! } });
      if (count >= HIGHLIGHT_MAX_ITEMS) throw fail.invalid(`Ein Highlight fasst höchstens ${HIGHLIGHT_MAX_ITEMS} Stories.`);
      const last = await tx.storyHighlightItem.findFirst({ where: { highlightId: input.highlightId! }, orderBy: { position: "desc" }, select: { position: true } });
      await tx.storyHighlightItem.createMany({ data: [{ highlightId: input.highlightId!, storyId: input.storyId, position: (last?.position ?? -1) + 1 }], skipDuplicates: true });
      await tx.storyHighlight.update({ where: { id: input.highlightId! }, data: { updatedAt: new Date() } });
    });
    return { highlightId: input.highlightId };
  }
  const title = highlightTitleSchema.parse(input.title ?? "");
  const h = await createHighlight(user, { title, storyIds: [input.storyId] });
  return { highlightId: h.id };
}

export async function removeFromHighlight(user: SessionUser, highlightId: string, storyId: string) {
  return db.$transaction(async (tx) => {
    await ownHighlight(tx, user.id, highlightId);
    await tx.storyHighlightItem.deleteMany({ where: { highlightId, storyId } });
    await tx.storyHighlight.updateMany({ where: { id: highlightId, coverStoryId: storyId }, data: { coverStoryId: null } });
    const left = await tx.storyHighlightItem.count({ where: { highlightId } });
    if (!left) await tx.storyHighlight.delete({ where: { id: highlightId } });
    return { deleted: !left };
  });
}

export async function deleteHighlight(user: SessionUser, highlightId: string) {
  await db.$transaction(async (tx) => {
    await ownHighlight(tx, user.id, highlightId);
    await tx.storyHighlight.delete({ where: { id: highlightId } });
  });
}

/** Reihenfolge der Highlights auf dem Profil festlegen. */
export async function reorderHighlights(user: SessionUser, ids: string[]) {
  const own = await db.storyHighlight.findMany({ where: { ownerId: user.id }, select: { id: true } });
  const known = new Set(own.map((h) => h.id));
  const order = ids.filter((id) => known.has(id));
  await db.$transaction(order.map((id, position) => db.storyHighlight.update({ where: { id }, data: { position } })));
}
