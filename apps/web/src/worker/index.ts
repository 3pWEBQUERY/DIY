/**
 * Werkuno Worker – Hintergrundjobs (PRD §25.2, §25.6, §27.3).
 * Läuft als eigener Railway-Service mit demselben Image: `pnpm worker`.
 *
 * - Outbox → Queues (Entkopplung von Benachrichtigungen, Medien, Analytics)
 * - Medienverarbeitung
 * - E-Mail-Versand (sofort / täglich / wöchentlich gebündelt)
 * - Ablauf von Warenkorb-Reservierungen, geplante Artikel
 * - Bereinigung (verwaiste Medien, abgelaufene Sessions/Tokens)
 */
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { hostname } from "node:os";
import { PgBoss } from "pg-boss";
import { db, Prisma } from "@/server/db";
import { sendEmails } from "@/server/notifications-mail";
import { processMedia } from "@/server/media/process";
import { notify, notifyMany } from "@/server/notifications";
import { storage } from "@/server/storage";
import { track, isQualifiedComment } from "@/server/analytics/service";
import { deliverPendingPushes } from "@/server/push/service";
import { captureError } from "@/server/monitoring";
import { backoffDelay } from "@/lib/backoff";
import { stableUuid } from "@/lib/stable-uuid";
import { env } from "@/server/env";
import { notifyEndedPolls, publishScheduledPosts } from "@/server/social/posts";
import { liftExpiredSuspensions } from "@/server/moderation/expiry";
import { sendEventReminders } from "@/server/communities/events";
import { syncPendingConnectAccounts } from "@/server/commerce/shops";
import { migrateStripePayoutSchedules, runScheduledPayouts, syncPayouts } from "@/server/commerce/payouts";
import { autoCompleteShippedOrders } from "@/server/commerce/orders";
import { retryCancelledRefunds } from "@/server/commerce/payments";
import { purgeDeletedAccount } from "@/server/account/deletion";
import { syncProSubscriptions } from "@/server/pro/service";
import { runCompetitionPhases } from "@/server/communities/competitions";
import { auditCheckpointJob } from "@/server/audit";
import { notifyTutorialReaders } from "@/server/tutorials/service";
import { notifyProjectFollowers } from "@/server/projects/service";

/** Fehler eines Jobs an die Fehlerüberwachung melden; pg-boss wiederholt den Job danach. */
function guarded<A extends unknown[], R>(queue: string, fn: (...a: A) => Promise<R>) {
  return async (...a: A) => {
    try {
      return await fn(...a);
    } catch (e) {
      await captureError(e, { source: "WORKER", path: queue });
      throw e;
    }
  };
}

const log = (msg: string, extra: Record<string, unknown> = {}) => console.log(JSON.stringify({ level: "info", svc: "worker", msg, ...extra }));
const warn = (msg: string, extra: Record<string, unknown> = {}) => console.warn(JSON.stringify({ level: "warn", svc: "worker", msg, ...extra }));

const Q = {
  media: "media.process",
  fanout: "notify.fanout",
  contentNotify: "notify.content",
  emailInstant: "email.instant",
  emailDigest: "email.digest",
  reservations: "commerce.reservations",
  scheduled: "blog.scheduled",
  cleanup: "maintenance.cleanup",
  outbox: "outbox.dispatch",
  push: "push.deliver",
  polls: "poll.ended",
  posts: "post.scheduled",
  events: "event.reminders",
  stripeSync: "stripe.sync",
  proSync: "pro.sync",
  competitions: "competition.phases",
  accountPurge: "account.purge",
  auditCheckpoint: "audit.checkpoint",
  payouts: "payouts.run",
} as const;

/** Fan-out an Leser:innen einer Anleitung bzw. Follower:innen eines Projekts (aus der Outbox). */
type ContentNotifyJob =
  | { kind: "tutorial-readers"; tutorialId: string; authorId: string; version: number }
  | { kind: "project-followers"; projectId: string; actorId: string; event: "completed" | "update"; excerpt?: string };

/**
 * Kontolöschung (DSG): bis zu 1 Std. Laufzeit (Medien im Bucket, Stripe), danach mit Backoff
 * 1 Min. … 6 Std. wiederholen (~2 Tage). purgeDeletedAccount ist idempotent.
 */
const PURGE_JOB = { retryLimit: 12, retryDelay: 60, retryBackoff: true, retryDelayMax: 6 * 3600, expireInSeconds: 3600 } as const;

/** Wie lange das Herunterfahren auf laufende Arbeit wartet – unter RAILWAY_DEPLOYMENT_DRAINING_SECONDS (45 s). */
const SHUTDOWN_TIMEOUT_MS = 30_000;

/** ~20 Versuche mit Backoff bis 6 Std. ≈ 3–4 Tage, bevor ein Ereignis aufgegeben (und gemeldet) wird. */
const OUTBOX_MAX_ATTEMPTS = 20;
/**
 * Claim-Dauer: So lange gehört ein Ereignis exklusiv diesem Prozess. Stürzt er ab, übernimmt danach ein
 * anderer. Die Verarbeitung je Ereignis ist kurz (nur Einreihen bzw. Statistik), 5 Min. reichen weit.
 */
const OUTBOX_LEASE_MS = 5 * 60_000;
/** Eindeutig je Prozess – beim Deploy laufen kurz alter und neuer Worker parallel. */
const WORKER_ID = `${hostname()}:${process.pid}:${randomUUID().slice(0, 8)}`;

/** Laufende Arbeit ausserhalb von pg-boss (Takte), auf die das Herunterfahren wartet. */
const inflight = new Set<Promise<unknown>>();
let stopping = false;
function inFlight<T>(p: Promise<T>): Promise<T> {
  inflight.add(p);
  p.finally(() => inflight.delete(p)).catch(() => {});
  return p;
}

let dispatching = false;

/**
 * Cron-Job und 3-Sekunden-Takt teilen sich diese Funktion. `dispatching` verhindert parallele Läufe
 * im selben Prozess, der Claim in der Datenbank (claimedAt/claimedBy) verhindert, dass zwei Worker-
 * Prozesse dasselbe Ereignis verarbeiten (doppelte Fan-outs, Medienjobs, Löschläufe).
 */
function dispatchOutbox(boss: PgBoss) {
  if (dispatching || stopping) return Promise.resolve();
  dispatching = true;
  return inFlight(
    dispatchOutboxOnce(boss).finally(() => {
      dispatching = false;
    }),
  );
}

/** Fällige Ereignisse bedingt beanspruchen: nur Zeilen, die kein anderer Prozess (gültig) hält. */
async function claimOutboxEvents(limit = 100) {
  const now = new Date();
  const leaseCutoff = new Date(now.getTime() - OUTBOX_LEASE_MS);
  const candidates = await db.outboxEvent.findMany({
    where: {
      publishedAt: null,
      attempts: { lt: OUTBOX_MAX_ATTEMPTS },
      AND: [{ OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }] }, { OR: [{ claimedAt: null }, { claimedAt: { lt: leaseCutoff } }] }],
    },
    orderBy: { createdAt: "asc" },
    take: limit,
    select: { id: true },
  });
  if (!candidates.length) return [];
  // Ein UPDATE mit Bedingung ist atomar: Bei gleichzeitigen Claims gewinnt genau ein Prozess je Zeile
  const claimed = await db.$queryRaw<{ id: string }[]>`
    UPDATE "OutboxEvent" SET "claimedAt" = ${now}, "claimedBy" = ${WORKER_ID}
    WHERE id = ANY(${candidates.map((c) => c.id)}) AND "publishedAt" IS NULL
      AND ("claimedAt" IS NULL OR "claimedAt" < ${leaseCutoff})
    RETURNING id`;
  if (!claimed.length) return [];
  return db.outboxEvent.findMany({ where: { id: { in: claimed.map((c) => c.id) } }, orderBy: { createdAt: "asc" } });
}

async function dispatchOutboxOnce(boss: PgBoss) {
  const events = await claimOutboxEvents();
  for (const [i, e] of events.entries()) {
    // Beim Herunterfahren nicht mehr anfangen – restliche Claims sofort freigeben (der neue Worker übernimmt)
    if (stopping) {
      await db.outboxEvent.updateMany({ where: { id: { in: events.slice(i).map((x) => x.id) }, claimedBy: WORKER_ID, publishedAt: null }, data: { claimedAt: null, claimedBy: null } });
      return;
    }
    try {
      const p = e.payload as Record<string, string>;
      const raw = e.payload as Record<string, unknown>;
      // Feste Job-ID je Ereignis: pg-boss legt sie nur einmal an. Schlägt nach dem Einreihen das
      // Markieren als erledigt fehl, reiht die Wiederholung den Job nicht ein zweites Mal ein.
      switch (e.type) {
        case "MediaUploaded":
          await boss.send(Q.media, { mediaId: p.mediaId }, { id: stableUuid(e.id, Q.media), retryLimit: 3, retryDelay: 30 });
          break;
        // Konto gelöscht: Abo beenden, persönliche Daten und Medien entfernen (§23.1). Kann Minuten dauern →
        // eigene Queue mit Wiederholungen, damit Medien und Beiträge in der Outbox nicht warten müssen
        case "UserDeleted":
          await boss.send(Q.accountPurge, { userId: p.userId }, { id: stableUuid(e.id, Q.accountPurge), ...PURGE_JOB });
          break;
        case "PostPublished":
          await boss.send(Q.fanout, { postId: p.postId, authorId: p.authorId }, { id: stableUuid(e.id, Q.fanout) });
          break;
        // North Star (§30.1): nur sinnvolle kreative Interaktionen zählen
        case "ProjectUpdated":
          if (p.updateId) await track("project_update", { userId: p.ownerId, ownerId: p.ownerId, targetType: "PROJECT", targetId: p.projectId });
          break;
        // Erstveröffentlichung: wird genau einmal emittiert (markProjectPublished, publishedAt null → gesetzt)
        case "ProjectPublished":
          await track("project_published", { userId: p.ownerId, ownerId: p.ownerId, targetType: "PROJECT", targetId: p.projectId });
          break;
        case "ProjectFollowersNotify": {
          const job: ContentNotifyJob = { kind: "project-followers", projectId: p.projectId!, actorId: p.actorId!, event: p.event === "completed" ? "completed" : "update", ...(p.excerpt ? { excerpt: p.excerpt } : {}) };
          await boss.send(Q.contentNotify, job, { id: stableUuid(e.id, Q.contentNotify), retryLimit: 3, retryDelay: 60 });
          break;
        }
        case "ProjectRemixed":
          await track("remix_shared", { userId: p.ownerId, ownerId: p.ownerId, targetType: "PROJECT", targetId: p.projectId, props: { originalId: p.originalId } });
          break;
        case "CommentCreated": {
          const c = await db.comment.findUnique({ where: { id: p.commentId }, select: { body: true, targetType: true, targetId: true } });
          if (c && isQualifiedComment(c.body)) await track("qualified_comment", { userId: p.authorId, targetType: c.targetType, targetId: c.targetId });
          break;
        }
        case "TutorialPublished":
          if (raw.notifyReaders === true) {
            const job: ContentNotifyJob = { kind: "tutorial-readers", tutorialId: p.tutorialId!, authorId: p.authorId!, version: Number(raw.version) };
            await boss.send(Q.contentNotify, job, { id: stableUuid(e.id, Q.contentNotify), retryLimit: 3, retryDelay: 60 });
          }
          await track("tutorial_published", { userId: p.authorId, ownerId: p.authorId, targetType: "TUTORIAL", targetId: p.tutorialId });
          break;
        case "ArticlePublished":
          await track("article_published", { userId: p.authorId, ownerId: p.authorId, targetType: "ARTICLE", targetId: p.articleId });
          break;
        default:
          break;
      }
      await db.outboxEvent.update({ where: { id: e.id }, data: { publishedAt: new Date(), attempts: { increment: 1 }, claimedAt: null, claimedBy: null } });
    } catch (err) {
      const attempts = e.attempts + 1;
      warn("outbox_failed", { id: e.id, type: e.type, attempts, err: String(err) });
      await captureError(err, { source: "WORKER", path: `outbox:${e.type}`, meta: { eventId: e.id, attempts } });
      // Exponentielles Backoff (10 s … 6 Std.) statt 10 Versuche im 3-Sekunden-Takt: ein Ausfall von Stripe/S3
      // über einige Minuten darf ein Ereignis wie UserDeleted (DSG-Löschung) nicht endgültig verwerfen
      await db.outboxEvent.update({
        where: { id: e.id },
        data: { attempts, lastError: String(err).slice(0, 500), nextAttemptAt: new Date(Date.now() + backoffDelay(attempts - 1, { base: 10_000, max: 6 * 3600_000 })), claimedAt: null, claimedBy: null },
      });
      if (attempts >= OUTBOX_MAX_ATTEMPTS) {
        await captureError(new Error(`Outbox-Ereignis ${e.type} nach ${attempts} Versuchen aufgegeben – bitte manuell klären`), { source: "WORKER", path: "outbox:abandoned", meta: { eventId: e.id, type: e.type } });
      }
    }
  }
}

/** Neue Beiträge gefolgter Creator – gebündelt pro Autor, nur öffentliche Beiträge. */
async function fanoutPost(postId: string, authorId: string) {
  const post = await db.post.findUnique({ where: { id: postId }, select: { visibility: true, state: true, communityId: true, author: { select: { status: true, profile: { select: { handle: true } } } } } });
  if (!post || post.state !== "PUBLISHED" || post.visibility === "PRIVATE" || post.communityId || post.author.status !== "ACTIVE") return;
  let cursor: string | undefined;
  for (;;) {
    const followers = await db.follow.findMany({ where: { followeeId: authorId }, select: { followerId: true }, take: 500, ...(cursor ? { cursor: { followerId_followeeId: { followerId: cursor, followeeId: authorId } }, skip: 1 } : {}) });
    if (!followers.length) break;
    await notifyMany(followers.map((f) => f.followerId), { type: "NEW_POST_FROM_FOLLOWED", actorId: authorId, targetType: "USER", targetId: authorId, data: { href: `/beitrag/${postId}`, handle: post.author.profile?.handle } });
    cursor = followers[followers.length - 1]!.followerId;
    if (followers.length < 500) break;
  }
}

/**
 * Bereinigung gemäss Medienrichtlinie (§25.6 Nr. 8) und Datensparsamkeit (§23.1).
 * Unverknüpfte Medien erst 14 Tage nach der letzten Änderung – `releaseMedia` setzt attachedAt beim
 * Löschen des Inhalts zurück (updatedAt = Beginn der Schonfrist).
 */
async function cleanup() {
  const day = 86400_000;
  const stale = await db.media.findMany({
    where: { OR: [{ state: "PENDING", createdAt: { lt: new Date(Date.now() - day) } }, { state: "FAILED", createdAt: { lt: new Date(Date.now() - day) } }, { attachedAt: null, state: "READY", createdAt: { lt: new Date(Date.now() - 14 * day) }, updatedAt: { lt: new Date(Date.now() - 14 * day) }, isPrivate: false }] },
    take: 500,
    select: { id: true, storageKey: true, variants: true, ownerId: true },
  });
  for (const m of stale) {
    // Profilbilder sind nicht über attachedAt verknüpft → schützen, wenn noch referenziert
    const v = Object.values((m.variants ?? {}) as Record<string, string>);
    if (v.length) {
      const inUse = await db.userProfile.count({ where: { OR: [{ avatarUrl: { in: v } }, { coverUrl: { in: v } }] } });
      const inProject = await db.project.count({ where: { coverUrl: { in: v } } });
      if (inUse || inProject) {
        await db.media.update({ where: { id: m.id }, data: { attachedAt: new Date() } });
        continue;
      }
    }
    const st = storage();
    await st.del(m.storageKey).catch(() => {});
    for (const url of v) await st.del(url.replace(/^\/media\//, "")).catch(() => {});
    await db.media.delete({ where: { id: m.id } }).catch(() => {});
  }
  const [sessions, tokens, buckets, idem] = await Promise.all([
    db.session.deleteMany({ where: { OR: [{ expiresAt: { lt: new Date() } }, { revokedAt: { lt: new Date(Date.now() - 30 * day) } }] } }),
    db.verificationToken.deleteMany({ where: { expiresAt: { lt: new Date(Date.now() - 7 * day) } } }),
    db.rateLimitBucket.deleteMany({ where: { resetAt: { lt: new Date() } } }),
    db.idempotencyKey.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - 2 * day) } } }),
  ]);
  // Fehlerüberwachung: Einzelvorkommen 30 Tage, erledigte Fehlergruppen 90 Tage
  const errs = await db.errorOccurrence.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - 30 * day) } } });
  await db.errorGroup.deleteMany({ where: { resolvedAt: { not: null }, lastSeenAt: { lt: new Date(Date.now() - 90 * day) } } });
  // Wachsende Hilfstabellen begrenzen (in Häppchen, damit keine langen Sperren entstehen)
  const batchDelete = async (sql: Prisma.Sql) => {
    let total = 0;
    for (let i = 0; i < 50; i++) {
      const n = await db.$executeRaw(sql);
      total += n;
      if (n < 5000) break;
    }
    return total;
  };
  const outbox = await batchDelete(Prisma.sql`DELETE FROM "OutboxEvent" WHERE id IN (SELECT id FROM "OutboxEvent" WHERE "publishedAt" < now() - interval '7 days' LIMIT 5000)`);
  const webhooks = await batchDelete(Prisma.sql`DELETE FROM "WebhookEvent" WHERE id IN (SELECT id FROM "WebhookEvent" WHERE "processedAt" IS NOT NULL AND "createdAt" < now() - interval '30 days' LIMIT 5000)`);
  // Gelesene Benachrichtigungen nach 180 Tagen (ungelesene bleiben)
  const notes = await batchDelete(Prisma.sql`DELETE FROM "Notification" WHERE id IN (SELECT id FROM "Notification" WHERE "readAt" < now() - interval '180 days' LIMIT 5000)`);
  log("cleanup", { errors: errs.count, media: stale.length, sessions: sessions.count, tokens: tokens.count, buckets: buckets.count, idem: idem.count, outbox, webhooks, notifications: notes });
}

async function optional<T>(path: string, fn: string): Promise<(() => Promise<T>) | null> {
  try {
    const mod = (await import(path)) as Record<string, () => Promise<T>>;
    if (!mod[fn]) warn("optional_job_missing", { path, fn });
    return mod[fn] ?? null;
  } catch (e) {
    // Nicht still schlucken: ein Import-/Initialisierungsfehler legt sonst einen Job unbemerkt still
    warn("optional_job_failed", { path, fn, err: String(e) });
    await captureError(e, { source: "WORKER", path: `optional:${path}#${fn}` });
    return null;
  }
}

/**
 * Beim Deploy startet der Worker oft vor dem Web-Dienst, der die Migrationen einspielt.
 * Bis alle Migrationen der eigenen Version angewendet sind, warten (max. 10 Minuten),
 * sonst laufen Jobs gegen ein veraltetes Schema.
 */
async function waitForMigrations() {
  const { readdir } = await import("node:fs/promises");
  const { join } = await import("node:path");
  const dir = join(process.cwd(), "prisma", "migrations");
  const expected = (await readdir(dir, { withFileTypes: true }).catch(() => [])).filter((d) => d.isDirectory()).map((d) => d.name);
  if (!expected.length) return;
  const deadline = Date.now() + 10 * 60_000;
  for (let i = 0; ; i++) {
    const rows = await db.$queryRaw<{ migration_name: string }[]>`SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`.catch(() => []);
    const done = new Set(rows.map((r) => r.migration_name));
    const missing = expected.filter((m) => !done.has(m));
    if (!missing.length) return;
    if (Date.now() > deadline) {
      warn("migrations_pending_timeout", { missing });
      return;
    }
    if (i === 0) log("waiting_for_migrations", { missing });
    await new Promise((r) => setTimeout(r, 5000));
  }
}

async function main() {
  // Konfiguration sofort prüfen: fehlende/ungültige Pflichtvariablen beenden den Start (sichtbar im Deploy-Log),
  // Warnungen (z. B. fehlender RESEND_API_KEY) werden einmal geloggt
  env();
  await waitForMigrations();
  const boss = new PgBoss({ connectionString: process.env.DATABASE_URL!, schema: "pgboss", max: 3 });
  boss.on("error", (e) => warn("pgboss_error", { err: String(e) }));
  await boss.start();
  for (const q of Object.values(Q)) await boss.createQueue(q, q === Q.accountPurge ? PURGE_JOB : undefined).catch(() => {});

  await boss.work<{ mediaId: string }>(Q.media, { batchSize: 2 }, guarded(Q.media, async (jobs) => {
    for (const j of jobs) await processMedia(j.data.mediaId);
  }));
  await boss.work<{ postId: string; authorId: string }>(Q.fanout, guarded(Q.fanout, async (jobs) => {
    for (const j of jobs) await fanoutPost(j.data.postId, j.data.authorId);
  }));
  await boss.work<ContentNotifyJob>(Q.contentNotify, guarded(Q.contentNotify, async (jobs) => {
    for (const j of jobs) {
      const d = j.data;
      if (d.kind === "tutorial-readers") await notifyTutorialReaders(d.tutorialId, d.authorId, d.version);
      else await notifyProjectFollowers(d.projectId, d.actorId, d.event, d.excerpt);
    }
  }));
  await boss.work(Q.outbox, guarded(Q.outbox, async () => dispatchOutbox(boss)));
  await boss.work<{ userId: string }>(Q.accountPurge, guarded(Q.accountPurge, async (jobs) => {
    for (const j of jobs) await purgeDeletedAccount(j.data.userId);
  }));
  await boss.work(Q.emailInstant, guarded(Q.emailInstant, async () => sendEmails("instant")));
  await boss.work(Q.emailDigest, guarded(Q.emailDigest, async () => sendEmails("digest")));
  await boss.work(Q.cleanup, guarded(Q.cleanup, async () => cleanup()));
  await boss.work(Q.competitions, guarded(Q.competitions, async () => void (await runCompetitionPhases())));
  await boss.work(Q.proSync, guarded(Q.proSync, async () => void (await syncProSubscriptions())));
  await boss.work(Q.push, guarded(Q.push, async () => void (await deliverPendingPushes())));

  const releaseReservations = await optional<unknown>("@/server/commerce/reservations", "releaseExpiredReservations");
  const publishScheduled = await optional<unknown>("@/server/blog/service", "publishScheduledArticles");
  await boss.work(Q.reservations, guarded(Q.reservations, async () => void (await releaseReservations?.())));
  await boss.work(Q.scheduled, guarded(Q.scheduled, async () => void (await publishScheduled?.())));
  await boss.work(Q.polls, guarded(Q.polls, async () => void (await notifyEndedPolls())));
  await boss.work(Q.posts, guarded(Q.posts, async () => {
    // Zuerst abgelaufene Sperren aufheben – sonst blieben geplante Beiträge dieser Konten liegen
    await liftExpiredSuspensions();
    await publishScheduledPosts();
  }));
  await boss.work(Q.events, guarded(Q.events, async () => void (await sendEventReminders())));
  // Audit-Kette prüfen und Prüfpunkt schreiben (DB + Log-Zeile „audit_checkpoint“ ausserhalb der DB)
  await boss.work(Q.auditCheckpoint, guarded(Q.auditCheckpoint, async () => void (await auditCheckpointJob())));
  // Haltefrist: bisherige Stripe-Pläne übernehmen, versendete Bestellungen automatisch abschliessen,
  // fällige Auszahlungen nach Plan (nur freigegebenes Guthaben)
  await boss.work(Q.payouts, guarded(Q.payouts, async () => {
    await migrateStripePayoutSchedules();
    await autoCompleteShippedOrders();
    await runScheduledPayouts();
  }));
  await boss.work(Q.stripeSync, guarded(Q.stripeSync, async () => {
      await syncPendingConnectAccounts();
      // Auszahlungen abgleichen (Benachrichtigung auch, falls ein Webhook ausbleibt) – halbstündlich
      if (new Date().getMinutes() % 30 < 10) await syncPayouts();
      // Fehlgeschlagene Erstattungen stornierter Bestellungen nachholen
      await retryCancelledRefunds();
    }));

  await boss.schedule(Q.outbox, "* * * * *");
  await boss.schedule(Q.emailInstant, "*/2 * * * *");
  await boss.schedule(Q.emailDigest, "0 7 * * *", null, { tz: "Europe/Zurich" });
  await boss.schedule(Q.reservations, "* * * * *");
  await boss.schedule(Q.scheduled, "* * * * *");
  await boss.schedule(Q.cleanup, "30 3 * * *", null, { tz: "Europe/Zurich" });
  await boss.schedule(Q.proSync, "15 */6 * * *");
  await boss.schedule(Q.competitions, "*/5 * * * *");
  await boss.schedule(Q.push, "* * * * *");
  await boss.schedule(Q.polls, "* * * * *");
  await boss.schedule(Q.posts, "* * * * *");
  await boss.schedule(Q.events, "*/5 * * * *");
  await boss.schedule(Q.stripeSync, "*/10 * * * *");
  await boss.schedule(Q.payouts, "20 * * * *", null, { tz: "Europe/Zurich" });
  await boss.schedule(Q.auditCheckpoint, "45 2 * * *", null, { tz: "Europe/Zurich" });

  // Outbox zusätzlich alle 3 s abarbeiten (Cron-Auflösung ist 1 min)
  const tick = setInterval(() => void dispatchOutbox(boss).catch((e) => captureError(e, { source: "WORKER", path: "outbox_tick" })), 3000);
  // iOS-Push zeitnah zustellen (Cron ist nur die Rückfallebene)
  const pushTick = setInterval(() => {
    if (!stopping) void inFlight(deliverPendingPushes()).catch((e) => captureError(e, { source: "WORKER", path: "push_tick" }));
  }, 10_000);
  log("worker_started", { queues: Object.values(Q), workerId: WORKER_ID });

  /**
   * Sauber herunterfahren (Deploy/Neustart): keine neue Arbeit annehmen, laufende Takte (Outbox, Push)
   * und pg-boss-Jobs abschliessen lassen – erst danach die DB-Verbindung schliessen. Alles innerhalb von
   * SHUTDOWN_TIMEOUT_MS, damit Railway nicht mitten in einem Schreibvorgang per SIGKILL beendet.
   */
  const stop = async (signal: string) => {
    if (stopping) return;
    stopping = true;
    const deadline = Date.now() + SHUTDOWN_TIMEOUT_MS;
    log("worker_stopping", { signal, inflight: inflight.size });
    clearInterval(tick);
    clearInterval(pushTick);
    const left = () => Math.max(1000, deadline - Date.now());
    // Zuerst die eigenen Takte (sie reihen über boss.send ein, pg-boss muss dafür noch offen sein)
    const drained = await Promise.race([Promise.allSettled([...inflight]).then(() => true), sleep(left()).then(() => false)]);
    await boss.stop({ graceful: true, timeout: left() }).catch((e) => warn("pgboss_stop_failed", { err: String(e) }));
    if (!drained) warn("worker_stop_timeout", { inflight: inflight.size });
    await db.$disconnect().catch(() => {});
    log("worker_stopped", { signal });
    process.exit(0);
  };
  process.on("SIGTERM", () => void stop("SIGTERM"));
  process.on("SIGINT", () => void stop("SIGINT"));
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

main().catch((e) => {
  console.error(JSON.stringify({ level: "error", svc: "worker", msg: "fatal", err: String(e) }));
  process.exit(1);
});
