import "server-only";
import { categoryBySlug } from "@werkraum/shared";
import { db, type Prisma } from "@/server/db";
import { sendMail, type MailCard, type MailSection } from "@/server/mail";
import { unsubscribeUrl } from "@/server/mail-unsubscribe";
import { features } from "@/server/env";
import { relationsFor } from "@/server/visibility";
import { fail } from "@/server/errors";
import { rateLimit } from "@/server/ratelimit";
import { BRAND } from "@/config/brand";

/**
 * Wochenrückblick per E-Mail (sonntags): Neues aus den eigenen Kategorien, von Personen, denen man
 * folgt, und Neuigkeiten bei Gemerktem. Ohne passende Inhalte wird nichts verschickt.
 * Abbestellbar per Link (eigene Liste, unabhängig von den Benachrichtigungs-Mails).
 */

const DAY = 86_400_000;
const warn = (msg: string, extra: Record<string, unknown> = {}) => console.warn(JSON.stringify({ level: "warn", svc: "worker", msg, ...extra }));

function appUrl() {
  return (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
}
const abs = (u: string | null | undefined) => (!u ? null : /^https?:\/\//.test(u) ? u : `${appUrl()}${u.startsWith("/") ? "" : "/"}${u}`);

const ownerSel = { select: { profile: { select: { handle: true, displayName: true } } } } as const;

type Card = MailCard & { key: string };

function projectCard(p: { id: string; title: string; slug: string; coverUrl: string | null; category: string; likeCount: number; owner: { profile: { handle: string; displayName: string } | null } }, extra?: string): Card {
  const cat = categoryBySlug(p.category)?.name;
  return {
    key: `p:${p.id}`,
    title: p.title,
    meta: [extra ?? `Projekt von ${p.owner.profile?.displayName ?? "Unbekannt"}`, cat, p.likeCount > 0 ? `${p.likeCount} Gefällt mir` : null].filter(Boolean).join(" · "),
    url: `${appUrl()}/u/${p.owner.profile?.handle}/${p.slug}`,
    imageUrl: abs(p.coverUrl),
  };
}

function tutorialCard(t: { id: string; title: string; slug: string; coverUrl: string | null; category: string; author: { profile: { handle: string; displayName: string } | null } }, extra?: string): Card {
  const cat = categoryBySlug(t.category)?.name;
  return {
    key: `t:${t.id}`,
    title: t.title,
    meta: [extra ?? `Anleitung von ${t.author.profile?.displayName ?? "Unbekannt"}`, cat].filter(Boolean).join(" · "),
    url: `${appUrl()}/anleitungen/${t.slug}`,
    imageUrl: abs(t.coverUrl),
  };
}

/** Inhalte des Rückblicks für ein Konto (leer → keine Mail). */
export async function buildWeeklyDigest(userId: string, now = new Date()) {
  const since = new Date(now.getTime() - 7 * DAY);
  const [pref, profile, rel] = await Promise.all([
    db.userPreference.findUnique({ where: { userId }, select: { interests: true, hiddenCategories: true } }),
    db.userProfile.findUnique({ where: { userId }, select: { displayName: true, categories: true } }),
    relationsFor(userId),
  ]);
  const interests = pref?.interests.length ? pref.interests : (profile?.categories ?? []);
  const hidden = pref?.hiddenCategories ?? [];
  const exclude = [userId, ...rel.blocked, ...rel.muted];
  const seen = new Set<string>();
  const take = (cards: Card[], n: number) => {
    const out: Card[] = [];
    for (const c of cards) {
      if (out.length >= n) break;
      if (seen.has(c.key)) continue;
      seen.add(c.key);
      out.push(c);
    }
    return out;
  };

  const projectWhere = (extra: Prisma.ProjectWhereInput): Prisma.ProjectWhereInput => ({
    state: "PUBLISHED",
    visibility: "PUBLIC",
    publishedAt: { gte: since, lte: now },
    ownerId: { notIn: exclude },
    owner: { status: "ACTIVE" },
    ...(hidden.length ? { category: { notIn: hidden } } : {}),
    ...extra,
  });
  const tutorialWhere = (extra: Prisma.TutorialWhereInput): Prisma.TutorialWhereInput => ({
    state: "PUBLISHED",
    publishedAt: { gte: since, lte: now },
    authorId: { notIn: exclude },
    author: { status: "ACTIVE" },
    ...(hidden.length ? { category: { notIn: hidden } } : {}),
    ...extra,
  });
  const pSel = { id: true, title: true, slug: true, coverUrl: true, category: true, likeCount: true, owner: ownerSel } as const;
  const tSel = { id: true, title: true, slug: true, coverUrl: true, category: true, author: ownerSel } as const;

  // 1. Von Personen, denen du folgst
  const following = rel.following.filter((id) => !exclude.includes(id));
  const [fProjects, fTutorials] = following.length
    ? await Promise.all([
        db.project.findMany({ where: projectWhere({ ownerId: { in: following, notIn: exclude } }), orderBy: { publishedAt: "desc" }, take: 6, select: pSel }),
        db.tutorial.findMany({ where: tutorialWhere({ authorId: { in: following, notIn: exclude } }), orderBy: { publishedAt: "desc" }, take: 4, select: tSel }),
      ])
    : [[], []];
  const followed = take([...fTutorials.map((t) => tutorialCard(t)), ...fProjects.map((p) => projectCard(p))], 4);

  // 2. Neu in deinen Kategorien (beliebteste zuerst)
  const [cProjects, cTutorials] = interests.length
    ? await Promise.all([
        db.project.findMany({ where: projectWhere({ category: { in: interests, ...(hidden.length ? { notIn: hidden } : {}) } }), orderBy: [{ likeCount: "desc" }, { qualityScore: "desc" }, { publishedAt: "desc" }], take: 8, select: pSel }),
        db.tutorial.findMany({ where: tutorialWhere({ category: { in: interests, ...(hidden.length ? { notIn: hidden } : {}) } }), orderBy: [{ likeCount: "desc" }, { qualityScore: "desc" }, { publishedAt: "desc" }], take: 4, select: tSel }),
      ])
    : [[], []];
  const categories = take([...cTutorials.slice(0, 2).map((t) => tutorialCard(t)), ...cProjects.map((p) => projectCard(p)), ...cTutorials.slice(2).map((t) => tutorialCard(t))], 4);

  // 3. Neuigkeiten bei Gemerktem: neue Updates zu gemerkten Projekten, neue Versionen gemerkter Anleitungen
  const marks = await db.bookmark.findMany({ where: { userId, targetType: { in: ["PROJECT", "TUTORIAL"] } }, select: { targetType: true, targetId: true }, take: 500 });
  const markedProjects = marks.filter((m) => m.targetType === "PROJECT").map((m) => m.targetId);
  const markedTutorials = marks.filter((m) => m.targetType === "TUTORIAL").map((m) => m.targetId);
  const [mProjects, mTutorials] = await Promise.all([
    markedProjects.length
      ? db.project.findMany({
          where: { id: { in: markedProjects }, state: "PUBLISHED", visibility: "PUBLIC", ownerId: { notIn: exclude }, owner: { status: "ACTIVE" }, updates: { some: { createdAt: { gte: since } } } },
          take: 3,
          select: { ...pSel, _count: { select: { updates: { where: { createdAt: { gte: since } } } } } },
        })
      : [],
    markedTutorials.length
      ? db.tutorial.findMany({
          where: { id: { in: markedTutorials }, state: "PUBLISHED", authorId: { notIn: exclude }, author: { status: "ACTIVE" }, versions: { some: { version: { gt: 1 }, publishedAt: { gte: since } } } },
          take: 3,
          select: tSel,
        })
      : [],
  ]);
  const saved = take(
    [
      ...mProjects.map((p) => projectCard(p, p._count.updates === 1 ? "1 neues Update" : `${p._count.updates} neue Updates`)),
      ...mTutorials.map((t) => tutorialCard(t, "Neue Version")),
    ],
    3,
  );

  // Fallback: ohne Persönliches die beliebtesten Projekte der Woche
  let popular: Card[] = [];
  if (!followed.length && !categories.length) {
    const top = await db.project.findMany({ where: projectWhere({}), orderBy: [{ likeCount: "desc" }, { qualityScore: "desc" }], take: 6, select: pSel });
    popular = take(top.map((p) => projectCard(p)), 4);
  }

  const sections: MailSection[] = [
    { title: "Neu in deinen Kategorien", cards: categories },
    { title: "Von Leuten, denen du folgst", cards: followed },
    { title: "Neues bei deinen gemerkten Projekten", cards: saved },
    { title: "Beliebt diese Woche", cards: popular },
  ].filter((s) => s.cards.length);
  return { firstName: (profile?.displayName ?? "").split(" ")[0] ?? "", sections };
}

async function sendDigest(user: { id: string; email: string }, digest: Awaited<ReturnType<typeof buildWeeklyDigest>>) {
  const count = digest.sections.reduce((a, s) => a + s.cards.length, 0);
  const hello = digest.firstName ? `Hallo ${digest.firstName}` : "Hallo";
  return sendMail(
    user.email,
    `Dein Wochenrückblick auf ${BRAND.name}`,
    `${hello}, hier ist, was diese Woche in deiner Werkstatt-Community entstanden ist – ausgewählt nach deinen Kategorien und den Leuten, denen du folgst.`,
    {
      eyebrow: "Wochenrückblick",
      heading: "Was diese Woche entstanden ist",
      preheader: digest.sections.flatMap((s) => s.cards.map((c) => c.title)).slice(0, 4).join(" · ").slice(0, 140) || `${count} neue Ideen für deine Werkstatt`,
      sections: digest.sections,
      cta: { label: "Mehr entdecken", url: `${appUrl()}/entdecken` },
      unsubscribeUrl: unsubscribeUrl(user.id, "weekly"),
      unsubscribeLabel: "Wochenrückblick abbestellen",
    },
  );
}

/**
 * Worker-Job (sonntags): Rückblick an alle aktiven, bestätigten Konten, die ihn nicht abbestellt
 * haben. Höchstens einmal in 6 Tagen je Konto (Wiederholungen nach Abbrüchen schicken nicht doppelt).
 */
export async function sendWeeklyDigests(opts: { now?: Date; limit?: number } = {}) {
  const now = opts.now ?? new Date();
  if (!features.email() && process.env.NODE_ENV === "production") return { sent: 0, skipped: 0 };
  const cutoff = new Date(now.getTime() - 6 * DAY);
  let cursor: string | undefined;
  let sent = 0;
  let skipped = 0;
  const max = opts.limit ?? 20_000;
  for (;;) {
    const users = await db.user.findMany({
      where: {
        status: "ACTIVE",
        emailVerifiedAt: { not: null },
        NOT: { email: { endsWith: ".invalid" } },
        OR: [{ preference: { is: null } }, { preference: { is: { weeklyDigest: true, emailDigest: { not: "OFF" }, OR: [{ weeklyDigestSentAt: null }, { weeklyDigestSentAt: { lt: cutoff } }] } } }],
        ...(cursor ? { id: { gt: cursor } } : {}),
      },
      orderBy: { id: "asc" },
      take: 200,
      select: { id: true, email: true },
    });
    if (!users.length) break;
    for (const u of users) {
      try {
        const digest = await buildWeeklyDigest(u.id, now);
        if (digest.sections.length) {
          const r = await sendDigest(u, digest);
          if ("failed" in r && r.failed) {
            skipped++;
            continue; // nächster Lauf versucht es erneut
          }
          sent++;
        } else skipped++;
        // Auch ohne Inhalte als erledigt markieren – sonst würde das Konto bei jedem Lauf neu geprüft
        await db.userPreference.upsert({ where: { userId: u.id }, create: { userId: u.id, weeklyDigestSentAt: now }, update: { weeklyDigestSentAt: now } });
      } catch (err) {
        skipped++;
        warn("weekly_digest_failed", { userId: u.id, err: String(err).slice(0, 200) });
      }
      if (sent + skipped >= max) return { sent, skipped };
    }
    cursor = users[users.length - 1]!.id;
  }
  return { sent, skipped };
}

/** „Beispiel an mich senden“ in den Einstellungen – unabhängig vom Wochenrhythmus, begrenzt. */
export async function sendWeeklyDigestPreview(user: { id: string; email: string }) {
  await rateLimit(`weekly-digest-preview:${user.id}`, 3, 86_400);
  const digest = await buildWeeklyDigest(user.id);
  if (!digest.sections.length) throw fail.invalid("Für dich gab es diese Woche noch keine neuen Inhalte. Folge ein paar Personen oder wähle Kategorien, dann füllt sich dein Rückblick.");
  const r = await sendDigest(user, digest);
  if ("failed" in r && r.failed) throw fail.unavailable("Die E-Mail konnte gerade nicht verschickt werden. Bitte versuche es später erneut.");
  return { sections: digest.sections.length };
}
