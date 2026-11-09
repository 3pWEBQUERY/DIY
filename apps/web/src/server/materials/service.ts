import "server-only";
import { shoppingListCreateSchema, shoppingListItemSchema, shoppingListItemPatchSchema } from "@werkraum/shared";
import { db, type Prisma } from "@/server/db";
import { fail } from "@/server/errors";
import { rateLimit } from "@/server/ratelimit";
import { canViewContent } from "@/server/visibility";
import { token } from "@/server/crypto";
import { stockLookup } from "@/server/materials/stock";
import { visibleProjectsWhere } from "@/server/projects/service";
import type { SessionUser } from "@/server/auth/session";

/**
 * Materialdatenbank & Einkaufslisten (PRD §17).
 * Einkaufslisten sind privat; geteilt wird nur lesend über ein zufälliges shareToken.
 */

const MAX_LISTS = 100;
const MAX_ITEMS = 300;

const writeLimit = (userId: string) => rateLimit(`shopping:${userId}`, 600, 3600);

/**
 * „In X Projekten verwendet“ zählt nur öffentlich sichtbare Projekte – private, ausgeblendete
 * oder entfernte Projekte dürfen nicht durch eine Zahl auf der Materialseite durchscheinen.
 */
const PUBLIC_PROJECT: Prisma.ProjectWhereInput = { state: "PUBLISHED", visibility: "PUBLIC", owner: { status: { in: ["ACTIVE", "SUSPENDED"] } } };

// ───────────────────────── Materialdatenbank ─────────────────────────

export async function searchMaterials(q: string, take = 10) {
  const term = q.trim().slice(0, 60);
  if (term.length < 2) return [];
  const rows = await db.material.findMany({
    where: { OR: [{ name: { contains: term, mode: "insensitive" } }, { type: { contains: term, mode: "insensitive" } }, { brand: { contains: term, mode: "insensitive" } }] },
    orderBy: { name: "asc" },
    take: Math.min(take, 25),
    select: { id: true, name: true, unit: true, type: true, brand: true, category: { select: { name: true } } },
  });
  // Treffer am Wortanfang zuerst
  const lc = term.toLowerCase();
  return rows
    .map((r) => ({ id: r.id, name: r.name, unit: r.unit, type: r.type, brand: r.brand, category: r.category.name }))
    .sort((a, b) => Number(!a.name.toLowerCase().startsWith(lc)) - Number(!b.name.toLowerCase().startsWith(lc)));
}

export async function listMaterialCategories() {
  return db.materialCategory.findMany({ orderBy: { name: "asc" }, select: { id: true, slug: true, name: true, _count: { select: { materials: true } } } });
}

export async function browseMaterials(opts: { categorySlug?: string; q?: string; cursor?: string | null; take?: number }) {
  const take = Math.min(opts.take ?? 48, 100);
  const where: Prisma.MaterialWhereInput = {
    ...(opts.categorySlug ? { category: { slug: opts.categorySlug } } : {}),
    ...(opts.q?.trim()
      ? { OR: [{ name: { contains: opts.q.trim(), mode: "insensitive" } }, { type: { contains: opts.q.trim(), mode: "insensitive" } }, { brand: { contains: opts.q.trim(), mode: "insensitive" } }] }
      : {}),
  };
  const rows = await db.material.findMany({
    where,
    orderBy: [{ name: "asc" }, { id: "asc" }],
    take: take + 1,
    ...(opts.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
    select: {
      id: true, slug: true, name: true, type: true, unit: true, brand: true, notes: true, safetyInfo: true, properties: true,
      category: { select: { slug: true, name: true } },
      _count: { select: { projectMaterials: { where: { project: PUBLIC_PROJECT } } } },
    },
  });
  const page = rows.slice(0, take);
  return {
    items: page.map((m) => ({ ...m, properties: (m.properties ?? {}) as Record<string, unknown>, usedIn: m._count.projectMaterials })),
    nextCursor: rows.length > take ? page[page.length - 1]!.id : null,
  };
}

// ───────────────────────── Einkaufslisten ─────────────────────────

async function ownedList(user: SessionUser, listId: string) {
  const l = await db.shoppingList.findUnique({ where: { id: listId }, select: { id: true, ownerId: true, title: true, shareToken: true } });
  if (!l || l.ownerId !== user.id) throw fail.notFound("Einkaufsliste nicht gefunden.");
  return l;
}

export async function listMyShoppingLists(userId: string) {
  const rows = await db.shoppingList.findMany({
    where: { ownerId: userId },
    orderBy: { updatedAt: "desc" },
    select: { id: true, title: true, shareToken: true, updatedAt: true, createdAt: true, items: { select: { purchased: true, haveIt: true, sourceTitle: true } } },
  });
  return rows.map((l) => ({
    id: l.id,
    title: l.title,
    shared: !!l.shareToken,
    updatedAt: l.updatedAt.toISOString(),
    total: l.items.length,
    done: l.items.filter((i) => i.purchased || i.haveIt).length,
    sources: [...new Set(l.items.map((i) => i.sourceTitle).filter((x): x is string => !!x))].slice(0, 3),
  }));
}

export type ShoppingListSummary = Awaited<ReturnType<typeof listMyShoppingLists>>[number];

export async function createShoppingList(user: SessionUser, input: unknown) {
  const data = shoppingListCreateSchema.parse(input);
  await writeLimit(user.id);
  const count = await db.shoppingList.count({ where: { ownerId: user.id } });
  if (count >= MAX_LISTS) throw fail.invalid(`Du kannst höchstens ${MAX_LISTS} Einkaufslisten anlegen.`);
  return db.shoppingList.create({ data: { ownerId: user.id, title: data.title }, select: { id: true, title: true } });
}

export async function renameShoppingList(user: SessionUser, listId: string, input: unknown) {
  const data = shoppingListCreateSchema.parse(input);
  await ownedList(user, listId);
  await db.shoppingList.update({ where: { id: listId }, data: { title: data.title } });
}

export async function deleteShoppingList(user: SessionUser, listId: string) {
  await ownedList(user, listId);
  await db.shoppingList.delete({ where: { id: listId } });
}

export async function addShoppingListItem(user: SessionUser, listId: string, input: unknown) {
  const data = shoppingListItemSchema.parse(input);
  await writeLimit(user.id);
  await ownedList(user, listId);
  const n = await db.shoppingListItem.count({ where: { listId } });
  if (n >= MAX_ITEMS) throw fail.invalid(`Eine Liste fasst höchstens ${MAX_ITEMS} Positionen.`);
  const materialId = data.materialId ? ((await db.material.findUnique({ where: { id: data.materialId }, select: { id: true } }))?.id ?? null) : null;
  const item = await db.$transaction(async (tx) => {
    const it = await tx.shoppingListItem.create({ data: { listId, name: data.name, quantity: data.quantity, materialId, position: n } });
    await tx.shoppingList.update({ where: { id: listId }, data: { updatedAt: new Date() } });
    return it;
  });
  return { id: item.id };
}

async function ownedItem(user: SessionUser, itemId: string) {
  const it = await db.shoppingListItem.findUnique({ where: { id: itemId }, select: { id: true, listId: true, list: { select: { ownerId: true } } } });
  if (!it || it.list.ownerId !== user.id) throw fail.notFound();
  return it;
}

export async function updateShoppingListItem(user: SessionUser, itemId: string, input: unknown) {
  const data = shoppingListItemPatchSchema.parse(input);
  await writeLimit(user.id);
  const it = await ownedItem(user, itemId);
  await db.$transaction([
    db.shoppingListItem.update({ where: { id: itemId }, data }),
    db.shoppingList.update({ where: { id: it.listId }, data: { updatedAt: new Date() } }),
  ]);
}

export async function removeShoppingListItem(user: SessionUser, itemId: string) {
  const it = await ownedItem(user, itemId);
  await db.shoppingListItem.delete({ where: { id: it.id } });
}

export async function clearDoneItems(user: SessionUser, listId: string) {
  await ownedList(user, listId);
  const r = await db.shoppingListItem.deleteMany({ where: { listId, OR: [{ purchased: true }, { haveIt: true }] } });
  return { removed: r.count };
}

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

function mergeQuantity(a: string, b: string) {
  if (!a) return b;
  if (!b || norm(a) === norm(b)) return a;
  const re = /^(\d+(?:[.,]\d+)?)\s*(.*)$/;
  const ma = a.trim().match(re);
  const mb = b.trim().match(re);
  if (ma && mb && norm(ma[2] ?? "") === norm(mb[2] ?? "")) {
    const sum = Number(ma[1]!.replace(",", ".")) + Number(mb[1]!.replace(",", "."));
    const formatted = Number.isInteger(sum) ? String(sum) : sum.toFixed(2).replace(/0+$/, "").replace(".", ",");
    return `${formatted}${ma[2] ? ` ${ma[2]}` : ""}`.slice(0, 40);
  }
  return `${a} + ${b}`.slice(0, 40);
}

type IncomingItem = { name: string; quantity: string; materialId: string | null; sourceType?: string | null; sourceId?: string | null; sourceTitle?: string | null; haveIt?: boolean; purchased?: boolean };

/** Positionen in eine Liste übernehmen; gleiche Materialien werden zusammengefasst. */
async function mergeInto(listId: string, incoming: IncomingItem[]) {
  return db.$transaction(async (tx) => {
    const existing = await tx.shoppingListItem.findMany({ where: { listId }, orderBy: { position: "asc" } });
    if (existing.length + incoming.length > MAX_ITEMS * 2) throw fail.invalid("Die Liste wird zu lang.");
    const key = (i: { name: string; materialId: string | null }) => (i.materialId ? `m:${i.materialId}` : `n:${norm(i.name)}`);
    const byKey = new Map(existing.map((e) => [key(e), e]));
    let position = existing.length;
    let added = 0;
    let merged = 0;
    for (const it of incoming) {
      const hit = byKey.get(key(it));
      if (hit) {
        const quantity = mergeQuantity(hit.quantity, it.quantity);
        const sourceTitle = hit.sourceTitle && it.sourceTitle && hit.sourceTitle !== it.sourceTitle ? `${hit.sourceTitle} + ${it.sourceTitle}`.slice(0, 160) : (hit.sourceTitle ?? it.sourceTitle ?? null);
        // „Gekauft“ bzw. „Habe ich“ nur zurücksetzen, wenn tatsächlich noch etwas fehlt
        const stillNeeded = !(it.purchased || it.haveIt);
        await tx.shoppingListItem.update({ where: { id: hit.id }, data: { quantity, sourceTitle, ...(stillNeeded ? { purchased: false } : {}) } });
        hit.quantity = quantity;
        hit.sourceTitle = sourceTitle;
        merged++;
      } else {
        const row = await tx.shoppingListItem.create({
          data: { listId, name: it.name.slice(0, 120), quantity: it.quantity.slice(0, 40), materialId: it.materialId, sourceType: it.sourceType ?? null, sourceId: it.sourceId ?? null, sourceTitle: it.sourceTitle ?? null, haveIt: !!it.haveIt, purchased: !!it.purchased, position: position++ },
        });
        byKey.set(key(row), row);
        added++;
      }
    }
    await tx.shoppingList.update({ where: { id: listId }, data: { updatedAt: new Date() } });
    return { added, merged };
  });
}

/** Zwei Listen zusammenführen: `sourceId` wird in `targetId` übernommen und danach gelöscht. */
export async function mergeShoppingLists(user: SessionUser, targetId: string, sourceId: string) {
  if (targetId === sourceId) throw fail.invalid("Wähle zwei verschiedene Listen.");
  await Promise.all([ownedList(user, targetId), ownedList(user, sourceId)]);
  const items = await db.shoppingListItem.findMany({ where: { listId: sourceId }, orderBy: { position: "asc" } });
  const r = await mergeInto(targetId, items.map((i) => ({ name: i.name, quantity: i.quantity, materialId: i.materialId, sourceType: i.sourceType, sourceId: i.sourceId, sourceTitle: i.sourceTitle, haveIt: i.haveIt, purchased: i.purchased })));
  await db.shoppingList.delete({ where: { id: sourceId } });
  return r;
}

export async function setShoppingListShared(user: SessionUser, listId: string, shared: boolean) {
  const l = await ownedList(user, listId);
  const shareToken = shared ? (l.shareToken ?? token(18)) : null;
  await db.shoppingList.update({ where: { id: listId }, data: { shareToken } });
  return { shareToken };
}

const listInclude = {
  owner: { select: { profile: { select: { handle: true, displayName: true } } } },
  items: { orderBy: [{ position: "asc" }, { createdAt: "asc" }], include: { material: { select: { slug: true, unit: true, category: { select: { name: true } } } } } },
} satisfies Prisma.ShoppingListInclude;

function toListView(l: Prisma.ShoppingListGetPayload<{ include: typeof listInclude }>) {
  return {
    id: l.id,
    title: l.title,
    shareToken: l.shareToken,
    updatedAt: l.updatedAt.toISOString(),
    owner: { handle: l.owner.profile?.handle ?? "", displayName: l.owner.profile?.displayName ?? "" },
    items: l.items.map((i) => ({
      id: i.id,
      name: i.name,
      quantity: i.quantity,
      haveIt: i.haveIt,
      purchased: i.purchased,
      sourceType: i.sourceType,
      sourceTitle: i.sourceTitle,
      category: i.material?.category.name ?? null,
      materialId: i.materialId,
      materialSlug: i.material?.slug ?? null,
    })),
  };
}
export type ShoppingListView = ReturnType<typeof toListView>;

export async function getShoppingList(user: SessionUser, listId: string) {
  const l = await db.shoppingList.findUnique({ where: { id: listId }, include: listInclude });
  if (!l || l.ownerId !== user.id) return null;
  return toListView(l);
}

/** Öffentliche, schreibgeschützte Ansicht über das Freigabe-Token. */
export async function getSharedShoppingList(shareToken: string) {
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(shareToken)) return null;
  const l = await db.shoppingList.findUnique({ where: { shareToken }, include: listInclude });
  if (!l) return null;
  const owner = await db.user.findUnique({ where: { id: l.ownerId }, select: { status: true } });
  if (!owner || owner.status === "BANNED" || owner.status === "DELETED") return null;
  return toListView(l);
}

// ───────────────────────── Übernehmen aus Projekt / Anleitung ─────────────────────────

type SourceKind = "PROJECT" | "TUTORIAL" | "MATERIAL";

async function sourceItems(viewerId: string, kind: SourceKind, id: string): Promise<{ title: string; items: IncomingItem[] }> {
  if (kind === "MATERIAL") {
    const m = await db.material.findUnique({ where: { id }, select: { id: true, name: true, unit: true } });
    if (!m) throw fail.notFound("Material nicht gefunden.");
    return { title: m.name, items: [{ name: m.name, quantity: "", materialId: m.id }] };
  }
  if (kind === "PROJECT") {
    const p = await db.project.findUnique({
      where: { id },
      select: { title: true, ownerId: true, visibility: true, state: true, materials: { orderBy: { position: "asc" }, select: { name: true, quantity: true, materialId: true } } },
    });
    if (!p || !(await canViewContent(viewerId, { ownerId: p.ownerId, visibility: p.visibility, state: p.state }))) throw fail.notFound();
    return { title: p.title, items: p.materials.map((m) => ({ ...m, sourceType: "PROJECT", sourceId: id, sourceTitle: p.title })) };
  }
  const t = await db.tutorial.findUnique({ where: { id }, select: { title: true, authorId: true, state: true, currentVersion: { select: { materials: true } } } });
  if (!t || !t.currentVersion || !(await canViewContent(viewerId, { ownerId: t.authorId, visibility: "PUBLIC", state: t.state }))) throw fail.notFound();
  const lines = Array.isArray(t.currentVersion.materials) ? (t.currentVersion.materials as { name?: unknown; quantity?: unknown; materialId?: unknown }[]) : [];
  const ids = lines.map((l) => (typeof l.materialId === "string" ? l.materialId : null)).filter((x): x is string => !!x);
  const valid = new Set((await db.material.findMany({ where: { id: { in: ids } }, select: { id: true } })).map((m) => m.id));
  return {
    title: t.title,
    items: lines
      .filter((l) => typeof l.name === "string" && l.name.trim())
      .map((l) => ({
        name: String(l.name),
        quantity: typeof l.quantity === "string" ? l.quantity : "",
        materialId: typeof l.materialId === "string" && valid.has(l.materialId) ? l.materialId : null,
        sourceType: "TUTORIAL",
        sourceId: id,
        sourceTitle: t.title,
      })),
  };
}

/**
 * „Materialliste übernehmen“: in bestehende Liste (listId) oder neue Liste (newTitle).
 */
export async function addSourceToShoppingList(user: SessionUser, input: { kind: SourceKind; id: string; listId?: string | null; newTitle?: string | null }) {
  if (input.kind !== "PROJECT" && input.kind !== "TUTORIAL" && input.kind !== "MATERIAL") throw fail.invalid("Unbekannte Quelle.");
  await writeLimit(user.id);
  const src = await sourceItems(user.id, input.kind, input.id);
  if (!src.items.length) throw fail.invalid("Hier gibt es keine Materialliste zum Übernehmen.");
  // Was schon im eigenen Bestand ist, gilt direkt als „Habe ich“
  const stock = await stockLookup(user.id, src.items.map((i) => i.materialId).filter((x): x is string => !!x), src.items.filter((i) => !i.materialId).map((i) => i.name.trim()));
  let alreadyHave = 0;
  for (const it of src.items) {
    it.haveIt = it.materialId ? stock.ids.has(it.materialId) : stock.names.has(it.name.trim().toLowerCase());
    if (it.haveIt) alreadyHave++;
  }
  let listId = input.listId ?? null;
  if (listId) await ownedList(user, listId);
  else listId = (await createShoppingList(user, { title: (input.newTitle?.trim() || `Für: ${src.title}`).slice(0, 80) })).id;
  const r = await mergeInto(listId, src.items);
  return { listId, ...r, alreadyHave };
}

// ───────────────────────── Materialseite ─────────────────────────

/** Detailseite eines Materials: Stammdaten, Bestand der betrachtenden Person, Projekte. */
export async function getMaterialPage(slug: string, viewerId: string | null | undefined) {
  if (!/^[a-z0-9-]{1,120}$/.test(slug)) return null;
  const m = await db.material.findUnique({
    where: { slug },
    select: {
      id: true, slug: true, name: true, type: true, unit: true, brand: true, productRef: true, notes: true, safetyInfo: true, properties: true,
      category: { select: { slug: true, name: true } },
    },
  });
  if (!m) return null;
  const [usedIn, uses, stock] = await Promise.all([
    db.project.count({ where: { ...PUBLIC_PROJECT, materials: { some: { materialId: m.id } } } }),
    // Sichtbarkeit vor dem Begrenzen filtern, sonst verdrängen private/entfernte Projekte die sichtbaren
    visibleProjectsWhere(viewerId).then((visible) =>
      db.projectMaterial.findMany({ where: { materialId: m.id, project: visible }, distinct: ["projectId"], orderBy: { project: { publishedAt: { sort: "desc", nulls: "last" } } }, take: 40, select: { projectId: true } }),
    ),
    viewerId ? db.materialStock.findUnique({ where: { userId_materialId: { userId: viewerId, materialId: m.id } }, select: { id: true, quantity: true, note: true } }) : null,
  ]);
  const related = await db.material.findMany({ where: { category: { slug: m.category.slug }, id: { not: m.id } }, orderBy: { name: "asc" }, take: 8, select: { slug: true, name: true, type: true } });
  return {
    ...m,
    properties: (m.properties ?? {}) as Record<string, unknown>,
    usedIn,
    projectIds: uses.map((u) => u.projectId),
    stock,
    related,
  };
}
