import "server-only";
import { db, Prisma } from "@/server/db";

/**
 * Kennzahlen für das Admin-Dashboard (PRD §30). Bewusst wenige, erklärbare
 * Werte – keine Eitelkeitsmetriken. Zahlungskennzahlen (GMV, Provision) werden
 * nur für ADMIN berechnet (§24.3).
 */

const DAY = 86_400_000;
export const WEEKS = 12;

type Table = "User" | "Project" | "Post" | "Order" | "Comment" | "AnalyticsEvent" | "ModerationCase" | "Follow";
type Column = "createdAt" | "paidAt" | "completedAt" | "resolvedAt" | "publishedAt";

/** Montag 00:00 UTC der Woche von `d` – identisch zu Postgres `date_trunc('week', …)` in UTC. */
export function weekStart(d: Date) {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dow = (x.getUTCDay() + 6) % 7;
  x.setUTCDate(x.getUTCDate() - dow);
  return x;
}

export function weekKeys(weeks = WEEKS, now = new Date()) {
  const start = weekStart(now);
  return Array.from({ length: weeks }, (_, i) => {
    const d = new Date(start);
    d.setUTCDate(d.getUTCDate() - (weeks - 1 - i) * 7);
    return d.toISOString().slice(0, 10);
  });
}

/** Wöchentliche Zählung (oder Summe) über eine Tabelle, lückenlos aufgefüllt. */
export async function weeklySeries(table: Table, column: Column, opts: { where?: Prisma.Sql; sum?: "totalMinor" | "platformFeeMinor"; distinct?: "userId"; weeks?: number } = {}) {
  const weeks = opts.weeks ?? WEEKS;
  const keys = weekKeys(weeks);
  const t = Prisma.raw(`"${table}"`);
  const c = Prisma.raw(`"${column}"`);
  const agg = opts.sum ? Prisma.raw(`coalesce(sum("${opts.sum}"),0)::bigint`) : opts.distinct ? Prisma.raw(`count(distinct "${opts.distinct}")::bigint`) : Prisma.raw("count(*)::bigint");
  const rows = await db.$queryRaw<{ wk: string; n: bigint }[]>`
    SELECT to_char(date_trunc('week', ${c}), 'YYYY-MM-DD') AS wk, ${agg} AS n
    FROM ${t}
    WHERE ${c} >= ${new Date(`${keys[0]}T00:00:00Z`)} ${opts.where ?? Prisma.empty}
    GROUP BY 1`;
  const map = new Map(rows.map((r) => [r.wk, Number(r.n)]));
  return keys.map((k) => map.get(k) ?? 0);
}

function pct(part: number, whole: number) {
  return whole > 0 ? part / whole : null;
}

export async function dashboardKpis(opts: { includeMoney: boolean }) {
  const now = Date.now();
  const d7 = new Date(now - 7 * DAY);
  const d30 = new Date(now - 30 * DAY);
  const d60 = new Date(now - 60 * DAY);

  const [
    wau,
    mau,
    users,
    newUsers7,
    publishedProjects,
    newProjects7,
    newProjectsPrev7,
    completedProjects,
    completed7,
    withMaterials,
    withTutorial,
    remixProjects,
    posts7,
    postsPrev7,
    projectComments,
    openCases,
    appealsOpen,
    medianRow,
    activeSellers,
    pendingSellers,
    activeProducts,
    orders30,
    refundedOrders30,
    meaningfulCreators7,
  ] = await Promise.all([
    db.user.count({ where: { status: "ACTIVE", lastSeenAt: { gte: d7 } } }),
    db.user.count({ where: { status: "ACTIVE", lastSeenAt: { gte: d30 } } }),
    db.user.count({ where: { status: { not: "DELETED" } } }),
    db.user.count({ where: { createdAt: { gte: d7 } } }),
    db.project.count({ where: { state: "PUBLISHED" } }),
    db.project.count({ where: { createdAt: { gte: d7 } } }),
    db.project.count({ where: { createdAt: { gte: new Date(now - 14 * DAY), lt: d7 } } }),
    db.project.count({ where: { state: "PUBLISHED", status: "COMPLETED" } }),
    db.project.count({ where: { completedAt: { gte: d7 } } }),
    db.project.count({ where: { state: "PUBLISHED", materials: { some: {} } } }),
    db.project.count({ where: { state: "PUBLISHED", tutorials: { some: {} } } }),
    db.project.count({ where: { state: "PUBLISHED", outgoing: { some: { kind: "REMIX" } } } }),
    db.post.count({ where: { state: "PUBLISHED", createdAt: { gte: d7 } } }),
    db.post.count({ where: { state: "PUBLISHED", createdAt: { gte: new Date(now - 14 * DAY), lt: d7 } } }),
    db.comment.count({ where: { state: "PUBLISHED", targetType: "PROJECT" } }),
    db.moderationCase.count({ where: { status: { in: ["OPEN", "IN_REVIEW"] } } }),
    db.appeal.count({ where: { status: "OPEN" } }),
    db.$queryRaw<{ median: number | null; n: bigint }[]>`
      SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM ("resolvedAt" - "createdAt"))) AS median, count(*)::bigint AS n
      FROM "ModerationCase" WHERE "resolvedAt" IS NOT NULL AND "resolvedAt" >= ${d30}`,
    db.shop.count({ where: { status: "ACTIVE" } }),
    db.shop.count({ where: { status: "PENDING_VERIFICATION" } }),
    db.product.count({ where: { status: "ACTIVE" } }),
    db.order.count({ where: { paidAt: { gte: d30 } } }),
    db.order.count({ where: { paidAt: { gte: d30 }, OR: [{ status: "REFUNDED" }, { refunds: { some: { status: "SUCCEEDED" } } }] } }),
    db.analyticsEvent.groupBy({ by: ["userId"], where: { meaningful: true, createdAt: { gte: d7 }, userId: { not: null } } }).then((r) => r.length),
  ]);

  const [seriesUsers, seriesProjects, seriesPosts, seriesOrders, seriesMeaningful, seriesCasesResolved] = await Promise.all([
    weeklySeries("User", "createdAt"),
    weeklySeries("Project", "createdAt"),
    weeklySeries("Post", "createdAt", { where: Prisma.sql`AND "state" = 'PUBLISHED'` }),
    weeklySeries("Order", "paidAt"),
    weeklySeries("AnalyticsEvent", "createdAt", { where: Prisma.sql`AND "meaningful" = true AND "userId" IS NOT NULL`, distinct: "userId" }),
    weeklySeries("ModerationCase", "resolvedAt"),
  ]);

  let money: null | { gmv30: number; gmvPrev30: number; commission30: number; seriesGmv: number[]; aov: number | null } = null;
  if (opts.includeMoney) {
    const valid = { status: { notIn: ["CANCELLED", "REFUNDED", "PENDING_PAYMENT"] as ("CANCELLED" | "REFUNDED" | "PENDING_PAYMENT")[] } };
    const [cur, prev, seriesGmv] = await Promise.all([
      db.order.aggregate({ where: { paidAt: { gte: d30 }, ...valid }, _sum: { totalMinor: true, platformFeeMinor: true }, _count: { _all: true } }),
      db.order.aggregate({ where: { paidAt: { gte: d60, lt: d30 }, ...valid }, _sum: { totalMinor: true } }),
      weeklySeries("Order", "paidAt", { sum: "totalMinor", where: Prisma.sql`AND "status" NOT IN ('CANCELLED','REFUNDED','PENDING_PAYMENT')` }),
    ]);
    const gmv30 = cur._sum.totalMinor ?? 0;
    money = { gmv30, gmvPrev30: prev._sum.totalMinor ?? 0, commission30: cur._sum.platformFeeMinor ?? 0, seriesGmv, aov: cur._count._all ? Math.round(gmv30 / cur._count._all) : null };
  }

  return {
    activity: { wau, mau, users, newUsers7, stickiness: pct(wau, mau), meaningfulCreators7, seriesUsers, seriesMeaningful },
    projects: {
      published: publishedProjects,
      new7: newProjects7,
      newPrev7: newProjectsPrev7,
      completed: completedProjects,
      completed7,
      shareWithMaterials: pct(withMaterials, publishedProjects),
      shareWithTutorial: pct(withTutorial, publishedProjects),
      remixRate: pct(remixProjects, publishedProjects),
      commentsPerProject: publishedProjects ? projectComments / publishedProjects : null,
      seriesProjects,
    },
    community: { posts7, postsPrev7, seriesPosts },
    moderation: {
      openCases,
      appealsOpen,
      medianHandlingSeconds: medianRow[0]?.median != null ? Number(medianRow[0].median) : null,
      resolved30: Number(medianRow[0]?.n ?? 0),
      seriesCasesResolved,
    },
    market: { activeSellers, pendingSellers, activeProducts, orders30, refundRate: pct(refundedOrders30, orders30), seriesOrders },
    money,
    weeks: weekKeys(),
  };
}
export type DashboardKpis = Awaited<ReturnType<typeof dashboardKpis>>;

/** Zähler für die Admin-Navigation (offene Arbeit). */
export async function adminNavCounts() {
  const [cases, appeals, shops, tickets, disputes] = await Promise.all([
    db.moderationCase.count({ where: { status: { in: ["OPEN", "IN_REVIEW"] } } }),
    db.appeal.count({ where: { status: "OPEN" } }),
    db.shop.count({ where: { status: "PENDING_VERIFICATION" } }),
    db.supportTicket.count({ where: { status: { in: ["OPEN", "IN_PROGRESS"] } } }),
    db.order.count({ where: { OR: [{ status: "PROBLEM" }, { payments: { some: { status: "DISPUTED" } } }] } }),
  ]);
  return { cases, appeals, shops, tickets, disputes };
}
