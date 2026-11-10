import "server-only";
import { db, Prisma } from "@/server/db";
import { fail } from "@/server/errors";
import { storage } from "@/server/storage";
import { mediaInUse } from "@/server/media/service";
import { weekKeys, weeklySeries } from "@/server/admin/kpis";
import { TZ, zurichDayKey, zurichWeekDays } from "@/lib/tz";

/**
 * Kennzahlen für das Werkuno Studio (PRD §20). Ehrlich beschriftet (§20.4):
 * „Aufrufe“ sind keine eindeutigen Besucher; Zeiträume sind immer angegeben.
 */

const DAY = 86_400_000;
export const PERIOD_DAYS = 28;

async function count(sql: Prisma.Sql) {
  const r = await db.$queryRaw<{ n: bigint }[]>(sql);
  return Number(r[0]?.n ?? 0);
}

/**
 * Interaktionen auf eigenen Inhalten zählen – von den eigenen Inhalten aus (Index auf authorId/ownerId)
 * und dann per (targetType, targetId)-Index in die Interaktionstabelle. Eine OR-Bedingung über alle
 * Inhaltsarten würde stattdessen alle Reaktionen/Kommentare/Lesezeichen durchsuchen.
 */
const OWNED: [string, string, string][] = [
  ["POST", "Post", "authorId"],
  ["PROJECT", "Project", "ownerId"],
  ["TUTORIAL", "Tutorial", "authorId"],
  ["ARTICLE", "BlogArticle", "authorId"],
];

async function ownedCount(table: string, alias: string, extra: Prisma.Sql, uid: string) {
  const parts = OWNED.map(
    ([type, model, owner]) =>
      Prisma.sql`(SELECT count(*) FROM ${Prisma.raw(`"${model}"`)} t JOIN ${Prisma.raw(`"${table}"`)} ${Prisma.raw(alias)} ON ${Prisma.raw(alias)}."targetType" = ${Prisma.raw(`'${type}'`)} AND ${Prisma.raw(alias)}."targetId" = t.id WHERE t.${Prisma.raw(`"${owner}"`)} = ${uid} AND ${extra})`,
  );
  return count(Prisma.sql`SELECT (${Prisma.join(parts, " + ")})::bigint AS n`);
}

async function interactions(uid: string, from: Date, to: Date) {
  const [likes, comments, saves] = await Promise.all([
    ownedCount("Reaction", "r", Prisma.sql`r."createdAt" >= ${from} AND r."createdAt" < ${to} AND r."userId" <> ${uid}`, uid),
    ownedCount("Comment", "c", Prisma.sql`c."createdAt" >= ${from} AND c."createdAt" < ${to} AND c."authorId" <> ${uid} AND c."state" = 'PUBLISHED'`, uid),
    ownedCount("Bookmark", "b", Prisma.sql`b."createdAt" >= ${from} AND b."createdAt" < ${to} AND b."userId" <> ${uid}`, uid),
  ]);
  return { likes, comments, saves, total: likes + comments + saves };
}

async function views(uid: string, targetType: "USER" | "PROJECT" | "TUTORIAL" | "ARTICLE" | "PRODUCT" | "POST", from: Date, to: Date) {
  return db.analyticsEvent.count({
    where: { name: "view", ownerId: uid, targetType, createdAt: { gte: from, lt: to }, ...(targetType === "USER" ? { targetId: uid } : {}) },
  });
}

export async function studioOverview(userId: string) {
  const now = new Date();
  const from = new Date(now.getTime() - PERIOD_DAYS * DAY);
  const prevFrom = new Date(now.getTime() - 2 * PERIOD_DAYS * DAY);

  const [profileViews, profileViewsPrev, projectViews, projectViewsPrev, tutorialViews, tutorialViewsPrev, ix, ixPrev, profile, followersGained, meaningful, shop] = await Promise.all([
    views(userId, "USER", from, now),
    views(userId, "USER", prevFrom, from),
    views(userId, "PROJECT", from, now),
    views(userId, "PROJECT", prevFrom, from),
    views(userId, "TUTORIAL", from, now),
    views(userId, "TUTORIAL", prevFrom, from),
    interactions(userId, from, now),
    interactions(userId, prevFrom, from),
    db.userProfile.findUnique({ where: { userId }, select: { followerCount: true, projectCount: true, postCount: true } }),
    weeklySeries("Follow", "createdAt", { where: Prisma.sql`AND "followeeId" = ${userId}` }),
    db.analyticsEvent.count({ where: { userId, meaningful: true, createdAt: { gte: from } } }),
    db.shop.findUnique({ where: { ownerId: userId }, select: { id: true, name: true, status: true, currency: true } }),
  ]);

  let revenue: null | { gross: number; grossPrev: number; fees: number; orders: number; allTime: number; currency: string; series: number[] } = null;
  if (shop) {
    const paid = { shopId: shop.id, paidAt: { not: null }, status: { notIn: ["CANCELLED", "REFUNDED", "PENDING_PAYMENT"] as ("CANCELLED" | "REFUNDED" | "PENDING_PAYMENT")[] } };
    const [cur, prev, all, series] = await Promise.all([
      db.order.aggregate({ where: { ...paid, paidAt: { gte: from } }, _sum: { totalMinor: true, platformFeeMinor: true }, _count: { _all: true } }),
      db.order.aggregate({ where: { ...paid, paidAt: { gte: prevFrom, lt: from } }, _sum: { totalMinor: true } }),
      db.order.aggregate({ where: paid, _sum: { totalMinor: true } }),
      weeklySeries("Order", "paidAt", { sum: "totalMinor", where: Prisma.sql`AND "shopId" = ${shop.id} AND "status" NOT IN ('CANCELLED','REFUNDED','PENDING_PAYMENT')` }),
    ]);
    revenue = {
      gross: cur._sum.totalMinor ?? 0,
      grossPrev: prev._sum.totalMinor ?? 0,
      fees: cur._sum.platformFeeMinor ?? 0,
      orders: cur._count._all,
      allTime: all._sum.totalMinor ?? 0,
      currency: shop.currency,
      series,
    };
  }

  return {
    periodDays: PERIOD_DAYS,
    profileViews: { cur: profileViews, prev: profileViewsPrev },
    projectViews: { cur: projectViews, prev: projectViewsPrev },
    tutorialViews: { cur: tutorialViews, prev: tutorialViewsPrev },
    interactions: { cur: ix, prev: ixPrev },
    followers: { total: profile?.followerCount ?? 0, gainedSeries: followersGained, weeks: weekKeys() },
    meaningful,
    shop,
    revenue,
    heat: await publishingHeat(userId),
  };
}

/**
 * Veröffentlichungen pro Tag der letzten 12 Wochen (Beiträge, Journal, Projekte, Anleitungen, Artikel).
 * Tage nach Zürcher Kalender (nicht UTC): ein Beitrag um 00:30 Uhr zählt zum richtigen Tag.
 */
export async function publishingHeat(userId: string, weeks = 12) {
  const keys = zurichWeekDays(weeks);
  // Spalten sind „timestamp without time zone“ in UTC → erst als UTC lesen, dann nach Zürich umrechnen.
  // Untergrenze mit einem Tag Puffer; was ausserhalb der Schlüssel liegt, fällt unten weg.
  const start = new Date(new Date(`${keys[0]}T00:00:00Z`).getTime() - DAY);
  const local = (col: string) => Prisma.raw(`to_char(("${col}" AT TIME ZONE 'UTC') AT TIME ZONE '${TZ}', 'YYYY-MM-DD')`);
  const rows = await db.$queryRaw<{ d: string; n: bigint }[]>`
    SELECT d, count(*)::bigint AS n FROM (
      SELECT ${local("publishedAt")} AS d FROM "Post" WHERE "authorId" = ${userId} AND "state" = 'PUBLISHED' AND "publishedAt" >= ${start} AND "projectUpdateId" IS NULL
      UNION ALL SELECT ${local("createdAt")} FROM "ProjectUpdate" WHERE "authorId" = ${userId} AND "createdAt" >= ${start}
      UNION ALL SELECT ${local("publishedAt")} FROM "Project" WHERE "ownerId" = ${userId} AND "state" = 'PUBLISHED' AND "publishedAt" >= ${start}
      UNION ALL SELECT ${local("publishedAt")} FROM "Tutorial" WHERE "authorId" = ${userId} AND "state" = 'PUBLISHED' AND "publishedAt" >= ${start}
      UNION ALL SELECT ${local("publishedAt")} FROM "BlogArticle" WHERE "authorId" = ${userId} AND "state" = 'PUBLISHED' AND "publishedAt" >= ${start}
    ) t GROUP BY 1`;
  const map = new Map(rows.map((r) => [r.d, Number(r.n)]));
  const days = keys.map((date) => ({ date, n: map.get(date) ?? 0 }));
  return { days, today: zurichDayKey(), total: days.reduce((a, b) => a + b.n, 0), activeDays: days.filter((d) => d.n > 0).length };
}

/* ───────────── Inhalte (alle Typen) ───────────── */

export type OwnContentType = "post" | "project" | "tutorial" | "article" | "product";
export type OwnContentState = "draft" | "published" | "archived";
export type OwnContentRow = {
  type: OwnContentType;
  id: string;
  title: string;
  state: OwnContentState;
  stateLabel: string;
  updatedAt: Date;
  href: string | null;
  manageHref: string;
  meta: string | null;
};

export async function listOwnContent(userId: string, handle: string, opts: { type?: OwnContentType | null; state?: OwnContentState | null; take?: number } = {}) {
  const take = Math.min(300, opts.take ?? 150);
  const want = (t: OwnContentType) => !opts.type || opts.type === t;
  const st = opts.state;
  const shop = await db.shop.findUnique({ where: { ownerId: userId }, select: { id: true, slug: true } });

  const [posts, projects, tutorials, articles, products] = await Promise.all([
    want("post")
      ? db.post.findMany({
          where: { authorId: userId, projectUpdateId: null, NOT: { state: "DRAFT", articleId: { not: null } }, ...(st === "draft" ? { state: "DRAFT" } : st === "published" ? { state: "PUBLISHED" } : st === "archived" ? { state: { in: ["HIDDEN", "REMOVED"] } } : {}) },
          orderBy: { updatedAt: "desc" },
          take,
          select: { id: true, body: true, kind: true, state: true, scheduledAt: true, updatedAt: true, likeCount: true, commentCount: true },
        })
      : [],
    want("project")
      ? db.project.findMany({
          where: {
            ownerId: userId,
            ...(st === "draft" ? { state: "DRAFT" } : st === "published" ? { state: "PUBLISHED", status: { not: "ARCHIVED" } } : st === "archived" ? { OR: [{ status: "ARCHIVED" }, { state: { in: ["HIDDEN", "REMOVED"] } }] } : {}),
          },
          orderBy: { updatedAt: "desc" },
          take,
          select: { id: true, title: true, slug: true, state: true, status: true, updatedAt: true, _count: { select: { updates: true } } },
        })
      : [],
    want("tutorial")
      ? db.tutorial.findMany({
          where: { authorId: userId, ...(st === "draft" ? { state: "DRAFT" } : st === "published" ? { state: "PUBLISHED" } : st === "archived" ? { state: { in: ["HIDDEN", "REMOVED"] } } : {}) },
          orderBy: { updatedAt: "desc" },
          take,
          select: { id: true, title: true, slug: true, state: true, updatedAt: true, currentVersion: { select: { version: true } } },
        })
      : [],
    want("article")
      ? db.blogArticle.findMany({
          where: { authorId: userId, ...(st === "draft" ? { state: { in: ["DRAFT", "SCHEDULED"] } } : st === "published" ? { state: "PUBLISHED" } : st === "archived" ? { state: "HIDDEN" } : {}) },
          orderBy: { updatedAt: "desc" },
          take,
          select: { id: true, title: true, slug: true, state: true, updatedAt: true, readingMinutes: true },
        })
      : [],
    want("product") && shop
      ? db.product.findMany({
          where: { shopId: shop.id, ...(st === "draft" ? { status: "DRAFT" } : st === "published" ? { status: { in: ["ACTIVE", "SOLD_OUT"] } } : st === "archived" ? { status: { in: ["PAUSED", "DISABLED"] } } : {}) },
          orderBy: { updatedAt: "desc" },
          take,
          select: { id: true, title: true, slug: true, status: true, updatedAt: true, priceMinor: true, currency: true },
        })
      : [],
  ]);

  const contentState = (s: string): { state: OwnContentState; label: string } =>
    s === "PUBLISHED" ? { state: "published", label: "Veröffentlicht" } : s === "DRAFT" ? { state: "draft", label: "Entwurf" } : s === "REMOVED" ? { state: "archived", label: "Entfernt (Moderation)" } : { state: "archived", label: "Ausgeblendet" };

  const rows: OwnContentRow[] = [
    ...posts.map((p) => ({
      type: "post" as const,
      id: p.id,
      title: p.body.replace(/\s+/g, " ").slice(0, 90) || "Beitrag ohne Text",
      ...(() => {
        const s = contentState(p.state);
        const planned = p.state === "DRAFT" && p.scheduledAt ? `Geplant · ${p.scheduledAt.toLocaleString("de-CH", { timeZone: "Europe/Zurich", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}` : null;
        return { state: s.state, stateLabel: planned ?? s.label };
      })(),
      updatedAt: p.updatedAt,
      href: p.state === "REMOVED" ? null : `/beitrag/${p.id}`,
      // Entfernte Beiträge lassen sich nicht mehr bearbeiten → zur Benachrichtigung mit Einspruchsmöglichkeit
      manageHref: p.state === "REMOVED" ? "/benachrichtigungen" : `/studio/inhalte/beitrag/${p.id}`,
      meta: `${p.likeCount} Gefällt-mir · ${p.commentCount} Kommentare`,
    })),
    ...projects.map((p) => {
      const s = p.status === "ARCHIVED" && p.state === "PUBLISHED" ? { state: "archived" as const, label: "Archiviert" } : contentState(p.state);
      return { type: "project" as const, id: p.id, title: p.title, state: s.state, stateLabel: s.label, updatedAt: p.updatedAt, href: p.state === "REMOVED" ? null : `/u/${handle}/${p.slug}`, manageHref: p.state === "REMOVED" ? "/studio/projekte" : `/u/${handle}/${p.slug}/bearbeiten`, meta: `${p._count.updates} Journal-Einträge` };
    }),
    ...tutorials.map((t) => {
      const s = contentState(t.state);
      return { type: "tutorial" as const, id: t.id, title: t.title, state: s.state, stateLabel: s.label, updatedAt: t.updatedAt, href: t.state === "PUBLISHED" ? `/anleitungen/${t.slug}` : null, manageHref: `/studio/anleitungen/${t.id}`, meta: t.currentVersion ? `Version ${t.currentVersion.version}` : "unveröffentlicht" };
    }),
    ...articles.map((a) => {
      const s = a.state === "PUBLISHED" ? { state: "published" as const, label: "Veröffentlicht" } : a.state === "HIDDEN" ? { state: "archived" as const, label: "Verborgen" } : { state: "draft" as const, label: a.state === "SCHEDULED" ? "Geplant" : "Entwurf" };
      return { type: "article" as const, id: a.id, title: a.title, state: s.state, stateLabel: s.label, updatedAt: a.updatedAt, href: a.state === "PUBLISHED" ? `/u/${handle}/blog/${a.slug}` : null, manageHref: `/studio/blog/${a.id}`, meta: `${a.readingMinutes} Min. Lesezeit` };
    }),
    ...products.map((p) => {
      const s =
        p.status === "ACTIVE" ? { state: "published" as const, label: "Aktiv" } : p.status === "SOLD_OUT" ? { state: "published" as const, label: "Ausverkauft" } : p.status === "DRAFT" ? { state: "draft" as const, label: "Entwurf" } : { state: "archived" as const, label: p.status === "DISABLED" ? "Deaktiviert" : "Pausiert" };
      return { type: "product" as const, id: p.id, title: p.title, state: s.state, stateLabel: s.label, updatedAt: p.updatedAt, href: s.state === "published" && shop ? `/markt/${shop.slug}/${p.slug}` : null, manageHref: `/studio/produkte/${p.id}`, meta: `${(p.priceMinor / 100).toFixed(2)} ${p.currency}` };
    }),
  ];
  rows.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  return { rows: rows.slice(0, take), hasShop: !!shop };
}

/* ───────────── Statistik je Inhalt ───────────── */

export async function contentStats(userId: string, weeks = 12) {
  const keys = weekKeys(weeks);
  const start = new Date(`${keys[0]}T00:00:00Z`);
  const [projects, tutorials, articles, posts, products, series] = await Promise.all([
    db.project.findMany({ where: { ownerId: userId, state: { in: ["PUBLISHED", "HIDDEN"] } }, orderBy: { viewCount: "desc" }, take: 60, select: { id: true, title: true, viewCount: true, likeCount: true, saveCount: true, commentCount: true, remixCount: true, publishedAt: true } }),
    db.tutorial.findMany({ where: { authorId: userId, state: { in: ["PUBLISHED", "HIDDEN"] } }, orderBy: { viewCount: "desc" }, take: 60, select: { id: true, title: true, viewCount: true, likeCount: true, saveCount: true, completionCount: true, publishedAt: true } }),
    db.blogArticle.findMany({ where: { authorId: userId, state: "PUBLISHED" }, orderBy: { viewCount: "desc" }, take: 40, select: { id: true, title: true, viewCount: true, likeCount: true, publishedAt: true } }),
    db.post.findMany({ where: { authorId: userId, state: "PUBLISHED", projectUpdateId: null }, orderBy: { publishedAt: "desc" }, take: 40, select: { id: true, body: true, likeCount: true, saveCount: true, commentCount: true, repostCount: true, publishedAt: true } }),
    db.product.findMany({ where: { shop: { ownerId: userId }, status: { in: ["ACTIVE", "SOLD_OUT", "PAUSED"] } }, orderBy: { viewCount: "desc" }, take: 40, select: { id: true, title: true, viewCount: true, saveCount: true, ratingCount: true, publishedAt: true, _count: { select: { orderItems: true } } } }),
    db.$queryRaw<{ id: string; wk: string; n: bigint }[]>`
      SELECT "targetId" AS id, to_char(date_trunc('week', "createdAt"), 'YYYY-MM-DD') AS wk, count(*)::bigint AS n
      FROM "AnalyticsEvent" WHERE "ownerId" = ${userId} AND "name" = 'view' AND "targetId" IS NOT NULL AND "createdAt" >= ${start}
      GROUP BY 1, 2`,
  ]);
  const byId = new Map<string, Map<string, number>>();
  for (const r of series) {
    if (!byId.has(r.id)) byId.set(r.id, new Map());
    byId.get(r.id)!.set(r.wk, Number(r.n));
  }
  const trend = (id: string) => keys.map((k) => byId.get(id)?.get(k) ?? 0);
  const viewsInRange = (id: string) => trend(id).reduce((a, b) => a + b, 0);
  return { projects, tutorials, articles, posts, products, trend, viewsInRange, weeks: keys };
}

/* ───────────── Medienbibliothek ───────────── */

export async function listMedia(userId: string, filter: "all" | "unused" | "images" | "videos" | "files" = "all") {
  const rows = await db.media.findMany({
    where: {
      ownerId: userId,
      ...(filter === "images" ? { kind: "IMAGE" } : filter === "videos" ? { kind: "VIDEO" } : filter === "files" ? { kind: "FILE" } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 300,
    select: {
      id: true,
      kind: true,
      state: true,
      mime: true,
      bytes: true,
      width: true,
      height: true,
      variants: true,
      isPrivate: true,
      alt: true,
      attachedAt: true,
      createdAt: true,
      _count: { select: { postMedia: true, projectMedia: true, productMedia: true, tutorialMedia: true } },
    },
  });
  const [covers, profile] = await Promise.all([
    db.project.findMany({ where: { ownerId: userId, coverMediaId: { in: rows.map((r) => r.id) } }, select: { coverMediaId: true } }),
    db.userProfile.findUnique({ where: { userId }, select: { avatarUrl: true, coverUrl: true } }),
  ]);
  const coverIds = new Set(covers.map((c) => c.coverMediaId));
  const directUses = (m: (typeof rows)[number]) => m._count.postMedia + m._count.projectMedia + m._count.productMedia + m._count.tutorialMedia + (coverIds.has(m.id) ? 1 : 0);
  const profileUse = (m: (typeof rows)[number]) => Object.values((m.variants ?? {}) as Record<string, string>).some((u) => u && (u === profile?.avatarUrl || u === profile?.coverUrl));
  // `attachedAt` bleibt nach dem Löschen des Inhalts gesetzt → für Medien ohne direkte Verknüpfung die
  // tatsächliche Verwendung (JSON-Felder, URL-Verweise) nachprüfen, statt sie für immer „verwendet“ zu zeigen
  const indirect = await mediaInUse(rows.filter((m) => m.attachedAt && !directUses(m) && !profileUse(m)).map((m) => m.id));
  const items = rows.map((m) => {
    const v = (m.variants ?? {}) as Record<string, string>;
    const uses = directUses(m);
    const isProfile = profileUse(m);
    const linked = !!m.attachedAt && indirect.has(m.id);
    const usedIn = [
      m._count.postMedia && `${m._count.postMedia} Beitrag`,
      (m._count.projectMedia || coverIds.has(m.id)) && "Projekt",
      m._count.tutorialMedia && "Anleitung",
      m._count.productMedia && "Produkt",
      isProfile && "Profil",
    ].filter(Boolean) as string[];
    return {
      id: m.id,
      kind: m.kind,
      state: m.state,
      mime: m.mime,
      bytes: m.bytes,
      width: m.width,
      height: m.height,
      preview: m.kind === "IMAGE" ? (v.sm ?? v.thumb ?? v.md ?? null) : null,
      isPrivate: m.isPrivate,
      alt: m.alt,
      createdAt: m.createdAt,
      // Verwendungen in JSON-Feldern (Journal, Anleitungsschritte, Nachrichten, Artikel) und per URL
      attached: uses > 0 || isProfile || linked,
      usedIn: usedIn.length || !linked ? usedIn : ["Verknüpft"],
    };
  });
  const filtered = filter === "unused" ? items.filter((i) => !i.attached) : items;
  const totalBytes = rows.reduce((a, b) => a + b.bytes, 0);
  return { items: filtered, totalBytes, count: rows.length };
}

export async function updateMediaAlt(userId: string, mediaId: string, alt: string) {
  const clean = alt.trim().slice(0, 500);
  const r = await db.media.updateMany({ where: { id: mediaId, ownerId: userId }, data: { alt: clean } });
  if (!r.count) throw fail.notFound();
  // Alt-Texte an Verwendungen weitergeben, wo sie noch leer sind
  await Promise.all([
    db.postMedia.updateMany({ where: { mediaId, alt: "" }, data: { alt: clean } }),
    db.projectMedia.updateMany({ where: { mediaId, alt: "" }, data: { alt: clean } }),
    db.productMedia.updateMany({ where: { mediaId, alt: "" }, data: { alt: clean } }),
  ]);
}

export async function deleteUnusedMedia(userId: string, mediaId: string) {
  // Direkt über ID + Eigentümer:in (nicht nur unter den neuesten 300 der Bibliothek)
  const row = await db.media.findFirst({ where: { id: mediaId, ownerId: userId }, select: { storageKey: true, variants: true } });
  if (!row) throw fail.notFound();
  if ((await mediaInUse([mediaId])).has(mediaId)) throw fail.conflict("Dieses Medium wird noch verwendet. Entferne es zuerst aus dem Inhalt.");
  const keys = new Set<string>([row.storageKey]);
  for (const url of Object.values((row.variants ?? {}) as Record<string, string>)) {
    if (typeof url === "string" && url.startsWith("/media/")) keys.add(url.slice("/media/".length));
  }
  await db.media.delete({ where: { id: mediaId } });
  await Promise.all([...keys].map((k) => storage().del(k).catch(() => {})));
}
