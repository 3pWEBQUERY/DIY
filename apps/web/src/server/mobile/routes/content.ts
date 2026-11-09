import "server-only";
import { db } from "@/server/db";
import { fail } from "@/server/errors";
import * as projects from "@/server/projects/service";
import * as tutorials from "@/server/tutorials/service";
import * as lists from "@/server/materials/service";
import * as stock from "@/server/materials/stock";
import { listOffers } from "@/server/materials/offers";
import * as collections from "@/server/collections/service";
import { search, SEARCH_TYPES, type SearchType } from "@/server/discovery/search";
import { suggestedCommunities, suggestedCreators } from "@/server/discovery/suggestions";
import { browseCategories, categoryOptions, effectiveCategories, effectiveCategory } from "@/server/categories/settings";
import { baseFeedWhere, listPosts } from "@/server/social/posts";
import { commentsResponse } from "./social";
import { recordView } from "@/server/analytics/service";
import { z } from "zod";
import { DELETE, GET, PATCH, POST, PUT, bool, int, me, need, pageParam, str, takeParam, viewer, viewerId, zBool, zId, type RouteDef } from "../router";

function season(d = new Date()) {
  const m = d.getMonth() + 1;
  return m === 12 || m <= 2 ? "winter" : m <= 5 ? "fruehling" : m <= 8 ? "sommer" : "herbst";
}

type EditorialItem = { type: string; id: string };

/** Projekte, Anleitungen, Entdecken, Suche, Materialien, Einkaufslisten, Gespeichertes (PRD §10, §11, §17, §18). */
export const contentRoutes: RouteDef[] = [
  // ── Kategorien ──
  GET("/categories", async (c) => (bool(c.q, "all") ? effectiveCategories() : browseCategories(str(c.q, "current")))),
  GET("/categories/options", async (c) => categoryOptions(str(c.q, "keep"))),

  // ── Entdecken (§18.3) ──
  GET("/discover", async (c) => {
    const cat = await effectiveCategory(str(c.q, "category"));
    const u = await viewer();
    const vid = u?.id ?? null;
    const interests = cat ? [cat.slug] : (u?.profile?.categories ?? []);
    const [popular, fresh, tuts, creators, communities, collectionsRaw, catCounts, catPosts, categories] = await Promise.all([
      projects.listProjects({ category: cat?.slug, sort: "popular" }, vid, { take: 10 }),
      projects.listProjects({ category: cat?.slug, sort: "new" }, vid, { take: 6 }),
      tutorials.listTutorials({ category: cat?.slug }, vid, { take: 6 }),
      suggestedCreators(vid, interests, 8),
      suggestedCommunities(vid, interests, 6),
      db.editorialCollection.findMany({ where: { isActive: true }, orderBy: { position: "asc" }, take: 6 }),
      db.project.groupBy({ by: ["category"], where: { state: "PUBLISHED", visibility: "PUBLIC" }, _count: true }),
      cat ? listPosts({ ...(await baseFeedWhere(vid)), category: cat.slug, visibility: "PUBLIC", communityId: null }, vid, { take: 6 }) : Promise.resolve(null),
      browseCategories(cat?.slug),
    ]);
    const now = season();
    const seasonal = collectionsRaw.find((x) => x.season === now) ?? null;
    const editorial = collectionsRaw.filter((x) => x !== seasonal).slice(0, 3);
    const cards = await Promise.all(
      [seasonal, ...editorial].filter((x): x is NonNullable<typeof x> => !!x).map(async (col) => {
        const items = (Array.isArray(col.items) ? col.items : []) as unknown as EditorialItem[];
        const [p, t] = await Promise.all([
          projects.getProjectCards(items.filter((i) => i.type === "project").map((i) => i.id), vid),
          tutorials.getTutorialCards(items.filter((i) => i.type === "tutorial").map((i) => i.id), vid),
        ]);
        return { id: col.id, slug: col.slug, title: col.title, kicker: col.kicker, description: col.description, season: col.season, isSeasonal: col === seasonal, projects: p, tutorials: t };
      }),
    );
    const following = vid ? (await db.follow.findMany({ where: { followerId: vid }, select: { followeeId: true } })).map((f) => f.followeeId) : [];
    return {
      category: cat ?? null,
      categories: categories.map((x) => ({ ...x, projectCount: catCounts.find((cc) => cc.category === x.slug)?._count ?? 0 })),
      popular: popular.items,
      fresh: fresh.items,
      tutorials: tuts.items,
      creators: creators.map((cr) => ({ ...cr, following: following.includes(cr.userId) })),
      communities,
      collections: cards,
      posts: catPosts?.items ?? [],
    };
  }),

  // ── Suche (§18) ──
  GET("/search", async (c) => {
    const q = (str(c.q, "q") ?? "").slice(0, 120);
    const types = (str(c.q, "types")?.split(",").filter((t) => SEARCH_TYPES.includes(t as SearchType)) ?? [...SEARCH_TYPES]) as SearchType[];
    const vid = await viewerId();
    if (q.trim().length < 2) return { q, results: null };
    const results = await search(
      {
        q,
        types,
        category: str(c.q, "category"),
        difficulty: int(c.q, "difficulty", { max: 5 }),
        maxMinutes: int(c.q, "maxMinutes", { max: 100_000 }),
        priceMin: int(c.q, "priceMin", { max: 100_000_000 }),
        priceMax: int(c.q, "priceMax", { max: 100_000_000 }),
        free: c.q.has("free") ? bool(c.q, "free") : undefined,
        country: str(c.q, "country"),
        sinceDays: int(c.q, "sinceDays", { max: 3650 }),
        limit: takeParam(c.q, "limit", 12, 40),
      },
      vid,
    );
    const r = results as Record<string, { id: string }[] | undefined>;
    const [projectCards, tutorialCards] = await Promise.all([
      projects.getProjectCards((r.project ?? []).map((h) => h.id), vid),
      tutorials.getTutorialCards((r.tutorial ?? []).map((h) => h.id), vid),
    ]);
    return { q, results, projectCards, tutorialCards };
  }),

  // ── Projekte (§10) ──
  GET("/projects", async (c) => {
    const vid = await viewerId();
    return projects.listProjects(
      {
        category: str(c.q, "category"),
        sort: (str(c.q, "sort") as projects.ProjectSort | undefined) ?? "new",
        q: str(c.q, "q"),
        difficulty: int(c.q, "difficulty", { max: 5 }),
        status: str(c.q, "status") as never,
        hasTutorial: c.q.has("hasTutorial") ? bool(c.q, "hasTutorial") : undefined,
        ownerId: str(c.q, "ownerId"),
      },
      vid,
      { cursor: str(c.q, "cursor") ?? null, take: takeParam(c.q, "take", 24) },
    );
  }),
  GET("/projects/by/:handle/:slug", async (c) => {
    const vid = await viewerId();
    return need(await projects.getProjectPage(c.p.handle!, c.p.slug!, vid), "Projekt nicht gefunden.");
  }),
  GET("/projects/by/:handle/:slug/edit", async (c) => {
    const u = await me();
    const [data, categories] = await Promise.all([projects.getProjectForEdit(u, c.p.handle!, c.p.slug!), categoryOptions()]);
    return { ...(need(data, "Projekt nicht gefunden.") as object), categories };
  }),
  GET("/projects/remix-source/:id", async (c) => need(await projects.getRemixSource((await me()).id, c.p.id!), "Projekt nicht gefunden.")),
  GET("/projects/:id/comments", async (c) => commentsResponse("PROJECT", c.p.id!, c.q)),
  POST("/projects", async (c) => projects.createProject(await me(), await c.json())),
  PUT("/projects/:id", async (c) => projects.updateProject(await me(), c.p.id!, await c.json())),
  DELETE("/projects/:id", async (c) => {
    await projects.deleteProject(await me(), c.p.id!);
    return { ok: true };
  }),
  POST("/projects/:id/status", async (c) => projects.setProjectStatus(await me(), c.p.id!, await c.json())),
  POST("/projects/:id/updates", async (c) => projects.addProjectUpdate(await me(), c.p.id!, await c.json())),
  DELETE("/project-updates/:id", async (c) => {
    await projects.deleteProjectUpdate(await me(), c.p.id!);
    return { ok: true };
  }),
  GET("/me/project-options", async () => projects.listOwnProjectOptions((await me()).id)),

  // ── Anleitungen (§11) ──
  GET("/tutorials", async (c) => {
    const vid = await viewerId();
    return tutorials.listTutorials(
      {
        category: str(c.q, "category"),
        difficulty: int(c.q, "difficulty", { max: 5 }),
        duration: str(c.q, "duration") as never,
        q: str(c.q, "q"),
        sort: str(c.q, "sort") as never,
        authorId: str(c.q, "authorId"),
        projectId: str(c.q, "projectId"),
      },
      vid,
      { cursor: str(c.q, "cursor") ?? null, take: takeParam(c.q, "take", 24) },
    );
  }),
  GET("/tutorials/durations", async () => tutorials.DURATIONS),
  GET("/tutorials/by-slug/:slug", async (c) => {
    const vid = await viewerId();
    const page = need(await tutorials.getTutorialPage(c.p.slug!, vid), "Anleitung nicht gefunden.");
    return page;
  }),
  GET("/tutorials/:id/comments", async (c) => commentsResponse("TUTORIAL", c.p.id!, c.q)),
  GET("/tutorials/:id/edit", async (c) => {
    const u = await me();
    const [data, projectOptions, categories] = await Promise.all([tutorials.getTutorialForEdit(u, c.p.id!), projects.listOwnProjectOptions(u.id), categoryOptions()]);
    return { ...(need(data, "Anleitung nicht gefunden.") as object), projectOptions, categories };
  }),
  GET("/tutorials/seed/:projectId", async (c) => need(await tutorials.getTutorialSeedFromProject((await me()).id, c.p.projectId!), "Projekt nicht gefunden.")),
  POST("/tutorials", async (c) => {
    const { input, publish } = await c.body({ input: z.unknown(), publish: zBool });
    return tutorials.saveTutorial(await me(), null, input, { publish: !!publish });
  }),
  PUT("/tutorials/:id", async (c) => {
    const { input, publish } = await c.body({ input: z.unknown(), publish: zBool });
    return tutorials.saveTutorial(await me(), c.p.id!, input, { publish: !!publish });
  }),
  POST("/tutorials/:id/published", async (c) => {
    const { published } = await c.body({ published: zBool });
    return tutorials.setTutorialPublished(await me(), c.p.id!, !!published);
  }),
  DELETE("/tutorials/:id", async (c) => {
    await tutorials.deleteTutorial(await me(), c.p.id!);
    return { ok: true };
  }),
  POST("/tutorials/:id/steps/:key", async (c) => {
    const { done } = await c.body({ done: zBool });
    return tutorials.toggleTutorialStep(await me(), c.p.id!, c.p.key!, done !== false);
  }),
  POST("/tutorials/:id/complete", async (c) => tutorials.completeTutorial(await me(), c.p.id!)),
  POST("/tutorials/:id/reset", async (c) => tutorials.resetTutorialProgress(await me(), c.p.id!)),
  POST("/tutorials/:id/seen", async (c) => tutorials.markTutorialVersionSeen(await me(), c.p.id!)),

  // ── Aufrufe (§20.4, ohne PII) ──
  POST("/track", async (c) => {
    const b = await c.body({ targetType: z.string().max(40).optional(), targetId: z.string().max(200).optional(), ref: z.string().max(200).optional() });
    if (!b.targetType || !b.targetId) throw fail.invalid("targetType und targetId erforderlich");
    const r = await recordView({ viewerId: await viewerId(), targetType: b.targetType, targetId: b.targetId, ref: b.ref ?? "ios" });
    return { counted: r.counted };
  }),

  // ── Materialien (§17) ──
  GET("/materials", async (c) => lists.searchMaterials(str(c.q, "q") ?? "", takeParam(c.q, "limit", 10, 25))),
  GET("/materials/categories", async () => lists.listMaterialCategories()),
  GET("/materials/browse", async (c) => lists.browseMaterials({ categorySlug: str(c.q, "category"), q: str(c.q, "q"), cursor: str(c.q, "cursor") ?? null, take: takeParam(c.q, "take", 40) })),
  // Materialseite: Stammdaten, Preisvergleich (offers, günstigster Preis je Einheit zuerst; href → /go/:id), eigener Bestand, Projekte
  GET("/materials/:slug", async (c) => {
    const v = await viewerId();
    const m = need(await lists.getMaterialPage(c.p.slug!, v), "Material nicht gefunden.");
    const [offers, projectCards] = await Promise.all([listOffers(m.id, m.unit), projects.getProjectCards(m.projectIds, v).then((p) => p.slice(0, 8))]);
    const { projectIds: _ids, _count: _c, ...material } = m;
    return { material, offers, projects: projectCards };
  }),
  // „Habe ich schon“: { have: boolean }
  PUT("/materials/:id/stock", async (c) => {
    const { have } = await c.body({ have: zBool });
    return stock.toggleStockMaterial((await me()).id, c.p.id!, have !== false);
  }),

  // ── Eigener Bestand ──
  GET("/me/material-stock", async () => stock.listStock((await me()).id)),
  POST("/me/material-stock", async (c) => stock.addStock((await me()).id, await c.json())),
  PATCH("/me/material-stock/:id", async (c) => {
    await stock.updateStock((await me()).id, c.p.id!, await c.json());
    return { ok: true };
  }),
  DELETE("/me/material-stock/:id", async (c) => {
    await stock.removeStock((await me()).id, c.p.id!);
    return { ok: true };
  }),
  POST("/shopping-list-items/:id/to-stock", async (c) => stock.stockFromShoppingItem((await me()).id, c.p.id!)),

  // ── Einkaufslisten (§17.4) ──
  GET("/shopping-lists", async () => lists.listMyShoppingLists((await me()).id)),
  POST("/shopping-lists", async (c) => lists.createShoppingList(await me(), await c.json())),
  POST("/shopping-lists/add-source", async (c) => lists.addSourceToShoppingList(await me(), await c.json())),
  GET("/shopping-lists/shared/:token", async (c) => need(await lists.getSharedShoppingList(c.p.token!), "Liste nicht gefunden.")),
  GET("/shopping-lists/:id", async (c) => need(await lists.getShoppingList(await me(), c.p.id!), "Liste nicht gefunden.")),
  PATCH("/shopping-lists/:id", async (c) => {
    await lists.renameShoppingList(await me(), c.p.id!, await c.json());
    return { ok: true };
  }),
  DELETE("/shopping-lists/:id", async (c) => {
    await lists.deleteShoppingList(await me(), c.p.id!);
    return { ok: true };
  }),
  POST("/shopping-lists/:id/items", async (c) => lists.addShoppingListItem(await me(), c.p.id!, await c.json())),
  POST("/shopping-lists/:id/clear-done", async (c) => lists.clearDoneItems(await me(), c.p.id!)),
  POST("/shopping-lists/:id/merge", async (c) => {
    const { sourceId } = await c.body({ sourceId: zId.optional() });
    if (!sourceId) throw fail.invalid("sourceId fehlt.");
    return lists.mergeShoppingLists(await me(), c.p.id!, sourceId);
  }),
  POST("/shopping-lists/:id/share", async (c) => {
    const { shared } = await c.body({ shared: zBool });
    return lists.setShoppingListShared(await me(), c.p.id!, !!shared);
  }),
  PATCH("/shopping-list-items/:id", async (c) => {
    await lists.updateShoppingListItem(await me(), c.p.id!, await c.json());
    return { ok: true };
  }),
  DELETE("/shopping-list-items/:id", async (c) => {
    await lists.removeShoppingListItem(await me(), c.p.id!);
    return { ok: true };
  }),

  // ── Gespeichert & Sammlungen (§10.7) ──
  GET("/saved", async (c) => {
    const u = await me();
    const type = (str(c.q, "type") ?? "PROJECT") as collections.SavedType;
    if (!collections.SAVED_TYPES.includes(type)) throw fail.invalid("Unbekannter Typ.");
    return collections.listSaved(u, { type, collectionId: str(c.q, "collection") ?? null, page: pageParam(c.q) });
  }),
  GET("/collections", async () => collections.listCollections((await me()).id)),
  POST("/collections", async (c) => collections.createCollection(await me(), await c.json())),
  GET("/collections/:id", async (c) => need(await collections.getCollectionPage(c.p.id!, await viewerId()), "Sammlung nicht gefunden.")),
  PATCH("/collections/:id", async (c) => {
    await collections.updateCollection(await me(), c.p.id!, await c.json());
    return { ok: true };
  }),
  DELETE("/collections/:id", async (c) => {
    await collections.deleteCollection(await me(), c.p.id!);
    return { ok: true };
  }),
];
