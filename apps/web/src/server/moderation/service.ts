import "server-only";
import {
  APPEAL_WINDOW_DAYS,
  MODERATION_ACTION_LABEL,
  REPORT_REASON_LABEL,
  appealDecisionSchema,
  appealSchema,
  moderationDecisionSchema,
  type ModerationActionKind,
  type ReportReason,
} from "@werkraum/shared";
import { db, type ModerationCaseStatus, type Prisma, type TargetType, type Tx } from "@/server/db";
import { fail } from "@/server/errors";
import { audit } from "@/server/audit";
import { emit } from "@/server/events";
import { notify } from "@/server/notifications";
import { hasRole } from "@/server/authz";
import { targetMeta } from "@/server/social/targets";
import type { SessionUser } from "@/server/auth/session";

/**
 * Moderationsablauf (PRD §24): Meldung → Fall → Priorisierung → Entscheidung →
 * Benachrichtigung → Einspruch. Jede Entscheidung ist begründet, protokolliert
 * (audit) und – bei Stattgabe eines Einspruchs – vollständig umkehrbar.
 */

type Actor = Pick<SessionUser, "id" | "role">;

const DAY = 86_400_000;
export const OPEN_STATUSES: ModerationCaseStatus[] = ["OPEN", "IN_REVIEW"];

export function reasonLabel(reason: string) {
  return REPORT_REASON_LABEL[reason as ReportReason] ?? reason;
}

function assertModerator(actor: Actor) {
  if (!hasRole(actor, "PLATFORM_MODERATOR")) throw fail.forbidden();
}

/* ───────────────────────────── Warteschlange ───────────────────────────── */

export type QueueFilter = {
  status?: ModerationCaseStatus | "ACTIVE" | "ALL";
  targetType?: TargetType | null;
  assignee?: "me" | "none" | null;
  q?: string | null;
};

export async function listQueue(actor: Actor, filter: QueueFilter = {}, page = 1, perPage = 30) {
  assertModerator(actor);
  const status = filter.status ?? "ACTIVE";
  const where: Prisma.ModerationCaseWhereInput = {
    ...(status === "ALL" ? {} : status === "ACTIVE" ? { status: { in: [...OPEN_STATUSES, "APPEALED"] } } : { status }),
    ...(filter.targetType ? { targetType: filter.targetType } : {}),
    ...(filter.assignee === "me" ? { assigneeId: actor.id } : filter.assignee === "none" ? { assigneeId: null } : {}),
  };
  const q = filter.q?.trim();
  if (q) {
    const n = Number(q.replace(/^#|^nº\s*/i, ""));
    where.OR = [...(Number.isInteger(n) && n > 0 ? [{ number: n }] : []), { targetId: q }, { subjectUser: { profile: { handle: q.replace(/^@/, "").toLowerCase() } } }];
  }
  const [rows, total, counts] = await Promise.all([
    db.moderationCase.findMany({
      where,
      // Priorität: Risiko absteigend, dann Alter (ältere zuerst) – §24.1 Nr. 4
      orderBy: [{ riskScore: "desc" }, { createdAt: "asc" }],
      skip: (page - 1) * perPage,
      take: perPage,
      include: {
        assignee: { select: { id: true, profile: { select: { handle: true, displayName: true } } } },
        subjectUser: { select: { id: true, status: true, profile: { select: { handle: true, displayName: true } } } },
        _count: { select: { reports: true, appeals: true } },
      },
    }),
    db.moderationCase.count({ where }),
    db.moderationCase.groupBy({ by: ["status"], _count: { _all: true } }),
  ]);
  const byStatus = Object.fromEntries(counts.map((c) => [c.status, c._count._all])) as Partial<Record<ModerationCaseStatus, number>>;
  return { rows, total, byStatus, page, pages: Math.max(1, Math.ceil(total / perPage)) };
}

export async function assignCase(actor: Actor, caseId: string, assign: boolean) {
  assertModerator(actor);
  const c = await db.moderationCase.findUnique({ where: { id: caseId }, select: { id: true, status: true, assigneeId: true, number: true } });
  if (!c) throw fail.notFound();
  if (!assign && c.assigneeId !== actor.id && !hasRole(actor, "ADMIN")) throw fail.forbidden("Nur die zugewiesene Person kann den Fall freigeben.");
  const status: ModerationCaseStatus = assign && c.status === "OPEN" ? "IN_REVIEW" : !assign && c.status === "IN_REVIEW" ? "OPEN" : c.status;
  await db.$transaction(async (tx) => {
    await tx.moderationCase.update({ where: { id: caseId }, data: { assigneeId: assign ? actor.id : null, status } });
    await audit({ actorId: actor.id, action: assign ? "moderation.case_assigned" : "moderation.case_released", targetType: "MODERATION_CASE", targetId: caseId, meta: { number: c.number } }, tx);
  });
}

/* ───────────────────────────── Falldetail ───────────────────────────── */

export type ContentPreview = {
  exists: boolean;
  title: string;
  href: string | null;
  state: string | null;
  body: string | null;
  imageUrl: string | null;
  meta: { label: string; value: string }[];
  ownerId: string | null;
};

/** Live-Ansicht des gemeldeten Inhalts (unabhängig von Sichtbarkeit – nur für Moderation). */
export async function contentPreview(type: TargetType, id: string): Promise<ContentPreview> {
  const meta = await targetMeta(type, id);
  const base: ContentPreview = { exists: !!meta, title: meta?.title || "–", href: meta?.href ?? null, state: meta?.state ?? null, body: null, imageUrl: null, meta: [], ownerId: meta?.ownerId ?? null };
  if (!meta) return base;
  switch (type) {
    case "POST": {
      const p = await db.post.findUnique({ where: { id }, select: { body: true, kind: true, visibility: true, reachLimited: true, isCommercial: true, media: { take: 1, orderBy: { position: "asc" }, select: { media: { select: { variants: true } } } } } });
      if (!p) return base;
      const v = (p.media[0]?.media.variants ?? {}) as Record<string, string>;
      return { ...base, body: p.body, imageUrl: v.md ?? v.sm ?? null, meta: [{ label: "Art", value: p.kind }, { label: "Sichtbarkeit", value: p.visibility }, { label: "Reichweite", value: p.reachLimited ? "beschränkt" : "normal" }, ...(p.isCommercial ? [{ label: "Werbung", value: "ja" }] : [])] };
    }
    case "COMMENT": {
      const c = await db.comment.findUnique({ where: { id }, select: { body: true, targetType: true } });
      return { ...base, body: c?.body ?? null, meta: [{ label: "Kommentar zu", value: c?.targetType ?? "–" }] };
    }
    case "PROJECT": {
      const p = await db.project.findUnique({ where: { id }, select: { description: true, coverUrl: true, category: true, status: true, visibility: true, isFeatured: true } });
      return { ...base, body: p?.description ?? null, imageUrl: p?.coverUrl ?? null, meta: [{ label: "Kategorie", value: p?.category ?? "–" }, { label: "Status", value: p?.status ?? "–" }, { label: "Sichtbarkeit", value: p?.visibility ?? "–" }] };
    }
    case "TUTORIAL":
    case "TUTORIAL_STEP": {
      if (type === "TUTORIAL_STEP") {
        const s = await db.tutorialStep.findUnique({ where: { id }, select: { title: true, body: true, safety: true, position: true } });
        return { ...base, body: [s?.body, s?.safety ? `Sicherheitshinweis: ${s.safety}` : null].filter(Boolean).join("\n\n"), meta: [{ label: "Schritt", value: String((s?.position ?? 0) + 1) }] };
      }
      const t = await db.tutorial.findUnique({ where: { id }, select: { summary: true, coverUrl: true, safetyKinds: true, isPaid: true, difficulty: true } });
      return { ...base, body: t?.summary ?? null, imageUrl: t?.coverUrl ?? null, meta: [{ label: "Sicherheit", value: t?.safetyKinds.join(", ") || "–" }, { label: "Kostenpflichtig", value: t?.isPaid ? "ja" : "nein" }] };
    }
    case "PRODUCT": {
      const p = await db.product.findUnique({ where: { id }, select: { description: true, coverUrl: true, status: true, kind: true, priceMinor: true, currency: true, safetyInfo: true } });
      return { ...base, body: [p?.description, p?.safetyInfo ? `Sicherheit: ${p.safetyInfo}` : null].filter(Boolean).join("\n\n"), imageUrl: p?.coverUrl ?? null, state: p?.status ?? base.state, meta: [{ label: "Art", value: p?.kind ?? "–" }, { label: "Preis", value: p ? `${(p.priceMinor / 100).toFixed(2)} ${p.currency}` : "–" }] };
    }
    case "ARTICLE": {
      const a = await db.blogArticle.findUnique({ where: { id }, select: { dek: true, plainText: true, coverUrl: true, state: true } });
      return { ...base, body: [a?.dek, a?.plainText?.slice(0, 1500)].filter(Boolean).join("\n\n"), imageUrl: a?.coverUrl ?? null, state: a?.state ?? base.state };
    }
    case "COMMUNITY": {
      const c = await db.community.findUnique({ where: { id }, select: { description: true, coverUrl: true, visibility: true, memberCount: true } });
      return { ...base, body: c?.description ?? null, imageUrl: c?.coverUrl ?? null, meta: [{ label: "Sichtbarkeit", value: c?.visibility ?? "–" }, { label: "Mitglieder", value: String(c?.memberCount ?? 0) }] };
    }
    case "MESSAGE": {
      // Nur die gemeldete Nachricht – nie der ganze Verlauf (Datensparsamkeit §24.3).
      const m = await db.message.findUnique({ where: { id }, select: { body: true, flags: true, createdAt: true } });
      return { ...base, href: null, body: m?.body ?? null, meta: [{ label: "Markierungen", value: m?.flags.join(", ") || "–" }] };
    }
    case "REVIEW": {
      const r = await db.review.findUnique({ where: { id }, select: { body: true, productRating: true } });
      return { ...base, body: r?.body ?? null, meta: [{ label: "Bewertung", value: `${r?.productRating ?? "–"} / 5` }] };
    }
    case "USER": {
      const u = await db.user.findUnique({ where: { id }, select: { status: true, profile: { select: { bio: true, avatarUrl: true, handle: true } } } });
      return { ...base, body: u?.profile?.bio ?? null, imageUrl: u?.profile?.avatarUrl ?? null, state: u?.status ?? base.state, meta: [{ label: "Handle", value: `@${u?.profile?.handle ?? "–"}` }] };
    }
  }
}

export async function getCaseDetail(actor: Actor, caseId: string) {
  assertModerator(actor);
  const c = await db.moderationCase.findUnique({
    where: { id: caseId },
    include: {
      assignee: { select: { id: true, profile: { select: { handle: true, displayName: true } } } },
      subjectUser: {
        select: {
          id: true,
          status: true,
          role: true,
          suspendedUntil: true,
          messagingRestrictedUntil: true,
          createdAt: true,
          profile: { select: { handle: true, displayName: true, avatarUrl: true, followerCount: true, postCount: true, projectCount: true } },
        },
      },
      reports: {
        orderBy: { createdAt: "asc" },
        include: { reporter: { select: { id: true, profile: { select: { handle: true } } } } },
      },
      actions: { orderBy: { createdAt: "asc" }, include: { moderator: { select: { id: true, profile: { select: { handle: true, displayName: true } } } } } },
      appeals: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!c) throw fail.notFound();
  const [preview, history, reporterStats] = await Promise.all([
    contentPreview(c.targetType, c.targetId),
    c.subjectUserId
      ? db.moderationCase.findMany({
          where: { subjectUserId: c.subjectUserId, id: { not: c.id } },
          orderBy: { createdAt: "desc" },
          take: 20,
          select: { id: true, number: true, targetType: true, primaryReason: true, status: true, createdAt: true, actions: { select: { action: true, createdAt: true }, orderBy: { createdAt: "desc" }, take: 3 } },
        })
      : Promise.resolve([]),
    // Kontext zu Meldenden: Anzahl ihrer Meldungen insgesamt (erkennt Massenmeldungen)
    db.report.groupBy({ by: ["reporterId"], where: { reporterId: { in: [...new Set(c.reports.map((r) => r.reporterId))] } }, _count: { _all: true } }),
  ]);
  return { case: c, preview, history, reporterStats: Object.fromEntries(reporterStats.map((r) => [r.reporterId, r._count._all])) as Record<string, number> };
}
export type CaseDetail = Awaited<ReturnType<typeof getCaseDetail>>;

/* ───────────────────────────── Massnahmen ───────────────────────────── */

/** Welche Massnahmen sind für welchen Zieltyp möglich? */
export function allowedActions(type: TargetType, hasSubject: boolean): ModerationActionKind[] {
  const user: ModerationActionKind[] = hasSubject ? ["RESTRICT_MESSAGING", "SUSPEND", "BAN"] : [];
  const base: ModerationActionKind[] = ["NONE", ...(hasSubject ? (["WARN"] as const) : [])];
  switch (type) {
    case "POST":
      return [...base, "LIMIT_REACH", "HIDE", "REMOVE", ...user];
    case "PRODUCT":
      return [...base, "DISABLE_LISTING", "HIDE", ...user];
    case "USER":
      return [...base, ...user];
    case "MESSAGE":
    case "COMMENT":
    case "REVIEW":
    case "PROJECT":
    case "TUTORIAL":
    case "TUTORIAL_STEP":
    case "COMMUNITY":
    case "ARTICLE":
      return [...base, "HIDE", "REMOVE", ...user];
  }
}

/** Vorheriger Zustand, damit ein Einspruch die Massnahme exakt zurücknehmen kann. */
type Prior =
  | { kind: "content"; model: string; id: string; field: "state" | "status" | "reachLimited"; value: string | boolean }
  | { kind: "user"; userId: string; status: string; suspendedUntil: string | null; messagingRestrictedUntil: string | null; shops?: { id: string; status: string }[] }
  | { kind: "none" };

async function applyToContent(tx: Tx, type: TargetType, id: string, action: "HIDE" | "REMOVE" | "LIMIT_REACH" | "DISABLE_LISTING"): Promise<Prior> {
  const contentState = action === "REMOVE" ? "REMOVED" : "HIDDEN";
  switch (type) {
    case "POST": {
      const p = await tx.post.findUniqueOrThrow({ where: { id }, select: { state: true, reachLimited: true } });
      if (action === "LIMIT_REACH") {
        await tx.post.update({ where: { id }, data: { reachLimited: true } });
        return { kind: "content", model: "post", id, field: "reachLimited", value: p.reachLimited };
      }
      await tx.post.update({ where: { id }, data: { state: contentState } });
      return { kind: "content", model: "post", id, field: "state", value: p.state };
    }
    case "COMMENT": {
      const c = await tx.comment.findUniqueOrThrow({ where: { id }, select: { state: true } });
      await tx.comment.update({ where: { id }, data: { state: contentState } });
      return { kind: "content", model: "comment", id, field: "state", value: c.state };
    }
    case "PROJECT": {
      const p = await tx.project.findUniqueOrThrow({ where: { id }, select: { state: true } });
      await tx.project.update({ where: { id }, data: { state: contentState, isFeatured: false } });
      return { kind: "content", model: "project", id, field: "state", value: p.state };
    }
    case "TUTORIAL":
    case "TUTORIAL_STEP": {
      const tid = type === "TUTORIAL" ? id : (await tx.tutorialStep.findUniqueOrThrow({ where: { id }, select: { version: { select: { tutorialId: true } } } })).version.tutorialId;
      const t = await tx.tutorial.findUniqueOrThrow({ where: { id: tid }, select: { state: true } });
      await tx.tutorial.update({ where: { id: tid }, data: { state: contentState, isFeatured: false } });
      return { kind: "content", model: "tutorial", id: tid, field: "state", value: t.state };
    }
    case "ARTICLE": {
      const a = await tx.blogArticle.findUniqueOrThrow({ where: { id }, select: { state: true } });
      // Artikel kennen kein REMOVED – entfernt = verborgen
      await tx.blogArticle.update({ where: { id }, data: { state: "HIDDEN", isFeatured: false } });
      return { kind: "content", model: "blogArticle", id, field: "state", value: a.state };
    }
    case "COMMUNITY": {
      const c = await tx.community.findUniqueOrThrow({ where: { id }, select: { state: true } });
      await tx.community.update({ where: { id }, data: { state: contentState, isFeatured: false } });
      return { kind: "content", model: "community", id, field: "state", value: c.state };
    }
    case "MESSAGE": {
      const m = await tx.message.findUniqueOrThrow({ where: { id }, select: { state: true } });
      await tx.message.update({ where: { id }, data: { state: contentState } });
      return { kind: "content", model: "message", id, field: "state", value: m.state };
    }
    case "REVIEW": {
      const r = await tx.review.findUniqueOrThrow({ where: { id }, select: { state: true } });
      await tx.review.update({ where: { id }, data: { state: contentState } });
      return { kind: "content", model: "review", id, field: "state", value: r.state };
    }
    case "PRODUCT": {
      const p = await tx.product.findUniqueOrThrow({ where: { id }, select: { status: true } });
      await tx.product.update({ where: { id }, data: { status: action === "HIDE" ? "PAUSED" : "DISABLED", isFeatured: false } });
      return { kind: "content", model: "product", id, field: "status", value: p.status };
    }
    case "USER":
      throw fail.invalid("Für Profile bitte eine Kontomassnahme wählen.");
  }
}

async function applyToUser(tx: Tx, userId: string, action: "RESTRICT_MESSAGING" | "SUSPEND" | "BAN", until: Date | null): Promise<Prior> {
  const u = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { status: true, suspendedUntil: true, messagingRestrictedUntil: true, role: true } });
  const prior: Prior = {
    kind: "user",
    userId,
    status: u.status,
    suspendedUntil: u.suspendedUntil?.toISOString() ?? null,
    messagingRestrictedUntil: u.messagingRestrictedUntil?.toISOString() ?? null,
  };
  if (u.status === "DELETED") throw fail.conflict("Das Konto wurde bereits gelöscht.");
  if (action === "RESTRICT_MESSAGING") {
    await tx.user.update({ where: { id: userId }, data: { messagingRestrictedUntil: until } });
  } else if (action === "SUSPEND") {
    await tx.user.update({ where: { id: userId }, data: { status: "SUSPENDED", suspendedUntil: until } });
    await tx.session.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
  } else {
    await tx.user.update({ where: { id: userId }, data: { status: "BANNED", suspendedUntil: null } });
    await tx.session.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
    // Verkaufsangebote eines dauerhaft gesperrten Kontos sind nicht mehr kaufbar – vorherigen Shop-Status
    // merken, damit ein stattgegebener Einspruch den Shop wiederherstellt
    const shops = await tx.shop.findMany({ where: { ownerId: userId, status: { in: ["ACTIVE", "PENDING_VERIFICATION", "PAUSED"] } }, select: { id: true, status: true } });
    if (shops.length) await tx.shop.updateMany({ where: { id: { in: shops.map((x) => x.id) } }, data: { status: "SUSPENDED" } });
    (prior as Extract<Prior, { kind: "user" }>).shops = shops;
  }
  return prior;
}

/** Zustand, den eine Inhaltsmassnahme gesetzt hat – nur dann darf ein Einspruch zurücksetzen. */
function appliedValue(model: string, field: string, action: string): string | boolean | null {
  if (field === "reachLimited") return true;
  if (model === "product") return action === "HIDE" ? "PAUSED" : "DISABLED";
  if (model === "blogArticle") return "HIDDEN";
  if (action === "HIDE") return "HIDDEN";
  if (action === "REMOVE") return "REMOVED";
  return null;
}

/**
 * Massnahme zurücknehmen (stattgegebener Einspruch) – aber nur, solange der aktuelle Zustand noch
 * der von dieser Massnahme gesetzte ist. Wurde seither anders entschieden (z.B. inzwischen gebannt
 * oder vom Admin entfernt), bleibt der neuere Zustand bestehen. Gibt zurück, ob zurückgesetzt wurde.
 */
async function revertPrior(tx: Tx, prior: Prior, action: string): Promise<boolean> {
  if (prior.kind === "none") return false;
  if (prior.kind === "user") {
    if (action === "RESTRICT_MESSAGING") {
      await tx.user.update({ where: { id: prior.userId }, data: { messagingRestrictedUntil: prior.messagingRestrictedUntil ? new Date(prior.messagingRestrictedUntil) : null } });
      return true;
    }
    const expected = action === "BAN" ? "BANNED" : "SUSPENDED";
    // Zurück auf den Stand vor dieser Massnahme (z.B. Bann → vorherige befristete Sperre bleibt)
    const target = (["ACTIVE", "SUSPENDED", "BANNED"].includes(prior.status) ? prior.status : "ACTIVE") as "ACTIVE" | "SUSPENDED" | "BANNED";
    const r = await tx.user.updateMany({
      where: { id: prior.userId, status: expected },
      data: { status: target, suspendedUntil: target === "SUSPENDED" && prior.suspendedUntil ? new Date(prior.suspendedUntil) : null },
    });
    if (!r.count) return false;
    for (const sh of prior.shops ?? []) {
      await tx.shop.updateMany({ where: { id: sh.id, status: "SUSPENDED" }, data: { status: sh.status as "ACTIVE" | "PENDING_VERIFICATION" | "PAUSED" } });
    }
    return true;
  }
  const expected = appliedValue(prior.model, prior.field, action);
  if (expected === null) return false;
  const where = { id: prior.id, [prior.field]: expected };
  const data = { [prior.field]: prior.value };
  const args = { where, data } as never;
  let count = 0;
  switch (prior.model) {
    case "post":
      count = (await tx.post.updateMany(args)).count;
      break;
    case "comment":
      count = (await tx.comment.updateMany(args)).count;
      break;
    case "project":
      count = (await tx.project.updateMany(args)).count;
      break;
    case "tutorial":
      count = (await tx.tutorial.updateMany(args)).count;
      break;
    case "blogArticle":
      count = (await tx.blogArticle.updateMany(args)).count;
      break;
    case "community":
      count = (await tx.community.updateMany(args)).count;
      break;
    case "message":
      count = (await tx.message.updateMany(args)).count;
      break;
    case "review":
      count = (await tx.review.updateMany(args)).count;
      break;
    case "product":
      count = (await tx.product.updateMany(args)).count;
      break;
  }
  return count > 0;
}

/** Standarddauer je Kontomassnahme, wenn keine angegeben ist. */
const DEFAULT_DAYS: Partial<Record<ModerationActionKind, number>> = { RESTRICT_MESSAGING: 14, SUSPEND: 7 };

export async function decideCase(actor: Actor, caseId: string, input: unknown) {
  assertModerator(actor);
  const data = moderationDecisionSchema.parse(input);
  const c = await db.moderationCase.findUnique({ where: { id: caseId }, include: { reports: { select: { reporterId: true } } } });
  if (!c) throw fail.notFound();
  if (!OPEN_STATUSES.includes(c.status)) throw fail.conflict("Dieser Fall wurde bereits entschieden.");
  if (!allowedActions(c.targetType, !!c.subjectUserId).includes(data.action)) throw fail.invalid("Diese Massnahme passt nicht zum gemeldeten Inhalt.");
  if (["SUSPEND", "BAN"].includes(data.action) && !data.publicNote) {
    throw fail.invalid("Bitte formuliere eine Begründung für die betroffene Person.", { publicNote: "Für Kontosperren erforderlich" });
  }
  if (c.subjectUserId) {
    const subject = await db.user.findUnique({ where: { id: c.subjectUserId }, select: { role: true } });
    // Teammitglieder können nur von höherrangigen Rollen sanktioniert werden.
    if (subject && subject.role !== "MEMBER" && ["RESTRICT_MESSAGING", "SUSPEND", "BAN"].includes(data.action) && !hasRole(actor, "SUPERADMIN")) {
      throw fail.forbidden("Kontomassnahmen gegen Teammitglieder darf nur die Superadministration verhängen.");
    }
    if (c.subjectUserId === actor.id) throw fail.forbidden("Du kannst nicht über eigene Inhalte entscheiden.");
  }

  const days = data.days ?? DEFAULT_DAYS[data.action];
  const until = data.action === "RESTRICT_MESSAGING" || data.action === "SUSPEND" ? new Date(Date.now() + (days ?? 7) * DAY) : null;

  const result = await db.$transaction(async (tx) => {
    // Fall beanspruchen: entscheiden zwei Personen gleichzeitig, gewinnt nur eine (keine doppelten Massnahmen)
    const claimed = await tx.moderationCase.updateMany({ where: { id: caseId, status: { in: OPEN_STATUSES } }, data: { status: "RESOLVED" } });
    if (claimed.count !== 1) throw fail.conflict("Dieser Fall wurde bereits entschieden.");
    let prior: Prior = { kind: "none" };
    switch (data.action) {
      case "HIDE":
      case "REMOVE":
      case "LIMIT_REACH":
      case "DISABLE_LISTING":
        prior = await applyToContent(tx, c.targetType, c.targetId, data.action);
        break;
      case "RESTRICT_MESSAGING":
      case "SUSPEND":
      case "BAN":
        prior = await applyToUser(tx, c.subjectUserId!, data.action, until);
        break;
    }
    const action = await tx.moderationAction.create({
      data: { caseId, moderatorId: actor.id, action: data.action, reason: data.reason, publicNote: data.publicNote, until },
    });
    const snapshot = { ...((c.snapshot ?? {}) as Record<string, unknown>), applied: { actionId: action.id, action: data.action, prior } };
    await tx.moderationCase.update({
      where: { id: caseId },
      data: { status: "RESOLVED", resolvedAt: new Date(), assigneeId: c.assigneeId ?? actor.id, snapshot: snapshot as object },
    });
    await audit(
      {
        actorId: actor.id,
        action: "moderation.decision",
        targetType: "MODERATION_CASE",
        targetId: caseId,
        meta: { number: c.number, decision: data.action, contentType: c.targetType, contentId: c.targetId, until: until?.toISOString() ?? null, days: days ?? null },
      },
      tx,
    );
    await emit({ type: "ModerationDecisionRecorded", caseId, actionId: action.id }, tx);

    // Betroffene Person: Entscheidung, Begründung, Einspruchsmöglichkeit (§24.1 Nr. 6–7)
    if (c.subjectUserId && data.action !== "NONE") {
      await notify(
        {
          recipientId: c.subjectUserId,
          type: "MODERATION",
          targetType: c.targetType,
          targetId: c.targetId,
          bundle: false,
          data: {
            kind: "DECISION",
            caseId,
            caseNumber: c.number,
            action: data.action,
            actionLabel: MODERATION_ACTION_LABEL[data.action],
            reasonLabel: reasonLabel(c.primaryReason),
            publicNote: data.publicNote,
            title: ((c.snapshot ?? {}) as Record<string, unknown>).title ?? null,
            until: until?.toISOString() ?? null,
            href: `/einspruch/${caseId}`,
          },
        },
        tx,
      );
    }
    // Meldende: Abschluss ohne Details (Schutz der betroffenen Person)
    const reporters = [...new Set(c.reports.map((r) => r.reporterId))].filter((id) => id !== c.subjectUserId);
    for (const reporterId of reporters) {
      await notify({ recipientId: reporterId, type: "MODERATION", bundle: false, data: { kind: "REPORT_RESOLVED", caseNumber: c.number, href: "/benachrichtigungen?filter=system" } }, tx);
    }
    return action;
  });
  return { actionId: result.id, number: c.number };
}

/* ───────────────────────────── Einsprüche ───────────────────────────── */

/** Daten für /einspruch/[caseId] – nur für die betroffene Person. */
export async function appealContext(userId: string, caseId: string) {
  const c = await db.moderationCase.findUnique({
    where: { id: caseId },
    select: {
      id: true,
      number: true,
      status: true,
      targetType: true,
      primaryReason: true,
      subjectUserId: true,
      snapshot: true,
      resolvedAt: true,
      createdAt: true,
      // Ursprüngliche Entscheidung (eine Aufhebung nach Einspruch wird später als NONE angehängt)
      actions: { orderBy: { createdAt: "asc" }, take: 1, select: { action: true, publicNote: true, until: true, createdAt: true } },
      appeals: { where: { userId }, select: { id: true, status: true, statement: true, decision: true, createdAt: true, decidedAt: true } },
    },
  });
  if (!c || c.subjectUserId !== userId) return null;
  const decision = c.actions[0] ?? null;
  const deadline = c.resolvedAt ? new Date(c.resolvedAt.getTime() + APPEAL_WINDOW_DAYS * DAY) : null;
  const appeal = c.appeals[0] ?? null;
  const canAppeal = !appeal && c.status === "RESOLVED" && !!decision && decision.action !== "NONE" && !!deadline && deadline > new Date();
  return {
    id: c.id,
    number: c.number,
    status: c.status,
    targetType: c.targetType,
    reasonLabel: reasonLabel(c.primaryReason),
    title: (((c.snapshot ?? {}) as Record<string, unknown>).title as string | undefined) ?? null,
    decision,
    deadline,
    appeal,
    canAppeal,
  };
}

export async function submitAppeal(user: Pick<SessionUser, "id">, caseId: string, input: unknown) {
  const { statement } = appealSchema.parse(input);
  const ctx = await appealContext(user.id, caseId);
  if (!ctx) throw fail.notFound();
  if (ctx.appeal) throw fail.conflict("Du hast zu diesem Fall bereits Einspruch erhoben.");
  if (!ctx.canAppeal) throw fail.conflict(ctx.deadline && ctx.deadline < new Date() ? "Die Einspruchsfrist von 14 Tagen ist abgelaufen." : "Gegen diesen Fall ist kein Einspruch möglich.");
  return db.$transaction(async (tx) => {
    // Bedingte Aktualisierung schützt vor Doppelklicks / parallelen Requests
    const upd = await tx.moderationCase.updateMany({ where: { id: caseId, status: "RESOLVED" }, data: { status: "APPEALED" } });
    if (upd.count !== 1) throw fail.conflict("Gegen diesen Fall ist kein Einspruch möglich.");
    const appeal = await tx.appeal.create({ data: { caseId, userId: user.id, statement } });
    await audit({ actorId: user.id, action: "moderation.appeal_submitted", targetType: "MODERATION_CASE", targetId: caseId, meta: { number: ctx.number, appealId: appeal.id } }, tx);
    return appeal;
  });
}

export async function listAppeals(actor: Actor, status: "OPEN" | "UPHELD" | "OVERTURNED" | "ALL" = "OPEN") {
  assertModerator(actor);
  return db.appeal.findMany({
    where: status === "ALL" ? {} : { status },
    orderBy: { createdAt: status === "OPEN" ? "asc" : "desc" },
    take: 100,
    include: {
      user: { select: { id: true, profile: { select: { handle: true, displayName: true } } } },
      case: {
        select: {
          id: true,
          number: true,
          targetType: true,
          primaryReason: true,
          snapshot: true,
          actions: { orderBy: { createdAt: "asc" }, take: 1, select: { action: true, moderatorId: true, reason: true, publicNote: true, moderator: { select: { profile: { select: { handle: true } } } } } },
        },
      },
    },
  });
}

export async function decideAppeal(actor: Actor, appealId: string, input: unknown) {
  assertModerator(actor);
  const data = appealDecisionSchema.parse(input);
  const appeal = await db.appeal.findUnique({
    where: { id: appealId },
    include: { case: { include: { actions: { orderBy: { createdAt: "asc" }, take: 1 } } } },
  });
  if (!appeal) throw fail.notFound();
  if (appeal.status !== "OPEN") throw fail.conflict("Über diesen Einspruch wurde bereits entschieden.");
  if (appeal.userId === actor.id) throw fail.forbidden("Du kannst nicht über deinen eigenen Einspruch entscheiden.");
  const original = appeal.case.actions[0];
  // Vier-Augen-Prinzip: eine andere Person prüft – sofern im Team möglich (§24.1 Nr. 7)
  if (original?.moderatorId === actor.id) {
    const others = await db.user.count({ where: { id: { not: actor.id }, role: { in: ["PLATFORM_MODERATOR", "ADMIN", "SUPERADMIN"] }, status: "ACTIVE" } });
    if (others > 0) throw fail.forbidden("Bitte lass den Einspruch von einer anderen Person aus dem Team prüfen.");
  }
  const applied = ((appeal.case.snapshot ?? {}) as { applied?: { prior?: Prior; action?: string } }).applied;
  // Banns hebt nur die Administration auf (wie beim direkten Entsperren)
  if (data.decision === "OVERTURNED" && applied?.action === "BAN" && !hasRole(actor, "ADMIN")) throw fail.forbidden("Einen dauerhaften Bann kann nur die Administration aufheben.");

  await db.$transaction(async (tx) => {
    const upd = await tx.appeal.updateMany({ where: { id: appealId, status: "OPEN" }, data: { status: data.decision, decidedBy: actor.id, decision: data.note, decidedAt: new Date() } });
    if (upd.count !== 1) throw fail.conflict("Über diesen Einspruch wurde bereits entschieden.");
    if (data.decision === "OVERTURNED") {
      const reverted = applied?.prior ? await revertPrior(tx, applied.prior, applied.action ?? "") : false;
      await tx.moderationAction.create({
        data: {
          caseId: appeal.caseId,
          moderatorId: actor.id,
          action: "NONE",
          reason: reverted || !applied?.prior || applied.prior.kind === "none" ? `Einspruch stattgegeben – Massnahme aufgehoben. ${data.note}` : `Einspruch stattgegeben – der Zustand wurde inzwischen durch eine andere Entscheidung geändert und bleibt bestehen. ${data.note}`,
          publicNote: data.note,
        },
      });
    }
    await tx.moderationCase.update({ where: { id: appeal.caseId }, data: { status: "CLOSED" } });
    await audit(
      {
        actorId: actor.id,
        action: data.decision === "OVERTURNED" ? "moderation.appeal_overturned" : "moderation.appeal_upheld",
        targetType: "MODERATION_CASE",
        targetId: appeal.caseId,
        meta: { number: appeal.case.number, appealId, reverted: data.decision === "OVERTURNED" ? (applied?.action ?? null) : null },
      },
      tx,
    );
    await notify(
      {
        recipientId: appeal.userId,
        type: "MODERATION",
        bundle: false,
        data: { kind: "APPEAL_DECIDED", caseId: appeal.caseId, caseNumber: appeal.case.number, outcome: data.decision, publicNote: data.note, href: `/einspruch/${appeal.caseId}` },
      },
      tx,
    );
  });
}

/* ───────────────────────────── Meldungen ───────────────────────────── */

export async function listReports(actor: Actor, opts: { reason?: string | null; targetType?: TargetType | null; page?: number } = {}) {
  assertModerator(actor);
  const page = Math.max(1, opts.page ?? 1);
  const where: Prisma.ReportWhereInput = {
    ...(opts.reason ? { reason: opts.reason } : {}),
    ...(opts.targetType ? { targetType: opts.targetType } : {}),
  };
  const [rows, total, byReason] = await Promise.all([
    db.report.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * 50,
      take: 50,
      include: { reporter: { select: { profile: { select: { handle: true } } } }, case: { select: { id: true, number: true, status: true, riskScore: true } } },
    }),
    db.report.count({ where }),
    db.report.groupBy({ by: ["reason"], where: { createdAt: { gte: new Date(Date.now() - 30 * DAY) } }, _count: { _all: true } }),
  ]);
  return { rows, total, page, pages: Math.max(1, Math.ceil(total / 50)), byReason: Object.fromEntries(byReason.map((r) => [r.reason, r._count._all])) as Record<string, number> };
}

/** Moderationsverlauf einer Person (Admin → Nutzer). */
export async function userModerationHistory(userId: string) {
  return db.moderationCase.findMany({
    where: { subjectUserId: userId },
    orderBy: { createdAt: "desc" },
    take: 30,
    select: { id: true, number: true, targetType: true, primaryReason: true, status: true, riskScore: true, createdAt: true, actions: { orderBy: { createdAt: "desc" }, take: 1, select: { action: true, until: true } } },
  });
}
