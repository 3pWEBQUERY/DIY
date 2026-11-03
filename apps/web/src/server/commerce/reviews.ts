import "server-only";
import { reviewCreateSchema } from "@werkraum/shared";
import { db, type Tx } from "@/server/db";
import { fail } from "@/server/errors";
import { rateLimit } from "@/server/ratelimit";
import { relationsFor } from "@/server/visibility";
import type { SessionUser } from "@/server/auth/session";
import { canReview } from "./rules";

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
    return await db.$transaction(async (tx) => {
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
