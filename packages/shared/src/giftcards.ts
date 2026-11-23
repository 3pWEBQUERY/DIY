import { z } from "zod";

/**
 * Geschenkgutscheine eines Shops. Werte in Rappen/Cent der Shop-Währung. Ein Gutschein gilt nur
 * im ausstellenden Shop (ein plattformweiter Gutschein würde bedeuten, dass Werkuno Kundengeld für
 * mehrere Shops verwahrt – bewusst nicht vorgesehen).
 */
export const GIFT_CARD_MIN_MINOR = 500;
export const GIFT_CARD_MAX_MINOR = 100_000;
/** Standard-Gültigkeit: 3 Jahre (in der Schweiz verjähren Gutscheine nach 10 Jahren; 3 Jahre sind üblich und in DE die Regelverjährung) */
export const GIFT_CARD_DEFAULT_MONTHS = 36;

const minor = z.number().int().min(GIFT_CARD_MIN_MINOR, "Mindestens 5.–").max(GIFT_CARD_MAX_MINOR, "Höchstens 1000.–");

export const giftCardSettingsSchema = z
  .object({
    enabled: z.boolean(),
    amounts: z.array(minor).max(6, "Höchstens 6 feste Beträge").default([]),
    customEnabled: z.boolean().default(false),
    customMinMinor: minor.default(1000),
    customMaxMinor: minor.default(30_000),
    validityMonths: z.number().int().min(12, "Mindestens 12 Monate").max(120, "Höchstens 10 Jahre").default(GIFT_CARD_DEFAULT_MONTHS),
    note: z.string().trim().max(200, "Höchstens 200 Zeichen").default(""),
  })
  .superRefine((v, ctx) => {
    if (v.customEnabled && v.customMinMinor > v.customMaxMinor) ctx.addIssue({ code: "custom", path: ["customMaxMinor"], message: "Höchstbetrag muss über dem Mindestbetrag liegen" });
    if (v.enabled && !v.amounts.length && !v.customEnabled) ctx.addIssue({ code: "custom", path: ["amounts"], message: "Mindestens einen Betrag oder freie Beträge anbieten" });
  });
export type GiftCardSettingsInput = z.input<typeof giftCardSettingsSchema>;

export const giftCardPurchaseSchema = z.object({
  shopId: z.string().min(1).max(40),
  amountMinor: z.number().int().positive(),
  recipientEmail: z.email("Bitte gib eine gültige E-Mail-Adresse an").trim().toLowerCase().max(254),
  recipientName: z.string().trim().min(1, "Wie heisst die beschenkte Person?").max(80),
  senderName: z.string().trim().min(1, "Von wem ist der Gutschein?").max(80),
  message: z.string().trim().max(500, "Höchstens 500 Zeichen").default(""),
  /** ISO-Datum/Zeit; leer = sofort */
  deliverAt: z.string().max(40).nullish(),
});
export type GiftCardPurchaseInput = z.input<typeof giftCardPurchaseSchema>;

/** Code ohne Trennzeichen, in Grossbuchstaben */
export function normalizeGiftCode(input: string) {
  return input.toUpperCase().replace(/[^0-9A-Z]/g, "");
}

/** Lesbar in Vierergruppen: ABCD-EFGH-JKLM-NPQR */
export function formatGiftCode(code: string) {
  return normalizeGiftCode(code).replace(/(.{4})(?=.)/g, "$1-");
}

/** Maskiert für Listen: ••••-••••-••••-NPQR */
export function maskGiftCode(code: string) {
  const c = normalizeGiftCode(code);
  return `••••-••••-••••-${c.slice(-4)}`;
}
