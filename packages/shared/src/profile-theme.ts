import { z } from "zod";

/**
 * Profil-Design (Creator Pro): Akzentfarbe, Titelbild-Layout und Reihenfolge der Profilbereiche.
 * Farben im Werkbuch-Ton, je mit dunkler Variante (iOS-Dunkelmodus); Text in der Akzentfarbe auf
 * Papier und weisser Text auf der Akzentfläche erreichen jeweils mindestens 4.5:1 (WCAG AA).
 */
export const PROFILE_ACCENTS = {
  werkstatt: { label: "Werkstatt", base: "#b64b3a", ink: "#973b2c", soft: "#f6e5e0", dark: "#e58a77" },
  moos: { label: "Moos", base: "#4a6a39", ink: "#3b552d", soft: "#e5ecdf", dark: "#9cc283" },
  tinte: { label: "Tinte", base: "#2f5d84", ink: "#244a6a", soft: "#e1e9f1", dark: "#8fb8de" },
  pflaume: { label: "Pflaume", base: "#7c3f66", ink: "#643251", soft: "#efe3eb", dark: "#d89cc3" },
  ocker: { label: "Ocker", base: "#86580f", ink: "#6c470c", soft: "#f3e9d9", dark: "#dcae62" },
  petrol: { label: "Petrol", base: "#1f6a6a", ink: "#185555", soft: "#dcedec", dark: "#76c3c1" },
  schiefer: { label: "Schiefer", base: "#4f6475", ink: "#3f505e", soft: "#e4e9ed", dark: "#a8bdcc" },
} as const;
export type ProfileAccent = keyof typeof PROFILE_ACCENTS;
export const PROFILE_ACCENT_KEYS = Object.keys(PROFILE_ACCENTS) as ProfileAccent[];

export const PROFILE_COVER_LAYOUTS = ["wide", "framed", "none"] as const;
export type ProfileCoverLayout = (typeof PROFILE_COVER_LAYOUTS)[number];
export const PROFILE_COVER_LABEL: Record<ProfileCoverLayout, string> = { wide: "Breit", framed: "Gerahmt", none: "Ohne Titelbild" };

export const PROFILE_SECTIONS = ["projects", "posts", "tutorials", "shop", "articles"] as const;
export type ProfileSection = (typeof PROFILE_SECTIONS)[number];
export const PROFILE_SECTION_LABEL: Record<ProfileSection, string> = { projects: "Projekte", posts: "Beiträge", tutorials: "Anleitungen", shop: "Shop", articles: "Blog" };

export type ProfileTheme = { accent: ProfileAccent; coverLayout: ProfileCoverLayout; sections: ProfileSection[] };
export const DEFAULT_PROFILE_THEME: ProfileTheme = { accent: "werkstatt", coverLayout: "wide", sections: [...PROFILE_SECTIONS] };

export const profileThemeSchema = z.object({
  accent: z.enum(PROFILE_ACCENT_KEYS as [ProfileAccent, ...ProfileAccent[]], { error: "Unbekannte Farbe" }),
  coverLayout: z.enum(PROFILE_COVER_LAYOUTS, { error: "Unbekanntes Layout" }),
  sections: z
    .array(z.enum(PROFILE_SECTIONS))
    .min(1, { error: "Mindestens ein Bereich bleibt sichtbar" })
    .refine((s) => new Set(s).size === s.length, { error: "Jeder Bereich nur einmal" }),
});

/** Gespeichertes Design lesen; Unbekanntes oder Fehlerhaftes fällt auf den Standard zurück */
export function parseProfileTheme(value: unknown): ProfileTheme | null {
  const r = profileThemeSchema.safeParse(value);
  return r.success ? r.data : null;
}
