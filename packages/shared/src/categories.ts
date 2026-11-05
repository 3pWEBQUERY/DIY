/** PRD §4.3 – DIY-Kategorien. `focus` markiert die vertikalen Startschwerpunkte. */
export const CATEGORIES = [
  { slug: "haekeln-stricken", name: "Häkeln & Stricken", short: "Häkeln", focus: true, glyph: "loop" },
  { slug: "naehen-textil", name: "Nähen & Textilien", short: "Nähen", focus: true, glyph: "stitch" },
  { slug: "holz", name: "Holzarbeiten", short: "Holz", focus: false, glyph: "grain" },
  { slug: "moebel-upcycling", name: "Möbel & Upcycling", short: "Upcycling", focus: false, glyph: "chair" },
  { slug: "wohnen-deko", name: "Wohnen & Dekoration", short: "Wohnen", focus: false, glyph: "frame" },
  { slug: "papier-basteln", name: "Papier & Basteln", short: "Papier", focus: false, glyph: "fold" },
  { slug: "schmuck-accessoires", name: "Schmuck & Accessoires", short: "Schmuck", focus: false, glyph: "ring" },
  { slug: "keramik", name: "Keramik & Töpfern", short: "Keramik", focus: false, glyph: "vessel" },
  { slug: "malen-zeichnen", name: "Malen & Zeichnen", short: "Malen", focus: false, glyph: "brush" },
  { slug: "3d-druck", name: "3D-Druck", short: "3D-Druck", focus: false, glyph: "layers" },
  { slug: "elektronik-maker", name: "Elektronik & Maker", short: "Elektronik", focus: false, glyph: "circuit" },
  { slug: "garten-pflanzen", name: "Garten & Pflanzen", short: "Garten", focus: false, glyph: "leaf" },
  { slug: "festlich", name: "Festliche Dekoration", short: "Festlich", focus: false, glyph: "star" },
  { slug: "kinder-familie", name: "Kinder & Familie", short: "Familie", focus: false, glyph: "kite" },
  { slug: "weitere", name: "Weitere kreative Arbeiten", short: "Weitere", focus: false, glyph: "spark" },
] as const;

export type CategorySlug = (typeof CATEGORIES)[number]["slug"];
export const CATEGORY_SLUGS = CATEGORIES.map((c) => c.slug) as [CategorySlug, ...CategorySlug[]];

type BaseCategory = (typeof CATEGORIES)[number];

/** Darstellungsdaten einer Kategorie inkl. Admin-Overrides (Name, Kurzname, Reihenfolge, aktiv). */
export type CategoryInfo = { slug: CategorySlug; name: string; short: string; focus: boolean; glyph: BaseCategory["glyph"]; description: string; isActive: boolean };

type RegistryEntry = { slug: string; name: string; short: string; focus: boolean; description?: string; isActive?: boolean };

/*
 * Laufzeit-Registry für Overrides aus der Datenbank (Admin → Kategorien).
 * Liegt auf globalThis, damit Server-Komponenten, SSR und Browser dieselbe Quelle sehen
 * (Next.js bündelt RSC- und SSR-Schicht getrennt). Ohne Registry gelten die Standards.
 */
const KEY = "__werkraumCategoryRegistry";
type Registry = { order: string[]; bySlug: Map<string, CategoryInfo> };
const g = globalThis as unknown as Record<string, Registry | undefined>;

function base(c: BaseCategory): CategoryInfo {
  return { slug: c.slug, name: c.name, short: c.short, focus: c.focus, glyph: c.glyph, description: "", isActive: true };
}

export function setCategoryRegistry(list: readonly RegistryEntry[]) {
  const bySlug = new Map<string, CategoryInfo>();
  for (const e of list) {
    const c = CATEGORIES.find((x) => x.slug === e.slug);
    if (!c) continue;
    bySlug.set(c.slug, { ...base(c), name: e.name || c.name, short: e.short || c.short, focus: e.focus, description: e.description ?? "", isActive: e.isActive ?? true });
  }
  g[KEY] = { order: list.map((e) => e.slug).filter((s) => bySlug.has(s)), bySlug };
}

/** Aktuelle Registry als serialisierbare Liste (für die Übergabe an den Browser). */
export function categoryRegistrySnapshot(): CategoryInfo[] {
  return listCategories();
}

/** Kategorie nach Slug – mit Overrides (auch inaktive, damit bestehende Inhalte korrekt heissen). */
export function categoryBySlug(slug: string | null | undefined): CategoryInfo | undefined {
  if (!slug) return undefined;
  const r = g[KEY];
  const hit = r?.bySlug.get(slug);
  if (hit) return hit;
  const c = CATEGORIES.find((x) => x.slug === slug);
  return c ? base(c) : undefined;
}

/** Alle Kategorien in Admin-Reihenfolge; `activeOnly` blendet deaktivierte aus. */
export function listCategories(opts: { activeOnly?: boolean; keep?: string | null } = {}): CategoryInfo[] {
  const r = g[KEY];
  const all = r ? r.order.map((s) => r.bySlug.get(s)!) : CATEGORIES.map(base);
  return opts.activeOnly ? all.filter((c) => c.isActive || c.slug === opts.keep) : all;
}
