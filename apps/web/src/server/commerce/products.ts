import "server-only";
import { track } from "@/server/analytics/service";
import { z } from "zod";
import { productUpsertSchema, SHIP_COUNTRIES, PRODUCT_KIND, CATEGORY_SLUGS, type ProductKind } from "@werkraum/shared";
import { db, type Prisma, type Tx } from "@/server/db";
import { fail } from "@/server/errors";
import { attachMedia } from "@/server/media/service";
import { getSetting } from "@/server/settings";
import { relationsFor, isBlockedBetween } from "@/server/visibility";
import { createPost } from "@/server/social/posts";
import type { SessionUser } from "@/server/auth/session";
import type { Variants } from "@/components/ui/media";
import { slugify } from "@/lib/utils";
import { available, isSoldOut } from "./rules";
import { requireOwnShop } from "./shops";
import { assertCategoryAllowed } from "@/server/categories/settings";
import { requireFlag } from "@/server/flags";

/* ───────────────────────── Karten & Listen ───────────────────────── */

export const productCardSelect = {
  id: true,
  slug: true,
  title: true,
  priceMinor: true,
  currency: true,
  kind: true,
  category: true,
  status: true,
  coverUrl: true,
  ratingAvg: true,
  ratingCount: true,
  publishedAt: true,
  shop: { select: { slug: true, name: true } },
  media: { orderBy: { position: "asc" }, take: 1, select: { alt: true, media: { select: { variants: true } } } },
} satisfies Prisma.ProductSelect;

type ProductCardRow = Prisma.ProductGetPayload<{ select: typeof productCardSelect }>;

/** Serialisierbare Produktkarte (Server → Client, Suche, Profile, Entdecken). */
export type ProductCardData = {
  id: string;
  slug: string;
  title: string;
  priceMinor: number;
  currency: "CHF" | "EUR";
  kind: ProductKind;
  category: string;
  status: string;
  cover: { url: string | null; variants: Variants | null; alt: string };
  shop: { slug: string; name: string };
  ratingAvg: number;
  ratingCount: number;
  href: string;
};

export function toProductCard(p: ProductCardRow): ProductCardData {
  const m = p.media[0];
  return {
    id: p.id,
    slug: p.slug,
    title: p.title,
    priceMinor: p.priceMinor,
    currency: (p.currency === "EUR" ? "EUR" : "CHF") as "CHF" | "EUR",
    kind: p.kind,
    category: p.category,
    status: p.status,
    cover: { url: p.coverUrl, variants: (m?.media.variants as Variants | undefined) ?? null, alt: m?.alt || p.title },
    shop: p.shop,
    ratingAvg: p.ratingAvg,
    ratingCount: p.ratingCount,
    href: `/markt/${p.shop.slug}/${p.slug}`,
  };
}

export const PRODUCT_SORTS = ["neu", "preis-auf", "preis-ab", "beliebt", "bewertet"] as const;
export type ProductSort = (typeof PRODUCT_SORTS)[number];

export type ProductFilters = {
  q?: string;
  category?: string;
  kind?: ProductKind;
  minPriceMinor?: number;
  maxPriceMinor?: number;
  shipsFrom?: string;
  /** „Einzelstück“ – nur Unikate */
  uniqueOnly?: boolean;
  shopId?: string;
  ownerId?: string;
  projectId?: string;
  tutorialId?: string;
  excludeIds?: string[];
  includeSoldOut?: boolean;
  /** Standard: nur aktive Shops. Shopseite: auch pausierte (sichtbar, nicht kaufbar). */
  shopStatuses?: ("ACTIVE" | "PAUSED" | "PENDING_VERIFICATION" | "DRAFT")[];
  sort?: ProductSort;
};

const filtersSchema = z.object({
  q: z.string().trim().max(120).optional(),
  kategorie: z.enum(CATEGORY_SLUGS).optional().catch(undefined),
  art: z.enum(PRODUCT_KIND).optional().catch(undefined),
  min: z.coerce.number().min(0).max(100_000).optional().catch(undefined),
  max: z.coerce.number().min(0).max(100_000).optional().catch(undefined),
  versand: z.enum(SHIP_COUNTRIES).optional().catch(undefined),
  unikat: z.string().optional(),
  sort: z.enum(PRODUCT_SORTS).optional().catch(undefined),
});

/** URL-Parameter (/markt?kategorie=…&min=10&max=80&art=KIT&versand=CH&unikat=1&sort=preis-auf) → Filter. */
export function parseProductFilters(sp: Record<string, string | string[] | undefined>): ProductFilters & { raw: Record<string, string> } {
  const flat: Record<string, string> = {};
  for (const [k, v] of Object.entries(sp)) if (typeof v === "string" && v !== "") flat[k] = v;
  const p = filtersSchema.safeParse(flat);
  const d = p.success ? p.data : {};
  return {
    q: d.q || undefined,
    category: d.kategorie,
    kind: d.art,
    minPriceMinor: d.min != null ? Math.round(d.min * 100) : undefined,
    maxPriceMinor: d.max != null ? Math.round(d.max * 100) : undefined,
    shipsFrom: d.versand,
    uniqueOnly: d.unikat === "1" || d.unikat === "ja",
    sort: d.sort,
    raw: flat,
  };
}

/** Volltextsuche (deutsch, akzent-unabhängig) + Trigramm-Ähnlichkeit für Tippfehler. */
async function searchProductIds(q: string) {
  const rows = await db.$queryRaw<{ id: string }[]>`
    SELECT "id" FROM "Product"
    WHERE "status" IN ('ACTIVE', 'SOLD_OUT')
      AND ("search" @@ websearch_to_tsquery('german', wr_unaccent(${q})) OR similarity("title", ${q}) > 0.25)
    ORDER BY ts_rank("search", websearch_to_tsquery('german', wr_unaccent(${q}))) DESC, similarity("title", ${q}) DESC
    LIMIT 500`;
  return rows.map((r) => r.id);
}

/**
 * Öffentliche Produktliste für Marktplatz, Suche, Profile und Entdecken.
 * Nur aktive Produkte aktiver Shops, keine Produkte blockierter Konten,
 * digitale Produkte nur wenn im Web freigeschaltet. Cursor = letzte Produkt-ID.
 */
/** Aktueller Bestand einer Variante – innerhalb der Transaktion gelesen (FOR UPDATE), damit parallele Verkäufe zählen. */
async function currentOnHand(tx: Tx, variantId: string | null) {
  if (!variantId) return null;
  const rows = await tx.$queryRaw<{ onHand: number }[]>`SELECT "onHand" FROM "InventoryItem" WHERE "variantId" = ${variantId} FOR UPDATE`;
  return rows[0]?.onHand ?? null;
}

export async function listProducts(
  filters: ProductFilters = {},
  cursor?: string | null,
  opts: { take?: number; viewerId?: string | null } = {},
): Promise<{ items: ProductCardData[]; nextCursor: string | null }> {
  const take = Math.min(opts.take ?? 24, 60);
  const [rel, digitalEnabled] = await Promise.all([relationsFor(opts.viewerId), getSetting("commerce.digitalEnabledWeb")]);
  const and: Prisma.ProductWhereInput[] = [];
  if (filters.q) {
    const ids = await searchProductIds(filters.q);
    if (!ids.length) return { items: [], nextCursor: null };
    and.push({ id: { in: ids } });
  }
  if (filters.excludeIds?.length) and.push({ id: { notIn: filters.excludeIds } });
  if (!digitalEnabled) and.push({ kind: { not: "DIGITAL" } });
  if (filters.uniqueOnly) and.push({ kind: "UNIQUE" });
  else if (filters.kind) and.push({ kind: filters.kind });
  if (filters.minPriceMinor != null || filters.maxPriceMinor != null) {
    and.push({ priceMinor: { ...(filters.minPriceMinor != null ? { gte: filters.minPriceMinor } : {}), ...(filters.maxPriceMinor != null ? { lte: filters.maxPriceMinor } : {}) } });
  }
  const where: Prisma.ProductWhereInput = {
    status: filters.includeSoldOut ? { in: ["ACTIVE", "SOLD_OUT"] } : "ACTIVE",
    ...(filters.category ? { category: filters.category } : {}),
    ...(filters.shipsFrom ? { shipsFrom: filters.shipsFrom } : {}),
    ...(filters.shopId ? { shopId: filters.shopId } : {}),
    ...(filters.projectId ? { projectId: filters.projectId } : {}),
    ...(filters.tutorialId ? { tutorialId: filters.tutorialId } : {}),
    shop: {
      status: filters.shopStatuses?.length ? { in: filters.shopStatuses } : "ACTIVE",
      ...(filters.ownerId ? { ownerId: filters.ownerId } : {}),
      owner: { status: { in: ["ACTIVE", "SUSPENDED"] }, ...(rel.blocked.length ? { id: { notIn: rel.blocked } } : {}) },
    },
    ...(and.length ? { AND: and } : {}),
  };
  const orderBy: Prisma.ProductOrderByWithRelationInput[] =
    filters.sort === "preis-auf"
      ? [{ priceMinor: "asc" }, { id: "asc" }]
      : filters.sort === "preis-ab"
        ? [{ priceMinor: "desc" }, { id: "desc" }]
        : filters.sort === "beliebt"
          ? [{ saveCount: "desc" }, { id: "desc" }]
          : filters.sort === "bewertet"
            ? [{ ratingAvg: "desc" }, { ratingCount: "desc" }, { id: "desc" }]
            : [{ publishedAt: "desc" }, { id: "desc" }];
  const rows = await db.product.findMany({
    where,
    select: productCardSelect,
    orderBy,
    take: take + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });
  const page = rows.slice(0, take);
  return { items: page.map(toProductCard), nextCursor: rows.length > take ? page[page.length - 1]!.id : null };
}

/* ───────────────────────── Studio: Lesen ───────────────────────── */

export async function listMyProducts(user: Pick<SessionUser, "id">, opts: { status?: string } = {}) {
  const shop = await db.shop.findUnique({ where: { ownerId: user.id }, select: { id: true } });
  if (!shop) return [];
  return db.product.findMany({
    where: { shopId: shop.id, ...(opts.status ? { status: opts.status as Prisma.EnumProductStatusFilter["equals"] } : {}) },
    orderBy: { updatedAt: "desc" },
    select: {
      ...productCardSelect,
      updatedAt: true,
      viewCount: true,
      saveCount: true,
      inventory: { select: { onHand: true, reserved: true } },
      orderItems: { where: { order: { paidAt: { not: null }, status: { notIn: ["CANCELLED", "REFUNDED"] } } }, select: { quantity: true } },
      _count: { select: { orderItems: true, variants: true } },
    },
  });
}

/** Produkt inkl. Varianten, Bestand und Medien für den Editor (nur Eigentümer). */
export async function getProductForEdit(user: Pick<SessionUser, "id">, productId: string) {
  const p = await db.product.findUnique({
    where: { id: productId },
    include: {
      shop: { select: { ownerId: true, slug: true, status: true } },
      variants: { orderBy: { position: "asc" }, include: { inventory: true } },
      inventory: true,
      media: { orderBy: { position: "asc" }, include: { media: { select: { id: true, variants: true, kind: true, state: true } } } },
    },
  });
  if (!p || p.shop.ownerId !== user.id) return null;
  const digital = p.digitalKey ? await db.media.findUnique({ where: { id: p.digitalKey }, select: { id: true, mime: true, bytes: true, state: true, createdAt: true } }) : null;
  return { ...p, digitalFile: digital };
}

/** Auswahllisten für Projekt-/Anleitungsverknüpfung (nur eigene Inhalte). */
export async function linkOptions(userId: string) {
  const [projects, tutorials] = await Promise.all([
    db.project.findMany({ where: { ownerId: userId, state: { not: "REMOVED" } }, orderBy: { updatedAt: "desc" }, take: 100, select: { id: true, title: true } }),
    db.tutorial.findMany({ where: { authorId: userId, state: { not: "REMOVED" } }, orderBy: { updatedAt: "desc" }, take: 100, select: { id: true, title: true } }),
  ]);
  return { projects, tutorials };
}

/* ───────────────────────── Studio: Schreiben ───────────────────────── */

const extraSchema = z.object({
  shipsFrom: z.enum(SHIP_COUNTRIES).optional(),
  digitalMediaId: z.string().min(1).nullable().optional(),
  announce: z.boolean().default(false),
  announceText: z.string().trim().max(1000).default(""),
});

async function uniqueSlug(tx: Tx, shopId: string, title: string, exceptId?: string) {
  const base = slugify(title, 60);
  for (let i = 1; i < 200; i++) {
    const slug = i === 1 ? base : `${base}-${i}`;
    const hit = await tx.product.findUnique({ where: { shopId_slug: { shopId, slug } }, select: { id: true } });
    if (!hit || hit.id === exceptId) return slug;
  }
  return `${base}-${Date.now().toString(36)}`;
}

function coverFrom(variants: unknown) {
  const v = (variants ?? {}) as Record<string, string>;
  return v.md ?? v.lg ?? v.sm ?? null;
}

/**
 * Produkt anlegen/bearbeiten (§13.4). Nur aktive Shops dürfen aktiv veröffentlichen.
 * Bestand je Variante bzw. ein Bestandseintrag ohne Variante; reservierte Mengen bleiben geschützt.
 */
export async function upsertProduct(user: SessionUser, productId: string | null, input: unknown, extraInput: unknown = {}) {
  const data = productUpsertSchema.parse(input);
  await requireFlag("marketplace", user.id);
  if (data.kind === "RAW" && data.description.trim().length < 20) throw fail.invalid("Beschreibe den Zustand des Artikels (mind. 20 Zeichen).", { description: "Zustand beschreiben (mind. 20 Zeichen)" });
  await assertCategoryAllowed(data.category, productId ? (await db.product.findUnique({ where: { id: productId }, select: { category: true } }))?.category : null);
  const extra = extraSchema.parse(extraInput);
  const shop = await requireOwnShop(user, { writable: true });
  const existing = productId
    ? await db.product.findUnique({ where: { id: productId }, include: { variants: { include: { inventory: true } }, inventory: true } })
    : null;
  if (productId && (!existing || existing.shopId !== shop.id)) throw fail.notFound();
  if (existing?.status === "DISABLED") throw fail.forbidden("Dieses Angebot wurde von der Moderation deaktiviert und kann nicht bearbeitet werden.");

  const isDigital = data.kind === "DIGITAL";
  if (isDigital && !(await getSetting("commerce.digitalEnabledWeb"))) throw fail.forbidden("Digitale Produkte sind derzeit nicht freigeschaltet.");
  if (data.status === "ACTIVE" && shop.status !== "ACTIVE") {
    throw fail.forbidden("Produkte können erst veröffentlicht werden, wenn dein Shop verifiziert und aktiv ist. Speichere es solange als Entwurf.");
  }
  if (isDigital && data.variants.length) throw fail.invalid("Digitale Produkte haben keine Varianten.", { variants: "Nicht möglich bei digitalen Produkten" });
  if (new Set(data.variants.map((v) => v.name.toLowerCase())).size !== data.variants.length) throw fail.invalid("Variantennamen müssen eindeutig sein.", { variants: "Doppelte Variante" });
  if (data.variants.some((v) => data.priceMinor + v.priceDeltaMinor < 100)) throw fail.invalid("Jede Variante muss mindestens CHF 1.00 kosten.", { variants: "Preis zu tief" });

  const digitalMediaId = extra.digitalMediaId === undefined ? (existing?.digitalKey ?? null) : extra.digitalMediaId;
  if (isDigital && data.status === "ACTIVE" && !digitalMediaId) throw fail.invalid("Bitte lade die Datei für dein digitales Produkt hoch.", { digital: "Datei fehlt" });
  if (digitalMediaId && digitalMediaId !== existing?.digitalKey) {
    const f = await db.media.findUnique({ where: { id: digitalMediaId }, select: { ownerId: true, kind: true, isPrivate: true, state: true } });
    if (!f || f.ownerId !== user.id || f.kind !== "FILE" || !f.isPrivate) throw fail.forbidden("Ungültige Datei.");
    if (f.state === "FAILED") throw fail.invalid("Die Datei konnte nicht verarbeitet werden. Bitte lade sie erneut hoch.");
  }

  if (data.projectId) {
    const pr = await db.project.findUnique({ where: { id: data.projectId }, select: { ownerId: true, state: true } });
    if (!pr || pr.ownerId !== user.id || pr.state === "REMOVED") throw fail.forbidden("Du kannst nur eigene Projekte verknüpfen.");
  }
  if (data.tutorialId) {
    const t = await db.tutorial.findUnique({ where: { id: data.tutorialId }, select: { authorId: true, state: true } });
    if (!t || t.authorId !== user.id || t.state === "REMOVED") throw fail.forbidden("Du kannst nur eigene Anleitungen verknüpfen.");
  }

  // Einzelstück: höchstens 1 Stück (je Variante)
  const clampStock = (n: number) => Math.max(0, data.kind === "UNIQUE" ? Math.min(n, 1) : n);

  const product = await db.$transaction(async (tx) => {
    const mediaIds = data.media.map((m) => m.id);
    await attachMedia(tx, user.id, [...mediaIds, ...(digitalMediaId && digitalMediaId !== existing?.digitalKey ? [digitalMediaId] : [])]);
    const firstMedia = await tx.media.findUnique({ where: { id: mediaIds[0]! }, select: { variants: true } });
    // Slug bleibt nach der ersten Veröffentlichung stabil, damit geteilte Links nicht brechen.
    const slug = existing && (existing.title === data.title || existing.publishedAt) ? existing.slug : await uniqueSlug(tx, shop.id, data.title, existing?.id);
    const base = {
      title: data.title,
      slug,
      description: data.description,
      kind: data.kind,
      category: data.category,
      priceMinor: data.priceMinor,
      currency: data.currency,
      // Neue Clients senden eine Liste; ältere nur Freitext → beide Felder konsistent halten
      materialList: data.materialList ?? (data.materials ? [data.materials] : []),
      materials: data.materialList ? data.materialList.join(", ") : data.materials,
      dimensions: data.dimensions,
      ...(data.heightMm !== undefined ? { heightMm: data.heightMm } : {}),
      ...(data.widthMm !== undefined ? { widthMm: data.widthMm } : {}),
      ...(data.depthMm !== undefined ? { depthMm: data.depthMm } : {}),
      productionDays: data.productionDays,
      shippingMinor: isDigital ? 0 : data.shippingMinor,
      shipsFrom: extra.shipsFrom ?? existing?.shipsFrom ?? shop.country,
      safetyInfo: data.safetyInfo,
      returnPolicy: data.returnPolicy,
      projectId: data.projectId ?? null,
      tutorialId: data.tutorialId ?? null,
      coverUrl: coverFrom(firstMedia?.variants),
      digitalKey: isDigital ? digitalMediaId : null,
    };
    const p = existing
      ? await tx.product.update({ where: { id: existing.id }, data: base })
      : await tx.product.create({ data: { ...base, shopId: shop.id, status: "DRAFT" } });

    await tx.productMedia.deleteMany({ where: { productId: p.id } });
    await tx.productMedia.createMany({ data: data.media.map((m, i) => ({ productId: p.id, mediaId: m.id, position: i, alt: m.alt })) });

    // ── Varianten & Bestand ──
    const stockLevels: number[] = [];
    if (isDigital) {
      await tx.productVariant.deleteMany({ where: { productId: p.id } });
      await tx.inventoryItem.deleteMany({ where: { productId: p.id } });
    } else if (data.variants.length) {
      const old = existing?.variants ?? [];
      const keep = new Set<string>();
      for (const [i, v] of data.variants.entries()) {
        const match = old.find((o) => o.name.toLowerCase() === v.name.toLowerCase());
        // Mit stockBase nur die Änderung anwenden: Verkäufe seit dem Laden des Editors bleiben erhalten
        // (sonst setzt ein alter Tab ein verkauftes Einzelstück wieder auf „verfügbar“)
        const current = await currentOnHand(tx, match?.id ?? null);
        const stock = clampStock(v.stockBase != null && match && current != null ? current + (v.stock - v.stockBase) : v.stock);
        const reserved = match?.inventory?.reserved ?? 0;
        if (stock < reserved) throw fail.invalid(`„${v.name}“: ${reserved} Stück sind in offenen Bestellungen reserviert. Der Bestand kann nicht tiefer sein.`, { variants: "Bestand unter Reservierung" });
        const variant = match
          ? await tx.productVariant.update({ where: { id: match.id }, data: { name: v.name, priceDeltaMinor: v.priceDeltaMinor, position: i } })
          : await tx.productVariant.create({ data: { productId: p.id, name: v.name, priceDeltaMinor: v.priceDeltaMinor, position: i } });
        keep.add(variant.id);
        await tx.inventoryItem.upsert({
          where: { variantId: variant.id },
          create: { productId: p.id, variantId: variant.id, onHand: stock },
          update: { onHand: stock },
        });
        stockLevels.push(stock);
      }
      const remove = old.filter((o) => !keep.has(o.id));
      if (remove.some((o) => (o.inventory?.reserved ?? 0) > 0)) throw fail.conflict("Eine Variante mit offenen Reservierungen kann nicht entfernt werden.");
      if (remove.length) await tx.productVariant.deleteMany({ where: { id: { in: remove.map((o) => o.id) } } });
      await tx.inventoryItem.deleteMany({ where: { productId: p.id, variantId: null } });
    } else {
      if (existing?.variants.some((v) => (v.inventory?.reserved ?? 0) > 0)) throw fail.conflict("Varianten mit offenen Reservierungen können nicht entfernt werden.");
      await tx.productVariant.deleteMany({ where: { productId: p.id } });
      // Zeile sperren: ein gleichzeitiger Verkauf wartet bzw. wird mitgezählt
      const inv = (await tx.$queryRaw<{ id: string; onHand: number; reserved: number }[]>`SELECT id, "onHand", reserved FROM "InventoryItem" WHERE "productId" = ${p.id} AND "variantId" IS NULL FOR UPDATE`)[0];
      const stock = clampStock(data.stockBase != null && inv ? inv.onHand + (data.stock - data.stockBase) : data.stock);
      if (inv && stock < inv.reserved) throw fail.invalid(`${inv.reserved} Stück sind in offenen Bestellungen reserviert. Der Bestand kann nicht tiefer sein.`, { stock: "Bestand unter Reservierung" });
      if (inv) await tx.inventoryItem.update({ where: { id: inv.id }, data: { onHand: stock } });
      else await tx.inventoryItem.create({ data: { productId: p.id, onHand: stock } });
      stockLevels.push(stock);
    }

    // ── Status ── (aktiv ohne Bestand → ausverkauft)
    let status: "DRAFT" | "ACTIVE" | "PAUSED" | "SOLD_OUT" = data.status;
    if (status === "ACTIVE" && !isDigital && isSoldOut(stockLevels.map((onHand) => ({ onHand })))) status = "SOLD_OUT";
    return tx.product.update({
      where: { id: p.id },
      data: { status, publishedAt: status === "ACTIVE" || status === "SOLD_OUT" ? (p.publishedAt ?? new Date()) : p.publishedAt },
      include: { shop: { select: { slug: true } } },
    });
  });

  // „Im Feed ankündigen“ – als gekennzeichneter Verkaufsbeitrag (§9.6)
  let announced = false;
  if (extra.announce && product.status === "ACTIVE") {
    const body = extra.announceText || `Neu in meinem Shop: ${product.title}`;
    await createPost(user, { body, media: [] }, { productId: product.id });
    announced = true;
  }
  return { id: product.id, slug: product.slug, shopSlug: product.shop.slug, status: product.status, announced };
}

/** Schneller Statuswechsel aus der Produkttabelle. */
export async function setProductStatus(user: SessionUser, productId: string, status: "ACTIVE" | "PAUSED" | "DRAFT") {
  const shop = await requireOwnShop(user, { writable: true });
  const p = await db.product.findUnique({ where: { id: productId }, include: { inventory: true } });
  if (!p || p.shopId !== shop.id) throw fail.notFound();
  if (p.status === "DISABLED") throw fail.forbidden("Von der Moderation deaktiviert.");
  if (status === "ACTIVE") {
    if (shop.status !== "ACTIVE") throw fail.forbidden("Dein Shop ist noch nicht aktiv.");
    if (p.kind === "DIGITAL" && !p.digitalKey) throw fail.invalid("Für dieses digitale Produkt fehlt noch die Datei.");
  }
  const next = status === "ACTIVE" && p.kind !== "DIGITAL" && isSoldOut(p.inventory) ? "SOLD_OUT" : status;
  return db.product.update({ where: { id: p.id }, data: { status: next, publishedAt: next === "ACTIVE" ? (p.publishedAt ?? new Date()) : p.publishedAt } });
}

/** Löschen nur ohne Bestellhistorie – sonst pausieren (Belege bleiben nachvollziehbar). */
export async function deleteProduct(user: SessionUser, productId: string) {
  const shop = await requireOwnShop(user, { writable: true });
  const p = await db.product.findUnique({ where: { id: productId }, select: { shopId: true, _count: { select: { orderItems: true } } } });
  if (!p || p.shopId !== shop.id) throw fail.notFound();
  if (p._count.orderItems > 0) throw fail.conflict("Dieses Produkt wurde bereits verkauft und kann nicht gelöscht werden. Pausiere es stattdessen.");
  await db.product.delete({ where: { id: productId } });
}

/* ───────────────────────── Öffentlich: Detailseite ───────────────────────── */

export async function getProductPage(shopSlug: string, productSlug: string, viewerId: string | null | undefined) {
  const p = await db.product.findFirst({
    where: { slug: productSlug, shop: { slug: shopSlug } },
    include: {
      shop: {
        include: {
          verification: { select: { legalName: true, businessName: true, vatId: true, addressLine: true, postalCode: true, city: true, country: true } },
          owner: { select: { id: true, status: true, createdAt: true, profile: { select: { handle: true, displayName: true, avatarUrl: true, bio: true, region: true } } } },
        },
      },
      variants: { orderBy: { position: "asc" }, include: { inventory: { select: { onHand: true, reserved: true } } } },
      inventory: { where: { variantId: null }, select: { onHand: true, reserved: true } },
      media: { orderBy: { position: "asc" }, include: { media: { select: { id: true, variants: true, width: true, height: true, kind: true, state: true } } } },
      project: { select: { id: true, slug: true, title: true, status: true, coverUrl: true, category: true, state: true, visibility: true, ownerId: true, owner: { select: { profile: { select: { handle: true } } } } } },
      tutorial: { select: { id: true, slug: true, title: true, difficulty: true, minutes: true, coverUrl: true, category: true, state: true } },
    },
  });
  if (!p) return null;
  const isOwner = viewerId === p.shop.ownerId;
  if (!isOwner) {
    if (!["ACTIVE", "SOLD_OUT"].includes(p.status)) return null;
    if (!["ACTIVE", "PAUSED"].includes(p.shop.status)) return null;
    if (!["ACTIVE", "SUSPENDED"].includes(p.shop.owner.status)) return null;
    if (viewerId && (await isBlockedBetween(viewerId, p.shop.ownerId))) return null;
  }
  const digitalEnabled = await getSetting("commerce.digitalEnabledWeb");
  if (p.kind === "DIGITAL" && !digitalEnabled && !isOwner) return null;

  const stock = p.variants.length
    ? p.variants.map((v) => ({ id: v.id, name: v.name, priceDeltaMinor: v.priceDeltaMinor, available: available(v.inventory) }))
    : [];
  /** null = unbegrenzt (digitale Produkte) */
  const baseAvailable: number | null = p.kind === "DIGITAL" ? null : p.variants.length ? stock.reduce((s, v) => s + v.available, 0) : available(p.inventory[0]);
  const [saved, entitled] = viewerId
    ? await Promise.all([
        db.bookmark.findUnique({ where: { userId_targetType_targetId: { userId: viewerId, targetType: "PRODUCT", targetId: p.id } }, select: { userId: true } }),
        p.kind === "DIGITAL" ? db.digitalEntitlement.findUnique({ where: { userId_productId: { userId: viewerId, productId: p.id } }, select: { id: true, revokedAt: true } }) : null,
      ])
    : [null, null];

  // Verknüpfungen nur zeigen, wenn öffentlich sichtbar
  const project = p.project && p.project.state === "PUBLISHED" && p.project.visibility === "PUBLIC" ? { ...p.project, ownerHandle: p.project.owner.profile?.handle ?? "" } : null;
  const tutorial = p.tutorial && p.tutorial.state === "PUBLISHED" ? p.tutorial : null;

  return {
    ...p,
    project,
    tutorial,
    isOwner,
    purchasable: p.status === "ACTIVE" && p.shop.status === "ACTIVE" && p.shop.owner.status === "ACTIVE" && (baseAvailable === null || baseAvailable > 0),
    available: baseAvailable,
    variantStock: stock,
    viewer: { saved: !!saved, entitlementId: entitled && !entitled.revokedAt ? entitled.id : null },
  };
}

export type ProductPage = NonNullable<Awaited<ReturnType<typeof getProductPage>>>;

/** Aufrufzähler – unkritisch, deshalb ohne Transaktion und Fehler werden geschluckt. */
export async function countProductView(productId: string) {
  const r = await db.product.update({ where: { id: productId }, data: { viewCount: { increment: 1 } }, select: { shop: { select: { ownerId: true } } } }).catch(() => null);
  if (r) await track("view", { targetType: "PRODUCT", targetId: productId, ownerId: r.shop.ownerId });
}

/** Weitere Produkte desselben Shops (ruhige Querverweise statt aggressiver Empfehlungen). */
export async function moreFromShop(shopId: string, exceptId: string, take = 4) {
  const rows = await db.product.findMany({
    where: { shopId, status: "ACTIVE", id: { not: exceptId } },
    orderBy: { publishedAt: "desc" },
    take,
    select: productCardSelect,
  });
  return rows.map(toProductCard);
}
