import "server-only";
import { cache } from "react";
import {
  ANNOUNCEMENT_BG_MODES,
  ANNOUNCEMENT_BG_POSITIONS,
  ANNOUNCEMENT_BODY_SIZES,
  ANNOUNCEMENT_FONTS,
  ANNOUNCEMENT_OVERLAY_MAX,
  ANNOUNCEMENT_PER_PLACEMENT,
  ANNOUNCEMENT_TITLE_SIZES,
  ANNOUNCEMENT_TONES,
  announcementSchema,
  isHexColor,
  type AnnouncementBgMode,
  type AnnouncementBgPosition,
  type AnnouncementBodySize,
  type AnnouncementFont,
  type AnnouncementPlacement,
  type AnnouncementTitleSize,
  type AnnouncementTone,
} from "@werkraum/shared";
import { db } from "@/server/db";
import { fail } from "@/server/errors";
import { audit } from "@/server/audit";
import { hasRole } from "@/server/authz";
import { attachMedia } from "@/server/media/service";
import type { SessionUser } from "@/server/auth/session";

/**
 * Ankündigungen (Mini-Hero) – Verwaltung nur durch die Administration, Anzeige für alle auf den
 * gewählten Seiten, solange aktiv und im Zeitraum. Jede Änderung steht im Audit-Protokoll.
 */

type Actor = Pick<SessionUser, "id" | "role">;
function admin(actor: Actor) {
  if (!hasRole(actor, "ADMIN")) throw fail.forbidden();
}

const pick = <T extends string>(v: string, allowed: Record<T, unknown> | readonly T[], fallback: T): T =>
  (Array.isArray(allowed) ? (allowed as readonly string[]).includes(v) : v in allowed) ? (v as T) : fallback;

/** Gestaltung aus der Datenbank – unbekannte Werte (z. B. nach einer Rücknahme) fallen auf Standard zurück */
export function announcementStyleOf(r: {
  tone: string;
  titleFont: string;
  bodyFont: string;
  titleSize: string;
  bodySize: string;
  textColor: string;
  bgMode: string;
  bgColor: string;
  bgImageUrl: string | null;
  bgOverlay: number;
  bgImageLight: string;
  bgPosition: string;
}) {
  return {
    tone: pick<AnnouncementTone>(r.tone, ANNOUNCEMENT_TONES, "coral"),
    titleFont: pick<AnnouncementFont>(r.titleFont, ANNOUNCEMENT_FONTS, "werkuno"),
    bodyFont: pick<AnnouncementFont>(r.bodyFont, ANNOUNCEMENT_FONTS, "werkuno"),
    titleSize: pick<AnnouncementTitleSize>(r.titleSize, ANNOUNCEMENT_TITLE_SIZES, "m"),
    bodySize: pick<AnnouncementBodySize>(r.bodySize, ANNOUNCEMENT_BODY_SIZES, "m"),
    textColor: isHexColor(r.textColor) ? r.textColor : "",
    bgMode: pick<AnnouncementBgMode>(r.bgMode, ANNOUNCEMENT_BG_MODES, "tone"),
    bgColor: isHexColor(r.bgColor) ? r.bgColor : "",
    bgImageUrl: r.bgImageUrl,
    bgOverlay: Math.min(Math.max(r.bgOverlay, 0), ANNOUNCEMENT_OVERLAY_MAX),
    bgImageLight: isHexColor(r.bgImageLight) ? r.bgImageLight : "#FFFFFF",
    bgPosition: pick<AnnouncementBgPosition>(r.bgPosition, ANNOUNCEMENT_BG_POSITIONS, "center"),
  };
}
export type AnnouncementStyleView = ReturnType<typeof announcementStyleOf>;

const STYLE_SELECT = {
  tone: true,
  titleFont: true,
  bodyFont: true,
  titleSize: true,
  bodySize: true,
  textColor: true,
  bgMode: true,
  bgColor: true,
  bgImageUrl: true,
  bgOverlay: true,
  bgImageLight: true,
  bgPosition: true,
} as const;

/** Was die Seiten zum Anzeigen brauchen (ohne Verwaltungsdaten) */
export type AnnouncementView = {
  id: string;
  /** Wechselt bei jeder Änderung – eine ausgeblendete Ankündigung erscheint nach einer Änderung wieder */
  version: string;
  title: string;
  body: string;
  emoji: string;
  ctaLabel: string;
  ctaHref: string;
  dismissible: boolean;
} & AnnouncementStyleView;

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
      select: { id: true, updatedAt: true, title: true, body: true, emoji: true, ctaLabel: true, ctaHref: true, dismissible: true, ...STYLE_SELECT },
    })
    // Eine fehlende Tabelle o. Ä. darf keine Seite kippen – dann eben ohne Ankündigung
    .catch(() => []);
  return rows.map((r) => ({
    id: r.id,
    version: r.updatedAt.getTime().toString(36),
    title: r.title,
    body: r.body,
    emoji: r.emoji,
    ...announcementStyleOf(r),
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
    const prev = id ? await tx.announcement.findUnique({ where: { id }, select: { bgMediaId: true, bgImageUrl: true } }) : null;
    if (id && !prev) throw fail.notFound("Ankündigung nicht gefunden.");
    const { bgMediaId, ...rest } = d;
    const image = await resolveBackgroundImage(tx, actor, bgMediaId, prev);
    const data = { ...rest, ...image, placements: [...d.placements], updatedById: actor.id };
    const row = id ? await tx.announcement.update({ where: { id }, data }) : await tx.announcement.create({ data: { ...data, createdById: actor.id } });
    await audit(
      { actorId: actor.id, action: id ? "admin.announcement_updated" : "admin.announcement_created", targetType: "ANNOUNCEMENT", targetId: row.id, meta: { title: row.title, active: row.isActive, placements: row.placements } },
      tx,
    );
    return row;
  });
}

type Tx = Parameters<Parameters<typeof db.$transaction>[0]>[0];

/**
 * Hintergrundbild prüfen und die Adresse festhalten. Ein neues Bild muss ein eigenes, fertig
 * verarbeitetes Bild sein; ein bereits gespeichertes (ggf. von jemand anderem aus dem Team) bleibt gültig.
 */
async function resolveBackgroundImage(tx: Tx, actor: Actor, mediaId: string, prev: { bgMediaId: string | null; bgImageUrl: string | null } | null) {
  if (!mediaId) return { bgMediaId: null, bgImageUrl: null };
  if (prev?.bgMediaId === mediaId && prev.bgImageUrl) return { bgMediaId: mediaId, bgImageUrl: prev.bgImageUrl };
  const m = await tx.media.findUnique({ where: { id: mediaId }, select: { kind: true, state: true, variants: true, isPrivate: true } });
  if (!m || m.kind !== "IMAGE" || m.isPrivate) throw fail.invalid("Das Hintergrundbild ist ungültig. Bitte neu hochladen.", { bgMediaId: "Bitte ein Bild hochladen" });
  if (m.state !== "READY") throw fail.invalid("Das Bild wird noch verarbeitet. Bitte kurz warten und erneut speichern.", { bgMediaId: "Wird noch verarbeitet" });
  await attachMedia(tx, actor.id, [mediaId]);
  const v = (m.variants ?? {}) as Record<string, string>;
  const url = v.lg ?? v.md;
  if (!url) throw fail.invalid("Für das Bild gibt es keine Anzeigegrösse. Bitte ein anderes Bild wählen.", { bgMediaId: "Bild nicht verwendbar" });
  return { bgMediaId: mediaId, bgImageUrl: url };
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
