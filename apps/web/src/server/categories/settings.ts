import "server-only";
import { cache } from "react";
import { db } from "@/server/db";
import type { CategoryOption } from "./types";
import { mergeCategories } from "./merge";

export type { CategoryOption, EffectiveCategory } from "./types";
export { mergeCategories } from "./merge";

/**
 * DB-Overrides für die fest definierten DIY-Kategorien (§4.3).
 * Slugs bleiben in packages/shared fix (geteilt mit iOS, auf Inhalten gespeichert);
 * Name, Kurzname, Beschreibung, Reihenfolge, Startschwerpunkt und Aktiv-Status
 * sind über Admin → Kategorien änderbar. Inaktive Kategorien werden für neue
 * Inhalte nicht mehr angeboten – bestehende Inhalte behalten sie.
 */
export const getCategorySettings = cache(async () => {
  // Fällt bei fehlender Tabelle (Migration noch nicht angewendet) still auf die Standards zurück
  const rows = await db.categorySetting.findMany().catch(() => []);
  return new Map(rows.map((r) => [r.slug, r]));
});

/** Alle Kategorien inkl. Overrides, sortiert. Pro Request gecacht. */
export const effectiveCategories = cache(async () => mergeCategories(await getCategorySettings()));

/** Nur aktive Kategorien – für Auswahllisten bei neuen Inhalten und Browse-Chips. */
export const activeCategories = cache(async () => (await effectiveCategories()).filter((c) => c.isActive));

/** Kategorie nach Slug mit Overrides (auch inaktive – bestehende Inhalte bleiben erreichbar). */
export async function effectiveCategory(slug: string | null | undefined) {
  if (!slug) return undefined;
  return (await effectiveCategories()).find((c) => c.slug === slug);
}

/**
 * Chips für Browse-Listen: aktive Kategorien, plus die gerade gewählte, falls inaktiv
 * (damit der aktive Filter sichtbar bleibt).
 */
export async function browseCategories(current?: string | null) {
  const all = await effectiveCategories();
  return all.filter((c) => c.isActive || c.slug === current);
}

/**
 * Auswahl für Editoren: aktive Kategorien, plus die bereits gespeicherte Kategorie
 * eines bestehenden Inhalts, damit Bearbeiten nicht ungewollt die Kategorie ändert.
 */
export async function categoryOptions(keep?: string | null): Promise<CategoryOption[]> {
  const all = await effectiveCategories();
  return all.filter((c) => c.isActive || c.slug === keep).map(({ slug, name, short, glyph, focus }) => ({ slug, name, short, glyph, focus }));
}
