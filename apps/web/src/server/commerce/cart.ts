import "server-only";
import { cartAddSchema, cartUpdateSchema } from "@werkraum/shared";
import { db, type Prisma } from "@/server/db";
import { fail } from "@/server/errors";
import { rateLimit } from "@/server/ratelimit";
import { getSetting } from "@/server/settings";
import { isBlockedBetween } from "@/server/visibility";
import type { SessionUser } from "@/server/auth/session";
import type { Variants } from "@/components/ui/media";
import { available, groupByShop, grandTotal, unitPrice } from "./rules";
import { paymentsMode } from "./stripe";
import { requireFlag } from "@/server/flags";

/**
 * Warenkorb (§13.5): ein Warenkorb je Konto, Positionen je Produkt/Variante.
 * Preise werden nie im Warenkorb gespeichert, sondern immer live berechnet –
 * die verbindliche Prüfung erfolgt erneut in der Checkout-Transaktion.
 */

const cartItemInclude = {
  product: {
    select: {
      id: true,
      slug: true,
      title: true,
      kind: true,
      status: true,
      category: true,
      priceMinor: true,
      currency: true,
      shippingMinor: true,
      productionDays: true,
      coverUrl: true,
      media: { orderBy: { position: "asc" }, take: 1, select: { alt: true, media: { select: { variants: true } } } },
      inventory: { where: { variantId: null }, select: { onHand: true, reserved: true } },
      shop: { select: { id: true, slug: true, name: true, status: true, ownerId: true, chargesEnabled: true, stripeAccountId: true, processingDays: true, country: true } },
    },
  },
  variant: { select: { id: true, name: true, priceDeltaMinor: true, inventory: { select: { onHand: true, reserved: true } } } },
} satisfies Prisma.CartItemInclude;

type CartRow = Prisma.CartItemGetPayload<{ include: typeof cartItemInclude }>;

export type CartLineView = {
  id: string;
  productId: string;
  variantId: string | null;
  title: string;
  variantName: string | null;
  href: string;
  kind: string;
  category: string;
  cover: { url: string | null; variants: Variants | null; alt: string };
  unitMinor: number;
  quantity: number;
  lineMinor: number;
  shippingMinor: number;
  isDigital: boolean;
  available: number | null;
  problem: string | null;
};

function shopAcceptsPayments(shop: CartRow["product"]["shop"]) {
  if (shop.status !== "ACTIVE") return false;
  const mode = paymentsMode();
  if (mode === "stripe") return !!shop.stripeAccountId && shop.chargesEnabled;
  return mode === "simulated";
}

function toLine(r: CartRow, opts: { digitalEnabled: boolean }): CartLineView {
  const p = r.product;
  const isDigital = p.kind === "DIGITAL";
  const inv = r.variant ? r.variant.inventory : p.inventory[0];
  const avail = isDigital ? null : available(inv);
  const unit = unitPrice(p.priceMinor, r.variant?.priceDeltaMinor ?? 0);
  let problem: string | null = null;
  if (p.status !== "ACTIVE" && p.status !== "SOLD_OUT") problem = "Nicht mehr im Angebot";
  else if (isDigital && !opts.digitalEnabled) problem = "Digitale Produkte sind derzeit nicht verfügbar";
  else if (p.shop.status !== "ACTIVE") problem = "Der Shop nimmt gerade keine Bestellungen an";
  else if (!shopAcceptsPayments(p.shop)) problem = "Der Shop kann gerade keine Zahlungen annehmen";
  else if (!r.variant && r.variantId) problem = "Variante nicht mehr verfügbar";
  else if (avail !== null && avail <= 0) problem = "Nicht mehr verfügbar";
  else if (avail !== null && avail < r.quantity) problem = `Nur noch ${avail} verfügbar`;
  const m = p.media[0];
  return {
    id: r.id,
    productId: p.id,
    variantId: r.variantId,
    title: p.title,
    variantName: r.variant?.name ?? null,
    href: `/markt/${p.shop.slug}/${p.slug}`,
    kind: p.kind,
    category: p.category,
    cover: { url: p.coverUrl, variants: (m?.media.variants as Variants | undefined) ?? null, alt: m?.alt || p.title },
    unitMinor: unit,
    quantity: r.quantity,
    lineMinor: unit * r.quantity,
    shippingMinor: isDigital ? 0 : p.shippingMinor,
    isDigital,
    available: avail,
    problem,
  };
}

/** Warenkorb gruppiert nach Shop – mit vollständiger Kostenaufstellung (§5.7). */
export async function getCartView(userId: string) {
  const [feeBps, digitalEnabled] = await Promise.all([getSetting("commerce.feeBps"), getSetting("commerce.digitalEnabledWeb")]);
  const cart = await db.cart.findUnique({ where: { userId }, include: { items: { include: cartItemInclude, orderBy: { createdAt: "asc" } } } });
  const rows = cart?.items ?? [];
  const lines = rows.map((r) => ({ row: r, view: toLine(r, { digitalEnabled }) }));
  const priced = lines.map((l) => ({ ...l.view, shopId: l.row.product.shop.id }));
  const groups = groupByShop(priced, feeBps).map((g) => {
    const shop = rows.find((r) => r.product.shop.id === g.shopId)!.product.shop;
    return {
      shop: { id: shop.id, slug: shop.slug, name: shop.name, processingDays: shop.processingDays, country: shop.country },
      lines: g.lines,
      fees: g.fees,
      purchasable: g.lines.every((l) => !l.problem),
    };
  });
  return {
    groups,
    totals: grandTotal(groups),
    feeBps,
    count: rows.reduce((s, r) => s + r.quantity, 0),
    hasProblems: groups.some((g) => !g.purchasable),
    mode: paymentsMode(),
  };
}

export type CartView = Awaited<ReturnType<typeof getCartView>>;

/** Anzahl Artikel für ein Warenkorb-Badge in der Navigation. */
export async function cartCount(userId: string) {
  const r = await db.cartItem.aggregate({ where: { cart: { userId } }, _sum: { quantity: true } });
  return r._sum.quantity ?? 0;
}

async function ensureCart(userId: string) {
  return db.cart.upsert({ where: { userId }, create: { userId }, update: {}, select: { id: true } });
}

export async function addToCart(user: SessionUser, input: unknown) {
  const data = cartAddSchema.parse(input);
  await requireFlag("marketplace", user.id);
  await rateLimit(`cart:${user.id}`, 120, 3600);
  const p = await db.product.findUnique({
    where: { id: data.productId },
    include: {
      shop: { select: { ownerId: true, status: true } },
      variants: { select: { id: true, inventory: { select: { onHand: true, reserved: true } } } },
      inventory: { where: { variantId: null }, select: { onHand: true, reserved: true } },
    },
  });
  if (!p || p.status !== "ACTIVE" || p.shop.status !== "ACTIVE") throw fail.invalid("Dieses Produkt ist derzeit nicht erhältlich.");
  if (p.shop.ownerId === user.id) throw fail.invalid("Du kannst keine eigenen Produkte kaufen.");
  if (await isBlockedBetween(user.id, p.shop.ownerId)) throw fail.notFound();
  const isDigital = p.kind === "DIGITAL";
  if (isDigital) {
    if (!(await getSetting("commerce.digitalEnabledWeb"))) throw fail.invalid("Digitale Produkte sind derzeit nicht verfügbar.");
    const owned = await db.digitalEntitlement.findUnique({ where: { userId_productId: { userId: user.id, productId: p.id } }, select: { revokedAt: true } });
    if (owned && !owned.revokedAt) throw fail.conflict("Du besitzt dieses digitale Produkt bereits. Du findest es unter „Bestellungen“.");
  }
  let variantId: string | null = null;
  if (p.variants.length) {
    if (!data.variantId) throw fail.invalid("Bitte wähle eine Variante.", { variantId: "Variante wählen" });
    if (!p.variants.some((v) => v.id === data.variantId)) throw fail.invalid("Diese Variante gibt es nicht.");
    variantId = data.variantId;
  }
  const inv = variantId ? p.variants.find((v) => v.id === variantId)!.inventory : p.inventory[0];
  const cart = await ensureCart(user.id);
  const existing = await db.cartItem.findFirst({ where: { cartId: cart.id, productId: p.id, variantId } });
  const wanted = isDigital ? 1 : (existing?.quantity ?? 0) + data.quantity;
  const avail = isDigital ? 1 : available(inv);
  if (avail <= 0) throw fail.conflict("Dieser Artikel ist leider nicht mehr verfügbar.");
  const qty = Math.min(wanted, avail, 99);
  if (existing) await db.cartItem.update({ where: { id: existing.id }, data: { quantity: qty } });
  else await db.cartItem.create({ data: { cartId: cart.id, productId: p.id, variantId, quantity: qty } });
  return { quantity: qty, capped: qty < wanted, count: await cartCount(user.id) };
}

export async function updateCartItem(user: SessionUser, input: unknown) {
  const data = cartUpdateSchema.parse(input);
  const item = await db.cartItem.findUnique({
    where: { id: data.itemId },
    include: { cart: { select: { userId: true } }, product: { select: { kind: true, inventory: { where: { variantId: null }, select: { onHand: true, reserved: true } } } }, variant: { select: { inventory: true } } },
  });
  if (!item || item.cart.userId !== user.id) throw fail.notFound();
  if (data.quantity === 0) {
    await db.cartItem.delete({ where: { id: item.id } });
    return { quantity: 0 };
  }
  if (item.product.kind === "DIGITAL") return { quantity: 1 };
  const avail = available(item.variant ? item.variant.inventory : item.product.inventory[0]);
  if (avail <= 0) throw fail.conflict("Dieser Artikel ist leider nicht mehr verfügbar.");
  const qty = Math.min(data.quantity, avail);
  await db.cartItem.update({ where: { id: item.id }, data: { quantity: qty } });
  return { quantity: qty, capped: qty < data.quantity };
}

export async function removeCartItem(user: SessionUser, itemId: string) {
  const r = await db.cartItem.deleteMany({ where: { id: itemId, cart: { userId: user.id } } });
  if (!r.count) throw fail.notFound();
}
