import { CATEGORIES } from "@werkraum/shared";
import type { EffectiveCategory } from "./types";

/** Felder eines CategorySetting-Datensatzes, die für die Darstellung relevant sind. */
export type CategorySettingLike = {
  name: string | null;
  short: string | null;
  description: string | null;
  isActive: boolean;
  isFocus: boolean | null;
  sortOrder: number | null;
};

/** Reine Funktion (testbar): Standardkategorien + Overrides → sortierte, effektive Liste. */
export function mergeCategories(settings: ReadonlyMap<string, CategorySettingLike>): EffectiveCategory[] {
  const merged = CATEGORIES.map((c, i) => {
    const s = settings.get(c.slug);
    const name = s?.name?.trim() || c.name;
    const short = s?.short?.trim() || c.short;
    const focus = s?.isFocus ?? c.focus;
    const sortOrder = s?.sortOrder ?? null;
    return {
      slug: c.slug,
      name,
      short,
      glyph: c.glyph,
      focus,
      description: s?.description?.trim() ?? "",
      isActive: s?.isActive ?? true,
      position: 0,
      defaultPosition: i + 1,
      sortOrder,
      overridden: !!s && (name !== c.name || short !== c.short || focus !== c.focus || sortOrder != null || !!s.description?.trim() || s.isActive === false),
      defaults: { name: c.name, short: c.short, focus: c.focus },
    } satisfies EffectiveCategory;
  });
  // Explizite Reihenfolge gewinnt bei Gleichstand gegen die Standardposition
  merged.sort(
    (a, b) =>
      (a.sortOrder ?? a.defaultPosition) - (b.sortOrder ?? b.defaultPosition) ||
      (a.sortOrder == null ? 1 : 0) - (b.sortOrder == null ? 1 : 0) ||
      a.defaultPosition - b.defaultPosition,
  );
  return merged.map((c, i) => ({ ...c, position: i + 1 }));
}
