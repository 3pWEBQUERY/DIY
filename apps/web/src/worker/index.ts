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
import { PgBoss } from "pg-boss";
import { db } from "@/server/db";
import { processMedia } from "@/server/media/process";
import { notify } from "@/server/notifications";
import { sendMail } from "@/server/mail";
import { storage } from "@/server/storage";
import { track, isQualifiedComment } from "@/server/analytics/service";
import { NOTIFICATION_LABEL, type NotificationType } from "@werkraum/shared";
import { notificationHref, notificationText } from "@/server/notifications-format";
import { deliverPendingPushes } from "@/server/push/service";
import { captureError } from "@/server/monitoring";

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
  emailInstant: "email.instant",
  emailDigest: "email.digest",
  reservations: "commerce.reservations",
  scheduled: "blog.scheduled",
  cleanup: "maintenance.cleanup",
  outbox: "outbox.dispatch",
  push: "push.deliver",
} as const;

async function dispatchOutbox(boss: PgBoss) {
  const events = await db.outboxEvent.findMany({ where: { publishedAt: null, attempts: { lt: 10 } }, orderBy: { createdAt: "asc" }, take: 100 });
  for (const e of events) {
    try {
      const p = e.payload as Record<string, string>;
      switch (e.type) {
        case "MediaUploaded":
          await boss.send(Q.media, { mediaId: p.mediaId }, { retryLimit: 3, retryDelay: 30 });
          break;
        case "PostPublished":
          await boss.send(Q.fanout, { postId: p.postId, authorId: p.authorId });
          break;
        // North Star (§30.1): nur sinnvolle kreative Interaktionen zählen
        case "ProjectUpdated":
          if (p.updateId) await track("project_update", { userId: p.ownerId, ownerId: p.ownerId, targetType: "PROJECT", targetId: p.projectId });
          else {
            const pr = await db.project.findUnique({ where: { id: p.projectId }, select: { createdAt: true, state: true, visibility: true } });
            // Erstveröffentlichung = Ereignis in den ersten Sekunden nach Anlage
            if (pr && pr.state === "PUBLISHED" && Date.now() - pr.createdAt.getTime() < 60_000) await track("project_published", { userId: p.ownerId, ownerId: p.ownerId, targetType: "PROJECT", targetId: p.projectId });
          }
          break;
        case "ProjectRemixed":
          await track("remix_shared", { userId: p.ownerId, ownerId: p.ownerId, targetType: "PROJECT", targetId: p.projectId, props: { originalId: p.originalId } });
          break;
        case "CommentCreated": {
          const c = await db.comment.findUnique({ where: { id: p.commentId }, select: { body: true, targetType: true, targetId: true } });
          if (c && isQualifiedComment(c.body)) await track("qualified_comment", { userId: p.authorId, targetType: c.targetType, targetId: c.targetId });
          break;
        }
        case "TutorialPublished":
        case "ArticlePublished":
          await track(e.type === "TutorialPublished" ? "tutorial_published" : "article_published", { userId: p.authorId, ownerId: p.authorId, targetType: e.type === "TutorialPublished" ? "TUTORIAL" : "ARTICLE", targetId: p.tutorialId ?? p.articleId });
          break;
        default:
          break;
      }
      await db.outboxEvent.update({ where: { id: e.id }, data: { publishedAt: new Date(), attempts: { increment: 1 } } });
    } catch (err) {
      warn("outbox_failed", { id: e.id, type: e.type, err: String(err) });
      await captureError(err, { source: "WORKER", path: `outbox:${e.type}`, meta: { eventId: e.id } });
      await db.outboxEvent.update({ where: { id: e.id }, data: { attempts: { increment: 1 } } });
    }
  }
}

/** Neue Beiträge gefolgter Creator – gebündelt pro Autor, nur öffentliche Beiträge. */
async function fanoutPost(postId: string, authorId: string) {
  const post = await db.post.findUnique({ where: { id: postId }, select: { visibility: true, state: true, communityId: true, author: { select: { profile: { select: { handle: true } } } } } });
  if (!post || post.state !== "PUBLISHED" || post.visibility === "PRIVATE" || post.communityId) return;
  let cursor: string | undefined;
  for (;;) {
    const followers = await db.follow.findMany({ where: { followeeId: authorId }, select: { followerId: true }, take: 500, ...(cursor ? { cursor: { followerId_followeeId: { followerId: cursor, followeeId: authorId } }, skip: 1 } : {}) });
    if (!followers.length) break;
    for (const f of followers) {
      await notify({ recipientId: f.followerId, type: "NEW_POST_FROM_FOLLOWED", actorId: authorId, targetType: "USER", targetId: authorId, data: { href: `/beitrag/${postId}`, handle: post.author.profile?.handle } });
    }
    cursor = followers[followers.length - 1]!.followerId;
    if (followers.length < 500) break;
  }
}

const ALWAYS_INSTANT: NotificationType[] = ["SECURITY", "ORDER_NEW", "MODERATION", "ORDER_STATUS"];

async function sendEmails(mode: "instant" | "digest") {
  const appUrl = process.env.APP_URL ?? "http://localhost:3000";
  // Kurze Wartezeit erlaubt Bündelung (z. B. mehrere Likes in Folge)
  const before = new Date(Date.now() - (mode === "instant" ? 90_000 : 0));
  const pending = await db.notification.findMany({
    where: { emailedAt: null, createdAt: { lte: before } },
    orderBy: { createdAt: "asc" },
    take: 1000,
    include: { recipient: { select: { email: true, status: true, emailVerifiedAt: true, preference: { select: { emailDigest: true } } } }, actor: { select: { profile: { select: { displayName: true, handle: true } } } } },
  });
  const byUser = new Map<string, typeof pending>();
  for (const n of pending) {
    const digest = n.recipient.preference?.emailDigest ?? "DAILY";
    const critical = ALWAYS_INSTANT.includes(n.type as NotificationType);
    const instant = critical || digest === "INSTANT";
    // Keine Mails an inaktive Konten, abbestellte Digests oder (ausser Sicherheit/Bestellungen) unbestätigte Adressen
    if (n.recipient.status !== "ACTIVE" || (digest === "OFF" && !critical) || (!n.recipient.emailVerifiedAt && !critical)) {
      await db.notification.update({ where: { id: n.id }, data: { emailedAt: new Date() } });
      continue;
    }
    if ((mode === "instant") !== instant) continue;
    // Wöchentlicher Digest nur montags (der Digest-Job läuft täglich)
    if (mode === "digest" && digest === "WEEKLY" && new Date().getUTCDay() !== 1) continue;
    const list = byUser.get(n.recipientId) ?? [];
    list.push(n);
    byUser.set(n.recipientId, list);
  }
  for (const [, list] of byUser) {
    const to = list[0]!.recipient.email;
    if (to.endsWith(".invalid")) continue;
    // Vollständige Sätze inkl. Titel/Bestellnummer statt nur „Typ: Name“
    const lines = list.map((n) => {
      const d = (n.data ?? {}) as Record<string, unknown>;
      const excerpt = typeof d.excerpt === "string" && d.excerpt ? `\n  „${d.excerpt.slice(0, 140)}“` : "";
      return `• ${notificationText(n)}${excerpt}`;
    });
    const target = list.length === 1 ? notificationHref(list[0]!) : "/benachrichtigungen";
    const subject = list.length === 1 ? `${NOTIFICATION_LABEL[list[0]!.type as NotificationType] ?? "Neuigkeit"} auf Werkuno` : `${list.length} Neuigkeiten auf Werkuno`;
    try {
      const r = await sendMail(to, subject, `Das ist in deiner Werkstatt passiert:\n\n${lines.join("\n\n")}`, { cta: { label: "Ansehen", url: `${appUrl}${target}` } });
      // Bei Versandfehler offen lassen → nächster Lauf versucht es erneut
      if (!("failed" in r && r.failed)) await db.notification.updateMany({ where: { id: { in: list.map((n) => n.id) } }, data: { emailedAt: new Date() } });
    } catch (err) {
      warn("email_failed", { err: String(err) });
      await captureError(err, { source: "WORKER", path: "email" });
    }
  }
}

/** Bereinigung gemäss Medienrichtlinie (§25.6 Nr. 8) und Datensparsamkeit (§23.1). */
async function cleanup() {
  const day = 86400_000;
  const stale = await db.media.findMany({
    where: { OR: [{ state: "PENDING", createdAt: { lt: new Date(Date.now() - day) } }, { state: "FAILED", createdAt: { lt: new Date(Date.now() - day) } }, { attachedAt: null, state: "READY", createdAt: { lt: new Date(Date.now() - 14 * day) }, isPrivate: false }] },
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
  log("cleanup", { errors: errs.count, media: stale.length, sessions: sessions.count, tokens: tokens.count, buckets: buckets.count, idem: idem.count });
}

async function optional<T>(path: string, fn: string): Promise<(() => Promise<T>) | null> {
  try {
    const mod = (await import(path)) as Record<string, () => Promise<T>>;
    return mod[fn] ?? null;
  } catch {
    return null;
  }
}

async function main() {
  const boss = new PgBoss({ connectionString: process.env.DATABASE_URL!, schema: "pgboss" });
  boss.on("error", (e) => warn("pgboss_error", { err: String(e) }));
  await boss.start();
  for (const q of Object.values(Q)) await boss.createQueue(q).catch(() => {});

  await boss.work<{ mediaId: string }>(Q.media, { batchSize: 2 }, guarded(Q.media, async (jobs) => {
    for (const j of jobs) await processMedia(j.data.mediaId);
  }));
  await boss.work<{ postId: string; authorId: string }>(Q.fanout, guarded(Q.fanout, async (jobs) => {
    for (const j of jobs) await fanoutPost(j.data.postId, j.data.authorId);
  }));
  await boss.work(Q.outbox, guarded(Q.outbox, async () => dispatchOutbox(boss)));
  await boss.work(Q.emailInstant, guarded(Q.emailInstant, async () => sendEmails("instant")));
  await boss.work(Q.emailDigest, guarded(Q.emailDigest, async () => sendEmails("digest")));
  await boss.work(Q.cleanup, guarded(Q.cleanup, async () => cleanup()));
  await boss.work(Q.push, guarded(Q.push, async () => void (await deliverPendingPushes())));

  const releaseReservations = await optional<unknown>("@/server/commerce/reservations", "releaseExpiredReservations");
  const publishScheduled = await optional<unknown>("@/server/blog/service", "publishScheduledArticles");
  await boss.work(Q.reservations, guarded(Q.reservations, async () => void (await releaseReservations?.())));
  await boss.work(Q.scheduled, guarded(Q.scheduled, async () => void (await publishScheduled?.())));

  await boss.schedule(Q.outbox, "* * * * *");
  await boss.schedule(Q.emailInstant, "*/2 * * * *");
  await boss.schedule(Q.emailDigest, "0 7 * * *", null, { tz: "Europe/Zurich" });
  await boss.schedule(Q.reservations, "* * * * *");
  await boss.schedule(Q.scheduled, "* * * * *");
  await boss.schedule(Q.cleanup, "30 3 * * *", null, { tz: "Europe/Zurich" });
  await boss.schedule(Q.push, "* * * * *");

  // Outbox zusätzlich alle 3 s abarbeiten (Cron-Auflösung ist 1 min)
  const tick = setInterval(() => dispatchOutbox(boss).catch((e) => captureError(e, { source: "WORKER", path: "outbox_tick" })), 3000);
  // iOS-Push zeitnah zustellen (Cron ist nur die Rückfallebene)
  const pushTick = setInterval(() => deliverPendingPushes().catch((e) => captureError(e, { source: "WORKER", path: "push_tick" })), 10_000);
  log("worker_started", { queues: Object.values(Q) });

  const stop = async () => {
    clearInterval(tick);
    clearInterval(pushTick);
    await boss.stop({ graceful: true, timeout: 20_000 });
    await db.$disconnect();
    process.exit(0);
  };
  process.on("SIGTERM", stop);
  process.on("SIGINT", stop);
}

main().catch((e) => {
  console.error(JSON.stringify({ level: "error", svc: "worker", msg: "fatal", err: String(e) }));
  process.exit(1);
});
