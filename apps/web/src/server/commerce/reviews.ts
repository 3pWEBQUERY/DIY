import "server-only";
import { reviewCreateSchema } from "@werkraum/shared";
import { db, type Tx } from "@/server/db";
import { fail } from "@/server/errors";
import { rateLimit } from "@/server/ratelimit";
import { relationsFor } from "@/server/visibility";
import type { SessionUser } from "@/server/auth/session";
import { canReview } from "./rules";
import { notify } from "@/server/notifications";

/**
 * Bewertungen (§13.9): nur Käufer:innen, nur bestätigte Transaktionen, je Bestellposition
 * genau eine (DB-Unique auf orderItemId).
 */
export async function createReview(user: SessionUser, input: unknown) {
  const data = reviewCreateSchema.parse(input);
  await rateLimit(`review:${user.id}`, 30, 3600);
  const item = await db.orderItem.findUnique({
    where: { id: data.orderItemId },
    include: { order: { select: { id: true, buyerId: true, status: true, shopId: true, payments: { orderBy: { createdAt: "desc" }, take: 1, select: { status: true } } } }, review: { select: { id: true } } },
  });
  if (!item || item.order.buyerId !== user.id) throw fail.notFound();
  if (!canReview(item.order.status, item.order.payments[0]?.status)) throw fail.forbidden("Bewerten kannst du, sobald deine Bestellung versendet wurde.");
  if (item.review) throw fail.conflict("Du hast diesen Artikel bereits bewertet.");
  try {
    const created = await db.$transaction(async (tx) => {
      const r = await tx.review.create({
        data: {
          orderId: item.order.id,
          orderItemId: item.id,
          productId: item.productId,
          authorId: user.id,
          productRating: data.productRating,
          sellerRating: data.sellerRating ?? null,
          body: data.body,
        },
      });
      await recomputeRatings(tx, item.productId, item.order.shopId);
      return r;
    });
    // Shop über die neue Bewertung informieren (Antworten im Produkt möglich)
    const prod = await db.product.findUnique({ where: { id: item.productId }, select: { title: true, slug: true, shop: { select: { ownerId: true, slug: true } } } });
    if (prod) {
      await notify({
        recipientId: prod.shop.ownerId,
        type: "ORDER_STATUS",
        actorId: user.id,
        targetType: "PRODUCT",
        targetId: item.productId,
        bundle: false,
        data: { kind: "review", title: prod.title, stars: String(data.productRating), href: `/markt/${prod.shop.slug}/${prod.slug}#bewertungen`, excerpt: data.body.slice(0, 120) },
      }).catch(() => {});
    }
    return created;
  } catch (e) {
    if ((e as { code?: string }).code === "P2002") throw fail.conflict("Du hast diesen Artikel bereits bewertet.");
    throw e;
  }
}

/** Durchschnittswerte für Produkt und Shop neu berechnen (nur veröffentlichte Bewertungen). */
export async function recomputeRatings(tx: Tx, productId: string, shopId: string) {
  const p = await tx.review.aggregate({ where: { productId, state: "PUBLISHED" }, _avg: { productRating: true }, _count: { _all: true } });
  await tx.product.update({ where: { id: productId }, data: { ratingAvg: p._avg.productRating ?? 0, ratingCount: p._count._all } });
  const rows = await tx.$queryRaw<{ avg: number | null; n: bigint }[]>`
    SELECT AVG(COALESCE(r."sellerRating", r."productRating"))::float AS avg, COUNT(*) AS n
    FROM "Review" r JOIN "Order" o ON o."id" = r."orderId"
    WHERE o."shopId" = ${shopId} AND r."state" = 'PUBLISHED'`;
  const s = rows[0];
  await tx.shop.update({ where: { id: shopId }, data: { ratingAvg: s?.avg ?? 0, ratingCount: Number(s?.n ?? 0) } });
}

/** Öffentliche Bewertungen eines Produkts – ohne blockierte Konten. */
export async function listProductReviews(productId: string, viewerId: string | null | undefined, take = 20) {
  const rel = await relationsFor(viewerId);
  return db.review.findMany({
    where: { productId, state: "PUBLISHED", ...(rel.blocked.length ? { authorId: { notIn: rel.blocked } } : {}) },
    orderBy: { createdAt: "desc" },
    take,
    select: {
      id: true,
      productRating: true,
      sellerRating: true,
      body: true,
      sellerReply: true,
      createdAt: true,
      orderItem: { select: { variantName: true } },
      author: { select: { id: true, profile: { select: { handle: true, displayName: true, avatarUrl: true } } } },
    },
  });
}

/** Bewertungen über alle Produkte eines Shops (Shopseite). */
export async function listShopReviews(shopId: string, viewerId: string | null | undefined, take = 6) {
  const rel = await relationsFor(viewerId);
  return db.review.findMany({
    where: { order: { shopId }, state: "PUBLISHED", ...(rel.blocked.length ? { authorId: { notIn: rel.blocked } } : {}) },
    orderBy: { createdAt: "desc" },
    take,
    select: {
      id: true,
      productRating: true,
      sellerRating: true,
      body: true,
      createdAt: true,
      product: { select: { title: true, slug: true } },
      author: { select: { profile: { select: { handle: true, displayName: true, avatarUrl: true } } } },
    },
  });
}

/**
 * Antwort des Shops auf eine Bewertung (öffentlich unter der Bewertung). Leerer Text entfernt
 * die Antwort. Nur die Shop-Inhaberin bzw. der Shop-Inhaber.
 */
export async function replyToReview(user: SessionUser, reviewId: string, text: string) {
  const reply = String(text ?? "").trim();
  if (reply.length > 1000) throw fail.invalid("Höchstens 1000 Zeichen.", { reply: "Höchstens 1000 Zeichen" });
  await rateLimit(`review-reply:${user.id}`, 60, 3600);
  const r = await db.review.findUnique({
    where: { id: reviewId },
    select: { id: true, authorId: true, state: true, sellerReply: true, product: { select: { title: true, slug: true, shop: { select: { ownerId: true, slug: true, name: true } } } } },
  });
  if (!r || r.state !== "PUBLISHED") throw fail.notFound();
  if (r.product.shop.ownerId !== user.id) throw fail.forbidden();
  await db.review.update({ where: { id: reviewId }, data: { sellerReply: reply || null } });
  if (reply && !r.sellerReply && r.authorId !== user.id) {
    await notify({
      recipientId: r.authorId,
      type: "REPLY",
      actorId: user.id,
      targetType: "PRODUCT",
      targetId: reviewId,
      bundle: false,
      data: { kind: "review_reply", title: r.product.title, href: `/markt/${r.product.shop.slug}/${r.product.slug}#bewertungen`, excerpt: reply.slice(0, 120) },
    }).catch(() => {});
  }
  return { reply: reply || null };
}
