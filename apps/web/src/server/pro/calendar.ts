import "server-only";
import { db } from "@/server/db";

/**
 * Inhaltskalender im Studio: geplante und veröffentlichte Beiträge, Artikel, Projekte, Anleitungen
 * und Newsletter einer Person in einem Zeitraum. Nur eigene Inhalte; Links führen zum Bearbeiten
 * (geplant) bzw. zur Ansicht (veröffentlicht).
 */
export type CalendarKind = "POST" | "ARTICLE" | "PROJECT" | "TUTORIAL" | "NEWSLETTER";
export type CalendarItem = { id: string; kind: CalendarKind; title: string; at: string; scheduled: boolean; href: string };

export const CALENDAR_KIND_LABEL: Record<CalendarKind, string> = {
  POST: "Beitrag",
  ARTICLE: "Artikel",
  PROJECT: "Projekt",
  TUTORIAL: "Anleitung",
  NEWSLETTER: "Newsletter",
};

const excerpt = (s: string, n = 70) => {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t || "Ohne Text";
};

export async function contentCalendar(userId: string, from: Date, to: Date): Promise<CalendarItem[]> {
  const range = { gte: from, lt: to };
  const [profile, posts, articles, projects, tutorials, newsletters] = await Promise.all([
    db.userProfile.findUnique({ where: { userId }, select: { handle: true } }),
    db.post.findMany({
      where: {
        authorId: userId,
        articleId: null,
        OR: [
          { state: "DRAFT", scheduledAt: range },
          { state: "PUBLISHED", publishedAt: range },
        ],
      },
      select: { id: true, body: true, state: true, scheduledAt: true, publishedAt: true },
      take: 400,
    }),
    db.blogArticle.findMany({
      where: { authorId: userId, state: { in: ["SCHEDULED", "PUBLISHED"] }, publishedAt: range },
      select: { id: true, title: true, slug: true, state: true, publishedAt: true },
      take: 200,
    }),
    db.project.findMany({
      where: {
        ownerId: userId,
        OR: [
          { state: "DRAFT", publishedAt: null, scheduledAt: range },
          { state: "PUBLISHED", publishedAt: range },
        ],
      },
      select: { id: true, slug: true, title: true, state: true, scheduledAt: true, publishedAt: true },
      take: 200,
    }),
    db.tutorial.findMany({
      where: {
        authorId: userId,
        OR: [
          { state: "DRAFT", currentVersionId: null, scheduledAt: range },
          { state: "PUBLISHED", publishedAt: range },
        ],
      },
      select: { id: true, slug: true, title: true, state: true, scheduledAt: true, publishedAt: true },
      take: 200,
    }),
    db.creatorNewsletter
      .findMany({
        where: {
          authorId: userId,
          OR: [
            { status: "SCHEDULED", scheduledAt: range },
            { status: { in: ["SENDING", "SENT"] }, sentAt: range },
          ],
        },
        select: { id: true, subject: true, status: true, scheduledAt: true, sentAt: true },
        take: 100,
      })
      .catch(() => []),
  ]);
  const handle = profile?.handle ?? "";
  const items: CalendarItem[] = [];
  for (const p of posts) {
    const scheduled = p.state === "DRAFT";
    const at = scheduled ? p.scheduledAt : p.publishedAt;
    if (at) items.push({ id: p.id, kind: "POST", title: excerpt(p.body), at: at.toISOString(), scheduled, href: scheduled ? `/studio/inhalte/beitrag/${p.id}` : `/beitrag/${p.id}` });
  }
  for (const a of articles) {
    const scheduled = a.state === "SCHEDULED";
    if (a.publishedAt) items.push({ id: a.id, kind: "ARTICLE", title: a.title || "Ohne Titel", at: a.publishedAt.toISOString(), scheduled, href: `/studio/blog/${a.id}` });
  }
  for (const p of projects) {
    const scheduled = p.state === "DRAFT";
    const at = scheduled ? p.scheduledAt : p.publishedAt;
    if (at) items.push({ id: p.id, kind: "PROJECT", title: p.title, at: at.toISOString(), scheduled, href: scheduled ? `/u/${handle}/${p.slug}/bearbeiten` : `/u/${handle}/${p.slug}` });
  }
  for (const t of tutorials) {
    const scheduled = t.state === "DRAFT";
    const at = scheduled ? t.scheduledAt : t.publishedAt;
    if (at) items.push({ id: t.id, kind: "TUTORIAL", title: t.title, at: at.toISOString(), scheduled, href: scheduled ? `/studio/anleitungen/${t.id}` : `/anleitungen/${t.slug}` });
  }
  for (const n of newsletters) {
    const scheduled = n.status === "SCHEDULED";
    const at = scheduled ? n.scheduledAt : n.sentAt;
    if (at) items.push({ id: n.id, kind: "NEWSLETTER", title: n.subject || "Newsletter", at: at.toISOString(), scheduled, href: "/studio/newsletter" });
  }
  return items.sort((a, b) => a.at.localeCompare(b.at));
}

/** Alles, was noch geplant ist (ab jetzt, höchstens ein Jahr) – für die Liste „Geplant“ (Web und App). */
export async function upcomingScheduled(userId: string, now = new Date()) {
  const items = await contentCalendar(userId, now, new Date(now.getTime() + 367 * 86_400_000));
  return items.filter((i) => i.scheduled);
}
