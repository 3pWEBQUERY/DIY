import { z } from "zod";
import { shippingAddressSchema } from "./schemas";

/** Marktplatz-Eingaben (PRD §13) – geteilt zwischen Web und iOS. */

export const SELLER_TYPE = ["PRIVATE", "BUSINESS"] as const;
export type SellerType = (typeof SELLER_TYPE)[number];
export const SELLER_TYPE_LABEL: Record<SellerType, string> = {
  PRIVATE: "Privatperson",
  BUSINESS: "Gewerblich",
};

export const SHOP_STATUS_LABEL: Record<"DRAFT" | "PENDING_VERIFICATION" | "ACTIVE" | "PAUSED" | "SUSPENDED", string> = {
  DRAFT: "Entwurf",
  PENDING_VERIFICATION: "Verifizierung läuft",
  ACTIVE: "Aktiv",
  PAUSED: "Pausiert",
  SUSPENDED: "Gesperrt",
};

export const PAYMENT_STATUS_LABEL: Record<
  "REQUIRES_PAYMENT" | "PROCESSING" | "SUCCEEDED" | "FAILED" | "CANCELLED" | "REFUNDED" | "PARTIALLY_REFUNDED" | "DISPUTED",
  string
> = {
  REQUIRES_PAYMENT: "Zahlung offen",
  PROCESSING: "Zahlung in Prüfung",
  SUCCEEDED: "Bezahlt",
  FAILED: "Fehlgeschlagen",
  CANCELLED: "Abgebrochen",
  REFUNDED: "Erstattet",
  PARTIALLY_REFUNDED: "Teilweise erstattet",
  DISPUTED: "Zahlung angefochten",
};

export const PRODUCT_STATUS_LABEL: Record<"DRAFT" | "ACTIVE" | "PAUSED" | "SOLD_OUT" | "DISABLED", string> = {
  DRAFT: "Entwurf",
  ACTIVE: "Aktiv",
  PAUSED: "Pausiert",
  SOLD_OUT: "Ausverkauft",
  DISABLED: "Deaktiviert",
};

export const SHIP_COUNTRIES = ["CH", "DE", "AT", "LI"] as const;
export type ShipCountry = (typeof SHIP_COUNTRIES)[number];
export const COUNTRY_LABEL: Record<ShipCountry, string> = { CH: "Schweiz", DE: "Deutschland", AT: "Österreich", LI: "Liechtenstein" };

export const shopSlugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, "Mindestens 3 Zeichen")
  .max(40, "Höchstens 40 Zeichen")
  .regex(/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/, "Nur Kleinbuchstaben, Ziffern und Bindestriche");

export const shopSetupSchema = z
  .object({
    name: z.string().trim().min(2, "Name ist zu kurz").max(60),
    slug: shopSlugSchema,
    tagline: z.string().trim().max(120).default(""),
    description: z.string().trim().max(4000).default(""),
    sellerType: z.enum(SELLER_TYPE),
    legalName: z.string().trim().min(2, "Bitte gib den rechtlichen Namen an").max(120),
    businessName: z.string().trim().max(120).default(""),
    vatId: z.string().trim().max(40).default(""),
    addressLine: z.string().trim().min(2, "Adresse fehlt").max(200),
    postalCode: z.string().trim().min(3, "PLZ fehlt").max(12),
    city: z.string().trim().min(1, "Ort fehlt").max(100),
    country: z.enum(SHIP_COUNTRIES),
    shippingPolicy: z.string().trim().max(4000).default(""),
    returnPolicy: z.string().trim().max(4000).default(""),
    processingDays: z.coerce.number().int().min(0).max(120).default(3),
  })
  .superRefine((v, ctx) => {
    if (v.sellerType === "BUSINESS" && !v.businessName) {
      ctx.addIssue({ code: "custom", path: ["businessName"], message: "Firmenname ist für gewerbliche Shops Pflicht" });
    }
    if (v.sellerType === "BUSINESS" && v.vatId && !/^[A-Z]{2,3}[-\s]?[0-9A-Z.\s-]{5,20}$/i.test(v.vatId)) {
      ctx.addIssue({ code: "custom", path: ["vatId"], message: "Bitte eine gültige MWST-/USt-Nummer angeben (z.B. CHE-123.456.789)" });
    }
  });

export const cartAddSchema = z.object({
  productId: z.string().min(1),
  variantId: z.string().min(1).optional(),
  quantity: z.coerce.number().int().min(1).max(99).default(1),
});

export const cartUpdateSchema = z.object({
  itemId: z.string().min(1),
  quantity: z.coerce.number().int().min(0).max(99),
});

export const checkoutSchema = z.object({
  address: shippingAddressSchema,
  buyerNote: z.string().trim().max(1000).default(""),
  idempotencyKey: z.string().trim().min(16).max(80),
  /** Vom Client angezeigter Gesamtbetrag – weicht er ab, muss der Käufer neu bestätigen. */
  expectedTotalMinor: z.coerce.number().int().min(0).optional(),
});

export const shipmentSchema = z.object({
  carrier: z.string().trim().min(2, "Versanddienstleister fehlt").max(60),
  trackingNo: z.string().trim().max(80).default(""),
  trackingUrl: z
    .string()
    .trim()
    .max(500)
    .refine((v) => v === "" || /^https:\/\//.test(v), "Bitte eine https-Adresse angeben")
    .default(""),
  note: z.string().trim().max(500).default(""),
});

export const refundSchema = z.object({
  amountMinor: z.coerce.number().int().min(1, "Betrag fehlt"),
  reason: z.string().trim().min(3, "Bitte gib einen Grund an").max(500),
});

export const orderNoteSchema = z.object({ note: z.string().trim().max(1000).default("") });

export const problemReportSchema = z.object({ note: z.string().trim().min(10, "Beschreibe das Problem kurz (mind. 10 Zeichen)").max(2000) });

export const reviewCreateSchema = z.object({
  orderItemId: z.string().min(1),
  productRating: z.coerce.number().int().min(1, "Bitte vergib 1 bis 5 Punkte").max(5),
  sellerRating: z.coerce.number().int().min(1).max(5).optional(),
  body: z.string().trim().max(2000).default(""),
});

export type ShopSetupInput = z.infer<typeof shopSetupSchema>;
export type CheckoutInput = z.infer<typeof checkoutSchema>;
export type ReviewCreateInput = z.infer<typeof reviewCreateSchema>;
