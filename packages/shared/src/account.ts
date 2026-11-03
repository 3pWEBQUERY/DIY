import { z } from "zod";
import { CATEGORY_SLUGS } from "./categories";
import { handleSchema } from "./schemas";
import { MODERATION_ACTIONS, NOTIFICATION_TYPES } from "./enums";

/**
 * Schemas für Einstellungen, Benachrichtigungen, Support, Einsprüche,
 * Moderation und Analytics – geteilt zwischen Web und iOS.
 */

const optionalUrl = z
  .string()
  .trim()
  .max(300)
  .transform((v) => (v && !/^https?:\/\//i.test(v) ? `https://${v}` : v))
  .pipe(z.union([z.literal(""), z.url("Ungültige Adresse")]));

export const profileLinkSchema = z.object({
  label: z.string().trim().min(1, "Bezeichnung fehlt").max(40),
  url: optionalUrl.refine((v) => v.length > 0, "Adresse fehlt"),
});

export const PROFILE_COUNTRIES = ["CH", "DE", "AT", "LI", "FR", "IT", "OTHER"] as const;
export const PROFILE_COUNTRY_LABEL: Record<(typeof PROFILE_COUNTRIES)[number], string> = {
  CH: "Schweiz",
  DE: "Deutschland",
  AT: "Österreich",
  LI: "Liechtenstein",
  FR: "Frankreich",
  IT: "Italien",
  OTHER: "Anderes Land",
};

export const profileUpdateSchema = z.object({
  displayName: z.string().trim().min(1, "Bitte gib einen Namen an").max(60),
  handle: handleSchema,
  bio: z.string().trim().max(500, "Höchstens 500 Zeichen").default(""),
  region: z.string().trim().max(80).default(""),
  country: z.enum(PROFILE_COUNTRIES).default("CH"),
  website: optionalUrl.default(""),
  pronouns: z.string().trim().max(30).default(""),
  links: z.array(profileLinkSchema).max(6, "Höchstens 6 Links").default([]),
  categories: z.array(z.enum(CATEGORY_SLUGS)).max(15).default([]),
  avatarMediaId: z.string().nullable().optional(),
  coverMediaId: z.string().nullable().optional(),
  removeAvatar: z.boolean().optional(),
  removeCover: z.boolean().optional(),
});
export type ProfileUpdateInput = z.infer<typeof profileUpdateSchema>;

export const EMAIL_DIGEST = ["OFF", "INSTANT", "DAILY", "WEEKLY"] as const;
export type EmailDigest = (typeof EMAIL_DIGEST)[number];
export const EMAIL_DIGEST_LABEL: Record<EmailDigest, string> = {
  OFF: "Keine E-Mails",
  INSTANT: "Sofort",
  DAILY: "Täglich gebündelt",
  WEEKLY: "Wöchentlich gebündelt",
};

/** Ereignisse, die aus Sicherheits- bzw. Rechtsgründen immer in der App erscheinen. */
export const LOCKED_IN_APP_NOTIFICATIONS = ["MODERATION", "SECURITY"] as const;

export const notificationPrefsSchema = z.object({
  prefs: z.partialRecord(z.enum(NOTIFICATION_TYPES), z.object({ inApp: z.boolean(), email: z.boolean() })),
  emailDigest: z.enum(EMAIL_DIGEST),
});

export const FEED_DEFAULTS = ["FOR_YOU", "FOLLOWING", "NEW"] as const;
export const FEED_DEFAULT_LABEL: Record<(typeof FEED_DEFAULTS)[number], string> = {
  FOR_YOU: "Für dich",
  FOLLOWING: "Folge ich",
  NEW: "Neu",
};

export const feedPrefsSchema = z.object({
  interests: z.array(z.enum(CATEGORY_SLUGS)).max(15).default([]),
  hiddenCategories: z.array(z.enum(CATEGORY_SLUGS)).max(15).default([]),
  feedDefault: z.enum(FEED_DEFAULTS).default("FOR_YOU"),
});

export const DM_POLICIES = ["EVERYONE", "FOLLOWING", "NOBODY"] as const;
export const DM_POLICY_LABEL: Record<(typeof DM_POLICIES)[number], string> = {
  EVERYONE: "Alle Mitglieder",
  FOLLOWING: "Nur Personen, denen ich folge",
  NOBODY: "Niemand (ausser bei Bestellungen)",
};

export const privacyPrefsSchema = z.object({
  dmPolicy: z.enum(DM_POLICIES),
  reduceMotion: z.boolean().default(false),
});

export const SUPPORT_TOPICS = ["GENERAL", "ACCOUNT", "ORDER", "SELLING", "SAFETY", "PRIVACY", "BUG"] as const;
export type SupportTopic = (typeof SUPPORT_TOPICS)[number];
export const SUPPORT_TOPIC_LABEL: Record<SupportTopic, string> = {
  GENERAL: "Allgemeine Frage",
  ACCOUNT: "Konto & Anmeldung",
  ORDER: "Bestellung & Zahlung",
  SELLING: "Verkaufen & Shop",
  SAFETY: "Sicherheit & Missbrauch",
  PRIVACY: "Datenschutz & Auskunft",
  BUG: "Fehler melden",
};
export const SUPPORT_STATUS = ["OPEN", "IN_PROGRESS", "WAITING", "CLOSED"] as const;
export type SupportStatus = (typeof SUPPORT_STATUS)[number];
export const SUPPORT_STATUS_LABEL: Record<SupportStatus, string> = {
  OPEN: "Offen",
  IN_PROGRESS: "In Bearbeitung",
  WAITING: "Wartet auf Antwort",
  CLOSED: "Abgeschlossen",
};

export const supportTicketSchema = z.object({
  topic: z.enum(SUPPORT_TOPICS).default("GENERAL"),
  subject: z.string().trim().min(4, "Bitte gib einen kurzen Betreff an").max(140),
  body: z.string().trim().min(20, "Beschreibe dein Anliegen in mindestens 20 Zeichen").max(5000),
});

export const APPEAL_WINDOW_DAYS = 14;
export const appealSchema = z.object({
  statement: z
    .string()
    .trim()
    .min(30, "Bitte begründe deinen Einspruch in mindestens 30 Zeichen")
    .max(3000, "Höchstens 3000 Zeichen"),
});

export const moderationDecisionSchema = z.object({
  action: z.enum(MODERATION_ACTIONS),
  reason: z.string().trim().min(10, "Bitte begründe die Entscheidung (mind. 10 Zeichen)").max(2000),
  publicNote: z.string().trim().max(1000).default(""),
  days: z.coerce.number().int().min(1).max(365).optional(),
});

export const appealDecisionSchema = z.object({
  decision: z.enum(["UPHELD", "OVERTURNED"]),
  note: z.string().trim().min(10, "Bitte begründe die Entscheidung (mind. 10 Zeichen)").max(2000),
});

export const EDITORIAL_ITEM_TYPES = ["project", "tutorial", "article", "product", "community"] as const;
export type EditorialItemType = (typeof EDITORIAL_ITEM_TYPES)[number];
export const EDITORIAL_ITEM_LABEL: Record<EditorialItemType, string> = {
  project: "Projekt",
  tutorial: "Anleitung",
  article: "Artikel",
  product: "Produkt",
  community: "Community",
};
export const editorialItemSchema = z.object({ type: z.enum(EDITORIAL_ITEM_TYPES), id: z.string().trim().min(1) });
export const editorialCollectionSchema = z.object({
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .min(2)
    .max(64)
    .regex(/^[a-z0-9-]+$/, "Nur Kleinbuchstaben, Ziffern und Bindestriche"),
  title: z.string().trim().min(2, "Titel fehlt").max(120),
  kicker: z.string().trim().max(60).default(""),
  description: z.string().trim().max(600).default(""),
  items: z.array(editorialItemSchema).max(48).default([]),
  position: z.coerce.number().int().min(0).max(999).default(0),
  isActive: z.boolean().default(true),
  season: z.string().trim().max(40).default(""),
});
export type EditorialCollectionInput = z.infer<typeof editorialCollectionSchema>;

/** Client-Tracking (POST /api/v1/track). Nur Aufrufe – alles andere wird serverseitig erfasst. */
export const TRACKABLE_TARGETS = ["POST", "PROJECT", "TUTORIAL", "ARTICLE", "PRODUCT", "USER", "COMMUNITY"] as const;
export const trackEventSchema = z.object({
  name: z.literal("view"),
  targetType: z.enum(TRACKABLE_TARGETS),
  targetId: z.string().trim().min(1).max(64),
  ref: z.string().trim().max(40).optional(),
});
