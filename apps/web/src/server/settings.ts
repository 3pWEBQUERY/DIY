import "server-only";
import { cache } from "react";
import { db } from "@/server/db";

/** Systemweite Parameter mit Defaults; über Admin → Systemkonfiguration änderbar. */
export const SETTING_DEFAULTS = {
  "commerce.feeBps": 600, // 6 % Plattformprovision (§22.2)
  "commerce.reservationMinutes": 30,
  "commerce.digitalEnabledWeb": true,
  "commerce.digitalEnabledIos": false, // §13.7 – erst nach Klärung der Apple-Regeln
  "media.maxImageMb": 15,
  "media.maxVideoMb": 200,
  "media.maxVideoSeconds": 180,
  "feed.authorCap": 2, // max. Beiträge pro Autor je Feed-Seite (Vielfalt §9.5)
  "signup.minAge": 18,
  // Creator Pro (§22.3)
  "pro.priceMonthMinor": 900, // CHF 9.– pro Monat
  "pro.priceYearMinor": 9000, // CHF 90.– pro Jahr (2 Monate geschenkt)
  "pro.feeBps": 400, // tiefere Provision für Pro-Shops
  "pro.maxVideoSeconds": 600,
  "pro.maxVideoMb": 1000,
} as const;

export type SettingKey = keyof typeof SETTING_DEFAULTS;

export const getSetting = cache(async <K extends SettingKey>(key: K): Promise<(typeof SETTING_DEFAULTS)[K]> => {
  const row = await db.systemSetting.findUnique({ where: { key } }).catch(() => null);
  return (row?.value as (typeof SETTING_DEFAULTS)[K]) ?? SETTING_DEFAULTS[key];
});

export const isFeatureEnabled = cache(async (key: string, fallback = false) => {
  const f = await db.featureFlag.findUnique({ where: { key } }).catch(() => null);
  return f ? f.enabled : fallback;
});
