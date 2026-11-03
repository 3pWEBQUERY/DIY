/** Spiegel der Prisma-Enums, damit Web & iOS dieselben Werte verwenden. */
export const PROJECT_STATUS = ["IDEA", "PLANNING", "IN_PROGRESS", "PAUSED", "COMPLETED", "ARCHIVED"] as const;
export type ProjectStatus = (typeof PROJECT_STATUS)[number];
export const PROJECT_STATUS_LABEL: Record<ProjectStatus, string> = {
  IDEA: "Idee",
  PLANNING: "In Planung",
  IN_PROGRESS: "In Bearbeitung",
  PAUSED: "Pausiert",
  COMPLETED: "Abgeschlossen",
  ARCHIVED: "Archiviert",
};

export const DIFFICULTY = [1, 2, 3, 4, 5] as const;
export const DIFFICULTY_LABEL: Record<number, string> = {
  1: "Einsteiger",
  2: "Leicht",
  3: "Mittel",
  4: "Fortgeschritten",
  5: "Meisterstück",
};

export const VISIBILITY = ["PUBLIC", "FOLLOWERS", "PRIVATE"] as const;
export type Visibility = (typeof VISIBILITY)[number];
export const VISIBILITY_LABEL: Record<Visibility, string> = {
  PUBLIC: "Öffentlich",
  FOLLOWERS: "Nur Follower",
  PRIVATE: "Nur ich",
};

export const SAFETY_KINDS = ["ELECTRICITY", "HEAT", "CHEMICALS", "SHARP_TOOLS", "POWER_TOOLS", "CHILDREN", "DUST"] as const;
export type SafetyKind = (typeof SAFETY_KINDS)[number];
export const SAFETY_LABEL: Record<SafetyKind, string> = {
  ELECTRICITY: "Strom",
  HEAT: "Hitze",
  CHEMICALS: "Chemikalien",
  SHARP_TOOLS: "Scharfe Werkzeuge",
  POWER_TOOLS: "Elektrowerkzeuge",
  CHILDREN: "Kinderprodukt",
  DUST: "Staub & Dämpfe",
};

export const ORDER_STATUS = [
  "PENDING_PAYMENT", "NEW", "IN_PROGRESS", "READY_TO_SHIP", "SHIPPED", "COMPLETED", "CANCELLED", "REFUNDED", "PROBLEM",
] as const;
export type OrderStatus = (typeof ORDER_STATUS)[number];
export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  PENDING_PAYMENT: "Zahlung offen",
  NEW: "Neu",
  IN_PROGRESS: "In Bearbeitung",
  READY_TO_SHIP: "Versandbereit",
  SHIPPED: "Versendet",
  COMPLETED: "Abgeschlossen",
  CANCELLED: "Storniert",
  REFUNDED: "Erstattet",
  PROBLEM: "Problemfall",
};

/** Erlaubte Übergänge der Bestell-Statusmaschine (Verkäufersicht). */
export const ORDER_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  PENDING_PAYMENT: ["CANCELLED"],
  NEW: ["IN_PROGRESS", "CANCELLED", "PROBLEM"],
  IN_PROGRESS: ["READY_TO_SHIP", "CANCELLED", "PROBLEM"],
  READY_TO_SHIP: ["SHIPPED", "PROBLEM"],
  SHIPPED: ["COMPLETED", "PROBLEM"],
  COMPLETED: ["PROBLEM"],
  CANCELLED: [],
  REFUNDED: [],
  PROBLEM: ["IN_PROGRESS", "SHIPPED", "COMPLETED", "CANCELLED"],
};

export const PRODUCT_KIND = ["UNIQUE", "SMALL_BATCH", "MADE_TO_ORDER", "KIT", "DIGITAL"] as const;
export type ProductKind = (typeof PRODUCT_KIND)[number];
export const PRODUCT_KIND_LABEL: Record<ProductKind, string> = {
  UNIQUE: "Einzelstück",
  SMALL_BATCH: "Kleinserie",
  MADE_TO_ORDER: "Auf Bestellung",
  KIT: "DIY-Materialset",
  DIGITAL: "Digitale Anleitung",
};

export const REPORT_REASONS = [
  "SPAM", "HARASSMENT", "HATE", "COPYRIGHT", "DANGEROUS", "PROHIBITED_ITEM", "SCAM", "NUDITY", "MISINFORMATION", "OTHER",
] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];
export const REPORT_REASON_LABEL: Record<ReportReason, string> = {
  SPAM: "Spam oder Werbung",
  HARASSMENT: "Belästigung",
  HATE: "Hassrede",
  COPYRIGHT: "Urheberrechtsverletzung",
  DANGEROUS: "Gefährliche Anleitung",
  PROHIBITED_ITEM: "Verbotenes Produkt",
  SCAM: "Betrug",
  NUDITY: "Unangemessene Inhalte",
  MISINFORMATION: "Fehlerhafte Information",
  OTHER: "Anderes",
};

export const MODERATION_ACTIONS = [
  "NONE", "WARN", "LIMIT_REACH", "HIDE", "REMOVE", "DISABLE_LISTING", "RESTRICT_MESSAGING", "SUSPEND", "BAN",
] as const;
export type ModerationActionKind = (typeof MODERATION_ACTIONS)[number];
export const MODERATION_ACTION_LABEL: Record<ModerationActionKind, string> = {
  NONE: "Keine Massnahme",
  WARN: "Verwarnung",
  LIMIT_REACH: "Reichweite beschränken",
  HIDE: "Inhalt ausblenden",
  REMOVE: "Inhalt entfernen",
  DISABLE_LISTING: "Angebot deaktivieren",
  RESTRICT_MESSAGING: "Nachrichten einschränken",
  SUSPEND: "Account zeitweise sperren",
  BAN: "Account dauerhaft sperren",
};

export const NOTIFICATION_TYPES = [
  "FOLLOW", "COMMENT", "REPLY", "MENTION", "LIKE", "PROJECT_ACTIVITY", "REMIX", "NEW_POST_FROM_FOLLOWED",
  "MESSAGE", "ORDER_NEW", "ORDER_STATUS", "MODERATION", "COMMUNITY_INVITE", "TUTORIAL_UPDATED", "SECURITY",
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];
export const NOTIFICATION_LABEL: Record<NotificationType, string> = {
  FOLLOW: "Neue Follower",
  COMMENT: "Kommentare",
  REPLY: "Antworten",
  MENTION: "Erwähnungen",
  LIKE: "Gefällt-mir",
  PROJECT_ACTIVITY: "Projektaktivität",
  REMIX: "Nachbauten deiner Projekte",
  NEW_POST_FROM_FOLLOWED: "Neue Beiträge gefolgter Creator",
  MESSAGE: "Nachrichten",
  ORDER_NEW: "Neue Bestellungen",
  ORDER_STATUS: "Bestellstatus",
  MODERATION: "Moderationsentscheidungen",
  COMMUNITY_INVITE: "Community-Einladungen",
  TUTORIAL_UPDATED: "Aktualisierte Anleitungen",
  SECURITY: "Sicherheit",
};

export const ROLES = ["MEMBER", "PLATFORM_MODERATOR", "ADMIN", "SUPERADMIN"] as const;
export type PlatformRole = (typeof ROLES)[number];
