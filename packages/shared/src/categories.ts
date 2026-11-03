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

export function categoryBySlug(slug: string | null | undefined) {
  return CATEGORIES.find((c) => c.slug === slug);
}
