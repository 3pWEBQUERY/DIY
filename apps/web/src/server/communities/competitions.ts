import "server-only";
import { CHALLENGE_VOTES_PER_PERSON, challengeEntrySchema } from "@werkraum/shared";
import { db } from "@/server/db";
import { fail } from "@/server/errors";
import { hasRole, communityRole } from "@/server/authz";
import { rateLimit } from "@/server/ratelimit";
import { notify, notifyMany } from "@/server/notifications";
import { getProjectCards } from "@/server/projects/service";
import type { SessionUser } from "@/server/auth/session";
import { canViewCommunityContent, isModRole, isMuted } from "./service";

/**
 * Wettbewerbe in Communities (Ausbau der Challenges):
 * 1. Einreichung (startsAt–endsAt): aktive Mitglieder reichen je ein eigenes, öffentliches
 *    Projekt ein (austauschbar, zurückziehbar).
 * 2. Entscheidung:
 *    - VOTES: Mitglieder vergeben bis zu 3 Stimmen (nicht für sich selbst) bis votingEndsAt.
 *      Zwischenstände bleiben verborgen; Reihenfolge je Person gemischt – niemand wird bevorzugt.
 *    - JURY: Die Moderation wählt Platz 1–3 und veröffentlicht das Ergebnis.
 * 3. Ergebnis: Platzierungen sichtbar, alle Teilnehmenden werden benachrichtigt.
 */

type Viewer = Pick<SessionUser, "id" | "role"> | null;
export type CompetitionPhase = "upcoming" | "open" | "voting" | "jury" | "ended";

type ChallengeRow = { startsAt: Date; endsAt: Date; votingEndsAt: Date | null; resultsAt: Date | null; judging: string };

export function competitionPhase(c: ChallengeRow, now = new Date()): CompetitionPhase {
  if (c.resultsAt && c.resultsAt <= now) return "ended";
  if (now < c.startsAt) return "upcoming";
  if (now < c.endsAt) return "open";
  if (c.judging === "VOTES") return c.votingEndsAt && now < c.votingEndsAt ? "voting" : "ended";
  return "jury";
}

export const PHASE_LABEL: Record<CompetitionPhase, string> = {
  upcoming: "Startet bald",
  open: "Einreichung läuft",
  voting: "Abstimmung läuft",
  jury: "Jury entscheidet",
  ended: "Beendet",
};

/** Deterministisch gemischt je Person (gleiche Reihenfolge beim Neuladen, für alle verschieden). */
function shuffle<T extends { id: string }>(items: T[], seed: string) {
  const h = (s: string) => {
    let x = 2166136261;
    for (let i = 0; i < s.length; i++) x = Math.imul(x ^ s.charCodeAt(i), 16777619);
    return x >>> 0;
  };
  return [...items].sort((a, b) => h(seed + a.id) - h(seed + b.id));
}

async function loadChallenge(challengeId: string) {
  const ch = await db.communityChallenge.findUnique({ where: { id: challengeId }, include: { community: { select: { id: true, slug: true, name: true, visibility: true, state: true } } } });
  if (!ch || ch.community.state === "REMOVED") throw fail.notFound("Wettbewerb nicht gefunden.");
  return ch;
}

async function access(ch: Awaited<ReturnType<typeof loadChallenge>>, viewer: Viewer) {
  const m = viewer ? await communityRole(ch.communityId, viewer.id) : null;
  const platformMod = !!viewer && hasRole(viewer, "PLATFORM_MODERATOR");
  const canView = canViewCommunityContent(ch.community, m, viewer) && (ch.community.state !== "HIDDEN" || m?.state === "ACTIVE" || platformMod);
  return { m, canView, isMember: m?.state === "ACTIVE" && !isMuted(m), isMod: isModRole(m) || platformMod };
}

/* ───────────────────────── Lesen ───────────────────────── */

export async function getCompetition(challengeId: string, viewer: Viewer) {
  const ch = await loadChallenge(challengeId).catch(() => null);
  if (!ch) return null;
  const a = await access(ch, viewer);
  if (!a.canView) return null;
  const phase = competitionPhase(ch);
  const entries = await db.challengeEntry.findMany({
    where: { challengeId, state: "ACTIVE" },
    orderBy: [{ place: { sort: "asc", nulls: "last" } }, { createdAt: "desc" }],
    select: { id: true, userId: true, projectId: true, note: true, voteCount: true, place: true, createdAt: true },
  });
  const cards = await getProjectCards(entries.map((e) => e.projectId), viewer?.id);
  const byProject = new Map(cards.map((c) => [c.id, c]));
  const showCounts = phase === "ended" && ch.judging === "VOTES";
  let list = entries
    .map((e) => ({ id: e.id, userId: e.userId, note: e.note, place: phase === "ended" ? e.place : null, votes: showCounts ? e.voteCount : null, project: byProject.get(e.projectId) ?? null, mine: e.userId === viewer?.id }))
    .filter((e) => e.project);
  if (phase === "voting") list = shuffle(list, `${viewer?.id ?? "anon"}:${challengeId}`);
  if (phase === "ended") list.sort((x, y) => (x.place ?? 99) - (y.place ?? 99) || (y.votes ?? 0) - (x.votes ?? 0));

  const myVotes = viewer && ch.judging === "VOTES" ? (await db.challengeVote.findMany({ where: { challengeId, userId: viewer.id }, select: { entryId: true } })).map((v) => v.entryId) : [];
  const myEntry = viewer ? entries.find((e) => e.userId === viewer.id) ?? null : null;
  return {
    id: ch.id,
    title: ch.title,
    description: ch.description,
    rules: ch.rules,
    prize: ch.prize,
    judging: ch.judging as "VOTES" | "JURY",
    startsAt: ch.startsAt,
    endsAt: ch.endsAt,
    votingEndsAt: ch.votingEndsAt,
    resultsAt: ch.resultsAt,
    phase,
    community: { id: ch.community.id, slug: ch.community.slug, name: ch.community.name },
    entries: list,
    viewer: {
      isMember: a.isMember,
      isMod: a.isMod,
      myEntry: myEntry ? { id: myEntry.id, projectId: myEntry.projectId, note: myEntry.note } : null,
      myVotes,
      votesLeft: Math.max(0, CHALLENGE_VOTES_PER_PERSON - myVotes.length),
    },
  };
}

export type CompetitionView = NonNullable<Awaited<ReturnType<typeof getCompetition>>>;

/** Eigene, öffentliche Projekte für die Einreichung. */
export async function entryProjectOptions(userId: string) {
  return db.project.findMany({ where: { ownerId: userId, state: "PUBLISHED", visibility: "PUBLIC" }, orderBy: { updatedAt: "desc" }, take: 50, select: { id: true, title: true, coverUrl: true } });
}

/** Laufende und kommende Wettbewerbe aus sichtbaren Communities (Übersicht /wettbewerbe). */
export async function listCompetitions(viewer: Viewer, opts: { includeEnded?: boolean } = {}) {
  const memberOf = viewer ? (await db.communityMember.findMany({ where: { userId: viewer.id, state: "ACTIVE" }, select: { communityId: true } })).map((m) => m.communityId) : [];
  const now = new Date();
  const rows = await db.communityChallenge.findMany({
    where: {
      community: { state: "PUBLISHED", OR: [{ visibility: { not: "PRIVATE" } }, ...(memberOf.length ? [{ id: { in: memberOf } }] : [])] },
      ...(opts.includeEnded ? {} : { OR: [{ resultsAt: null }, { resultsAt: { gt: new Date(now.getTime() - 14 * 86400_000) } }] }),
      startsAt: { lte: new Date(now.getTime() + 30 * 86400_000) },
    },
    orderBy: { endsAt: "asc" },
    take: 60,
    include: { community: { select: { slug: true, name: true, coverUrl: true } } },
  });
  return rows
    .map((r) => ({ ...r, phase: competitionPhase(r, now), member: memberOf.includes(r.communityId) }))
    .filter((r) => opts.includeEnded || r.phase !== "ended" || (r.resultsAt && r.resultsAt > new Date(now.getTime() - 14 * 86400_000)));
}

/* ───────────────────────── Teilnehmen ───────────────────────── */

export async function submitEntry(user: SessionUser, challengeId: string, input: unknown) {
  const data = challengeEntrySchema.parse(input);
  const ch = await loadChallenge(challengeId);
  const a = await access(ch, user);
  if (!a.isMember) throw fail.forbidden("Nur Mitglieder der Community können teilnehmen.");
  if (competitionPhase(ch) !== "open") throw fail.invalid("Die Einreichung ist gerade nicht geöffnet.");
  await rateLimit(`challenge-entry:${user.id}`, 20, 3600);
  const project = await db.project.findUnique({ where: { id: data.projectId }, select: { ownerId: true, state: true, visibility: true } });
  if (!project || project.ownerId !== user.id) throw fail.invalid("Du kannst nur eigene Projekte einreichen.", { projectId: "Eigenes Projekt wählen" });
  if (project.state !== "PUBLISHED" || project.visibility !== "PUBLIC") throw fail.invalid("Das Projekt muss veröffentlicht und öffentlich sein.", { projectId: "Projekt ist nicht öffentlich" });
  const existing = await db.challengeEntry.findUnique({ where: { challengeId_userId: { challengeId, userId: user.id } } });
  if (existing?.state === "REMOVED") throw fail.forbidden("Deine Einreichung wurde von der Moderation entfernt.");
  await db.$transaction(async (tx) => {
    await tx.challengeEntry.upsert({
      where: { challengeId_userId: { challengeId, userId: user.id } },
      create: { challengeId, userId: user.id, projectId: data.projectId, note: data.note },
      update: { projectId: data.projectId, note: data.note },
    });
    if (!existing) await tx.communityChallenge.update({ where: { id: challengeId }, data: { entryCount: { increment: 1 } } });
  });
  return { replaced: !!existing };
}

export async function withdrawEntry(user: Pick<SessionUser, "id">, challengeId: string) {
  const ch = await loadChallenge(challengeId);
  if (competitionPhase(ch) !== "open") throw fail.invalid("Zurückziehen ist nur während der Einreichung möglich.");
  const e = await db.challengeEntry.findUnique({ where: { challengeId_userId: { challengeId, userId: user.id } } });
  if (!e || e.state !== "ACTIVE") throw fail.notFound();
  await db.$transaction([db.challengeEntry.delete({ where: { id: e.id } }), db.communityChallenge.update({ where: { id: challengeId }, data: { entryCount: { decrement: 1 } } })]);
  return { withdrawn: true };
}

export async function voteEntry(user: SessionUser, entryId: string, on: boolean) {
  const entry = await db.challengeEntry.findUnique({ where: { id: entryId }, select: { id: true, userId: true, state: true, challengeId: true } });
  if (!entry || entry.state !== "ACTIVE") throw fail.notFound("Einreichung nicht gefunden.");
  const ch = await loadChallenge(entry.challengeId);
  if (ch.judging !== "VOTES") throw fail.invalid("Bei diesem Wettbewerb entscheidet die Jury.");
  if (competitionPhase(ch) !== "voting") throw fail.invalid("Die Abstimmung ist gerade nicht geöffnet.");
  const a = await access(ch, user);
  if (!a.isMember) throw fail.forbidden("Abstimmen können Mitglieder der Community.");
  if (entry.userId === user.id) throw fail.invalid("Für die eigene Einreichung kannst du nicht stimmen.");
  await rateLimit(`challenge-vote:${user.id}`, 120, 3600);
  return db.$transaction(async (tx) => {
    // Gleichzeitige Stimmen derselben Person in diesem Wettbewerb nacheinander abarbeiten,
    // sonst sähen parallele Anfragen alle „noch Stimmen frei“ (Limit umgangen)
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`challenge-vote:${ch.id}:${user.id}`}))`;
    const has = await tx.challengeVote.findUnique({ where: { entryId_userId: { entryId, userId: user.id } } });
    if (on && !has) {
      const used = await tx.challengeVote.count({ where: { challengeId: ch.id, userId: user.id } });
      if (used >= CHALLENGE_VOTES_PER_PERSON) throw fail.invalid(`Du hast alle ${CHALLENGE_VOTES_PER_PERSON} Stimmen vergeben. Nimm eine zurück, um neu zu wählen.`);
      await tx.challengeVote.create({ data: { entryId, userId: user.id, challengeId: ch.id } });
      await tx.challengeEntry.update({ where: { id: entryId }, data: { voteCount: { increment: 1 } } });
    } else if (!on && has) {
      await tx.challengeVote.delete({ where: { entryId_userId: { entryId, userId: user.id } } });
      await tx.challengeEntry.update({ where: { id: entryId }, data: { voteCount: { decrement: 1 } } });
    }
    const used = await tx.challengeVote.count({ where: { challengeId: ch.id, userId: user.id } });
    return { voted: on, votesLeft: Math.max(0, CHALLENGE_VOTES_PER_PERSON - used) };
  });
}

/* ───────────────────────── Moderation / Jury ───────────────────────── */

async function requireCompetitionMod(user: SessionUser, challengeId: string) {
  const ch = await loadChallenge(challengeId);
  const a = await access(ch, user);
  if (!a.isMod) throw fail.forbidden("Nur die Moderation der Community kann das.");
  return ch;
}

export async function removeEntry(user: SessionUser, entryId: string) {
  const e = await db.challengeEntry.findUnique({ where: { id: entryId } });
  if (!e) throw fail.notFound();
  const ch = await requireCompetitionMod(user, e.challengeId);
  if (competitionPhase(ch) === "ended") throw fail.invalid("Nach dem Ergebnis können keine Einreichungen mehr entfernt werden.");
  // Bedingt umstellen: ein zweiter (gleichzeitiger) Aufruf zählt nicht erneut herunter und meldet nichts
  const changed = await db.$transaction(async (tx) => {
    const r = await tx.challengeEntry.updateMany({ where: { id: entryId, state: "ACTIVE" }, data: { state: "REMOVED", voteCount: 0, place: null } });
    if (!r.count) return false;
    await tx.challengeVote.deleteMany({ where: { entryId } });
    await tx.communityChallenge.update({ where: { id: e.challengeId }, data: { entryCount: { decrement: 1 } } });
    return true;
  });
  if (!changed) return { removed: true };
  await notify({ recipientId: e.userId, type: "PROJECT_ACTIVITY", bundle: false, data: { kind: "COMPETITION", message: `Deine Einreichung beim Wettbewerb „${ch.title}“ wurde von der Moderation entfernt.`, href: `/c/${ch.community.slug}/wettbewerbe/${ch.id}` } }).catch(() => {});
  return { removed: true };
}

/** Jury: Platz 1–3 festlegen und Ergebnis veröffentlichen. */
export async function publishJuryResult(user: SessionUser, challengeId: string, places: { entryId: string; place: number }[]) {
  const ch = await requireCompetitionMod(user, challengeId);
  if (ch.judging !== "JURY") throw fail.invalid("Bei diesem Wettbewerb entscheidet die Abstimmung.");
  if (competitionPhase(ch) !== "jury") throw fail.invalid(ch.resultsAt ? "Das Ergebnis ist bereits veröffentlicht." : "Die Einreichung läuft noch.");
  const clean = places.filter((p) => p.place >= 1 && p.place <= 3);
  if (!clean.length) throw fail.invalid("Wähle mindestens einen Platz.");
  if (new Set(clean.map((p) => p.place)).size !== clean.length || new Set(clean.map((p) => p.entryId)).size !== clean.length) throw fail.invalid("Jeder Platz und jede Einreichung nur einmal.");
  const valid = await db.challengeEntry.count({ where: { id: { in: clean.map((p) => p.entryId) }, challengeId, state: "ACTIVE" } });
  if (valid !== clean.length) throw fail.invalid("Ungültige Einreichung.");
  await db.$transaction([
    db.challengeEntry.updateMany({ where: { challengeId }, data: { place: null } }),
    ...clean.map((p) => db.challengeEntry.update({ where: { id: p.entryId }, data: { place: p.place } })),
    db.communityChallenge.update({ where: { id: challengeId }, data: { resultsAt: new Date() } }),
  ]);
  await announceResults(challengeId);
  return { published: true };
}

/* ───────────────────────── Phasen (Worker) ───────────────────────── */

async function tellAll(userIds: string[], message: string, href: string) {
  await notifyMany(userIds, { type: "PROJECT_ACTIVITY", bundle: false, data: { kind: "COMPETITION", message, href } }).catch(() => {});
}

async function announceResults(challengeId: string) {
  const ch = await db.communityChallenge.findUnique({ where: { id: challengeId }, include: { community: { select: { slug: true } } } });
  if (!ch || ch.notified.includes("results")) return;
  const entries = await db.challengeEntry.findMany({ where: { challengeId, state: "ACTIVE" }, select: { userId: true, place: true } });
  const href = `/c/${ch.community.slug}/wettbewerbe/${ch.id}`;
  for (const e of entries) {
    const msg = e.place ? `Glückwunsch! Du hast beim Wettbewerb „${ch.title}“ Platz ${e.place} erreicht.` : `Das Ergebnis des Wettbewerbs „${ch.title}“ ist da. Danke fürs Mitmachen!`;
    await notify({ recipientId: e.userId, type: "PROJECT_ACTIVITY", bundle: false, data: { kind: "COMPETITION", message: msg, href } }).catch(() => {});
  }
  await db.communityChallenge.update({ where: { id: challengeId }, data: { notified: { push: "results" } } });
}

/** Abstimmung auswerten: Platz 1–3 nach Stimmen (Gleichstand: frühere Einreichung zuerst). */
export async function finalizeVotes(challengeId: string) {
  // Nur Einreichungen, deren Projekt noch veröffentlicht und öffentlich ist (sonst leerer Siegerplatz)
  const top = await db.challengeEntry.findMany({ where: { challengeId, state: "ACTIVE", voteCount: { gt: 0 }, project: { state: "PUBLISHED", visibility: "PUBLIC" } }, orderBy: [{ voteCount: "desc" }, { createdAt: "asc" }], take: 3, select: { id: true } });
  await db.$transaction([
    db.challengeEntry.updateMany({ where: { challengeId }, data: { place: null } }),
    ...top.map((e, i) => db.challengeEntry.update({ where: { id: e.id }, data: { place: i + 1 } })),
    db.communityChallenge.update({ where: { id: challengeId }, data: { resultsAt: new Date() } }),
  ]);
  await announceResults(challengeId);
}

/** Start melden: alle aktiven Mitglieder der Community (ausser der Person, die ihn angelegt hat). */
async function announceStart(now: Date) {
  const starting = await db.communityChallenge.findMany({
    where: { startsAt: { lte: now }, endsAt: { gt: now }, NOT: { notified: { has: "start" } } },
    include: { community: { select: { slug: true, name: true } } },
    take: 20,
  });
  for (const ch of starting) {
    // Zuerst markieren – bricht der Lauf ab, gibt es lieber keine als doppelte Meldungen
    await db.communityChallenge.update({ where: { id: ch.id }, data: { notified: { push: "start" } } });
    const href = `/c/${ch.community.slug}/wettbewerbe/${ch.id}`;
    const until = ch.endsAt.toLocaleDateString("de-CH", { day: "numeric", month: "long", timeZone: "Europe/Zurich" });
    let cursor: string | undefined;
    for (;;) {
      const members = await db.communityMember.findMany({
        where: { communityId: ch.communityId, state: "ACTIVE", ...(ch.createdById ? { userId: { not: ch.createdById } } : {}) },
        orderBy: { userId: "asc" },
        take: 500,
        ...(cursor ? { cursor: { communityId_userId: { communityId: ch.communityId, userId: cursor } }, skip: 1 } : {}),
        select: { userId: true },
      });
      await notifyMany(members.map((m) => m.userId), { type: "PROJECT_ACTIVITY", bundle: false, data: { kind: "COMPETITION", message: `Neuer Wettbewerb in ${ch.community.name}: „${ch.title}“ – Einreichung bis ${until}.`, href } }).catch(() => {});
      if (members.length < 500) break;
      cursor = members.at(-1)!.userId;
    }
  }
}

/** Worker (alle 5 Min.): Start und Phasenwechsel melden, Abstimmungen auswerten. */
export async function runCompetitionPhases(now = new Date()) {
  await announceStart(now);
  const due = await db.communityChallenge.findMany({
    // Nur mit offener Arbeit: Jury-Wettbewerbe ohne Ergebnis, die schon gemeldet sind, warten auf die
    // Jury und dürfen die Liste nicht füllen (sonst würden neue Abstimmungen nie ausgewertet)
    where: {
      endsAt: { lte: now },
      OR: [
        { resultsAt: null, judging: "VOTES" },
        { resultsAt: null, judging: "JURY", NOT: { notified: { has: "jury" } } },
        { resultsAt: { not: null }, NOT: { notified: { has: "results" } } },
      ],
    },
    include: { community: { select: { slug: true, id: true } } },
    orderBy: { endsAt: "asc" },
    take: 100,
  });
  for (const ch of due) {
    const href = `/c/${ch.community.slug}/wettbewerbe/${ch.id}`;
    const participants = (await db.challengeEntry.findMany({ where: { challengeId: ch.id, state: "ACTIVE" }, select: { userId: true } })).map((e) => e.userId);
    if (ch.judging === "VOTES") {
      if (ch.votingEndsAt && now < ch.votingEndsAt) {
        if (!ch.notified.includes("voting")) {
          await tellAll(participants, `Die Einreichung zum Wettbewerb „${ch.title}“ ist geschlossen – jetzt stimmt die Community ab.`, href);
          await db.communityChallenge.update({ where: { id: ch.id }, data: { notified: { push: "voting" } } });
        }
      } else if (!ch.resultsAt) {
        await finalizeVotes(ch.id);
      } else await announceResults(ch.id);
    } else if (!ch.resultsAt && !ch.notified.includes("jury")) {
      const mods = await db.communityMember.findMany({ where: { communityId: ch.communityId, state: "ACTIVE", role: { in: ["OWNER", "ADMIN", "MODERATOR"] } }, select: { userId: true } });
      await tellAll(mods.map((m) => m.userId), `Die Einreichung zum Wettbewerb „${ch.title}“ ist geschlossen. Bitte wählt die Gewinner:innen und veröffentlicht das Ergebnis.`, href);
      await tellAll(participants, `Die Einreichung zum Wettbewerb „${ch.title}“ ist geschlossen – die Jury entscheidet.`, href);
      await db.communityChallenge.update({ where: { id: ch.id }, data: { notified: { push: "jury" } } });
    } else if (ch.resultsAt) await announceResults(ch.id);
  }
  return due.length;
}

/** Auszeichnungen für das Profil: Platzierungen in entschiedenen Wettbewerben sichtbarer Communities. */
export async function profileAwards(userId: string, viewer: Viewer) {
  const rows = await db.challengeEntry.findMany({
    where: { userId, state: "ACTIVE", place: { not: null }, challenge: { resultsAt: { not: null, lte: new Date() }, community: { state: "PUBLISHED" } } },
    orderBy: [{ challenge: { resultsAt: "desc" } }],
    take: 20,
    select: { id: true, place: true, challenge: { select: { id: true, title: true, resultsAt: true, communityId: true, community: { select: { slug: true, name: true, visibility: true } } } } },
  });
  const out = [];
  for (const r of rows) {
    // Private Communities nur zeigen, wenn die betrachtende Person Mitglied ist
    if (r.challenge.community.visibility === "PRIVATE") {
      const m = viewer ? await communityRole(r.challenge.communityId, viewer.id) : null;
      if (m?.state !== "ACTIVE") continue;
    }
    out.push({ id: r.id, place: r.place!, title: r.challenge.title, href: `/c/${r.challenge.community.slug}/wettbewerbe/${r.challenge.id}`, community: r.challenge.community.name, date: r.challenge.resultsAt! });
  }
  return out;
}
