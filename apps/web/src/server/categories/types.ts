/**
 * Kategorie mit angewendeten Admin-Overrides (CategorySetting). Bewusst ohne
 * Server-Abhängigkeiten, damit Client-Komponenten den Typ importieren können.
 */
export type EffectiveCategory = {
  slug: string;
  name: string;
  short: string;
  glyph: string;
  focus: boolean;
  description: string;
  isActive: boolean;
  /** 1-basierte Position nach Sortierung */
  position: number;
  /** Standardposition laut packages/shared (1-basiert) */
  defaultPosition: number;
  sortOrder: number | null;
  /** true, sobald irgendein Feld vom Standard abweicht */
  overridden: boolean;
  defaults: { name: string; short: string; focus: boolean };
};

/** Minimale Form für Auswahllisten (Editoren, Filter). */
export type CategoryOption = Pick<EffectiveCategory, "slug" | "name" | "short" | "glyph" | "focus">;
