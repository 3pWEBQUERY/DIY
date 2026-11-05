import "server-only";
import { z } from "zod";
import { CATEGORIES, categoryBySlug } from "@werkraum/shared";
import { db } from "@/server/db";
import { fail } from "@/server/errors";
import { audit } from "@/server/audit";
import { hasRole } from "@/server/authz";
import { mergeCategories } from "@/server/categories/merge";
import type { SessionUser } from "@/server/auth/session";

/**
 * Verwaltung der DIY-Kategorien (Overrides via CategorySetting) und Detailansichten
 * für Materialien & Werkzeuge inkl. Zusammenführen von Dubletten.
 * Lesen: Moderation. Kategorien ändern und Zusammenführen: Administration.
 */

type Actor = Pick<SessionUser, "id" | "role">;
const RECENT = 8;

function mod(actor: Actor) {
  if (!hasRole(actor, "PLATFORM_MODERATOR")) throw fail.forbidden();
}
function admin(actor: Actor, m = "Kategorien verwaltet nur die Administration.") {
  if (!hasRole(actor, "ADMIN")) throw fail.forbidden(m);
}
function knownSlug(slug: string) {
  const c = categoryBySlug(slug);
  if (!c) throw fail.notFound("Unbekannte Kategorie.");
  return c;
}

const reasonSchema = z.string().trim().min(5, "Bitte begründe die Änderung (mind. 5 Zeichen)").max(1000);

/* ───────────── Kategorien: Lesen ───────────── */

async function freshCategories() {
  const rows = await db.categorySetting.findMany();
  return mergeCategories(new Map(rows.map((r) => [r.slug, r])));
}

export async function getCategoryAdminDetail(actor: Actor, slug: string) {
  mod(actor);
  knownSlug(slug);
  const [all, setting] = await Promise.all([freshCategories(), db.categorySetting.findUnique({ where: { slug } })]);
  const category = all.find((c) => c.slug === slug)!;
  const where = { category: slug };

  const [projects, projectsLive, tutorials, tutorialsLive, posts, postsLive, products, productsLive, communities, communitiesLive] = await Promise.all([
    db.project.count({ where }),
    db.project.count({ where: { ...where, state: "PUBLISHED" } }),
    db.tutorial.count({ where }),
    db.tutorial.count({ where: { ...where, state: "PUBLISHED" } }),
    db.post.count({ where }),
    db.post.count({ where: { ...where, state: "PUBLISHED" } }),
    db.product.count({ where }),
    db.product.count({ where: { ...where, status: "ACTIVE" } }),
    db.community.count({ where }),
    db.community.count({ where: { ...where, state: "PUBLISHED" } }),
  ]);

  const handle = { select: { profile: { select: { handle: true, displayName: true } } } } as const;
  const [recentProjects, recentTutorials, recentProducts, recentCommunities, recentAudit, updatedBy] = await Promise.all([
    db.project.findMany({ where, orderBy: { createdAt: "desc" }, take: RECENT, select: { id: true, title: true, state: true, visibility: true, createdAt: true, owner: handle } }),
    db.tutorial.findMany({ where, orderBy: { createdAt: "desc" }, take: RECENT, select: { id: true, title: true, state: true, createdAt: true, author: handle } }),
    db.product.findMany({ where, orderBy: { createdAt: "desc" }, take: RECENT, select: { id: true, title: true, status: true, createdAt: true, priceMinor: true, currency: true, shop: { select: { name: true } } } }),
    db.community.findMany({ where, orderBy: { createdAt: "desc" }, take: RECENT, select: { id: true, name: true, slug: true, state: true, memberCount: true, createdAt: true } }),
    db.auditEvent.findMany({
      where: { targetType: "CATEGORY", targetId: slug },
      orderBy: { seq: "desc" },
      take: 20,
      select: { seq: true, action: true, meta: true, createdAt: true, actor: { select: { profile: { select: { handle: true } } } } },
    }),
    setting?.updatedById ? db.userProfile.findUnique({ where: { userId: setting.updatedById }, select: { handle: true } }) : Promise.resolve(null),
  ]);

  return {
    category,
    setting,
    updatedBy,
    activeCount: all.filter((c) => c.isActive).length,
    total: all.length,
    counts: { projects, projectsLive, tutorials, tutorialsLive, posts, postsLive, products, productsLive, communities, communitiesLive },
    recent: { projects: recentProjects, tutorials: recentTutorials, products: recentProducts, communities: recentCommunities },
    recentAudit,
  };
}

/* ───────────── Kategorien: Ändern ───────────── */

const optText = (max: number, label: string) =>
  z
    .string()
    .trim()
    .max(max, `${label}: höchstens ${max} Zeichen`)
    .optional()
    .transform((v) => (v ? v : null));

const categorySettingSchema = z.object({
  name: optText(80, "Name"),
  short: optText(24, "Kurzname"),
  description: optText(500, "Beschreibung"),
  sortOrder: z
    .union([z.string(), z.number(), z.null()])
    .optional()
    .transform((v, ctx) => {
      if (v === null || v === undefined || String(v).trim() === "") return null;
      const n = Number(v);
      if (!Number.isInteger(n) || n < 1 || n > 999) {
        ctx.addIssue({ code: "custom", message: "Ganze Zahl zwischen 1 und 999" });
        return z.NEVER;
      }
      return n;
    }),
  focus: z.enum(["default", "yes", "no"]).default("default"),
});

export type CategorySettingInput = z.input<typeof categorySettingSchema>;

export async function updateCategorySetting(actor: Actor, slug: string, input: unknown) {
  admin(actor);
  const base = knownSlug(slug);
  const d = categorySettingSchema.parse(input);
  // Werte, die dem Standard entsprechen, nicht als Override speichern
  const data = {
    name: d.name && d.name !== base.name ? d.name : null,
    short: d.short && d.short !== base.short ? d.short : null,
    description: d.description,
    sortOrder: d.sortOrder,
    isFocus: d.focus === "default" ? null : d.focus === "yes",
  };
  if (data.isFocus === base.focus) data.isFocus = null;

  // Namen müssen eindeutig bleiben (Filter, Auswahllisten)
  const others = (await freshCategories()).filter((c) => c.slug !== slug);
  const effName = (data.name ?? base.name).toLowerCase();
  const effShort = (data.short ?? base.short).toLowerCase();
  if (others.some((c) => c.name.toLowerCase() === effName)) throw fail.invalid("Dieser Name wird bereits von einer anderen Kategorie verwendet.", { name: "Bereits vergeben" });
  if (others.some((c) => c.short.toLowerCase() === effShort)) throw fail.invalid("Dieser Kurzname wird bereits von einer anderen Kategorie verwendet.", { short: "Bereits vergeben" });

  return db.$transaction(async (tx) => {
    const prev = await tx.categorySetting.findUnique({ where: { slug } });
    const row = await tx.categorySetting.upsert({ where: { slug }, create: { slug, ...data, updatedById: actor.id }, update: { ...data, updatedById: actor.id } });
    const changes: Record<string, { from: unknown; to: unknown }> = {};
    for (const k of ["name", "short", "description", "sortOrder", "isFocus"] as const) {
      const from = prev?.[k] ?? null;
      const to = row[k] ?? null;
      if (from !== to) changes[k] = { from, to };
    }
    if (Object.keys(changes).length) await audit({ actorId: actor.id, action: "admin.category_updated", targetType: "CATEGORY", targetId: slug, meta: { changes } }, tx);
    return { slug, changed: Object.keys(changes).length };
  });
}

export async function setCategoryActive(actor: Actor, slug: string, active: boolean, reason: string) {
  admin(actor);
  knownSlug(slug);
  const r = reasonSchema.parse(reason);
  await db.$transaction(async (tx) => {
    const prev = await tx.categorySetting.findUnique({ where: { slug } });
    if ((prev?.isActive ?? true) === active) throw fail.conflict(active ? "Die Kategorie ist bereits aktiv." : "Die Kategorie ist bereits deaktiviert.");
    if (!active) {
      const inactive = await tx.categorySetting.count({ where: { isActive: false, slug: { not: slug } } });
      if (CATEGORIES.length - inactive <= 1) throw fail.conflict("Mindestens eine Kategorie muss aktiv bleiben.");
    }
    await tx.categorySetting.upsert({ where: { slug }, create: { slug, isActive: active, updatedById: actor.id }, update: { isActive: active, updatedById: actor.id } });
    await audit({ actorId: actor.id, action: active ? "admin.category_activated" : "admin.category_deactivated", targetType: "CATEGORY", targetId: slug, meta: { reason: r } }, tx);
  });
}

export async function resetCategory(actor: Actor, slug: string, reason: string) {
  admin(actor);
  knownSlug(slug);
  const r = reasonSchema.parse(reason);
  await db.$transaction(async (tx) => {
    const prev = await tx.categorySetting.findUnique({ where: { slug } });
    if (!prev) throw fail.conflict("Die Kategorie verwendet bereits die Standardwerte.");
    await tx.categorySetting.delete({ where: { slug } });
    await audit(
      {
        actorId: actor.id,
        action: "admin.category_reset",
        targetType: "CATEGORY",
        targetId: slug,
        meta: { reason: r, previous: { name: prev.name, short: prev.short, description: prev.description, sortOrder: prev.sortOrder, isFocus: prev.isFocus, isActive: prev.isActive } },
      },
      tx,
    );
  });
}

/* ───────────── Materialien & Werkzeuge: Detail ───────────── */

const projectSelect = {
  id: true,
  title: true,
  state: true,
  category: true,
  createdAt: true,
  owner: { select: { profile: { select: { handle: true } } } },
} as const;

export async function getMaterialAdminDetail(actor: Actor, id: string) {
  mod(actor);
  const material = await db.material.findUnique({
    where: { id },
    include: { category: { select: { id: true, name: true } }, _count: { select: { projectMaterials: true, listItems: true } } },
  });
  if (!material) throw fail.notFound();
  const [usage, categories, mergeTargets, recentAudit] = await Promise.all([
    db.projectMaterial.findMany({ where: { materialId: id }, orderBy: { project: { createdAt: "desc" } }, take: 50, select: { id: true, name: true, quantity: true, project: { select: projectSelect } } }),
    db.materialCategory.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.material.findMany({ where: { id: { not: id } }, orderBy: { name: "asc" }, take: 500, select: { id: true, name: true, brand: true } }),
    db.auditEvent.findMany({
      where: { targetType: "MATERIAL", targetId: id },
      orderBy: { seq: "desc" },
      take: 20,
      select: { seq: true, action: true, meta: true, createdAt: true, actor: { select: { profile: { select: { handle: true } } } } },
    }),
  ]);
  return { material, usage, categories, mergeTargets, recentAudit };
}

export async function getToolAdminDetail(actor: Actor, id: string) {
  mod(actor);
  const tool = await db.tool.findUnique({ where: { id }, include: { _count: { select: { projectTools: true } } } });
  if (!tool) throw fail.notFound();
  const [usage, mergeTargets, recentAudit] = await Promise.all([
    db.projectTool.findMany({ where: { toolId: id }, orderBy: { project: { createdAt: "desc" } }, take: 50, select: { id: true, name: true, project: { select: projectSelect } } }),
    db.tool.findMany({ where: { id: { not: id } }, orderBy: { name: "asc" }, take: 500, select: { id: true, name: true } }),
    db.auditEvent.findMany({
      where: { targetType: "TOOL", targetId: id },
      orderBy: { seq: "desc" },
      take: 20,
      select: { seq: true, action: true, meta: true, createdAt: true, actor: { select: { profile: { select: { handle: true } } } } },
    }),
  ]);
  return { tool, usage, mergeTargets, recentAudit };
}

/* ───────────── Zusammenführen (Dubletten) ───────────── */

const mergeSchema = z.object({ targetId: z.string().min(1, "Ziel wählen"), reason: reasonSchema });

/**
 * Führt eine Material-Dublette in ein anderes Material über: Projektverweise und
 * Einkaufslisten zeigen danach auf das Ziel, die Dublette wird gelöscht.
 */
export async function mergeMaterial(actor: Actor, sourceId: string, input: { targetId: string; reason: string }) {
  admin(actor, "Zusammenführen darf nur die Administration.");
  const d = mergeSchema.parse(input);
  if (d.targetId === sourceId) throw fail.invalid("Quelle und Ziel sind identisch.", { choice: "Anderes Material wählen" });
  return db.$transaction(async (tx) => {
    const [source, target] = await Promise.all([
      tx.material.findUnique({ where: { id: sourceId }, select: { id: true, name: true } }),
      tx.material.findUnique({ where: { id: d.targetId }, select: { id: true, name: true } }),
    ]);
    if (!source) throw fail.notFound("Material nicht gefunden.");
    if (!target) throw fail.invalid("Zielmaterial nicht gefunden.", { choice: "Nicht gefunden" });
    const pm = await tx.projectMaterial.updateMany({ where: { materialId: sourceId }, data: { materialId: target.id } });
    const li = await tx.shoppingListItem.updateMany({ where: { materialId: sourceId }, data: { materialId: target.id } });
    await tx.material.delete({ where: { id: sourceId } });
    const meta = { reason: d.reason, sourceId, sourceName: source.name, targetId: target.id, targetName: target.name, projectMaterials: pm.count, listItems: li.count };
    await audit({ actorId: actor.id, action: "admin.catalog_merged", targetType: "MATERIAL", targetId: sourceId, meta }, tx);
    await audit({ actorId: actor.id, action: "admin.catalog_merged_into", targetType: "MATERIAL", targetId: target.id, meta }, tx);
    return { targetId: target.id, moved: pm.count + li.count };
  });
}

/** Führt eine Werkzeug-Dublette in ein anderes Werkzeug über. */
export async function mergeTool(actor: Actor, sourceId: string, input: { targetId: string; reason: string }) {
  admin(actor, "Zusammenführen darf nur die Administration.");
  const d = mergeSchema.parse(input);
  if (d.targetId === sourceId) throw fail.invalid("Quelle und Ziel sind identisch.", { choice: "Anderes Werkzeug wählen" });
  return db.$transaction(async (tx) => {
    const [source, target] = await Promise.all([
      tx.tool.findUnique({ where: { id: sourceId }, select: { id: true, name: true } }),
      tx.tool.findUnique({ where: { id: d.targetId }, select: { id: true, name: true } }),
    ]);
    if (!source) throw fail.notFound("Werkzeug nicht gefunden.");
    if (!target) throw fail.invalid("Zielwerkzeug nicht gefunden.", { choice: "Nicht gefunden" });
    const pt = await tx.projectTool.updateMany({ where: { toolId: sourceId }, data: { toolId: target.id } });
    await tx.tool.delete({ where: { id: sourceId } });
    const meta = { reason: d.reason, sourceId, sourceName: source.name, targetId: target.id, targetName: target.name, projectTools: pt.count };
    await audit({ actorId: actor.id, action: "admin.catalog_merged", targetType: "TOOL", targetId: sourceId, meta }, tx);
    await audit({ actorId: actor.id, action: "admin.catalog_merged_into", targetType: "TOOL", targetId: target.id, meta }, tx);
    return { targetId: target.id, moved: pt.count };
  });
}
