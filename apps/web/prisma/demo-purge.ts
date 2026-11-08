import type { PrismaClient, TargetType } from "../src/generated/prisma/client";

/**
 * Entfernt die Demo-Community restlos (Konten @demo.werkraum.local und alles, was daran hängt),
 * ohne echte Konten und deren Inhalte anzutasten. Zähler echter Inhalte (Likes, Follower,
 * Mitglieder …), die durch Demo-Konten entstanden sind, werden zurückgerechnet.
 *
 * Idempotent: ohne Demo-Konten passiert nichts.
 */
export const DEMO_EMAIL_DOMAIN = "@demo.werkraum.local";
const DEMO_COLLECTION_SLUGS = ["erste-projekte", "werkstattwissen", "herbst-am-werktisch"];
const DEMO_ADMIN_POSTS = ["Willkommen bei Werkuno! 🧶", "Willkommen im WERKRAUM!"];

type Db = PrismaClient;

export async function purgeDemo(db: Db, opts: { dryRun?: boolean; adminId?: string } = {}) {
  const users = await db.user.findMany({ where: { email: { endsWith: DEMO_EMAIL_DOMAIN } }, select: { id: true } });
  if (!users.length) {
    console.log("→ Keine Demo-Daten vorhanden.");
    return null;
  }
  const uids = users.map((u) => u.id);
  const inU = { in: uids };

  // ── Inhalte der Demo-Konten (plus Demo-Beitrag der Redaktion)
  const ids = async <T extends { id: string }>(p: Promise<T[]>) => (await p).map((r) => r.id);
  const shopIds = await ids(db.shop.findMany({ where: { ownerId: inU }, select: { id: true } }));
  const sets: Partial<Record<TargetType, string[]>> = {
    USER: uids,
    POST: await ids(db.post.findMany({ where: { OR: [{ authorId: inU }, ...(opts.adminId ? DEMO_ADMIN_POSTS.map((b) => ({ authorId: opts.adminId, body: { startsWith: b } })) : [])] }, select: { id: true } })),
    PROJECT: await ids(db.project.findMany({ where: { ownerId: inU }, select: { id: true } })),
    TUTORIAL: await ids(db.tutorial.findMany({ where: { authorId: inU }, select: { id: true } })),
    ARTICLE: await ids(db.blogArticle.findMany({ where: { authorId: inU }, select: { id: true } })),
    COMMUNITY: await ids(db.community.findMany({ where: { ownerId: inU }, select: { id: true } })),
    PRODUCT: await ids(db.product.findMany({ where: { shopId: { in: shopIds } }, select: { id: true } })),
    COMMENT: await ids(db.comment.findMany({ where: { authorId: inU }, select: { id: true } })),
  };
  // Kommentare echter Personen unter Demo-Inhalten verschwinden mit (Ziel existiert nicht mehr)
  const ownedTargets = (["POST", "PROJECT", "TUTORIAL", "ARTICLE", "PRODUCT"] as const).flatMap((t) => (sets[t] ?? []).map((id) => ({ targetType: t, targetId: id })));
  const commentsOnDemo = ownedTargets.length ? await ids(db.comment.findMany({ where: { OR: chunkOr(ownedTargets) }, select: { id: true } })) : [];
  sets.COMMENT = [...new Set([...(sets.COMMENT ?? []), ...commentsOnDemo])];
  const allTargets = new Set(Object.values(sets).flat());
  const isDemo = (t: string, id: string) => (sets[t as TargetType] ?? []).includes(id);

  const summary = Object.fromEntries(Object.entries(sets).map(([k, v]) => [k, v.length]));
  console.log("→ Demo-Daten gefunden:", JSON.stringify(summary));
  if (opts.dryRun) return summary;

  // ── Zähler echter Inhalte zurückrechnen (Interaktionen der Demo-Konten)
  const dec = async (type: string, id: string, field: string, n: number) => {
    if (isDemo(type, id) || n <= 0) return;
    const model = { POST: db.post, PROJECT: db.project, TUTORIAL: db.tutorial, ARTICLE: db.blogArticle, COMMENT: db.comment, PRODUCT: db.product }[type] as unknown as {
      updateMany: (a: unknown) => Promise<unknown>;
    } | undefined;
    if (!model) return;
    await model.updateMany({ where: { id }, data: { [field]: { decrement: n } } }).catch(() => {});
    await model.updateMany({ where: { id, [field]: { lt: 0 } }, data: { [field]: 0 } }).catch(() => {});
  };
  for (const r of await db.reaction.groupBy({ by: ["targetType", "targetId"], where: { userId: inU }, _count: true })) await dec(r.targetType, r.targetId, "likeCount", r._count);
  for (const r of await db.bookmark.groupBy({ by: ["targetType", "targetId"], where: { userId: inU }, _count: true })) await dec(r.targetType, r.targetId, "saveCount", r._count);
  for (const r of await db.comment.groupBy({ by: ["targetType", "targetId"], where: { authorId: inU }, _count: true })) await dec(r.targetType, r.targetId, "commentCount", r._count);
  for (const f of await db.follow.groupBy({ by: ["followeeId"], where: { followerId: inU, followeeId: { notIn: uids } }, _count: true })) {
    await db.userProfile.updateMany({ where: { userId: f.followeeId }, data: { followerCount: { decrement: f._count } } });
  }
  for (const f of await db.follow.groupBy({ by: ["followerId"], where: { followeeId: inU, followerId: { notIn: uids } }, _count: true })) {
    await db.userProfile.updateMany({ where: { userId: f.followerId }, data: { followingCount: { decrement: f._count } } });
  }
  for (const m of await db.communityMember.groupBy({ by: ["communityId"], where: { userId: inU, communityId: { notIn: sets.COMMUNITY ?? [] } }, _count: true })) {
    await db.community.updateMany({ where: { id: m.communityId }, data: { memberCount: { decrement: m._count } } });
  }
  await db.userProfile.updateMany({ where: { followerCount: { lt: 0 } }, data: { followerCount: 0 } });
  await db.userProfile.updateMany({ where: { followingCount: { lt: 0 } }, data: { followingCount: 0 } });

  // ── Polymorphe Verweise auf Demo-Ziele (keine Fremdschlüssel)
  const targetWhere = Object.entries(sets).flatMap(([t, list]) => (list.length ? [{ targetType: t as TargetType, targetId: { in: list } }] : []));
  await db.reaction.deleteMany({ where: { OR: targetWhere } });
  await db.bookmark.deleteMany({ where: { OR: targetWhere } });
  await db.hiddenContent.deleteMany({ where: { OR: targetWhere } });
  await db.report.deleteMany({ where: { OR: targetWhere } });
  await db.moderationCase.deleteMany({ where: { OR: targetWhere } });
  await db.notification.deleteMany({ where: { OR: [{ targetId: { in: [...allTargets] } }, { recipientId: inU }] } });
  await db.comment.deleteMany({ where: { id: { in: sets.COMMENT ?? [] } } });

  // ── Fremdschlüssel mit Restrict: Bestellungen, Zahlungen, Auszahlungen, Berechtigungen
  const orderIds = await ids(db.order.findMany({ where: { OR: [{ buyerId: inU }, { shopId: { in: shopIds } }] }, select: { id: true } }));
  await db.payment.deleteMany({ where: { orderId: { in: orderIds } } });
  await db.refund.deleteMany({ where: { orderId: { in: orderIds } } });
  await db.order.deleteMany({ where: { id: { in: orderIds } } });
  await db.digitalEntitlement.deleteMany({ where: { OR: [{ productId: { in: sets.PRODUCT ?? [] } }, { userId: inU }] } });
  await db.payoutRecord.deleteMany({ where: { shopId: { in: shopIds } } });
  await db.moderationAction.deleteMany({ where: { moderatorId: inU } });

  // ── Gespräche mit Demo-Konten komplett, Inhalte der Redaktion aus der Demo
  const convIds = (await db.conversationMember.findMany({ where: { userId: inU }, select: { conversationId: true } })).map((c) => c.conversationId);
  await db.conversation.deleteMany({ where: { id: { in: [...new Set(convIds)] } } });
  await db.post.deleteMany({ where: { id: { in: sets.POST ?? [] } } });

  // ── Konten (alles Weitere hängt per Cascade daran)
  await db.user.deleteMany({ where: { id: inU } });

  // ── Redaktionelle Sammlungen: Demo-Sammlungen weg, gelöschte Einträge aus den übrigen entfernen
  await db.editorialCollection.deleteMany({ where: { slug: { in: DEMO_COLLECTION_SLUGS } } });
  for (const c of await db.editorialCollection.findMany({ select: { id: true, items: true } })) {
    const items = (Array.isArray(c.items) ? c.items : []) as { id?: string }[];
    const kept = items.filter((i) => !i.id || !allTargets.has(i.id));
    if (kept.length !== items.length) await db.editorialCollection.update({ where: { id: c.id }, data: { items: kept } });
  }

  // ── Profilzähler aller verbleibenden Konten aus den echten Daten neu berechnen
  await db.$executeRaw`UPDATE "UserProfile" p SET
    "postCount" = (SELECT count(*) FROM "Post" x WHERE x."authorId" = p."userId" AND x.state = 'PUBLISHED'),
    "followerCount" = (SELECT count(*) FROM "Follow" f WHERE f."followeeId" = p."userId"),
    "followingCount" = (SELECT count(*) FROM "Follow" f WHERE f."followerId" = p."userId")`;
  await db.$executeRaw`UPDATE "Community" c SET "memberCount" = GREATEST(1, (SELECT count(*) FROM "CommunityMember" m WHERE m."communityId" = c.id AND m.state = 'ACTIVE'))`;

  console.log("✓ Demo-Daten entfernt.");
  return summary;
}

/** Grosse OR-Listen in Gruppen je Zieltyp zusammenfassen. */
function chunkOr(list: { targetType: TargetType; targetId: string }[]) {
  const by = new Map<TargetType, string[]>();
  for (const x of list) by.set(x.targetType, [...(by.get(x.targetType) ?? []), x.targetId]);
  return [...by].map(([targetType, idList]) => ({ targetType, targetId: { in: idList } }));
}
