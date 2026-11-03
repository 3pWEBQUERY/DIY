import { z } from "zod";
import { CATEGORY_SLUGS } from "./categories";
import { PROJECT_STATUS, VISIBILITY, REPORT_REASONS, SAFETY_KINDS, PRODUCT_KIND } from "./enums";

export const handleSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, "Mindestens 3 Zeichen")
  .max(24, "Höchstens 24 Zeichen")
  .regex(/^[a-z0-9](?:[a-z0-9._]*[a-z0-9])?$/, "Nur Kleinbuchstaben, Ziffern, Punkt und Unterstrich");

export const RESERVED_HANDLES = new Set([
  "admin", "api", "app", "studio", "support", "help", "hilfe", "werkraum", "login", "signup", "settings",
  "u", "p", "t", "shop", "markt", "blog", "explore", "entdecken", "moderation", "root", "system",
]);

export const passwordSchema = z
  .string()
  .min(10, "Mindestens 10 Zeichen")
  .max(200)
  .refine((v) => /[a-zA-ZäöüÄÖÜ]/.test(v) && /\d|[^\w\s]/.test(v), "Buchstaben und mindestens eine Ziffer oder ein Sonderzeichen");

export const signUpSchema = z.object({
  email: z.email("Ungültige E-Mail-Adresse").trim().toLowerCase().max(254),
  password: passwordSchema,
  displayName: z.string().trim().min(1, "Bitte gib einen Namen an").max(60),
  handle: handleSchema,
  adult: z.literal(true, { error: "Die Teilnahme ist ab 18 Jahren möglich" }),
  terms: z.literal(true, { error: "Bitte akzeptiere die Nutzungsbedingungen" }),
});

export const signInSchema = z.object({
  email: z.email("Ungültige E-Mail-Adresse").trim().toLowerCase(),
  password: z.string().min(1, "Passwort fehlt"),
});

export const categorySchema = z.enum(CATEGORY_SLUGS);
export const visibilitySchema = z.enum(VISIBILITY);

export const mediaRefSchema = z.object({
  id: z.string().min(1),
  alt: z.string().trim().max(500).default(""),
});

export const postCreateSchema = z
  .object({
    body: z.string().trim().max(5000).default(""),
    media: z.array(mediaRefSchema).max(10).default([]),
    category: categorySchema.optional(),
    projectId: z.string().optional(),
    visibility: visibilitySchema.default("PUBLIC"),
    repostOfId: z.string().optional(),
  })
  .refine((p) => p.body.length > 0 || p.media.length > 0 || p.repostOfId, {
    message: "Ein Beitrag braucht Text, Medien oder einen Repost",
  });

export const commentCreateSchema = z.object({
  body: z.string().trim().min(1, "Kommentar ist leer").max(2000),
  parentId: z.string().optional(),
});

export const materialLineSchema = z.object({
  name: z.string().trim().min(1).max(120),
  quantity: z.string().trim().max(40).default(""),
  materialId: z.string().optional(),
  note: z.string().trim().max(200).default(""),
});

export const projectUpsertSchema = z.object({
  title: z.string().trim().min(3, "Titel ist zu kurz").max(120),
  description: z.string().trim().max(10_000).default(""),
  category: categorySchema,
  tags: z.array(z.string().trim().toLowerCase().min(1).max(30)).max(12).default([]),
  status: z.enum(PROJECT_STATUS).default("IN_PROGRESS"),
  visibility: visibilitySchema.default("PUBLIC"),
  difficulty: z.coerce.number().int().min(1).max(5).default(2),
  estimatedMinutes: z.coerce.number().int().min(0).max(100_000).optional(),
  actualMinutes: z.coerce.number().int().min(0).max(100_000).optional(),
  budgetMinor: z.coerce.number().int().min(0).max(10_000_000).optional(),
  coverMediaId: z.string().optional(),
  media: z.array(mediaRefSchema).max(30).default([]),
  materials: z.array(materialLineSchema).max(60).default([]),
  tools: z.array(materialLineSchema).max(60).default([]),
  remixOfId: z.string().optional(),
  remixNote: z.string().trim().max(2000).optional(),
});

export const projectUpdateEntrySchema = z.object({
  body: z.string().trim().min(1, "Beschreibe den Fortschritt").max(5000),
  milestone: z.string().trim().max(120).optional(),
  problem: z.string().trim().max(2000).optional(),
  solution: z.string().trim().max(2000).optional(),
  minutes: z.coerce.number().int().min(0).max(10_000).optional(),
  media: z.array(mediaRefSchema).max(10).default([]),
  shareToFeed: z.boolean().default(false),
});

export const tutorialStepSchema = z.object({
  title: z.string().trim().min(1).max(140),
  body: z.string().trim().max(8000).default(""),
  minutes: z.coerce.number().int().min(0).max(10_000).optional(),
  tip: z.string().trim().max(1000).optional(),
  safety: z.string().trim().max(1000).optional(),
  safetyKinds: z.array(z.enum(SAFETY_KINDS)).default([]),
  media: z.array(mediaRefSchema).max(6).default([]),
  materials: z.array(z.string().trim().max(120)).max(20).default([]),
  tools: z.array(z.string().trim().max(120)).max(20).default([]),
});

export const tutorialUpsertSchema = z.object({
  title: z.string().trim().min(3).max(140),
  summary: z.string().trim().max(2000).default(""),
  category: categorySchema,
  difficulty: z.coerce.number().int().min(1).max(5).default(2),
  minutes: z.coerce.number().int().min(0).max(100_000).optional(),
  projectId: z.string().optional(),
  coverMediaId: z.string().optional(),
  language: z.string().default("de-CH"),
  materials: z.array(materialLineSchema).max(60).default([]),
  tools: z.array(materialLineSchema).max(60).default([]),
  steps: z.array(tutorialStepSchema).min(1, "Mindestens ein Schritt").max(80),
  changeNote: z.string().trim().max(500).optional(),
  notifyReaders: z.boolean().default(false),
});

export const reportSchema = z.object({
  targetType: z.enum(["POST", "COMMENT", "PROJECT", "TUTORIAL", "TUTORIAL_STEP", "PRODUCT", "USER", "MESSAGE", "ARTICLE", "COMMUNITY", "REVIEW"]),
  targetId: z.string().min(1),
  reason: z.enum(REPORT_REASONS),
  details: z.string().trim().max(2000).default(""),
});

export const productUpsertSchema = z.object({
  title: z.string().trim().min(3).max(140),
  description: z.string().trim().max(10_000).default(""),
  kind: z.enum(PRODUCT_KIND),
  category: categorySchema,
  priceMinor: z.coerce.number().int().min(100, "Mindestpreis CHF 1.00").max(5_000_000),
  currency: z.enum(["CHF", "EUR"]).default("CHF"),
  stock: z.coerce.number().int().min(0).max(100_000).default(1),
  materials: z.string().trim().max(1000).default(""),
  dimensions: z.string().trim().max(200).default(""),
  productionDays: z.coerce.number().int().min(0).max(365).default(3),
  shippingMinor: z.coerce.number().int().min(0).max(100_000).default(900),
  safetyInfo: z.string().trim().max(2000).default(""),
  returnPolicy: z.string().trim().max(2000).default(""),
  projectId: z.string().optional(),
  tutorialId: z.string().optional(),
  media: z.array(mediaRefSchema).min(1, "Mindestens ein Produktbild").max(12),
  variants: z
    .array(z.object({ name: z.string().trim().min(1).max(60), priceDeltaMinor: z.coerce.number().int().default(0), stock: z.coerce.number().int().min(0).default(0) }))
    .max(20)
    .default([]),
  status: z.enum(["DRAFT", "ACTIVE", "PAUSED"]).default("ACTIVE"),
});

export const shippingAddressSchema = z.object({
  name: z.string().trim().min(2).max(120),
  line1: z.string().trim().min(2).max(200),
  line2: z.string().trim().max(200).default(""),
  postalCode: z.string().trim().min(3).max(12),
  city: z.string().trim().min(1).max(100),
  country: z.enum(["CH", "DE", "AT", "LI"]),
});

export type SignUpInput = z.infer<typeof signUpSchema>;
export type PostCreateInput = z.infer<typeof postCreateSchema>;
export type ProjectUpsertInput = z.infer<typeof projectUpsertSchema>;
export type TutorialUpsertInput = z.infer<typeof tutorialUpsertSchema>;
export type ProductUpsertInput = z.infer<typeof productUpsertSchema>;
