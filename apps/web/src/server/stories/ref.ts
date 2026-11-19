import "server-only";
import { parseStoryLayout, type StoryLayoutView } from "@werkraum/shared";
import type { Prisma } from "@/server/db";

/**
 * Kompakter Verweis auf eine Story (z. B. Antwort in einer Nachricht). Eigene Datei, damit
 * Nachrichten ihn nutzen können, ohne den ganzen Story-Dienst zu laden (kein Import-Kreis).
 */
export const storyRefSelect = {
  id: true,
  kind: true,
  text: true,
  background: true,
  layout: true,
  state: true,
  expiresAt: true,
  author: { select: { profile: { select: { handle: true } } } },
  media: { select: { kind: true, state: true, variants: true } },
} satisfies Prisma.StorySelect;

export type StoryRefRow = Prisma.StoryGetPayload<{ select: typeof storyRefSelect }>;

/**
 * Gestaltung für die kleine Vorschau (statisch). Ohne Datenbank: Erwähnungen mit dem gespeicherten
 * Benutzernamen, Projekt-Sticker ohne Titel (die Vorschau ist nicht anklickbar).
 */
function refLayout(raw: unknown): StoryLayoutView | null {
  const l = parseStoryLayout(raw);
  if (!l) return null;
  return { ...l, elements: l.elements.map((e) => (e.type === "projectLink" ? { ...e, project: null } : e)) };
}

/** Vorschau fürs Gespräch: nur solange die Story läuft, danach „nicht mehr verfügbar“. */
export function toStoryRef(s: StoryRefRow | null | undefined) {
  if (!s) return null;
  const available = s.state === "PUBLISHED" && s.expiresAt > new Date();
  const v = (s.media?.variants ?? {}) as Record<string, string>;
  return {
    id: s.id,
    available,
    ownerHandle: s.author.profile?.handle ?? null,
    kind: s.kind,
    thumb: available && s.media?.state === "READY" ? (v.sm ?? v.poster ?? v.thumb ?? null) : null,
    background: available && s.kind === "TEXT" ? s.background : null,
    text: available && s.kind === "TEXT" ? s.text.slice(0, 80) : null,
    layout: available ? refLayout(s.layout) : null,
  };
}
export type StoryRef = NonNullable<ReturnType<typeof toStoryRef>>;
