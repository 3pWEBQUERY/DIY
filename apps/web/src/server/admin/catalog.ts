import "server-only";
import { z } from "zod";
import { CATEGORIES, editorialCollectionSchema, SUPPORT_STATUS } from "@werkraum/shared";
import { db, Prisma } from "@/server/db";
import { fail } from "@/server/errors";
import { audit } from "@/server/audit";
import { hasRole } from "@/server/authz";
import { slugify } from "@/lib/utils";
import type { SessionUser } from "@/server/auth/session";

/** Kategorien & Materialien, Redaktion und Support (Admin). */

type Actor = Pick<SessionUser, "id" | "role">;
function mod(actor: Actor) {
  if (!hasRole(actor, "PLATFORM_MODERATOR")) throw fail.forbidden();
}
const isUnique = (e: unknown) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";
const isFk = (e: unknown) => e instanceof Prisma.PrismaClientKnownRequestError && (e.code === "P2003" || e.code === "P2014");

/* ───────────── DIY-Kategorien (statisch, nur Zählung) ───────────── */

export async function categoryCounts() {
  const [projects, tutorials, products, communities, posts] = await Promise.all([
    db.project.groupBy({ by: ["category"], where: { state: "PUBLISHED" }, _count: { _all: true } }),
    db.tutorial.groupBy({ by: ["category"], where: { state: "PUBLISHED" }, _count: { _all: true } }),
    db.product.groupBy({ by: ["category"], where: { status: "ACTIVE" }, _count: { _all: true } }),
    db.community.groupBy({ by: ["category"], where: { state: "PUBLISHED" }, _count: { _all: true } }),
    db.post.groupBy({ by: ["category"], where: { state: "PUBLISHED", category: { not: null } }, _count: { _all: true } }),
  ]);
  const m = (rows: { category: string | null; _count: { _all: number } }[]) => Object.fromEntries(rows.map((r) => [r.category ?? "", r._count._all]));
  const p = m(projects), t = m(tutorials), pr = m(products), c = m(communities), po = m(posts);
  return CATEGORIES.map((cat) => ({ ...cat, projects: p[cat.slug] ?? 0, tutorials: t[cat.slug] ?? 0, products: pr[cat.slug] ?? 0, communities: c[cat.slug] ?? 0, posts: po[cat.slug] ?? 0 }));
}

/* ───────────── Materialdatenbank ───────────── */

export async function listMaterialCatalog(q?: string | null) {
  const where = q ? { name: { contains: q, mode: "insensitive" as const } } : {};
  const [categories, materials, tools] = await Promise.all([
    db.materialCategory.findMany({ orderBy: { name: "asc" }, include: { _count: { select: { materials: true } } } }),
    db.material.findMany({ where, orderBy: { name: "asc" }, take: 300, include: { category: { select: { name: true } }, _count: { select: { projectMaterials: true } } } }),
    db.tool.findMany({ where, orderBy: { name: "asc" }, take: 300, include: { _count: { select: { projectTools: true } } } }),
  ]);
  return { categories, materials, tools };
}

const materialCategorySchema = z.object({ name: z.string().trim().min(2, "Name fehlt").max(80) });
const materialSchema = z.object({
  name: z.string().trim().min(2, "Name fehlt").max(120),
  type: z.string().trim().min(2, "Typ fehlt").max(60),
  categoryId: z.string().min(1, "Kategorie wählen"),
  unit: z.string().trim().min(1).max(20).default("Stk"),
  brand: z.string().trim().max(80).default(""),
  notes: z.string().trim().max(1000).default(""),
  safetyInfo: z.string().trim().max(1000).default(""),
});
const toolSchema = z.object({
  name: z.string().trim().min(2, "Name fehlt").max(120),
  notes: z.string().trim().max(1000).default(""),
  safetyInfo: z.string().trim().max(1000).default(""),
});

export type CatalogEntity = "materialCategory" | "material" | "tool";

export async function upsertCatalog(actor: Actor, entity: CatalogEntity, id: string | null, input: unknown) {
  mod(actor);
  try {
    const row = await db.$transaction(async (tx) => {
      let res: { id: string };
      if (entity === "materialCategory") {
        const d = materialCategorySchema.parse(input);
        res = id
          ? await tx.materialCategory.update({ where: { id }, data: { name: d.name }, select: { id: true } })
          : await tx.materialCategory.create({ data: { name: d.name, slug: slugify(d.name) }, select: { id: true } });
      } else if (entity === "material") {
        const d = materialSchema.parse(input);
        const data = { ...d, brand: d.brand || null };
        res = id
          ? await tx.material.update({ where: { id }, data, select: { id: true } })
          : await tx.material.create({ data: { ...data, slug: `${slugify(d.name, 56)}-${Math.random().toString(36).slice(2, 6)}` }, select: { id: true } });
      } else {
        const d = toolSchema.parse(input);
        res = id
          ? await tx.tool.update({ where: { id }, data: d, select: { id: true } })
          : await tx.tool.create({ data: { ...d, slug: slugify(d.name) }, select: { id: true } });
      }
      await audit({ actorId: actor.id, action: `admin.catalog_${id ? "updated" : "created"}`, targetType: entity.toUpperCase(), targetId: res.id }, tx);
      return res;
    });
    return row;
  } catch (e) {
    if (isUnique(e)) throw fail.conflict("Ein Eintrag mit diesem Namen existiert bereits.");
    throw e;
  }
}

export async function deleteCatalog(actor: Actor, entity: CatalogEntity, id: string) {
  mod(actor);
  try {
    await db.$transaction(async (tx) => {
      if (entity === "materialCategory") {
        const n = await tx.material.count({ where: { categoryId: id } });
        if (n) throw fail.conflict(`Die Kategorie enthält noch ${n} Materialien.`);
        await tx.materialCategory.delete({ where: { id } });
      } else if (entity === "material") await tx.material.delete({ where: { id } });
      else await tx.tool.delete({ where: { id } });
      await audit({ actorId: actor.id, action: "admin.catalog_deleted", targetType: entity.toUpperCase(), targetId: id }, tx);
    });
  } catch (e) {
    if (isFk(e)) throw fail.conflict("Der Eintrag wird noch verwendet.");
    throw e;
  }
}

/* ───────────── Redaktion: EditorialCollection ───────────── */

export async function listCollections() {
  return db.editorialCollection.findMany({ orderBy: [{ isActive: "desc" }, { position: "asc" }, { updatedAt: "desc" }] });
}

export async function getCollection(id: string) {
  return db.editorialCollection.findUnique({ where: { id } });
}

/** Prüft, ob alle referenzierten Inhalte existieren – verhindert tote Kacheln auf „Entdecken“. */
async function resolveItems(items: { type: string; id: string }[]) {
  const ids = (t: string) => items.filter((i) => i.type === t).map((i) => i.id);
  const [p, t, a, pr, c] = await Promise.all([
    db.project.findMany({ where: { id: { in: ids("project") } }, select: { id: true, title: true, state: true } }),
    db.tutorial.findMany({ where: { id: { in: ids("tutorial") } }, select: { id: true, title: true, state: true } }),
    db.blogArticle.findMany({ where: { id: { in: ids("article") } }, select: { id: true, title: true, state: true } }),
    db.product.findMany({ where: { id: { in: ids("product") } }, select: { id: true, title: true, status: true } }),
    db.community.findMany({ where: { id: { in: ids("community") } }, select: { id: true, name: true, state: true } }),
  ]);
  const map = new Map<string, { title: string; live: boolean }>();
  p.forEach((x) => map.set(`project:${x.id}`, { title: x.title, live: x.state === "PUBLISHED" }));
  t.forEach((x) => map.set(`tutorial:${x.id}`, { title: x.title, live: x.state === "PUBLISHED" }));
  a.forEach((x) => map.set(`article:${x.id}`, { title: x.title, live: x.state === "PUBLISHED" }));
  pr.forEach((x) => map.set(`product:${x.id}`, { title: x.title, live: x.status === "ACTIVE" }));
  c.forEach((x) => map.set(`community:${x.id}`, { title: x.name, live: x.state === "PUBLISHED" }));
  return items.map((i) => ({ ...i, ...(map.get(`${i.type}:${i.id}`) ?? { title: null, live: false }), exists: map.has(`${i.type}:${i.id}`) }));
}
export { resolveItems as resolveCollectionItems };

export async function upsertCollection(actor: Actor, id: string | null, input: unknown) {
  mod(actor);
  const d = editorialCollectionSchema.parse(input);
  const resolved = await resolveItems(d.items);
  const missing = resolved.filter((r) => !r.exists);
  if (missing.length) throw fail.invalid(`Nicht gefunden: ${missing.map((m) => `${m.type} ${m.id}`).join(", ")}`, { items: "Mindestens ein Eintrag existiert nicht" });
  const data = { ...d, season: d.season || null, items: d.items as unknown as Prisma.InputJsonValue };
  try {
    return await db.$transaction(async (tx) => {
      const row = id ? await tx.editorialCollection.update({ where: { id }, data }) : await tx.editorialCollection.create({ data });
      await audit({ actorId: actor.id, action: id ? "admin.editorial_updated" : "admin.editorial_created", targetType: "EDITORIAL_COLLECTION", targetId: row.id, meta: { slug: row.slug, items: d.items.length, active: d.isActive } }, tx);
      return row;
    });
  } catch (e) {
    if (isUnique(e)) throw fail.invalid("Dieser Slug ist bereits vergeben.", { slug: "Bereits vergeben" });
    throw e;
  }
}

export async function deleteCollection(actor: Actor, id: string) {
  mod(actor);
  await db.$transaction(async (tx) => {
    const row = await tx.editorialCollection.delete({ where: { id } });
    await audit({ actorId: actor.id, action: "admin.editorial_deleted", targetType: "EDITORIAL_COLLECTION", targetId: id, meta: { slug: row.slug } }, tx);
  });
}

export async function toggleCollection(actor: Actor, id: string, isActive: boolean) {
  mod(actor);
  await db.$transaction(async (tx) => {
    await tx.editorialCollection.update({ where: { id }, data: { isActive } });
    await audit({ actorId: actor.id, action: isActive ? "admin.editorial_activated" : "admin.editorial_deactivated", targetType: "EDITORIAL_COLLECTION", targetId: id }, tx);
  });
}

/* ───────────── Support ───────────── */

export async function listTickets(actor: Actor, status?: string | null) {
  mod(actor);
  const s = (SUPPORT_STATUS as readonly string[]).includes(status ?? "") ? status! : null;
  const [rows, byStatus] = await Promise.all([
    db.supportTicket.findMany({
      where: s ? { status: s } : { status: { not: "CLOSED" } },
      orderBy: { createdAt: s === "CLOSED" ? "desc" : "asc" },
      take: 100,
      include: { user: { select: { id: true, profile: { select: { handle: true } } } } },
    }),
    db.supportTicket.groupBy({ by: ["status"], _count: { _all: true } }),
  ]);
  return { rows, byStatus: Object.fromEntries(byStatus.map((b) => [b.status, b._count._all])) as Record<string, number> };
}

export async function setTicketStatus(actor: Actor, id: string, status: string) {
  mod(actor);
  if (!(SUPPORT_STATUS as readonly string[]).includes(status)) throw fail.invalid("Unbekannter Status.");
  await db.$transaction(async (tx) => {
    const t = await tx.supportTicket.update({ where: { id }, data: { status } });
    await audit({ actorId: actor.id, action: "admin.support_status", targetType: "SUPPORT_TICKET", targetId: id, meta: { status, topic: t.topic } }, tx);
  });
}
