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

/** Umfrage: Frage ist der Beitragstext; 2–4 Antworten, Laufzeit 1/3/7 Tage. */
export const POLL_DURATIONS_HOURS = [24, 72, 168] as const;
export const pollInputSchema = z.object({
  options: z
    .array(z.string().trim().min(1, "Antwort ist leer").max(80, "Höchstens 80 Zeichen"))
    .min(2, "Mindestens zwei Antworten")
    .max(4, "Höchstens vier Antworten")
    .refine((o) => new Set(o.map((x) => x.toLowerCase())).size === o.length, "Jede Antwort nur einmal"),
  durationHours: z.coerce.number().refine((h) => (POLL_DURATIONS_HOURS as readonly number[]).includes(h), "Ungültige Laufzeit").default(72),
  multiple: z.boolean().default(false),
});
export type PollInput = z.infer<typeof pollInputSchema>;

export const postCreateSchema = z
  .object({
    body: z.string().trim().max(5000).default(""),
    media: z.array(mediaRefSchema).max(10).default([]),
    category: categorySchema.optional(),
    projectId: z.string().optional(),
    visibility: visibilitySchema.default("PUBLIC"),
    repostOfId: z.string().optional(),
    poll: pollInputSchema.optional(),
  })
  .refine((p) => p.body.length > 0 || p.media.length > 0 || p.repostOfId, {
    message: "Ein Beitrag braucht Text, Medien oder einen Repost",
  })
  .refine((p) => !p.poll || p.body.length > 0, { message: "Formuliere deine Frage im Text", path: ["body"] })
  .refine((p) => !p.poll || !p.repostOfId, { message: "Reposts können keine Umfrage enthalten", path: ["poll"] });

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

// ───────── Projekte, Anleitungen, Materialien, Sammlungen (Erweiterungen) ─────────

export const tutorialStepInputSchema = tutorialStepSchema.extend({
  /** Bleibt beim Bearbeiten gleich, damit der Lesefortschritt über Versionen erhalten bleibt. */
  stableKey: z.string().trim().min(1).max(64).optional(),
});

export const tutorialSaveSchema = tutorialUpsertSchema.extend({
  steps: z.array(tutorialStepInputSchema).min(1, "Mindestens ein Schritt").max(80),
  isMajor: z.boolean().default(false),
  shareToFeed: z.boolean().default(false),
});

export const projectStatusChangeSchema = z.object({ status: z.enum(PROJECT_STATUS) });

export const shoppingListCreateSchema = z.object({
  title: z.string().trim().min(1, "Bitte gib einen Titel an").max(80),
});

export const shoppingListItemSchema = z.object({
  name: z.string().trim().min(1, "Bezeichnung fehlt").max(120),
  quantity: z.string().trim().max(40).default(""),
  materialId: z.string().optional(),
});

export const shoppingListItemPatchSchema = z.object({
  quantity: z.string().trim().max(40).optional(),
  haveIt: z.boolean().optional(),
  purchased: z.boolean().optional(),
});

export const collectionUpsertSchema = z.object({
  title: z.string().trim().min(1, "Bitte gib einen Titel an").max(80),
  description: z.string().trim().max(500).default(""),
  visibility: visibilitySchema.default("PRIVATE"),
});

export type TutorialSaveInput = z.infer<typeof tutorialSaveSchema>;
export type TutorialStepInput = z.infer<typeof tutorialStepInputSchema>;

// ───────────────────────────── Blog (PRD §14) ─────────────────────────────
// Blockbasierter Inhalt. Absätze erlauben minimale Inline-Auszeichnung:
// **fett**, *kursiv*, [Linktext](https://…). Es wird nie rohes HTML gespeichert oder gerendert.

const blockId = z.string().trim().min(1).max(40);
const blockText = (max: number) => z.string().max(max).default("");
const articleMediaSchema = z.object({
  mediaId: z.string().min(1),
  url: z.string().max(2000).default(""),
  alt: z.string().trim().max(500).default(""),
  caption: z.string().trim().max(500).default(""),
});

export const ARTICLE_BLOCK_TYPES = [
  "heading", "paragraph", "list", "quote", "image", "gallery", "video", "table", "callout", "projectCard", "tutorialCard", "productCard", "divider",
] as const;
export type ArticleBlockType = (typeof ARTICLE_BLOCK_TYPES)[number];
export const CALLOUT_TONES = ["info", "tip", "warning"] as const;

export const articleBlockSchema = z.discriminatedUnion("type", [
  z.object({ id: blockId, type: z.literal("heading"), level: z.union([z.literal(2), z.literal(3)]).default(2), text: blockText(200) }),
  z.object({ id: blockId, type: z.literal("paragraph"), text: blockText(12_000) }),
  z.object({ id: blockId, type: z.literal("list"), ordered: z.boolean().default(false), items: z.array(z.string().max(2000)).max(100).default([]) }),
  z.object({ id: blockId, type: z.literal("quote"), text: blockText(3000), cite: blockText(200) }),
  z.object({ id: blockId, type: z.literal("image"), ...articleMediaSchema.shape }),
  z.object({ id: blockId, type: z.literal("gallery"), images: z.array(articleMediaSchema).min(1, "Galerie ohne Bilder").max(24) }),
  z.object({ id: blockId, type: z.literal("video"), mediaId: z.string().min(1), url: z.string().max(2000).default(""), caption: blockText(500) }),
  z.object({ id: blockId, type: z.literal("table"), rows: z.array(z.array(z.string().max(500)).min(1).max(8)).min(1).max(60) }),
  z.object({ id: blockId, type: z.literal("callout"), tone: z.enum(CALLOUT_TONES).default("info"), text: blockText(3000) }),
  z.object({ id: blockId, type: z.literal("projectCard"), projectId: z.string().min(1), title: z.string().max(200).optional() }),
  z.object({ id: blockId, type: z.literal("tutorialCard"), tutorialId: z.string().min(1), title: z.string().max(200).optional() }),
  z.object({ id: blockId, type: z.literal("productCard"), productId: z.string().min(1), title: z.string().max(200).optional() }),
  z.object({ id: blockId, type: z.literal("divider") }),
]);

export const articleBlocksSchema = z.array(articleBlockSchema).max(400, "Zu viele Blöcke");

export const articleSlugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(2, "Mindestens 2 Zeichen")
  .max(80)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Nur Kleinbuchstaben, Ziffern und Bindestriche");

export const articleUpsertSchema = z.object({
  title: z.string().trim().min(3, "Titel ist zu kurz").max(160),
  slug: z.union([articleSlugSchema, z.literal("")]).optional(),
  dek: z.string().trim().max(400).default(""),
  /** undefined = unverändert, null = entfernen, string = neues Titelbild */
  coverMediaId: z.string().min(1).nullish(),
  blocks: articleBlocksSchema.default([]),
  categoryId: z.string().min(1).nullish(),
  tags: z.array(z.string().trim().toLowerCase().min(1).max(30)).max(10, "Höchstens 10 Schlagwörter").default([]),
  seoTitle: z.string().trim().max(70, "SEO-Titel: höchstens 70 Zeichen").default(""),
  seoDescription: z.string().trim().max(170, "SEO-Beschreibung: höchstens 170 Zeichen").default(""),
  commentsEnabled: z.boolean().default(true),
  projectIds: z.array(z.string().min(1)).max(12).default([]),
});

export const articlePublishSchema = z.object({
  /** ISO-Zeitpunkt in der Zukunft → geplant; leer → sofort */
  publishAt: z.iso.datetime({ offset: true }).optional(),
  shareToFeed: z.boolean().default(true),
});

export type ArticleBlock = z.infer<typeof articleBlockSchema>;
export type ArticleUpsertInput = z.infer<typeof articleUpsertSchema>;

// ───────────────────────────── Communities (PRD §15) ─────────────────────────────

export const COMMUNITY_VISIBILITY = ["PUBLIC", "REQUEST", "PRIVATE"] as const;
export const COMMUNITY_VISIBILITY_LABEL: Record<(typeof COMMUNITY_VISIBILITY)[number], string> = {
  PUBLIC: "Öffentlich",
  REQUEST: "Beitritt auf Anfrage",
  PRIVATE: "Privat",
};
export const COMMUNITY_ROLES = ["OWNER", "ADMIN", "MODERATOR", "MEMBER"] as const;
export const COMMUNITY_ROLE_LABEL: Record<(typeof COMMUNITY_ROLES)[number], string> = {
  OWNER: "Gründer:in",
  ADMIN: "Admin",
  MODERATOR: "Moderation",
  MEMBER: "Mitglied",
};

export const communityRuleSchema = z.object({
  title: z.string().trim().min(2, "Regel braucht einen Titel").max(120),
  body: z.string().trim().max(1000).default(""),
});

export const communityUpsertSchema = z.object({
  name: z.string().trim().min(3, "Name ist zu kurz").max(80),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .min(3, "Mindestens 3 Zeichen")
    .max(48)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Nur Kleinbuchstaben, Ziffern und Bindestriche")
    .optional(),
  description: z.string().trim().max(4000).default(""),
  category: categorySchema,
  visibility: z.enum(COMMUNITY_VISIBILITY).default("PUBLIC"),
  region: z.string().trim().max(80).optional(),
  coverMediaId: z.string().min(1).nullish(),
  rules: z.array(communityRuleSchema).max(20).default([]),
});

export const communityPostSchema = z.object({
  body: z.string().trim().max(5000).default(""),
  media: z.array(mediaRefSchema).max(10).default([]),
  isAnnouncement: z.boolean().default(false),
  poll: pollInputSchema.optional(),
});

export const communityChallengeSchema = z
  .object({
    title: z.string().trim().min(3).max(120),
    description: z.string().trim().max(2000).default(""),
    startsAt: z.coerce.date(),
    endsAt: z.coerce.date(),
  })
  .refine((c) => c.endsAt > c.startsAt, { message: "Das Ende muss nach dem Start liegen", path: ["endsAt"] });

export type CommunityUpsertInput = z.infer<typeof communityUpsertSchema>;

// ───────────────────────────── Nachrichten (PRD §16) ─────────────────────────────

export const messageSendSchema = z
  .object({
    body: z.string().trim().max(5000, "Nachricht ist zu lang").default(""),
    media: z.array(mediaRefSchema).max(6, "Höchstens 6 Bilder").default([]),
  })
  .refine((m) => m.body.length > 0 || m.media.length > 0, { message: "Die Nachricht ist leer" });

export const conversationStartSchema = z.object({
  recipientHandle: handleSchema,
  orderId: z.string().min(1).optional(),
  productId: z.string().min(1).optional(),
  body: z.string().trim().max(5000).default(""),
  media: z.array(mediaRefSchema).max(6).default([]),
});

export type MessageSendInput = z.infer<typeof messageSendSchema>;
