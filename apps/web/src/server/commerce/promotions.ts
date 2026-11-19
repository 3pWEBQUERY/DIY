import "server-only";
import { applyCouponSchema, bundleSchema, couponSchema, formatMoney, type Currency } from "@werkraum/shared";
import { db, type Prisma } from "@/server/db";
import { fail, uniqueViolation } from "@/server/errors";
import { rateLimit } from "@/server/ratelimit";
import { audit } from "@/server/audit";
import { requireFlag } from "@/server/flags";
import { isBlockedBetween } from "@/server/visibility";
import type { SessionUser } from "@/server/auth/session";
import { addToCart } from "./cart";
import { buyerCouponUses } from "./discounts";
import { available, bundlePrice, couponProblem } from "./rules";
import { requireOwnShop } from "./shops";
import { publicProductWhere } from "./restock";

/**
 * Gutscheine und Sets (Bundles).
 * - Shops legen Gutscheincodes an (Prozent oder fester Betrag, optional Mindestwert, Zeitraum,
 *   Gesamtlimit, einmal je Konto) und Sets aus eigenen Produkten mit Set-Rabatt, optional zu einer Anleitung.
 * - Käufer:innen lösen je Shop einen Code im Warenkorb ein; ein Set kommt mit einem Klick komplett in
 *   den Warenkorb. Der Rabatt wird in Warenkorb und Kasse gleich berechnet (discounts.ts).
 */

/* ───────────────────────── Gutscheine (Shop) ───────────────────────── */

export async function listMyCoupons(user: Pick<SessionUser, "id">) {
  const shop = await requireOwnShop(user);
  const coupons = await db.shopCoupon.findMany({ where: { shopId: shop.id }, orderBy: [{ active: "desc" }, { createdAt: "desc" }] });
  const stats = coupons.length
    ? await db.order.groupBy({ by: ["couponId"], where: { couponId: { in: coupons.map((c) => c.id) }, paidAt: { not: null } }, _count: { _all: true }, _sum: { discountMinor: true } })
    : [];
  const by = new Map(stats.map((s) => [s.couponId!, { orders: s._count._all, discountMinor: s._sum.discountMinor ?? 0 }]));
  return { shop: { id: shop.id, currency: shop.currency, status: shop.status }, coupons: coupons.map((c) => ({ ...c, stats: by.get(c.id) ?? { orders: 0, discountMinor: 0 } })) };
}

export async function saveCoupon(user: SessionUser, couponId: string | null, input: unknown) {
  const data = couponSchema.parse(input);
  const shop = await requireOwnShop(user, { writable: true });
  await rateLimit(`coupon-save:${user.id}`, 60, 3600);
  const fields = {
    code: data.code,
    kind: data.kind,
    value: data.value,
    minSubtotalMinor: data.minSubtotalMinor,
    startsAt: data.startsAt ?? null,
    endsAt: data.endsAt ?? null,
    maxUses: data.maxUses ?? null,
    onePerBuyer: data.onePerBuyer,
    active: data.active,
  };
  try {
    if (couponId) {
      const r = await db.shopCoupon.updateMany({ where: { id: couponId, shopId: shop.id }, data: fields });
      if (!r.count) throw fail.notFound();
      await audit({ actorId: user.id, action: "coupon.update", targetType: "ShopCoupon", targetId: couponId, meta: { code: data.code, kind: data.kind, value: data.value, active: data.active } });
      return { id: couponId };
    }
    if ((await db.shopCoupon.count({ where: { shopId: shop.id } })) >= 200) throw fail.invalid("Höchstens 200 Gutscheine je Shop. Lösche alte Codes, die du nicht mehr brauchst.");
    const c = await db.shopCoupon.create({ data: { ...fields, shopId: shop.id }, select: { id: true } });
    await audit({ actorId: user.id, action: "coupon.create", targetType: "ShopCoupon", targetId: c.id, meta: { code: data.code, kind: data.kind, value: data.value } });
    return c;
  } catch (e) {
    if (uniqueViolation(e)) throw fail.invalid("Diesen Code gibt es in deinem Shop schon.", { code: "Code bereits vergeben" });
    throw e;
  }
}

export async function setCouponActive(user: SessionUser, couponId: string, active: boolean) {
  const shop = await requireOwnShop(user, { writable: true });
  const r = await db.shopCoupon.updateMany({ where: { id: couponId, shopId: shop.id }, data: { active } });
  if (!r.count) throw fail.notFound();
  await audit({ actorId: user.id, action: active ? "coupon.activate" : "coupon.deactivate", targetType: "ShopCoupon", targetId: couponId });
}

export async function deleteCoupon(user: SessionUser, couponId: string) {
  const shop = await requireOwnShop(user);
  // Bestellungen behalten ihre Rabattzeilen (Json), nur der Verweis entfällt
  const r = await db.shopCoupon.deleteMany({ where: { id: couponId, shopId: shop.id } });
  if (!r.count) throw fail.notFound();
  await audit({ actorId: user.id, action: "coupon.delete", targetType: "ShopCoupon", targetId: couponId });
}

/* ───────────────────────── Gutschein einlösen (Käufer:in) ───────────────────────── */

export async function applyCoupon(user: SessionUser, input: unknown) {
  const data = applyCouponSchema.parse(input);
  await requireFlag("marketplace", user.id);
  // Schutz gegen Durchprobieren von Codes
  await rateLimit(`coupon-apply:${user.id}`, 20, 3600);
  const cart = await db.cart.findUnique({ where: { userId: user.id }, select: { id: true, items: { where: { product: { shopId: data.shopId } }, select: { quantity: true, product: { select: { priceMinor: true } } } } } });
  if (!cart?.items.length) throw fail.invalid("In deinem Warenkorb liegt nichts aus diesem Shop.");
  const coupon = await db.shopCoupon.findUnique({ where: { shopId_code: { shopId: data.shopId, code: data.code } }, include: { shop: { select: { ownerId: true, currency: true } } } });
  if (!coupon) throw fail.invalid("Dieser Code ist für diesen Shop nicht gültig.", { code: "Unbekannter Code" });
  if (coupon.shop.ownerId === user.id) throw fail.invalid("Eigene Gutscheine kannst du nicht einlösen.", { code: "Eigener Gutschein" });
  if (await isBlockedBetween(user.id, coupon.shop.ownerId)) throw fail.invalid("Dieser Code ist für diesen Shop nicht gültig.", { code: "Unbekannter Code" });
  const uses = (await buyerCouponUses(db, user.id, [coupon.id], { includePending: false })).get(coupon.id) ?? { used: 0, pending: 0 };
  // Mindestwert wird im Warenkorb angezeigt (kann noch erreicht werden), alles andere lehnt sofort ab
  const problem = couponProblem({ ...coupon, usedCount: Math.max(0, coupon.usedCount - uses.pending) }, { now: new Date(), subtotal: Number.MAX_SAFE_INTEGER, buyerUses: uses.used, fmt: (m) => formatMoney(m, coupon.shop.currency as Currency) });
  if (problem) throw fail.invalid(problem, { code: problem });
  await db.cartCoupon.upsert({ where: { cartId_shopId: { cartId: cart.id, shopId: data.shopId } }, create: { cartId: cart.id, shopId: data.shopId, couponId: coupon.id }, update: { couponId: coupon.id } });
  return { code: coupon.code };
}

export async function removeCoupon(user: Pick<SessionUser, "id">, shopId: string) {
  const cart = await db.cart.findUnique({ where: { userId: user.id }, select: { id: true } });
  if (cart) await db.cartCoupon.deleteMany({ where: { cartId: cart.id, shopId } });
}

/* ───────────────────────── Sets (Shop) ───────────────────────── */

/** Produkte und Anleitungen, aus denen ein Set gebaut werden kann. */
export async function bundleOptions(user: Pick<SessionUser, "id">) {
  const shop = await requireOwnShop(user);
  const [products, tutorials] = await Promise.all([
    db.product.findMany({
      where: { shopId: shop.id, status: { in: ["ACTIVE", "SOLD_OUT", "DRAFT", "PAUSED"] } },
      orderBy: { title: "asc" },
      take: 300,
      select: { id: true, title: true, kind: true, status: true, priceMinor: true, currency: true, _count: { select: { variants: true } } },
    }),
    db.tutorial.findMany({ where: { authorId: user.id, state: { in: ["PUBLISHED", "DRAFT"] } }, orderBy: { updatedAt: "desc" }, take: 100, select: { id: true, title: true, state: true } }),
  ]);
  return {
    products: products.map((p) => ({ id: p.id, title: p.title, kind: p.kind, status: p.status, priceMinor: p.priceMinor, currency: p.currency, hasVariants: p._count.variants > 0 })),
    tutorials,
  };
}

export async function listMyBundles(user: Pick<SessionUser, "id">) {
  const shop = await requireOwnShop(user);
  const bundles = await db.productBundle.findMany({
    where: { shopId: shop.id },
    orderBy: [{ active: "desc" }, { createdAt: "desc" }],
    include: {
      tutorial: { select: { id: true, title: true, slug: true, state: true } },
      items: { orderBy: { position: "asc" }, select: { productId: true, quantity: true, product: { select: { title: true, priceMinor: true, status: true } } } },
    },
  });
  return bundles.map((b) => ({
    ...b,
    price: bundlePrice(b.items.map((i) => ({ unitMinor: i.product.priceMinor, quantity: i.quantity })), b.discountPct),
    unavailable: b.items.filter((i) => i.product.status !== "ACTIVE").map((i) => i.product.title),
  }));
}

export async function saveBundle(user: SessionUser, bundleId: string | null, input: unknown) {
  const data = bundleSchema.parse(input);
  const shop = await requireOwnShop(user, { writable: true });
  await rateLimit(`bundle-save:${user.id}`, 60, 3600);
  const products = await db.product.findMany({
    where: { id: { in: data.items.map((i) => i.productId) }, shopId: shop.id },
    select: { id: true, title: true, kind: true, _count: { select: { variants: true } } },
  });
  if (products.length !== data.items.length) throw fail.invalid("Ein Set kann nur Produkte aus deinem Shop enthalten.", { items: "Unbekanntes Produkt" });
  const withVariants = products.find((p) => p._count.variants > 0);
  if (withVariants) throw fail.invalid(`„${withVariants.title}“ hat Varianten – Produkte mit Varianten können nicht in ein Set.`, { items: "Produkt mit Varianten" });
  const digitalMulti = data.items.find((i) => i.quantity > 1 && products.find((p) => p.id === i.productId)?.kind === "DIGITAL");
  if (digitalMulti) throw fail.invalid("Digitale Produkte sind nur einmal im Set möglich.", { items: "Menge 1 bei digitalen Produkten" });
  if (data.tutorialId) {
    const t = await db.tutorial.findUnique({ where: { id: data.tutorialId }, select: { authorId: true, state: true } });
    if (!t || t.authorId !== user.id || t.state === "REMOVED") throw fail.invalid("Nur eigene Anleitungen können verknüpft werden.", { tutorialId: "Unbekannte Anleitung" });
  }
  const fields = { title: data.title, description: data.description, discountPct: data.discountPct, active: data.active, tutorialId: data.tutorialId || null };
  const items = data.items.map((i, position) => ({ productId: i.productId, quantity: i.quantity, position }));
  const id = await db.$transaction(async (tx) => {
    if (bundleId) {
      const r = await tx.productBundle.updateMany({ where: { id: bundleId, shopId: shop.id }, data: fields });
      if (!r.count) throw fail.notFound();
      await tx.productBundleItem.deleteMany({ where: { bundleId } });
      await tx.productBundleItem.createMany({ data: items.map((i) => ({ ...i, bundleId })) });
      return bundleId;
    }
    if ((await tx.productBundle.count({ where: { shopId: shop.id } })) >= 100) throw fail.invalid("Höchstens 100 Sets je Shop.");
    const b = await tx.productBundle.create({ data: { ...fields, shopId: shop.id, items: { create: items } }, select: { id: true } });
    return b.id;
  });
  await audit({ actorId: user.id, action: bundleId ? "bundle.update" : "bundle.create", targetType: "ProductBundle", targetId: id, meta: { discountPct: data.discountPct, items: items.length } });
  return { id };
}

export async function deleteBundle(user: SessionUser, bundleId: string) {
  const shop = await requireOwnShop(user);
  const r = await db.productBundle.deleteMany({ where: { id: bundleId, shopId: shop.id } });
  if (!r.count) throw fail.notFound();
  await audit({ actorId: user.id, action: "bundle.delete", targetType: "ProductBundle", targetId: bundleId });
}

/* ───────────────────────── Sets (öffentlich) ───────────────────────── */

const publicBundleInclude = {
  shop: { select: { id: true, slug: true, name: true, ownerId: true, status: true } },
  items: {
    orderBy: { position: "asc" },
    select: {
      quantity: true,
      product: {
        select: {
          id: true,
          slug: true,
          title: true,
          kind: true,
          status: true,
          hideWhenSoldOut: true,
          priceMinor: true,
          currency: true,
          coverUrl: true,
          inventory: { where: { variantId: null }, select: { onHand: true, reserved: true } },
          _count: { select: { variants: true } },
        },
      },
    },
  },
} satisfies Prisma.ProductBundleInclude;

type BundleRowFull = Prisma.ProductBundleGetPayload<{ include: typeof publicBundleInclude }>;

function bundleView(b: BundleRowFull) {
  const items = b.items.map((i) => {
    const p = i.product;
    const avail = p.kind === "DIGITAL" ? null : available(p.inventory[0]);
    return {
      productId: p.id,
      title: p.title,
      href: `/markt/${b.shop.slug}/${p.slug}`,
      coverUrl: p.coverUrl,
      kind: p.kind,
      unitMinor: p.priceMinor,
      currency: p.currency,
      quantity: i.quantity,
      inStock: p.status === "ACTIVE" && p._count.variants === 0 && (avail === null || avail >= i.quantity),
    };
  });
  return {
    id: b.id,
    title: b.title,
    description: b.description,
    discountPct: b.discountPct,
    shop: { slug: b.shop.slug, name: b.shop.name },
    items,
    ...bundlePrice(items, b.discountPct),
    currency: items[0]?.currency ?? "CHF",
    purchasable: items.length >= 2 && items.every((i) => i.inStock),
  };
}

export type BundleView = ReturnType<typeof bundleView>;

/** Sets, die öffentlich gezeigt werden: aktiver Shop, alle Teile öffentlich sichtbar. */
async function publicBundles(where: Prisma.ProductBundleWhereInput, viewerId: string | null) {
  const rows = await db.productBundle.findMany({
    where: { ...where, active: true, shop: { status: "ACTIVE", owner: { status: "ACTIVE" } }, items: { every: { product: publicProductWhere } } },
    orderBy: { createdAt: "asc" },
    take: 6,
    include: publicBundleInclude,
  });
  const out: BundleView[] = [];
  for (const b of rows) {
    if (b.items.length < 2) continue;
    if (viewerId && (await isBlockedBetween(viewerId, b.shop.ownerId))) continue;
    out.push(bundleView(b));
  }
  return out;
}

export function bundlesForTutorial(tutorialId: string, viewerId: string | null) {
  return publicBundles({ tutorialId }, viewerId);
}

export function bundlesForProduct(productId: string, viewerId: string | null) {
  return publicBundles({ items: { some: { productId } } }, viewerId);
}

/** Legt alle Teile eines Sets (in der Set-Menge) in den Warenkorb und merkt sich das Set für den Rabatt. */
export async function addBundleToCart(user: SessionUser, bundleId: string) {
  await requireFlag("marketplace", user.id);
  await rateLimit(`cart:${user.id}`, 120, 3600);
  const b = await db.productBundle.findUnique({ where: { id: bundleId }, include: publicBundleInclude });
  if (!b || !b.active || b.shop.status !== "ACTIVE") throw fail.notFound();
  const view = bundleView(b);
  if (!view.purchasable) throw fail.conflict("Dieses Set ist gerade nicht vollständig erhältlich.");
  const cart = await db.cart.upsert({ where: { userId: user.id }, create: { userId: user.id }, update: {}, select: { id: true, items: { where: { variantId: null }, select: { productId: true, quantity: true } } } });
  const have = new Map(cart.items.map((i) => [i.productId, i.quantity]));
  for (const it of view.items) {
    const missing = it.quantity - (have.get(it.productId) ?? 0);
    if (missing <= 0) continue;
    const r = await addToCart(user, { productId: it.productId, quantity: missing });
    if (r.capped) throw fail.conflict(`„${it.title}“ ist nicht mehr in der Set-Menge verfügbar.`);
  }
  await db.cartBundle.upsert({ where: { cartId_bundleId: { cartId: cart.id, bundleId } }, create: { cartId: cart.id, bundleId }, update: {} });
  return { title: b.title };
}
