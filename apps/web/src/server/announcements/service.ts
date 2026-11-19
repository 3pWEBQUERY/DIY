import "server-only";
import { cache } from "react";
import {
  ANNOUNCEMENT_PER_PLACEMENT,
  ANNOUNCEMENT_TONES,
  announcementSchema,
  type AnnouncementPlacement,
  type AnnouncementTone,
} from "@werkraum/shared";
import { db } from "@/server/db";
import { fail } from "@/server/errors";
import { audit } from "@/server/audit";
import { hasRole } from "@/server/authz";
import type { SessionUser } from "@/server/auth/session";

/**
 * Ankündigungen (Mini-Hero) – Verwaltung nur durch die Administration, Anzeige für alle auf den
 * gewählten Seiten, solange aktiv und im Zeitraum. Jede Änderung steht im Audit-Protokoll.
 */

type Actor = Pick<SessionUser, "id" | "role">;
function admin(actor: Actor) {
  if (!hasRole(actor, "ADMIN")) throw fail.forbidden();
}

const toneOf = (t: string): AnnouncementTone => (t in ANNOUNCEMENT_TONES ? (t as AnnouncementTone) : "coral");

/** Was die Seiten zum Anzeigen brauchen (ohne Verwaltungsdaten) */
export type AnnouncementView = {
  id: string;
  /** Wechselt bei jeder Änderung – eine ausgeblendete Ankündigung erscheint nach einer Änderung wieder */
  version: string;
  title: string;
  body: string;
  emoji: string;
  tone: AnnouncementTone;
  ctaLabel: string;
  ctaHref: string;
  dismissible: boolean;
};

/** Laufende Ankündigungen einer Seite, wichtigste zuerst (einmal pro Anfrage geladen). */
export const activeAnnouncements = cache(async (placement: AnnouncementPlacement): Promise<AnnouncementView[]> => {
  const now = new Date();
  const rows = await db.announcement
    .findMany({
      where: {
        isActive: true,
        placements: { has: placement },
        AND: [{ OR: [{ startsAt: null }, { startsAt: { lte: now } }] }, { OR: [{ endsAt: null }, { endsAt: { gt: now } }] }],
      },
      orderBy: [{ position: "asc" }, { updatedAt: "desc" }],
      take: ANNOUNCEMENT_PER_PLACEMENT,
      select: { id: true, updatedAt: true, title: true, body: true, emoji: true, tone: true, ctaLabel: true, ctaHref: true, dismissible: true },
    })
    // Eine fehlende Tabelle o. Ä. darf keine Seite kippen – dann eben ohne Ankündigung
    .catch(() => []);
  return rows.map((r) => ({
    id: r.id,
    version: r.updatedAt.getTime().toString(36),
    title: r.title,
    body: r.body,
    emoji: r.emoji,
    tone: toneOf(r.tone),
    ctaLabel: r.ctaLabel,
    ctaHref: r.ctaHref,
    dismissible: r.dismissible,
  }));
});

// ───────────────────────── Verwaltung ─────────────────────────

export async function listAnnouncements(actor: Actor) {
  admin(actor);
  return db.announcement.findMany({
    orderBy: [{ isActive: "desc" }, { position: "asc" }, { updatedAt: "desc" }],
    take: 200,
    include: { updatedBy: { select: { profile: { select: { displayName: true } } } } },
  });
}

export async function getAnnouncement(actor: Actor, id: string) {
  admin(actor);
  return db.announcement.findUnique({ where: { id } });
}

export async function saveAnnouncement(actor: Actor, id: string | null, input: unknown) {
  admin(actor);
  const d = announcementSchema.parse(input);
  return db.$transaction(async (tx) => {
    if (id && !(await tx.announcement.findUnique({ where: { id }, select: { id: true } }))) throw fail.notFound("Ankündigung nicht gefunden.");
    const data = { ...d, placements: [...d.placements], updatedById: actor.id };
    const row = id ? await tx.announcement.update({ where: { id }, data }) : await tx.announcement.create({ data: { ...data, createdById: actor.id } });
    await audit(
      { actorId: actor.id, action: id ? "admin.announcement_updated" : "admin.announcement_created", targetType: "ANNOUNCEMENT", targetId: row.id, meta: { title: row.title, active: row.isActive, placements: row.placements } },
      tx,
    );
    return row;
  });
}

export async function setAnnouncementActive(actor: Actor, id: string, isActive: boolean) {
  admin(actor);
  await db.$transaction(async (tx) => {
    const r = await tx.announcement.updateMany({ where: { id }, data: { isActive, updatedById: actor.id } });
    if (!r.count) throw fail.notFound("Ankündigung nicht gefunden.");
    await audit({ actorId: actor.id, action: isActive ? "admin.announcement_activated" : "admin.announcement_deactivated", targetType: "ANNOUNCEMENT", targetId: id }, tx);
  });
}

export async function deleteAnnouncement(actor: Actor, id: string) {
  admin(actor);
  await db.$transaction(async (tx) => {
    const row = await tx.announcement.findUnique({ where: { id }, select: { title: true } });
    if (!row) throw fail.notFound("Ankündigung nicht gefunden.");
    await tx.announcement.delete({ where: { id } });
    await audit({ actorId: actor.id, action: "admin.announcement_deleted", targetType: "ANNOUNCEMENT", targetId: id, meta: { title: row.title } }, tx);
  });
}
