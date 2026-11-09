import "server-only";
import { z } from "zod";
import { PRODUCT_KIND, categorySchema } from "@werkraum/shared";
import { db, type Prisma, type ProductStatus } from "@/server/db";
import { fail } from "@/server/errors";
import { assertNotOwn } from "@/server/admin/own";
import { audit } from "@/server/audit";
import { notify } from "@/server/notifications";
import { hasRole } from "@/server/authz";
import { recomputeRatings } from "@/server/commerce/reviews";
import { isSoldOut, parseMoneyInput } from "@/server/commerce/rules";
import type { SessionUser } from "@/server/auth/session";

/**
 * Marktplatz-Verwaltung (Admin): Shops, Produkte und Bewertungen.
 * Eingriffe ausserhalb eines Moderationsfalls sind die Ausnahme – deshalb immer mit
 * Begründung, Audit-Eintrag und Benachrichtigung der Verkäuferin bzw. des Verkäufers.
 * Beträge, Umsätze und Zahlungsdaten sieht nur die Administration (§24.3).
 */

type Actor = Pick<SessionUser, "id" | "role">;
const PER_PAGE = 40;

function mod(actor: Actor) {
  if (!hasRole(actor, "PLATFORM_MODERATOR")) throw fail.forbidden();
}

const reasonSchema = z.string().trim().min(5, "Bitte begründe den Eingriff (mind. 5 Zeichen)").max(1000);
const publicNoteSchema = z.string().trim().max(1000).default("");

/** Audit-Ziele: decideShop schreibt „SHOP“, die Verifizierung im Commerce-Bereich „Shop“. */
const SHOP_TARGETS = ["SHOP", "Shop"];

export const PRODUCT_STATUSES = ["DRAFT", "ACTIVE", "PAUSED", "SOLD_OUT", "DISABLED"] as const satisfies readonly ProductStatus[];
const OPEN_ORDER: Prisma.OrderWhereInput["status"] = { in: ["NEW", "IN_PROGRESS", "READY_TO_SHIP", "SHIPPED"] };
const GMV_EXCLUDED: Prisma.OrderWhereInput["status"] = { notIn: ["PENDING_PAYMENT", "CANCELLED", "REFUNDED"] };

const auditSelect = {
  seq: true,
  action: true,
  targetType: true,
  targetId: true,
  meta: true,
  createdAt: true,
  actor: { select: { profile: { select: { handle: true } } } },
} satisfies Prisma.AuditEventSelect;

const caseSelect = {
  id: true,
  number: true,
  targetType: true,
  targetId: true,
  primaryReason: true,
  status: true,
  riskScore: true,
  reportCount: true,
  createdAt: true,
  actions: { orderBy: { createdAt: "desc" }, take: 1, select: { action: true } },
} satisfies Prisma.ModerationCaseSelect;

const reviewSelect = {
  id: true,
  productRating: true,
  sellerRating: true,
  body: true,
  sellerReply: true,
  state: true,
  createdAt: true,
  product: { select: { id: true, title: true } },
  author: { select: { id: true, profile: { select: { handle: true } } } },
} satisfies Prisma.ReviewSelect;

/* ───────────────────────────── Produkte: Liste ───────────────────────────── */

export async function listProductsAdmin(
  actor: Actor,
  opts: { q?: string | null; status?: string | null; kind?: string | null; shop?: string | null; featured?: boolean; page?: number },
) {
  mod(actor);
  const page = Math.max(1, opts.page ?? 1);
  const status = z.enum(PRODUCT_STATUSES).nullable().catch(null).parse(opts.status ?? null);
  const kind = z.enum(PRODUCT_KIND).nullable().catch(null).parse(opts.kind ?? null);
  const q = opts.q?.trim();
  const shop = opts.shop?.trim();
  const base: Prisma.ProductWhereInput = {
    ...(kind ? { kind } : {}),
    ...(opts.featured ? { isFeatured: true } : {}),
    ...(shop ? { shop: { OR: [{ id: shop }, { slug: shop.toLowerCase() }, { name: { contains: shop, mode: "insensitive" } }] } } : {}),
    ...(q ? { OR: [{ title: { contains: q, mode: "insensitive" } }, { id: q }, { slug: q.toLowerCase() }] } : {}),
  };
  const where: Prisma.ProductWhereInput = { ...base, ...(status ? { status } : {}) };
  const [rows, total, byStatus] = await Promise.all([
    db.product.findMany({
      where,
      orderBy: [{ isFeatured: "desc" }, { updatedAt: "desc" }],
      skip: (page - 1) * PER_PAGE,
      take: PER_PAGE,
      select: {
        id: true,
        title: true,
        slug: true,
        kind: true,
        category: true,
        status: true,
        priceMinor: true,
        currency: true,
        coverUrl: true,
        isFeatured: true,
        ratingAvg: true,
        ratingCount: true,
        updatedAt: true,
        shop: { select: { id: true, name: true, slug: true, status: true } },
        inventory: { select: { onHand: true, reserved: true } },
        _count: { select: { orderItems: true } },
      },
    }),
    db.product.count({ where }),
    db.product.groupBy({ by: ["status"], where: base, _count: { _all: true } }),
  ]);
  return {
    rows,
    total,
    page,
    pages: Math.max(1, Math.ceil(total / PER_PAGE)),
    byStatus: Object.fromEntries(byStatus.map((b) => [b.status, b._count._all])) as Record<string, number>,
    all: byStatus.reduce((s, b) => s + b._count._all, 0),
  };
}

/* ───────────────────────────── Shop: Detail ───────────────────────────── */

export async function getShopAdminDetail(actor: Actor, shopId: string) {
  mod(actor);
  const isAdmin = hasRole(actor, "ADMIN");
  const shop = await db.shop.findUnique({
    where: { id: shopId },
    select: {
      id: true,
      name: true,
      slug: true,
      tagline: true,
      description: true,
      status: true,
      sellerType: true,
      country: true,
      currency: true,
      shippingPolicy: true,
      returnPolicy: true,
      processingDays: true,
      chargesEnabled: true,
      payoutsEnabled: true,
      stripeAccountId: true,
      ratingAvg: true,
      ratingCount: true,
      salesCount: true,
      createdAt: true,
      updatedAt: true,
      ownerId: true,
      owner: { select: { id: true, status: true, profile: { select: { handle: true, displayName: true, avatarUrl: true } } } },
      verification: true,
    },
  });
  if (!shop) throw fail.notFound();

  const [products, productsByStatus, ordersTotal, ordersOpen, ordersProblem, recentOrders, reviews, reviewsHidden, reviewIds] = await Promise.all([
    db.product.findMany({
      where: { shopId },
      orderBy: [{ isFeatured: "desc" }, { updatedAt: "desc" }],
      take: 60,
      select: {
        id: true,
        title: true,
        slug: true,
        kind: true,
        status: true,
        priceMinor: true,
        currency: true,
        coverUrl: true,
        isFeatured: true,
        ratingAvg: true,
        ratingCount: true,
        updatedAt: true,
        inventory: { select: { onHand: true, reserved: true } },
        _count: { select: { orderItems: true } },
      },
    }),
    db.product.groupBy({ by: ["status"], where: { shopId }, _count: { _all: true } }),
    db.order.count({ where: { shopId, status: { not: "PENDING_PAYMENT" } } }),
    db.order.count({ where: { shopId, status: OPEN_ORDER } }),
    db.order.count({ where: { shopId, status: "PROBLEM" } }),
    db.order.findMany({
      where: { shopId, status: { not: "PENDING_PAYMENT" } },
      orderBy: { createdAt: "desc" },
      take: 15,
      select: {
        id: true,
        number: true,
        status: true,
        currency: true,
        totalMinor: true,
        paidAt: true,
        createdAt: true,
        buyer: { select: { id: true, profile: { select: { handle: true } } } },
        payments: { orderBy: { createdAt: "desc" }, take: 1, select: { status: true } },
        _count: { select: { items: true } },
      },
    }),
    db.review.findMany({
      where: { order: { shopId } },
      orderBy: { createdAt: "desc" },
      take: 15,
      select: reviewSelect,
    }),
    db.review.count({ where: { order: { shopId }, state: { not: "PUBLISHED" } } }),
    db.review.findMany({ where: { order: { shopId } }, select: { id: true }, take: 2000 }),
  ]);

  const productIds = (await db.product.findMany({ where: { shopId }, select: { id: true } })).map((p) => p.id);
  const caseWhere: Prisma.ModerationCaseWhereInput = {
    OR: [
      { targetType: "PRODUCT", targetId: { in: productIds } },
      { targetType: "REVIEW", targetId: { in: reviewIds.map((r) => r.id) } },
    ],
  };
  const [cases, openCases, recentAudit, money] = await Promise.all([
    db.moderationCase.findMany({ where: caseWhere, orderBy: { createdAt: "desc" }, take: 20, select: caseSelect }),
    db.moderationCase.count({ where: { ...caseWhere, status: { in: ["OPEN", "IN_REVIEW", "APPEALED"] } } }),
    db.auditEvent.findMany({
      where: { OR: [{ targetType: { in: SHOP_TARGETS }, targetId: shopId }, { targetType: "PRODUCT", targetId: { in: productIds } }] },
      orderBy: { seq: "desc" },
      take: 25,
      select: auditSelect,
    }),
    // Umsätze und Streitfälle: nur Administration (§24.3)
    isAdmin
      ? Promise.all([
          db.order.aggregate({ where: { shopId, paidAt: { not: null }, status: GMV_EXCLUDED }, _sum: { totalMinor: true, platformFeeMinor: true } }),
          db.payment.count({ where: { status: "DISPUTED", order: { shopId } } }),
          db.refund.count({ where: { status: "PENDING", order: { shopId } } }),
        ]).then(([agg, disputed, refundsPending]) => ({
          gmvMinor: agg._sum.totalMinor ?? 0,
          feeMinor: agg._sum.platformFeeMinor ?? 0,
          disputed,
          refundsPending,
        }))
      : Promise.resolve(null),
  ]);

  const titleById = new Map(products.map((p) => [p.id, p.title]));
  return {
    shop: {
      ...shop,
      // Zahlungs-/Auszahlungsdaten und Identitätsangaben nur für die Administration
      chargesEnabled: isAdmin ? shop.chargesEnabled : null,
      payoutsEnabled: isAdmin ? shop.payoutsEnabled : null,
      stripeAccountId: isAdmin ? shop.stripeAccountId : null,
      verification: shop.verification
        ? {
            state: shop.verification.state,
            businessName: shop.verification.businessName,
            reviewedAt: shop.verification.reviewedAt,
            reviewedBy: shop.verification.reviewedBy,
            notes: shop.verification.notes,
            legalName: isAdmin ? shop.verification.legalName : null,
            vatId: isAdmin ? shop.verification.vatId : null,
            address: isAdmin ? [shop.verification.addressLine, [shop.verification.postalCode, shop.verification.city].filter(Boolean).join(" "), shop.verification.country].filter(Boolean).join(", ") : null,
          }
        : null,
    },
    products,
    productsByStatus: Object.fromEntries(productsByStatus.map((b) => [b.status, b._count._all])) as Record<string, number>,
    productTotal: productIds.length,
    orders: {
      total: ordersTotal,
      open: ordersOpen,
      problem: ordersProblem,
      recent: recentOrders.map((o) => ({ ...o, totalMinor: isAdmin ? o.totalMinor : null, payments: isAdmin ? o.payments : [] })),
    },
    reviews,
    reviewsHidden,
    cases,
    openCases,
    money,
    recentAudit: recentAudit.map((a) => ({ ...a, label: a.targetType === "PRODUCT" ? (titleById.get(a.targetId ?? "") ?? "Produkt") : null })),
  };
}


/* ───────────────────────────── Produkt: Detail ───────────────────────────── */

export async function getProductAdminDetail(actor: Actor, productId: string) {
  mod(actor);
  const isAdmin = hasRole(actor, "ADMIN");
  const p = await db.product.findUnique({
    where: { id: productId },
    select: {
      id: true,
      title: true,
      slug: true,
      description: true,
      kind: true,
      category: true,
      priceMinor: true,
      currency: true,
      status: true,
      materials: true,
      dimensions: true,
      productionDays: true,
      shippingMinor: true,
      shipsFrom: true,
      safetyInfo: true,
      returnPolicy: true,
      coverUrl: true,
      digitalKey: true,
      ratingAvg: true,
      ratingCount: true,
      saveCount: true,
      viewCount: true,
      isFeatured: true,
      publishedAt: true,
      createdAt: true,
      updatedAt: true,
      shop: { select: { id: true, name: true, slug: true, status: true, ownerId: true, owner: { select: { profile: { select: { handle: true, displayName: true } } } } } },
      project: { select: { id: true, title: true, slug: true } },
      tutorial: { select: { id: true, title: true, slug: true } },
      variants: { orderBy: { position: "asc" }, select: { id: true, name: true, priceDeltaMinor: true, inventory: { select: { onHand: true, reserved: true } }, _count: { select: { orderItems: true } } } },
      inventory: { where: { variantId: null }, select: { onHand: true, reserved: true } },
      _count: { select: { orderItems: true, media: true, reviews: true, entitlements: true, cartItems: true } },
    },
  });
  if (!p) throw fail.notFound();

  const [orderItems, reviews, cases, openReports, recentAudit] = await Promise.all([
    db.orderItem.findMany({
      where: { productId },
      orderBy: { order: { createdAt: "desc" } },
      take: 20,
      select: {
        id: true,
        quantity: true,
        unitMinor: true,
        variantName: true,
        order: { select: { id: true, number: true, status: true, currency: true, createdAt: true, buyer: { select: { id: true, profile: { select: { handle: true } } } } } },
      },
    }),
    db.review.findMany({ where: { productId }, orderBy: { createdAt: "desc" }, take: 20, select: reviewSelect }),
    db.moderationCase.findMany({ where: { targetType: "PRODUCT", targetId: productId }, orderBy: { createdAt: "desc" }, take: 20, select: caseSelect }),
    db.report.count({ where: { targetType: "PRODUCT", targetId: productId, OR: [{ caseId: null }, { case: { status: { in: ["OPEN", "IN_REVIEW"] } } }] } }),
    db.auditEvent.findMany({ where: { targetType: "PRODUCT", targetId: productId }, orderBy: { seq: "desc" }, take: 20, select: auditSelect }),
  ]);

  const unitsSold = orderItems.reduce((s, i) => s + i.quantity, 0);
  return {
    product: p,
    orderItems: orderItems.map((i) => ({ ...i, unitMinor: isAdmin ? i.unitMinor : null })),
    unitsSold,
    reviews,
    cases,
    openReports,
    recentAudit: recentAudit.map((a) => ({ ...a, label: null as string | null })),
  };
}

/* ───────────────────────────── Shop: Bearbeiten ───────────────────────────── */

const shopEditSchema = z.object({
  name: z.string().trim().min(2, "Name ist zu kurz").max(60),
  tagline: z.string().trim().max(120).default(""),
  description: z.string().trim().max(4000).default(""),
  shippingPolicy: z.string().trim().max(4000).default(""),
  returnPolicy: z.string().trim().max(4000).default(""),
  processingDays: z.coerce.number().int().min(0, "Mindestens 0 Tage").max(120, "Höchstens 120 Tage"),
  reason: reasonSchema,
  publicNote: publicNoteSchema,
});

const SHOP_FIELD_LABEL: Record<string, string> = {
  name: "Name",
  tagline: "Kurzbeschreibung",
  description: "Beschreibung",
  shippingPolicy: "Versandbedingungen",
  returnPolicy: "Rückgabebedingungen",
  processingDays: "Bearbeitungszeit",
};

/** Stammdaten eines Shops korrigieren (z.B. irreführende Angaben). Slug bleibt stabil. */
export async function updateShopAdmin(actor: Actor, shopId: string, input: unknown) {
  mod(actor);
  const data = shopEditSchema.parse(input);
  const shop = await db.shop.findUnique({ where: { id: shopId }, select: { id: true, ownerId: true, name: true, tagline: true, description: true, shippingPolicy: true, returnPolicy: true, processingDays: true } });
  if (!shop) throw fail.notFound();
  assertNotOwn(actor, shop.ownerId);
  const { reason, publicNote, ...next } = data;
  const changed = (Object.keys(next) as (keyof typeof next)[]).filter((k) => shop[k] !== next[k]);
  if (!changed.length) throw fail.invalid("Es wurde nichts geändert.");
  await db.$transaction(async (tx) => {
    await tx.shop.update({ where: { id: shopId }, data: Object.fromEntries(changed.map((k) => [k, next[k]])) });
    await audit(
      { actorId: actor.id, action: "admin.shop_edited", targetType: "SHOP", targetId: shopId, meta: { fields: changed, ...(changed.includes("name") ? { nameFrom: shop.name, nameTo: next.name } : {}), reason } },
      tx,
    );
  });
  await notify({
    recipientId: shop.ownerId,
    type: "MODERATION",
    bundle: false,
    data: {
      kind: "ACCOUNT",
      title: next.name,
      message: `Die Plattform hat Angaben deines Shops „${next.name}“ angepasst: ${changed.map((k) => SHOP_FIELD_LABEL[k]).join(", ")}.`,
      publicNote,
      href: "/studio/shop",
    },
  });
  return { changed: changed.length };
}

/** Verifizierungsantrag ablehnen: zurück in den Entwurf, Verkäufer:in kann nachbessern. */
export async function rejectShopVerificationAdmin(actor: Actor, shopId: string, input: { reason: string; publicNote?: string }) {
  mod(actor);
  const reason = reasonSchema.parse(input.reason);
  const publicNote = z.string().trim().min(10, "Bitte erkläre der Person, was fehlt (mind. 10 Zeichen)").max(1000).parse(input.publicNote ?? "");
  const shop = await db.shop.findUnique({ where: { id: shopId }, select: { id: true, status: true, ownerId: true, name: true } });
  if (!shop) throw fail.notFound();
  assertNotOwn(actor, shop.ownerId);
  if (shop.status !== "PENDING_VERIFICATION") throw fail.conflict("Nur Shops in Prüfung können abgelehnt werden.");
  await db.$transaction(async (tx) => {
    await tx.shop.update({ where: { id: shopId }, data: { status: "DRAFT" } });
    await tx.sellerVerification.upsert({
      where: { shopId },
      create: { shopId, state: "REJECTED", reviewedBy: actor.id, reviewedAt: new Date(), notes: reason },
      update: { state: "REJECTED", reviewedBy: actor.id, reviewedAt: new Date(), notes: reason },
    });
    await audit({ actorId: actor.id, action: "admin.shop_verification_rejected", targetType: "SHOP", targetId: shopId, meta: { from: shop.status, to: "DRAFT", reason } }, tx);
  });
  await notify({
    recipientId: shop.ownerId,
    type: "MODERATION",
    bundle: false,
    data: { kind: "ACCOUNT", message: `Der Antrag für deinen Shop „${shop.name}“ wurde noch nicht freigegeben. Bitte ergänze die Angaben und reiche ihn erneut ein.`, publicNote, href: "/studio/shop" },
  });
}

/* ───────────────────────────── Produkt: Bearbeiten ───────────────────────────── */

const productEditSchema = z.object({
  title: z.string().trim().min(3, "Titel ist zu kurz").max(140),
  description: z.string().trim().max(10_000).default(""),
  category: categorySchema,
  materials: z.string().trim().max(1000).default(""),
  dimensions: z.string().trim().max(200).default(""),
  safetyInfo: z.string().trim().max(2000).default(""),
  returnPolicy: z.string().trim().max(2000).default(""),
  /** Preis als Eingabe „24.50“ – leer = unverändert. Nur Administration. */
  price: z.string().trim().max(20).default(""),
  reason: reasonSchema,
  publicNote: publicNoteSchema,
});

const PRODUCT_FIELD_LABEL: Record<string, string> = {
  title: "Titel",
  description: "Beschreibung",
  category: "Kategorie",
  materials: "Materialien",
  dimensions: "Masse",
  safetyInfo: "Sicherheitshinweise",
  returnPolicy: "Rückgabe",
  priceMinor: "Preis",
};

/** Angebotsangaben korrigieren. Preisänderungen nur durch die Administration. Slug bleibt stabil. */
export async function updateProductAdmin(actor: Actor, productId: string, input: unknown) {
  mod(actor);
  const data = productEditSchema.parse(input);
  const p = await db.product.findUnique({
    where: { id: productId },
    select: { id: true, title: true, description: true, category: true, materials: true, dimensions: true, safetyInfo: true, returnPolicy: true, priceMinor: true, currency: true, shop: { select: { ownerId: true } }, variants: { select: { priceDeltaMinor: true } } },
  });
  if (!p) throw fail.notFound();
  assertNotOwn(actor, p.shop.ownerId);
  const { reason, publicNote, price, ...meta } = data;
  let priceMinor = p.priceMinor;
  if (price) {
    const parsed = parseMoneyInput(price);
    if (parsed == null) throw fail.invalid("Bitte einen gültigen Betrag angeben (z.B. 24.50).", { price: "Ungültiger Betrag" });
    if (parsed !== p.priceMinor) {
      if (!hasRole(actor, "ADMIN")) throw fail.forbidden("Preise ändert nur die Administration.");
      if (parsed < 100 || parsed > 5_000_000) throw fail.invalid("Der Preis muss zwischen 1.00 und 50'000.00 liegen.", { price: "Ausserhalb des erlaubten Bereichs" });
      if (p.variants.some((v) => parsed + v.priceDeltaMinor < 100)) throw fail.invalid("Jede Variante muss mindestens 1.00 kosten.", { price: "Variante zu günstig" });
      priceMinor = parsed;
    }
  }
  const next = { ...meta, priceMinor };
  const changed = (Object.keys(next) as (keyof typeof next)[]).filter((k) => p[k] !== next[k]);
  if (!changed.length) throw fail.invalid("Es wurde nichts geändert.");
  await db.$transaction(async (tx) => {
    await tx.product.update({ where: { id: productId }, data: Object.fromEntries(changed.map((k) => [k, next[k]])) });
    await audit(
      {
        actorId: actor.id,
        action: "admin.product_edited",
        targetType: "PRODUCT",
        targetId: productId,
        meta: { fields: changed, ...(changed.includes("priceMinor") ? { priceFrom: p.priceMinor, priceTo: priceMinor, currency: p.currency } : {}), reason },
      },
      tx,
    );
  });
  await notify({
    recipientId: p.shop.ownerId,
    type: "MODERATION",
    bundle: false,
    data: {
      kind: "ACCOUNT",
      title: next.title,
      message: `Die Plattform hat dein Angebot „${next.title}“ angepasst: ${changed.map((k) => PRODUCT_FIELD_LABEL[k]).join(", ")}.`,
      publicNote,
      href: "/studio/shop",
    },
  });
  return { changed: changed.length };
}

/* ───────────────────────────── Produkt: Status ───────────────────────────── */

export type ProductDecision = "PAUSE" | "ACTIVATE" | "DISABLE" | "RESTORE";

/**
 * PAUSE = ausblenden (nicht kaufbar, Verkäufer:in kann wieder aktivieren),
 * DISABLE = entfernen (Verkäufer:in kann nicht mehr bearbeiten), RESTORE nur Administration.
 */
export async function decideProduct(actor: Actor, productId: string, decision: ProductDecision, input: { reason: string; publicNote?: string }) {
  mod(actor);
  const reason = reasonSchema.parse(input.reason);
  const publicNote = publicNoteSchema.parse(input.publicNote ?? "");
  const p = await db.product.findUnique({
    where: { id: productId },
    select: { id: true, title: true, status: true, kind: true, digitalKey: true, publishedAt: true, shop: { select: { ownerId: true, status: true } }, inventory: { select: { onHand: true } } },
  });
  if (!p) throw fail.notFound();
  assertNotOwn(actor, p.shop.ownerId);
  const allowed: Record<ProductDecision, ProductStatus[]> = {
    PAUSE: ["ACTIVE", "SOLD_OUT"],
    ACTIVATE: ["PAUSED"],
    DISABLE: ["DRAFT", "ACTIVE", "PAUSED", "SOLD_OUT"],
    RESTORE: ["DISABLED"],
  };
  if (!allowed[decision].includes(p.status)) throw fail.conflict("Diese Aktion passt nicht zum aktuellen Status.");
  if (decision === "RESTORE" && !hasRole(actor, "ADMIN")) throw fail.forbidden("Entfernte Angebote stellt nur die Administration wieder her.");
  if (decision === "DISABLE" && publicNote.length < 10) throw fail.invalid("Bitte erkläre der Person, warum das Angebot entfernt wird.", { publicNote: "Mindestens 10 Zeichen" });
  if (decision === "ACTIVATE") {
    if (p.shop.status !== "ACTIVE") throw fail.conflict("Der Shop ist nicht aktiv – Produkte können nicht veröffentlicht werden.");
    if (p.kind === "DIGITAL" && !p.digitalKey) throw fail.conflict("Für dieses digitale Produkt fehlt die Datei.");
  }
  const next: ProductStatus =
    decision === "PAUSE" ? "PAUSED" : decision === "DISABLE" ? "DISABLED" : decision === "RESTORE" ? "PAUSED" : p.kind !== "DIGITAL" && isSoldOut(p.inventory) ? "SOLD_OUT" : "ACTIVE";
  await db.$transaction(async (tx) => {
    await tx.product.update({
      where: { id: productId },
      data: { status: next, ...(next !== "ACTIVE" ? { isFeatured: false } : {}), ...(next === "ACTIVE" && !p.publishedAt ? { publishedAt: new Date() } : {}) },
    });
    await audit({ actorId: actor.id, action: `admin.product_${decision.toLowerCase()}`, targetType: "PRODUCT", targetId: productId, meta: { from: p.status, to: next, reason } }, tx);
  });
  const message = {
    PAUSE: `Dein Angebot „${p.title}“ wurde von der Plattform vorübergehend ausgeblendet.`,
    ACTIVATE: `Dein Angebot „${p.title}“ ist wieder sichtbar.`,
    DISABLE: `Dein Angebot „${p.title}“ wurde von der Plattform entfernt und ist nicht mehr kaufbar.`,
    RESTORE: `Dein Angebot „${p.title}“ wurde wiederhergestellt. Es ist pausiert – du kannst es im Studio wieder aktivieren.`,
  }[decision];
  await notify({ recipientId: p.shop.ownerId, type: "MODERATION", bundle: false, data: { kind: "ACCOUNT", title: p.title, message, publicNote, href: "/studio/shop" } });
  return { status: next };
}

export async function setProductFeaturedAdmin(actor: Actor, productId: string, featured: boolean) {
  mod(actor);
  const p = await db.product.findUnique({ where: { id: productId }, select: { status: true, isFeatured: true, shop: { select: { status: true, ownerId: true } } } });
  if (!p) throw fail.notFound();
  assertNotOwn(actor, p.shop.ownerId);
  if (featured && (p.status !== "ACTIVE" || p.shop.status !== "ACTIVE")) throw fail.conflict("Nur aktive Produkte aus aktiven Shops können hervorgehoben werden.");
  if (p.isFeatured === featured) return;
  await db.$transaction(async (tx) => {
    await tx.product.update({ where: { id: productId }, data: { isFeatured: featured } });
    await audit({ actorId: actor.id, action: featured ? "admin.product_featured" : "admin.product_unfeatured", targetType: "PRODUCT", targetId: productId }, tx);
  });
}

/* ───────────────────────────── Bewertungen ───────────────────────────── */

/** Bewertung ausblenden bzw. wieder anzeigen; Durchschnittswerte werden neu berechnet. */
export async function setReviewHiddenAdmin(actor: Actor, reviewId: string, hidden: boolean, input: { reason: string; publicNote?: string }) {
  mod(actor);
  const r = reasonSchema.parse(input.reason);
  const publicNote = publicNoteSchema.parse(input.publicNote ?? "");
  const review = await db.review.findUnique({ where: { id: reviewId }, select: { id: true, state: true, productId: true, authorId: true, order: { select: { shopId: true, shop: { select: { ownerId: true } } } }, product: { select: { title: true } } } });
  if (!review) throw fail.notFound();
  // Weder eigene Bewertungen noch Bewertungen des eigenen Shops
  assertNotOwn(actor, review.authorId, review.order.shop.ownerId);
  if (review.state === "REMOVED") throw fail.conflict("Entfernte Bewertungen werden über den Moderationsfall wiederhergestellt.");
  if (hidden ? review.state !== "PUBLISHED" : review.state !== "HIDDEN") throw fail.conflict("Dieser Zustand lässt sich hier nicht ändern.");
  await db.$transaction(async (tx) => {
    await tx.review.update({ where: { id: reviewId }, data: { state: hidden ? "HIDDEN" : "PUBLISHED" } });
    await recomputeRatings(tx, review.productId, review.order.shopId);
    await audit({ actorId: actor.id, action: hidden ? "admin.review_hidden" : "admin.review_restored", targetType: "REVIEW", targetId: reviewId, meta: { productId: review.productId, reason: r } }, tx);
  });
  await notify({
    recipientId: review.authorId,
    type: "MODERATION",
    bundle: false,
    data: {
      kind: "ACCOUNT",
      title: review.product.title,
      message: hidden ? `Deine Bewertung zu „${review.product.title}“ wurde ausgeblendet.` : `Deine Bewertung zu „${review.product.title}“ ist wieder sichtbar.`,
      publicNote: hidden ? publicNote : "",
      href: "/einstellungen/hilfe-support",
    },
  });
}
