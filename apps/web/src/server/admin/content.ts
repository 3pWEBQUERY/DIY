import "server-only";
import { z } from "zod";
import { db, type Prisma } from "@/server/db";
import { fail } from "@/server/errors";
import { audit } from "@/server/audit";
import { notify } from "@/server/notifications";
import { hasRole } from "@/server/authz";
import type { SessionUser } from "@/server/auth/session";

/**
 * Inhalte, Communities und Verkäufer (Admin). Direkte Eingriffe ausserhalb eines
 * Moderationsfalls bleiben die Ausnahme – deshalb immer mit Begründung und Audit.
 */

type Actor = Pick<SessionUser, "id" | "role">;
const PER_PAGE = 40;

function mod(actor: Actor) {
  if (!hasRole(actor, "PLATFORM_MODERATOR")) throw fail.forbidden();
}

const stateFilter = z.enum(["PUBLISHED", "DRAFT", "HIDDEN", "REMOVED"]).nullable().catch(null);

export async function listProjects(actor: Actor, opts: { q?: string | null; state?: string | null; featured?: boolean; page?: number }) {
  mod(actor);
  const page = Math.max(1, opts.page ?? 1);
  const state = stateFilter.parse(opts.state ?? null);
  const where: Prisma.ProjectWhereInput = {
    ...(state ? { state } : {}),
    ...(opts.featured ? { isFeatured: true } : {}),
    ...(opts.q ? { OR: [{ title: { contains: opts.q, mode: "insensitive" } }, { id: opts.q }, { owner: { profile: { handle: opts.q.replace(/^@/, "").toLowerCase() } } }] } : {}),
  };
  const [rows, total] = await Promise.all([
    db.project.findMany({
      where,
      orderBy: [{ isFeatured: "desc" }, { updatedAt: "desc" }],
      skip: (page - 1) * PER_PAGE,
      take: PER_PAGE,
      select: {
        id: true,
        title: true,
        slug: true,
        category: true,
        status: true,
        state: true,
        visibility: true,
        isFeatured: true,
        likeCount: true,
        saveCount: true,
        remixCount: true,
        viewCount: true,
        updatedAt: true,
        owner: { select: { profile: { select: { handle: true, displayName: true } } } },
        _count: { select: { materials: true, tutorials: true } },
      },
    }),
    db.project.count({ where }),
  ]);
  return { rows, total, page, pages: Math.max(1, Math.ceil(total / PER_PAGE)) };
}

export async function listTutorials(actor: Actor, opts: { q?: string | null; state?: string | null; featured?: boolean; page?: number }) {
  mod(actor);
  const page = Math.max(1, opts.page ?? 1);
  const state = stateFilter.parse(opts.state ?? null);
  const where: Prisma.TutorialWhereInput = {
    ...(state ? { state } : {}),
    ...(opts.featured ? { isFeatured: true } : {}),
    ...(opts.q ? { OR: [{ title: { contains: opts.q, mode: "insensitive" } }, { id: opts.q }, { author: { profile: { handle: opts.q.replace(/^@/, "").toLowerCase() } } }] } : {}),
  };
  const [rows, total] = await Promise.all([
    db.tutorial.findMany({
      where,
      orderBy: [{ isFeatured: "desc" }, { updatedAt: "desc" }],
      skip: (page - 1) * PER_PAGE,
      take: PER_PAGE,
      select: {
        id: true,
        title: true,
        slug: true,
        category: true,
        state: true,
        difficulty: true,
        isPaid: true,
        isFeatured: true,
        safetyKinds: true,
        viewCount: true,
        saveCount: true,
        completionCount: true,
        updatedAt: true,
        author: { select: { profile: { select: { handle: true, displayName: true } } } },
      },
    }),
    db.tutorial.count({ where }),
  ]);
  return { rows, total, page, pages: Math.max(1, Math.ceil(total / PER_PAGE)) };
}

export type ContentKind = "PROJECT" | "TUTORIAL" | "COMMUNITY";

export async function setFeatured(actor: Actor, kind: ContentKind, id: string, featured: boolean) {
  mod(actor);
  await db.$transaction(async (tx) => {
    if (kind === "PROJECT") {
      const p = await tx.project.findUnique({ where: { id }, select: { state: true, visibility: true } });
      if (!p) throw fail.notFound();
      if (featured && (p.state !== "PUBLISHED" || p.visibility !== "PUBLIC")) throw fail.conflict("Nur öffentliche, veröffentlichte Projekte können hervorgehoben werden.");
      await tx.project.update({ where: { id }, data: { isFeatured: featured } });
    } else if (kind === "TUTORIAL") {
      const t = await tx.tutorial.findUnique({ where: { id }, select: { state: true } });
      if (!t) throw fail.notFound();
      if (featured && t.state !== "PUBLISHED") throw fail.conflict("Nur veröffentlichte Anleitungen können hervorgehoben werden.");
      await tx.tutorial.update({ where: { id }, data: { isFeatured: featured } });
    } else {
      const c = await tx.community.findUnique({ where: { id }, select: { state: true } });
      if (!c) throw fail.notFound();
      if (featured && c.state !== "PUBLISHED") throw fail.conflict("Nur sichtbare Communities können hervorgehoben werden.");
      await tx.community.update({ where: { id }, data: { isFeatured: featured } });
    }
    await audit({ actorId: actor.id, action: featured ? "admin.content_featured" : "admin.content_unfeatured", targetType: kind, targetId: id }, tx);
  });
}

/** Ausblenden bzw. wieder sichtbar machen (ohne Fall). Entfernen nur über einen Moderationsfall. */
export async function setContentHidden(actor: Actor, kind: ContentKind, id: string, hidden: boolean, reason: string) {
  mod(actor);
  const r = z.string().trim().min(5, "Bitte begründe den Eingriff").max(500).parse(reason);
  const state = hidden ? "HIDDEN" : "PUBLISHED";
  const owner = await db.$transaction(async (tx) => {
    let ownerId: string;
    let title: string;
    if (kind === "PROJECT") {
      const p = await tx.project.findUnique({ where: { id }, select: { state: true, ownerId: true, title: true } });
      if (!p) throw fail.notFound();
      if (p.state === "REMOVED" || (!hidden && p.state !== "HIDDEN")) throw fail.conflict("Dieser Zustand lässt sich hier nicht ändern.");
      await tx.project.update({ where: { id }, data: { state, ...(hidden ? { isFeatured: false } : {}) } });
      ownerId = p.ownerId;
      title = p.title;
    } else if (kind === "TUTORIAL") {
      const t = await tx.tutorial.findUnique({ where: { id }, select: { state: true, authorId: true, title: true } });
      if (!t) throw fail.notFound();
      if (t.state === "REMOVED" || (!hidden && t.state !== "HIDDEN")) throw fail.conflict("Dieser Zustand lässt sich hier nicht ändern.");
      await tx.tutorial.update({ where: { id }, data: { state, ...(hidden ? { isFeatured: false } : {}) } });
      ownerId = t.authorId;
      title = t.title;
    } else {
      const c = await tx.community.findUnique({ where: { id }, select: { state: true, ownerId: true, name: true } });
      if (!c) throw fail.notFound();
      if (c.state === "REMOVED" || (!hidden && c.state !== "HIDDEN")) throw fail.conflict("Dieser Zustand lässt sich hier nicht ändern.");
      await tx.community.update({ where: { id }, data: { state, ...(hidden ? { isFeatured: false } : {}) } });
      ownerId = c.ownerId;
      title = c.name;
    }
    await audit({ actorId: actor.id, action: hidden ? "admin.content_hidden" : "admin.content_restored", targetType: kind, targetId: id, meta: { reason: r } }, tx);
    return { ownerId, title };
  });
  await notify({
    recipientId: owner.ownerId,
    type: "MODERATION",
    bundle: false,
    data: {
      kind: "ACCOUNT",
      title: owner.title,
      message: hidden ? `Dein Inhalt „${owner.title}“ wurde vorübergehend ausgeblendet.` : `Dein Inhalt „${owner.title}“ ist wieder sichtbar.`,
      publicNote: hidden ? r : "",
      href: "/einstellungen/hilfe-support",
    },
  });
}

export async function listCommunities(actor: Actor, opts: { q?: string | null; state?: string | null; page?: number }) {
  mod(actor);
  const page = Math.max(1, opts.page ?? 1);
  const state = stateFilter.parse(opts.state ?? null);
  const where: Prisma.CommunityWhereInput = {
    ...(state ? { state } : {}),
    ...(opts.q ? { OR: [{ name: { contains: opts.q, mode: "insensitive" } }, { slug: opts.q.toLowerCase() }] } : {}),
  };
  const [rows, total] = await Promise.all([
    db.community.findMany({
      where,
      orderBy: [{ isFeatured: "desc" }, { memberCount: "desc" }],
      skip: (page - 1) * PER_PAGE,
      take: PER_PAGE,
      select: {
        id: true,
        name: true,
        slug: true,
        category: true,
        visibility: true,
        state: true,
        isFeatured: true,
        memberCount: true,
        region: true,
        createdAt: true,
        owner: { select: { profile: { select: { handle: true } } } },
        _count: { select: { posts: true } },
      },
    }),
    db.community.count({ where }),
  ]);
  return { rows, total, page, pages: Math.max(1, Math.ceil(total / PER_PAGE)) };
}

/* ───────────────────────────── Verkäufer ───────────────────────────── */

export async function listShops(actor: Actor, opts: { status?: string | null; q?: string | null; page?: number }) {
  mod(actor);
  const page = Math.max(1, opts.page ?? 1);
  const status = z.enum(["DRAFT", "PENDING_VERIFICATION", "ACTIVE", "PAUSED", "SUSPENDED"]).nullable().catch(null).parse(opts.status ?? null);
  const where: Prisma.ShopWhereInput = {
    ...(status ? { status } : {}),
    ...(opts.q ? { OR: [{ name: { contains: opts.q, mode: "insensitive" } }, { slug: opts.q.toLowerCase() }] } : {}),
  };
  const [rows, total, byStatus] = await Promise.all([
    db.shop.findMany({
      where,
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      skip: (page - 1) * PER_PAGE,
      take: PER_PAGE,
      select: {
        id: true,
        name: true,
        slug: true,
        status: true,
        sellerType: true,
        country: true,
        chargesEnabled: true,
        payoutsEnabled: true,
        ratingAvg: true,
        ratingCount: true,
        createdAt: true,
        owner: { select: { id: true, profile: { select: { handle: true } } } },
        verification: { select: { state: true, businessName: true, reviewedAt: true } },
        _count: { select: { products: true } },
      },
    }),
    db.shop.count({ where }),
    db.shop.groupBy({ by: ["status"], _count: { _all: true } }),
  ]);
  return { rows, total, page, pages: Math.max(1, Math.ceil(total / PER_PAGE)), byStatus: Object.fromEntries(byStatus.map((b) => [b.status, b._count._all])) as Record<string, number> };
}

export type ShopDecision = "APPROVE" | "PAUSE" | "SUSPEND" | "REACTIVATE";

export async function decideShop(actor: Actor, shopId: string, decision: ShopDecision, note: string) {
  mod(actor);
  const n = z.string().trim().min(5, "Bitte begründe die Entscheidung").max(1000).parse(note);
  const shop = await db.shop.findUnique({ where: { id: shopId }, select: { id: true, status: true, ownerId: true, name: true } });
  if (!shop) throw fail.notFound();
  const next = { APPROVE: "ACTIVE", PAUSE: "PAUSED", SUSPEND: "SUSPENDED", REACTIVATE: "ACTIVE" } as const;
  const allowed: Record<ShopDecision, string[]> = {
    APPROVE: ["PENDING_VERIFICATION", "DRAFT"],
    PAUSE: ["ACTIVE"],
    SUSPEND: ["ACTIVE", "PAUSED", "PENDING_VERIFICATION"],
    REACTIVATE: ["PAUSED", "SUSPENDED"],
  };
  if (!allowed[decision].includes(shop.status)) throw fail.conflict("Diese Entscheidung passt nicht zum aktuellen Status.");
  if (decision === "REACTIVATE" && shop.status === "SUSPENDED" && !hasRole(actor, "ADMIN")) throw fail.forbidden("Gesperrte Shops reaktiviert nur die Administration.");
  await db.$transaction(async (tx) => {
    await tx.shop.update({ where: { id: shopId }, data: { status: next[decision] } });
    if (decision === "APPROVE") {
      await tx.sellerVerification.upsert({
        where: { shopId },
        create: { shopId, state: "VERIFIED", reviewedBy: actor.id, reviewedAt: new Date(), notes: n },
        update: { state: "VERIFIED", reviewedBy: actor.id, reviewedAt: new Date(), notes: n },
      });
      await tx.roleAssignment.upsert({
        where: { userId_role_scopeType_scopeId: { userId: shop.ownerId, role: "VERIFIED_SELLER", scopeType: "SHOP", scopeId: shopId } },
        create: { userId: shop.ownerId, role: "VERIFIED_SELLER", scopeType: "SHOP", scopeId: shopId, grantedBy: actor.id },
        update: {},
      });
    }
    if (decision === "SUSPEND") {
      await tx.product.updateMany({ where: { shopId, status: "ACTIVE" }, data: { status: "PAUSED" } });
    }
    await audit({ actorId: actor.id, action: `admin.shop_${decision.toLowerCase()}`, targetType: "SHOP", targetId: shopId, meta: { from: shop.status, to: next[decision], note: n } }, tx);
  });
  const message = {
    APPROVE: `Dein Shop „${shop.name}“ wurde geprüft und ist jetzt aktiv.`,
    PAUSE: `Dein Shop „${shop.name}“ wurde vorübergehend pausiert.`,
    SUSPEND: `Dein Shop „${shop.name}“ wurde gesperrt. Deine Angebote sind nicht mehr kaufbar.`,
    REACTIVATE: `Dein Shop „${shop.name}“ ist wieder aktiv.`,
  }[decision];
  await notify({ recipientId: shop.ownerId, type: "MODERATION", bundle: false, data: { kind: "ACCOUNT", message, publicNote: decision === "APPROVE" || decision === "REACTIVATE" ? "" : n, href: "/studio/shop" } });
}
