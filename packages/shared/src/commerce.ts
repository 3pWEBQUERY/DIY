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

/**
 * Persönliche Angaben für Bestellungen – einmal erfasst, im Konto gespeichert und bei jeder
 * Bestellung verwendet (Rechnungsadresse; Lieferadresse, sofern nicht abweichend).
 */
const personName = z
  .string()
  .trim()
  .min(1, "Pflichtfeld")
  .max(60, "Höchstens 60 Zeichen")
  .regex(/^[\p{L}][\p{L}\p{M}' .-]*$/u, "Bitte nur Buchstaben verwenden");
const POSTAL: Record<(typeof SHIP_COUNTRIES)[number], RegExp> = { CH: /^\d{4}$/, LI: /^\d{4}$/, AT: /^\d{4}$/, DE: /^\d{5}$/ };
export const customerDetailsSchema = z
  .object({
    firstName: personName,
    lastName: personName,
    line1: z.string().trim().min(3, "Strasse und Hausnummer angeben").max(200),
    line2: z.string().trim().max(200).default(""),
    postalCode: z.string().trim().min(1, "PLZ angeben").max(12),
    city: z.string().trim().min(2, "Ort angeben").max(100),
    country: z.enum(SHIP_COUNTRIES),
    phone: z
      .string()
      .trim()
      .max(30)
      .refine((v) => !v || /^\+?[0-9 ()/.-]{7,}$/.test(v), "Ungültige Telefonnummer")
      .default(""),
  })
  .superRefine((d, ctx) => {
    if (!POSTAL[d.country].test(d.postalCode)) ctx.addIssue({ code: "custom", path: ["postalCode"], message: d.country === "DE" ? "5-stellige PLZ" : "4-stellige PLZ" });
  });
export type CustomerDetails = z.infer<typeof customerDetailsSchema>;
export const customerFullName = (d: Pick<CustomerDetails, "firstName" | "lastName">) => `${d.firstName} ${d.lastName}`.trim();

export const checkoutSchema = z.object({
  /** Abweichende Lieferadresse (nur mit shipToOther). Ältere App-Versionen senden nur `address`. */
  address: shippingAddressSchema.optional(),
  /** Neue/geänderte persönliche Angaben; ohne Angabe werden die gespeicherten verwendet. */
  details: customerDetailsSchema.optional(),
  saveDetails: z.boolean().default(true),
  shipToOther: z.boolean().default(false),
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

/** Höhe × Breite × Tiefe (Millimeter) für die Anzeige, z. B. „H 18 × B 24 × T 10 cm“. */
export function formatDimensions(d: { heightMm?: number | null; widthMm?: number | null; depthMm?: number | null }) {
  const cm = (mm: number) => (Math.round(mm) / 10).toLocaleString("de-CH", { maximumFractionDigits: 1 });
  const parts = [d.heightMm ? `H ${cm(d.heightMm)}` : null, d.widthMm ? `B ${cm(d.widthMm)}` : null, d.depthMm ? `T ${cm(d.depthMm)}` : null].filter(Boolean);
  return parts.length ? `${parts.join(" × ")} cm` : "";
}
