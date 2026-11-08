import "server-only";
import { shopSetupSchema, RESERVED_HANDLES } from "@werkraum/shared";
import { db, type Prisma, type Tx } from "@/server/db";
import { fail } from "@/server/errors";
import { audit } from "@/server/audit";
import { hasRole } from "@/server/authz";
import { isBlockedBetween } from "@/server/visibility";
import type { SessionUser } from "@/server/auth/session";
import { accountStatus, appUrl, createDashboardLink, createExpressAccount, createOnboardingLink, paymentsMode, retrieveAccount, type Stripe } from "./stripe";
import { requireFlag } from "@/server/flags";

/**
 * Shop-Eröffnung & Verkäuferverifizierung (PRD §13.2).
 * DRAFT → (Antrag) PENDING_VERIFICATION → (Stripe: charges + payouts aktiv ODER manuelle
 * Freigabe durch Admin) ACTIVE. Bei Aktivierung erhält das Konto die Rolle VERIFIED_SELLER.
 */

export const VERIFIED_SELLER = "VERIFIED_SELLER";

const shopWithVerification = { verification: true } satisfies Prisma.ShopInclude;
export type ShopWithVerification = Prisma.ShopGetPayload<{ include: typeof shopWithVerification }>;

export async function getMyShop(userId: string) {
  return db.shop.findUnique({ where: { ownerId: userId }, include: shopWithVerification });
}

/** Erzwingt einen eigenen Shop (beliebiger Status ausser gesperrt, falls `writable`). */
export async function requireOwnShop(user: Pick<SessionUser, "id">, opts: { writable?: boolean } = {}) {
  const shop = await db.shop.findUnique({ where: { ownerId: user.id } });
  if (!shop) throw fail.forbidden("Du hast noch keinen Shop. Eröffne ihn im Studio unter „Shopverwaltung“.");
  if (opts.writable && shop.status === "SUSPENDED") throw fail.forbidden("Dein Shop ist gesperrt. Details findest du in deinen Benachrichtigungen.");
  return shop;
}

export async function isShopSlugAvailable(slug: string, exceptShopId?: string) {
  if (RESERVED_HANDLES.has(slug)) return false;
  const s = await db.shop.findUnique({ where: { slug }, select: { id: true } });
  return !s || s.id === exceptShopId;
}

/**
 * Wizard speichern. `submit` stellt den Antrag (DRAFT → PENDING_VERIFICATION).
 * Nach der Aktivierung bleibt der Slug stabil, damit Produktlinks nicht brechen.
 */
export async function saveShop(user: SessionUser, input: unknown, opts: { submit?: boolean } = {}) {
  const data = shopSetupSchema.parse(input);
  await requireFlag("marketplace", user.id);
  if (!user.emailVerifiedAt && opts.submit) throw fail.forbidden("Bitte bestätige zuerst deine E-Mail-Adresse.");
  const existing = await db.shop.findUnique({ where: { ownerId: user.id }, include: shopWithVerification });
  if (existing?.status === "SUSPENDED") throw fail.forbidden("Dein Shop ist gesperrt.");
  const lockSlug = existing && existing.status !== "DRAFT";
  const slug = lockSlug ? existing.slug : data.slug;
  if (!lockSlug && !(await isShopSlugAvailable(slug, existing?.id))) throw fail.invalid("Diese Shop-Adresse ist bereits vergeben.", { slug: "Bereits vergeben" });

  const verification = {
    legalName: data.legalName,
    businessName: data.sellerType === "BUSINESS" ? data.businessName : null,
    vatId: data.sellerType === "BUSINESS" ? data.vatId || null : null,
    addressLine: data.addressLine,
    postalCode: data.postalCode,
    city: data.city,
    country: data.country,
  };
  const shopData = {
    name: data.name,
    slug,
    tagline: data.tagline,
    description: data.description,
    sellerType: data.sellerType,
    country: data.country,
    currency: "CHF",
    shippingPolicy: data.shippingPolicy,
    returnPolicy: data.returnPolicy,
    processingDays: data.processingDays,
  };

  return db.$transaction(async (tx) => {
    const shop = existing
      ? await tx.shop.update({ where: { id: existing.id }, data: shopData })
      : await tx.shop.create({ data: { ...shopData, ownerId: user.id, status: "DRAFT" } });
    await tx.sellerVerification.upsert({
      where: { shopId: shop.id },
      create: { shopId: shop.id, ...verification },
      update: verification,
    });
    if (opts.submit && shop.status === "DRAFT") {
      await tx.shop.update({ where: { id: shop.id }, data: { status: "PENDING_VERIFICATION" } });
      await tx.sellerVerification.update({ where: { shopId: shop.id }, data: { state: "PENDING" } });
      // Bereits verifiziertes Stripe-Konto (z.B. erneuter Antrag) → direkt aktivieren
      if (shop.chargesEnabled && shop.payoutsEnabled) await activateShop(tx, shop.id, null, "stripe");
    }
    return tx.shop.findUniqueOrThrow({ where: { id: shop.id }, include: shopWithVerification });
  });
}

/** Aktiviert einen Shop und vergibt die Verkäuferrolle (idempotent). */
export async function activateShop(tx: Tx, shopId: string, actorId: string | null, via: "stripe" | "manual" | "simulated") {
  const shop = await tx.shop.update({ where: { id: shopId }, data: { status: "ACTIVE" } });
  await tx.sellerVerification.upsert({
    where: { shopId },
    create: { shopId, state: "VERIFIED", reviewedAt: new Date(), reviewedBy: actorId },
    update: { state: "VERIFIED", reviewedAt: new Date(), reviewedBy: actorId ?? undefined },
  });
  const role = await tx.roleAssignment.findFirst({ where: { userId: shop.ownerId, role: VERIFIED_SELLER, scopeType: null, scopeId: null }, select: { id: true } });
  if (!role) await tx.roleAssignment.create({ data: { userId: shop.ownerId, role: VERIFIED_SELLER, grantedBy: actorId ?? `system:${via}` } });
  return shop;
}

/* ───────────────────────── Stripe Connect Onboarding ───────────────────────── */

/** Legt bei Bedarf das Express-Konto an und liefert den Onboarding-Link. */
export async function startStripeOnboarding(user: SessionUser) {
  if (paymentsMode() !== "stripe") throw fail.unavailable("Zahlungen sind noch nicht aktiviert. Die Verifizierung über Stripe ist deshalb noch nicht möglich.");
  const shop = await requireOwnShop(user, { writable: true });
  if (shop.status === "DRAFT") throw fail.invalid("Bitte reiche zuerst deine Shop-Angaben ein.");
  let accountId = shop.stripeAccountId;
  if (!accountId) {
    const account = await createExpressAccount({
      shopId: shop.id,
      email: user.email,
      country: shop.country,
      sellerType: shop.sellerType,
      shopUrl: appUrl(`/markt/${shop.slug}`),
      shopName: shop.name,
    });
    accountId = account.id;
    await db.shop.update({ where: { id: shop.id }, data: { stripeAccountId: accountId } });
    await db.sellerVerification.update({ where: { shopId: shop.id }, data: { providerRef: accountId, state: "PENDING" } });
  }
  return createOnboardingLink(accountId);
}

/** Express-Dashboard (Auszahlungen, Bankkonto) für verifizierte Verkäufer. */
export async function stripeDashboardLink(user: SessionUser) {
  if (paymentsMode() !== "stripe") throw fail.unavailable("Zahlungen sind noch nicht aktiviert.");
  const shop = await requireOwnShop(user);
  if (!shop.stripeAccountId) throw fail.invalid("Es ist noch kein Auszahlungskonto verbunden.");
  return createDashboardLink(shop.stripeAccountId);
}

/** Status direkt bei Stripe abfragen (Rückkehr aus dem Onboarding). */
export async function refreshStripeStatus(user: SessionUser) {
  if (paymentsMode() !== "stripe") return getMyShop(user.id);
  const shop = await requireOwnShop(user);
  if (!shop.stripeAccountId) return getMyShop(user.id);
  const account = await retrieveAccount(shop.stripeAccountId);
  await applyAccountStatus(account);
  return getMyShop(user.id);
}

/** Webhook `account.updated` bzw. manuelle Aktualisierung: Verifizierungsstatus übernehmen. */
export async function applyAccountStatus(account: Stripe.Account) {
  const s = accountStatus(account);
  const shop = await db.shop.findUnique({ where: { stripeAccountId: s.accountId }, include: shopWithVerification });
  if (!shop) return null;
  return db.$transaction(async (tx) => {
    await tx.shop.update({ where: { id: shop.id }, data: { chargesEnabled: s.chargesEnabled, payoutsEnabled: s.payoutsEnabled } });
    const verified = s.chargesEnabled && s.payoutsEnabled && s.detailsSubmitted;
    const rejected = !!s.disabledReason?.startsWith("rejected");
    const notes = s.disabledReason ? `Stripe: ${s.disabledReason}` : s.currentlyDue ? `Stripe: ${s.currentlyDue} Angaben ausstehend` : "";
    // Nur eingereichte Anträge werden automatisch aktiviert (abgelehnte Shops stehen wieder auf DRAFT).
    if (verified && shop.status === "PENDING_VERIFICATION") {
      await activateShop(tx, shop.id, null, "stripe");
      await tx.sellerVerification.update({ where: { shopId: shop.id }, data: { providerRef: s.accountId, notes } });
    } else {
      const state = verified ? "VERIFIED" : rejected ? "REJECTED" : shop.verification?.state === "NOT_STARTED" && !s.detailsSubmitted ? "NOT_STARTED" : "PENDING";
      await tx.sellerVerification.upsert({
        where: { shopId: shop.id },
        create: { shopId: shop.id, state, providerRef: s.accountId, notes },
        update: { state, providerRef: s.accountId, notes },
      });
    }
    return tx.shop.findUniqueOrThrow({ where: { id: shop.id } });
  });
}

/** Nur Entwicklung ohne Stripe: Verifizierung simulieren, um den Ablauf zu testen. */
export async function simulateVerification(user: SessionUser) {
  if (paymentsMode() !== "simulated") throw fail.forbidden("Nur im Testmodus verfügbar.");
  const shop = await requireOwnShop(user, { writable: true });
  if (shop.status === "DRAFT") throw fail.invalid("Bitte reiche zuerst deine Shop-Angaben ein.");
  return db.$transaction(async (tx) => {
    await tx.shop.update({ where: { id: shop.id }, data: { chargesEnabled: true, payoutsEnabled: true } });
    await tx.sellerVerification.update({ where: { shopId: shop.id }, data: { notes: "Testmodus: Verifizierung simuliert" } });
    return activateShop(tx, shop.id, user.id, "simulated");
  });
}

/* ───────────────────────── Administration ───────────────────────── */

/**
 * Manuelle Prüfung durch Admins (§13.2, §24.3 – auditpflichtig).
 * Freigabe aktiviert den Shop; Ablehnung setzt ihn auf DRAFT zurück.
 */
export async function reviewShopVerification(admin: SessionUser, shopId: string, decision: "APPROVE" | "REJECT", note = "") {
  if (!hasRole(admin, "ADMIN")) throw fail.forbidden();
  const shop = await db.shop.findUnique({ where: { id: shopId }, select: { id: true, status: true, ownerId: true } });
  if (!shop) throw fail.notFound();
  if (shop.status === "SUSPENDED") throw fail.conflict("Gesperrte Shops werden über die Moderation entsperrt.");
  return db.$transaction(async (tx) => {
    if (decision === "APPROVE") {
      await activateShop(tx, shopId, admin.id, "manual");
      await tx.sellerVerification.update({ where: { shopId }, data: { notes: note.slice(0, 1000) } });
    } else {
      await tx.shop.update({ where: { id: shopId }, data: { status: "DRAFT" } });
      await tx.sellerVerification.upsert({
        where: { shopId },
        create: { shopId, state: "REJECTED", reviewedBy: admin.id, reviewedAt: new Date(), notes: note.slice(0, 1000) },
        update: { state: "REJECTED", reviewedBy: admin.id, reviewedAt: new Date(), notes: note.slice(0, 1000) },
      });
    }
    await audit({ actorId: admin.id, action: decision === "APPROVE" ? "shop.verification.approve" : "shop.verification.reject", targetType: "Shop", targetId: shopId, meta: { from: shop.status } }, tx);
    return tx.shop.findUniqueOrThrow({ where: { id: shopId }, include: shopWithVerification });
  });
}

/** Shops in Prüfung (für die Admin-Oberfläche). */
export async function listShopsAwaitingReview(take = 50) {
  return db.shop.findMany({
    where: { status: "PENDING_VERIFICATION" },
    include: { verification: true, owner: { select: { email: true, profile: { select: { handle: true, displayName: true } } } } },
    orderBy: { updatedAt: "asc" },
    take,
  });
}

/* ───────────────────────── Pausieren ───────────────────────── */

export async function setShopPaused(user: SessionUser, paused: boolean) {
  const shop = await requireOwnShop(user, { writable: true });
  if (paused && shop.status !== "ACTIVE") throw fail.invalid("Nur aktive Shops können pausiert werden.");
  if (!paused && shop.status !== "PAUSED") throw fail.invalid("Der Shop ist nicht pausiert.");
  return db.shop.update({ where: { id: shop.id }, data: { status: paused ? "PAUSED" : "ACTIVE" } });
}

/* ───────────────────────── Öffentlich ───────────────────────── */

const publicShopInclude = {
  verification: { select: { legalName: true, businessName: true, vatId: true, addressLine: true, postalCode: true, city: true, country: true, state: true } },
  owner: { select: { id: true, status: true, createdAt: true, profile: { select: { handle: true, displayName: true, avatarUrl: true, bio: true, region: true, followerCount: true } } } },
  _count: { select: { products: { where: { status: { in: ["ACTIVE", "SOLD_OUT"] } } } } },
} satisfies Prisma.ShopInclude;

export type PublicShop = Prisma.ShopGetPayload<{ include: typeof publicShopInclude }>;

/** Öffentliche Shopseite – nur aktive/pausierte Shops, wechselseitige Blockierungen beachtet. */
export async function getPublicShop(slug: string, viewerId: string | null | undefined) {
  const shop = await db.shop.findUnique({ where: { slug }, include: publicShopInclude });
  if (!shop || !shop.owner.profile) return null;
  const isOwner = viewerId === shop.ownerId;
  if (!isOwner && !["ACTIVE", "PAUSED"].includes(shop.status)) return null;
  if (!isOwner && !["ACTIVE", "SUSPENDED"].includes(shop.owner.status)) return null;
  if (viewerId && !isOwner && (await isBlockedBetween(viewerId, shop.ownerId))) return null;
  return { ...shop, isOwner };
}

export type ShopCardData = {
  id: string;
  slug: string;
  name: string;
  tagline: string;
  country: string;
  ratingAvg: number;
  ratingCount: number;
  salesCount: number;
  productCount: number;
  owner: { handle: string; displayName: string; avatarUrl: string | null };
  covers: { id: string; url: string | null; category: string }[];
};

/** „Shops entdecken“ – ruhig sortiert nach Aktivität und Bewertungen, keine bezahlten Platzierungen. */
export async function listShops(opts: { take?: number; viewerId?: string | null; category?: string; ownerIds?: string[] } = {}): Promise<ShopCardData[]> {
  let blocked: string[] = [];
  if (opts.viewerId) {
    const rows = await db.userBlock.findMany({ where: { OR: [{ blockerId: opts.viewerId }, { blockedId: opts.viewerId }] }, select: { blockerId: true, blockedId: true } });
    blocked = rows.map((b) => (b.blockerId === opts.viewerId ? b.blockedId : b.blockerId));
  }
  const productWhere: Prisma.ProductWhereInput = { status: "ACTIVE", ...(opts.category ? { category: opts.category } : {}) };
  const shops = await db.shop.findMany({
    where: {
      status: "ACTIVE",
      owner: { status: { in: ["ACTIVE", "SUSPENDED"] } },
      ...(blocked.length || opts.ownerIds ? { ownerId: { ...(blocked.length ? { notIn: blocked } : {}), ...(opts.ownerIds ? { in: opts.ownerIds } : {}) } } : {}),
      products: { some: productWhere },
    },
    orderBy: [{ salesCount: "desc" }, { ratingCount: "desc" }, { createdAt: "desc" }],
    take: opts.take ?? 8,
    select: {
      id: true,
      slug: true,
      name: true,
      tagline: true,
      country: true,
      ratingAvg: true,
      ratingCount: true,
      salesCount: true,
      owner: { select: { profile: { select: { handle: true, displayName: true, avatarUrl: true } } } },
      _count: { select: { products: { where: { status: "ACTIVE" } } } },
      products: { where: productWhere, orderBy: { publishedAt: "desc" }, take: 3, select: { id: true, coverUrl: true, category: true } },
    },
  });
  return shops.map((s) => ({
    id: s.id,
    slug: s.slug,
    name: s.name,
    tagline: s.tagline,
    country: s.country,
    ratingAvg: s.ratingAvg,
    ratingCount: s.ratingCount,
    salesCount: s.salesCount,
    productCount: s._count.products,
    owner: { handle: s.owner.profile?.handle ?? "", displayName: s.owner.profile?.displayName ?? s.name, avatarUrl: s.owner.profile?.avatarUrl ?? null },
    covers: s.products.map((p) => ({ id: p.id, url: p.coverUrl, category: p.category })),
  }));
}
