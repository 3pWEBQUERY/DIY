import "server-only";
import { eventUpsertSchema } from "@werkraum/shared";
import { db, type Prisma } from "@/server/db";
import { fail } from "@/server/errors";
import { hasRole, communityRole } from "@/server/authz";
import { rateLimit } from "@/server/ratelimit";
import { notify } from "@/server/notifications";
import type { SessionUser } from "@/server/auth/session";
import { canViewCommunityContent, isModRole, isMuted } from "./service";

/**
 * Events in Communities: Treffen, Workshops, Tauschbörsen – vor Ort oder online.
 * Erstellen: aktive Mitglieder. Ändern/Absagen: Veranstalter:in und Moderation.
 * Teilnahme (Dabei/Interessiert) nur für Mitglieder; Online-Link sehen nur Teilnehmende.
 */

type Viewer = Pick<SessionUser, "id" | "role"> | null;
const TZ = "Europe/Zurich";

const eventSelect = {
  id: true,
  communityId: true,
  organizerId: true,
  title: true,
  description: true,
  kind: true,
  mode: true,
  startsAt: true,
  endsAt: true,
  locationName: true,
  address: true,
  onlineUrl: true,
  capacity: true,
  costNote: true,
  state: true,
  cancelReason: true,
  goingCount: true,
  interestedCount: true,
  createdAt: true,
  community: { select: { id: true, slug: true, name: true, visibility: true, state: true, coverUrl: true, category: true } },
  organizer: { select: { id: true, profile: { select: { handle: true, displayName: true, avatarUrl: true } } } },
} satisfies Prisma.CommunityEventSelect;

type EventRow = Prisma.CommunityEventGetPayload<{ select: typeof eventSelect }>;

function toCard(e: EventRow, my?: string | null) {
  const full = e.capacity != null && e.goingCount >= e.capacity;
  return {
    id: e.id,
    title: e.title,
    kind: e.kind,
    mode: e.mode,
    startsAt: e.startsAt.toISOString(),
    endsAt: e.endsAt.toISOString(),
    locationName: e.locationName,
    cancelled: e.state === "CANCELLED",
    past: e.endsAt < new Date(),
    goingCount: e.goingCount,
    interestedCount: e.interestedCount,
    capacity: e.capacity,
    full,
    myStatus: (my ?? null) as "GOING" | "INTERESTED" | null,
    community: { slug: e.community.slug, name: e.community.name, coverUrl: e.community.coverUrl },
    href: `/c/${e.community.slug}/events/${e.id}`,
  };
}
export type EventCard = ReturnType<typeof toCard>;

async function myStatuses(userId: string | null | undefined, ids: string[]) {
  if (!userId || !ids.length) return new Map<string, string>();
  const rows = await db.eventAttendee.findMany({ where: { userId, eventId: { in: ids } }, select: { eventId: true, status: true } });
  return new Map(rows.map((r) => [r.eventId, r.status]));
}

async function membership(communityId: string, viewer: Viewer) {
  return viewer ? communityRole(communityId, viewer.id) : null;
}

/** Lädt ein Event inkl. Rechte; null, wenn nicht sichtbar. */
export async function getEvent(eventId: string, viewer: Viewer) {
  const e = await db.communityEvent.findUnique({ where: { id: eventId }, select: eventSelect });
  if (!e || e.community.state === "REMOVED") return null;
  const m = await membership(e.communityId, viewer);
  const platformMod = !!viewer && hasRole(viewer, "PLATFORM_MODERATOR");
  if (e.community.state === "HIDDEN" && !platformMod && m?.state !== "ACTIVE") return null;
  if (!canViewCommunityContent(e.community, m, viewer)) return null;
  const isMod = isModRole(m) || platformMod;
  const isOrganizer = viewer?.id === e.organizerId;
  const [mine, going] = await Promise.all([
    viewer ? db.eventAttendee.findUnique({ where: { eventId_userId: { eventId, userId: viewer.id } }, select: { status: true } }) : null,
    db.eventAttendee.findMany({
      where: { eventId, status: "GOING" },
      orderBy: { createdAt: "asc" },
      take: 24,
      select: { user: { select: { id: true, profile: { select: { handle: true, displayName: true, avatarUrl: true } } } } },
    }),
  ]);
  const canSeeLink = isOrganizer || isMod || mine?.status === "GOING";
  return {
    ...toCard(e, mine?.status),
    description: e.description,
    address: e.address,
    costNote: e.costNote,
    cancelReason: e.cancelReason,
    onlineUrl: canSeeLink ? e.onlineUrl : "",
    onlineUrlHidden: e.mode === "ONLINE" && !canSeeLink,
    organizer: { id: e.organizer.id, ...e.organizer.profile },
    communityId: e.communityId,
    attendees: going.map((g) => ({ id: g.user.id, handle: g.user.profile?.handle ?? "", displayName: g.user.profile?.displayName ?? "", avatarUrl: g.user.profile?.avatarUrl ?? null })),
    canEdit: (isOrganizer || isMod) && e.state !== "CANCELLED",
    canAttend: !!viewer && m?.state === "ACTIVE" && e.state !== "CANCELLED" && e.endsAt > new Date(),
    isMember: m?.state === "ACTIVE",
  };
}
export type EventDetail = NonNullable<Awaited<ReturnType<typeof getEvent>>>;

/** Events einer Community: kommende (aufsteigend) oder vergangene (absteigend). */
export async function listCommunityEvents(communityId: string, viewer: Viewer, when: "upcoming" | "past" = "upcoming", take = 30) {
  const now = new Date();
  const rows = await db.communityEvent.findMany({
    where: { communityId, ...(when === "upcoming" ? { endsAt: { gte: now } } : { endsAt: { lt: now } }) },
    orderBy: { startsAt: when === "upcoming" ? "asc" : "desc" },
    take,
    select: eventSelect,
  });
  const my = await myStatuses(viewer?.id, rows.map((r) => r.id));
  return rows.map((r) => toCard(r, my.get(r.id)));
}

/**
 * Übersicht /events: eigene Zusagen, Events aus eigenen Communities, öffentliche Events.
 * Private Communities erscheinen nur für Mitglieder.
 */
export async function eventsOverview(viewer: Viewer, opts: { mode?: "IN_PERSON" | "ONLINE" | null; category?: string | null } = {}) {
  const now = new Date();
  const memberOf = viewer ? (await db.communityMember.findMany({ where: { userId: viewer.id, state: "ACTIVE" }, select: { communityId: true } })).map((m) => m.communityId) : [];
  const base: Prisma.CommunityEventWhereInput = {
    endsAt: { gte: now },
    state: "SCHEDULED",
    community: { state: "PUBLISHED", ...(opts.category ? { category: opts.category } : {}) },
    ...(opts.mode ? { mode: opts.mode } : {}),
  };
  const [mine, communities, open] = await Promise.all([
    viewer
      ? db.communityEvent.findMany({ where: { endsAt: { gte: now }, attendees: { some: { userId: viewer.id } } }, orderBy: { startsAt: "asc" }, take: 12, select: eventSelect })
      : Promise.resolve([]),
    memberOf.length ? db.communityEvent.findMany({ where: { ...base, communityId: { in: memberOf } }, orderBy: { startsAt: "asc" }, take: 24, select: eventSelect }) : Promise.resolve([]),
    db.communityEvent.findMany({ where: { ...base, communityId: { notIn: memberOf }, community: { ...(base.community as object), visibility: { not: "PRIVATE" } } }, orderBy: { startsAt: "asc" }, take: 24, select: eventSelect }),
  ]);
  const my = await myStatuses(viewer?.id, [...mine, ...communities, ...open].map((e) => e.id));
  const mineIds = new Set(mine.map((e) => e.id));
  return {
    mine: mine.map((e) => toCard(e, my.get(e.id))),
    communities: communities.filter((e) => !mineIds.has(e.id)).map((e) => toCard(e, my.get(e.id))),
    open: open.map((e) => toCard(e, my.get(e.id))),
  };
}

/** Nächstes Event einer Community (Banner auf der Community-Seite). */
export async function nextCommunityEvent(communityId: string, viewerId?: string | null) {
  const e = await db.communityEvent.findFirst({ where: { communityId, state: "SCHEDULED", endsAt: { gte: new Date() } }, orderBy: { startsAt: "asc" }, select: eventSelect });
  if (!e) return null;
  const my = await myStatuses(viewerId, [e.id]);
  return toCard(e, my.get(e.id));
}

// ───────────────────────── Schreiben ─────────────────────────

async function requireActiveMember(user: SessionUser, communityId: string) {
  const c = await db.community.findUnique({ where: { id: communityId }, select: { id: true, slug: true, name: true, state: true } });
  if (!c || c.state !== "PUBLISHED") throw fail.forbidden("In dieser Community können gerade keine Events erstellt werden.");
  const m = await communityRole(communityId, user.id);
  if (m?.state !== "ACTIVE") throw fail.forbidden("Tritt der Community bei, um ein Event zu erstellen.");
  if (isMuted(m)) throw fail.forbidden("Du bist in dieser Community gerade stummgeschaltet.");
  return { community: c, m };
}

function clean(data: ReturnType<typeof eventUpsertSchema.parse>) {
  return {
    title: data.title,
    description: data.description,
    kind: data.kind,
    mode: data.mode,
    startsAt: data.startsAt,
    endsAt: data.endsAt,
    locationName: data.mode === "IN_PERSON" ? data.locationName : "",
    address: data.mode === "IN_PERSON" ? data.address : "",
    onlineUrl: data.mode === "ONLINE" ? data.onlineUrl : "",
    capacity: data.capacity ?? null,
    costNote: data.costNote,
  };
}

export async function createEvent(user: SessionUser, communityId: string, input: unknown) {
  const data = eventUpsertSchema.parse(input);
  await requireActiveMember(user, communityId);
  if (data.startsAt.getTime() < Date.now() - 5 * 60_000) throw fail.invalid("Der Beginn liegt in der Vergangenheit.", { startsAt: "Liegt in der Vergangenheit" });
  if (data.startsAt.getTime() > Date.now() + 366 * 86400_000) throw fail.invalid("Höchstens ein Jahr im Voraus.", { startsAt: "Zu weit in der Zukunft" });
  await rateLimit(`event-create:${user.id}`, 10, 86400);
  const e = await db.$transaction(async (tx) => {
    const ev = await tx.communityEvent.create({ data: { ...clean(data), communityId, organizerId: user.id, goingCount: 1 } });
    // Veranstalter:in ist automatisch dabei
    await tx.eventAttendee.create({ data: { eventId: ev.id, userId: user.id, status: "GOING" } });
    return ev;
  });
  return { id: e.id };
}

async function requireEditor(user: SessionUser, eventId: string) {
  const e = await db.communityEvent.findUnique({ where: { id: eventId }, select: { id: true, communityId: true, organizerId: true, state: true, title: true, startsAt: true, endsAt: true, locationName: true, address: true, onlineUrl: true, mode: true, community: { select: { slug: true } } } });
  if (!e) throw fail.notFound("Event nicht gefunden.");
  const m = await communityRole(e.communityId, user.id);
  if (e.organizerId !== user.id && !isModRole(m) && !hasRole(user, "PLATFORM_MODERATOR")) throw fail.forbidden("Nur Veranstalter:in und Moderation können das Event ändern.");
  return e;
}

/** Teilnehmende über Änderungen informieren (ohne die handelnde Person). */
async function notifyAttendees(eventId: string, actorId: string, data: { message: string; href: string }) {
  const people = await db.eventAttendee.findMany({ where: { eventId, userId: { not: actorId } }, select: { userId: true } });
  for (const p of people) {
    await notify({ recipientId: p.userId, type: "COMMUNITY_INVITE", data: { kind: "event", ...data }, bundle: false }).catch(() => {});
  }
}

const when = (d: Date) => d.toLocaleString("de-CH", { timeZone: TZ, weekday: "short", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });

export async function updateEvent(user: SessionUser, eventId: string, input: unknown) {
  const data = eventUpsertSchema.parse(input);
  const prev = await requireEditor(user, eventId);
  if (prev.state === "CANCELLED") throw fail.conflict("Abgesagte Events können nicht mehr bearbeitet werden.");
  const next = clean(data);
  const going = await db.eventAttendee.count({ where: { eventId, status: "GOING" } });
  if (next.capacity != null && next.capacity < going) throw fail.invalid(`Es haben bereits ${going} Personen zugesagt.`, { capacity: `Mindestens ${going}` });
  await db.communityEvent.update({ where: { id: eventId }, data: next });
  const moved = prev.startsAt.getTime() !== next.startsAt.getTime() || prev.endsAt.getTime() !== next.endsAt.getTime();
  const relocated = prev.locationName !== next.locationName || prev.address !== next.address || prev.onlineUrl !== next.onlineUrl || prev.mode !== next.mode;
  if (moved || relocated) {
    const what = moved && relocated ? "Zeit und Ort" : moved ? `die Zeit (neu: ${when(next.startsAt)})` : "den Ort";
    await notifyAttendees(eventId, user.id, { message: `Das Event „${next.title}“ hat ${what} geändert.`, href: `/c/${prev.community.slug}/events/${eventId}` });
  }
  return { id: eventId };
}

export async function cancelEvent(user: SessionUser, eventId: string, reason: string) {
  const prev = await requireEditor(user, eventId);
  if (prev.state === "CANCELLED") return { id: eventId };
  const r = reason.trim().slice(0, 300);
  await db.communityEvent.update({ where: { id: eventId }, data: { state: "CANCELLED", cancelReason: r } });
  await notifyAttendees(eventId, user.id, { message: `Das Event „${prev.title}“ am ${when(prev.startsAt)} wurde abgesagt.${r ? ` Grund: ${r}` : ""}`, href: `/c/${prev.community.slug}/events/${eventId}` });
  return { id: eventId };
}

/** Zusagen/Interesse/Absagen. Plätze werden atomar vergeben (keine Überbuchung). */
export async function setAttendance(user: SessionUser, eventId: string, status: "GOING" | "INTERESTED" | null) {
  const e = await db.communityEvent.findUnique({ where: { id: eventId }, select: { id: true, communityId: true, organizerId: true, state: true, endsAt: true, capacity: true, title: true, community: { select: { slug: true } } } });
  if (!e) throw fail.notFound("Event nicht gefunden.");
  const m = await communityRole(e.communityId, user.id);
  if (m?.state !== "ACTIVE") throw fail.forbidden("Tritt der Community bei, um teilzunehmen.");
  if (e.state === "CANCELLED") throw fail.conflict("Dieses Event wurde abgesagt.");
  if (e.endsAt < new Date()) throw fail.conflict("Dieses Event ist bereits vorbei.");
  if (status === null && e.organizerId === user.id) throw fail.invalid("Als Veranstalter:in kannst du nicht absagen – sage stattdessen das Event ab.");
  await rateLimit(`event-rsvp:${user.id}`, 60, 3600);

  await db.$transaction(async (tx) => {
    // Zeile sperren, damit gleichzeitige Zusagen die Kapazität nicht überschreiten
    await tx.$queryRaw`SELECT id FROM "CommunityEvent" WHERE id = ${eventId} FOR UPDATE`;
    const prev = await tx.eventAttendee.findUnique({ where: { eventId_userId: { eventId, userId: user.id } }, select: { status: true } });
    if ((prev?.status ?? null) === status) return;
    if (status === "GOING" && e.capacity != null) {
      const going = await tx.eventAttendee.count({ where: { eventId, status: "GOING" } });
      if (going >= e.capacity) throw fail.conflict("Leider ausgebucht. Markiere das Event als „Interessiert“ – wird ein Platz frei, siehst du es hier.");
    }
    if (status) await tx.eventAttendee.upsert({ where: { eventId_userId: { eventId, userId: user.id } }, create: { eventId, userId: user.id, status }, update: { status } });
    else await tx.eventAttendee.delete({ where: { eventId_userId: { eventId, userId: user.id } } });
    const going = await tx.eventAttendee.count({ where: { eventId, status: "GOING" } });
    const interested = await tx.eventAttendee.count({ where: { eventId, status: "INTERESTED" } });
    await tx.communityEvent.update({ where: { id: eventId }, data: { goingCount: going, interestedCount: interested } });
  });
  if (status === "GOING" && e.organizerId !== user.id) {
    await notify({ recipientId: e.organizerId, actorId: user.id, type: "COMMUNITY_INVITE", targetType: "COMMUNITY", targetId: e.communityId, data: { kind: "event_going", title: e.title, href: `/c/${e.community.slug}/events/${eventId}` } }).catch(() => {});
  }
  return getEvent(eventId, user);
}

/** Erinnerung 24 h vorher an alle mit Zusage (Worker, minütlich). */
export async function sendEventReminders() {
  const soon = new Date(Date.now() + 24 * 3600_000);
  const due = await db.communityEvent.findMany({ where: { state: "SCHEDULED", reminderSentAt: null, startsAt: { lte: soon, gt: new Date() } }, take: 50, select: { id: true, title: true, startsAt: true, community: { select: { slug: true } } } });
  for (const e of due) {
    const claimed = await db.communityEvent.updateMany({ where: { id: e.id, reminderSentAt: null }, data: { reminderSentAt: new Date() } });
    if (!claimed.count) continue;
    const going = await db.eventAttendee.findMany({ where: { eventId: e.id, status: "GOING" }, select: { userId: true } });
    for (const g of going) {
      await notify({ recipientId: g.userId, type: "COMMUNITY_INVITE", data: { kind: "event", message: `Erinnerung: „${e.title}“ beginnt ${when(e.startsAt)}.`, href: `/c/${e.community.slug}/events/${e.id}` }, bundle: false }).catch(() => {});
    }
  }
  return due.length;
}

/** iCalendar-Datei (RFC 5545) für „Zum Kalender hinzufügen“. */
export function eventIcs(e: EventDetail, appUrl: string) {
  const fmt = (iso: string) => iso.replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/[,;]/g, (m) => `\\${m}`);
  const fold = (line: string) => line.match(/.{1,73}/g)!.join("\r\n ");
  const location = e.mode === "ONLINE" ? e.onlineUrl || "Online" : [e.locationName, e.address].filter(Boolean).join(", ");
  const url = `${appUrl}${e.href}`;
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Werkuno//Events//DE",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${e.id}@werkuno.ch`,
    `DTSTAMP:${fmt(new Date().toISOString())}`,
    `DTSTART:${fmt(e.startsAt)}`,
    `DTEND:${fmt(e.endsAt)}`,
    fold(`SUMMARY:${esc(e.title)}`),
    fold(`DESCRIPTION:${esc(`${e.description}\n\n${url}`.trim())}`),
    fold(`LOCATION:${esc(location)}`),
    fold(`URL:${url}`),
    e.cancelled ? "STATUS:CANCELLED" : "STATUS:CONFIRMED",
    "END:VEVENT",
    "END:VCALENDAR",
    "",
  ].join("\r\n");
}
