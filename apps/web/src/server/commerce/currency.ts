import "server-only";
import { cache } from "react";
import { FALLBACK_EUR_CHF, convertMinor, currencyForCountry, currencyFromAcceptLanguage, fxFactor, type Currency } from "@werkraum/shared";
import { db, type Prisma } from "@/server/db";
import { currentUser } from "@/server/auth/session";

/**
 * Währung der Betrachter:innen und Umrechnung zum Tageskurs.
 *
 * - Mitglieder: Land im Profil (CH/LI → CHF, DE/AT → EUR).
 * - Gäste: gewählte Währung (Cookie `wr_currency`), sonst Sprache des Browsers bzw. Geräts.
 * - Kurs: EZB-Referenzkurs, täglich vom Worker geladen (`refreshFxRate`); bis dahin ein fester Startwert.
 *
 * Shops verkaufen in ihrer Währung; Preise werden nur für Käufer:innen der anderen Währung umgerechnet
 * (auf 10 Rappen/Cent gerundet). Bezahlt wird in der Währung der Käufer:innen – Stripe rechnet für den Shop um.
 */
export const FX_SETTING_KEY = "fx.eurChf";
export const GUEST_CURRENCY_COOKIE = "wr_currency";

export type FxRate = { rate: number; date: string | null; fetchedAt: string | null };
export type PriceContext = { currency: Currency; eurChf: number; fxDate: string | null };

function parseFx(value: unknown): FxRate | null {
  const v = value as { rate?: unknown; date?: unknown; fetchedAt?: unknown } | null;
  const rate = typeof v?.rate === "number" ? v.rate : NaN;
  // Plausibilität: ein Kurs ausserhalb 0.5–2 ist ein Lesefehler
  if (!(rate > 0.5 && rate < 2)) return null;
  return { rate, date: typeof v?.date === "string" ? v.date : null, fetchedAt: typeof v?.fetchedAt === "string" ? v.fetchedAt : null };
}

/** Aktueller Kurs (CHF je 1 EUR), einmal je Anfrage gelesen */
export const getFxRate = cache(async (): Promise<FxRate> => {
  // Ein Lesefehler darf keine Seite brechen: dann gilt der Startwert
  let value: unknown = null;
  try {
    value = (await db.systemSetting.findUnique({ where: { key: FX_SETTING_KEY }, select: { value: true } }))?.value;
  } catch {
    value = null;
  }
  return parseFx(value) ?? { rate: FALLBACK_EUR_CHF, date: null, fetchedAt: null };
});

async function viewerOrNull() {
  try {
    return await currentUser();
  } catch {
    return null;
  }
}

async function guestCurrency(): Promise<Currency> {
  try {
    const { cookies, headers } = await import("next/headers");
    const c = (await cookies()).get(GUEST_CURRENCY_COOKIE)?.value;
    if (c === "CHF" || c === "EUR") return c;
    return currencyFromAcceptLanguage((await headers()).get("accept-language"));
  } catch {
    // Ausserhalb einer Anfrage (Worker, Skripte)
    return "CHF";
  }
}

/** Währung und Kurs für die aktuelle Anfrage (Web-Sitzung oder App-Token) */
export const getPriceContext = cache(async (): Promise<PriceContext> => {
  const [user, fx] = await Promise.all([viewerOrNull(), getFxRate()]);
  const country = user?.profile?.country ?? null;
  const currency = country ? currencyForCountry(country) : await guestCurrency();
  return { currency, eurChf: fx.rate, fxDate: fx.date };
});

/** Preis-Kontext für ein bestimmtes Konto (z. B. E-Mails, Worker) */
export async function priceContextFor(userId: string | null | undefined): Promise<PriceContext> {
  const [profile, fx] = await Promise.all([
    userId ? db.userProfile.findUnique({ where: { userId }, select: { country: true } }) : null,
    getFxRate(),
  ]);
  return { currency: currencyForCountry(profile?.country), eurChf: fx.rate, fxDate: fx.date };
}

/** Betrag in der Währung der Betrachter:innen */
export function localize(ctx: PriceContext, minor: number, from: string | null | undefined) {
  return convertMinor(minor, from ?? "CHF", ctx.currency, ctx.eurChf);
}

/** Wird für diese Währung umgerechnet? */
export function isConverted(ctx: PriceContext, from: string | null | undefined) {
  return (from ?? "CHF") !== ctx.currency;
}

/** Faktor Bestellwährung → Shop-Währung (für `Order.shopFx`), null bei gleicher Währung */
export function shopFxFor(orderCurrency: string, shopCurrency: string, eurChf: number) {
  return orderCurrency === shopCurrency ? null : fxFactor(orderCurrency, shopCurrency, eurChf);
}

/* ───────────────────────── Kurs laden (Worker) ───────────────────────── */

const ECB_DAILY = "https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml";

/** EZB-Referenzkurs EUR→CHF laden und speichern. Fehler lassen den letzten Kurs stehen. */
export async function refreshFxRate(fetcher: typeof fetch = fetch): Promise<FxRate | null> {
  const res = await fetcher(ECB_DAILY, { headers: { accept: "application/xml" }, signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`EZB-Kurs nicht erreichbar (${res.status})`);
  const xml = await res.text();
  const rate = Number(/currency=['"]CHF['"]\s+rate=['"]([\d.]+)['"]/.exec(xml)?.[1]);
  const date = /time=['"](\d{4}-\d{2}-\d{2})['"]/.exec(xml)?.[1] ?? null;
  const fx = parseFx({ rate, date, fetchedAt: new Date().toISOString() });
  if (!fx) throw new Error("EZB-Kurs CHF nicht gefunden");
  const value = fx as unknown as Prisma.InputJsonValue;
  await db.systemSetting.upsert({ where: { key: FX_SETTING_KEY }, create: { key: FX_SETTING_KEY, value }, update: { value } });
  return fx;
}

/** Preis eines Objekts (`priceMinor`, `currency`) in die Währung der Betrachter:in bringen */
export function localizePrice<T extends { priceMinor: number; currency: string }>(ctx: PriceContext, item: T): T & { currency: Currency; original: { priceMinor: number; currency: string } | null } {
  if (!isConverted(ctx, item.currency)) return { ...item, currency: ctx.currency, original: null };
  return { ...item, priceMinor: localize(ctx, item.priceMinor, item.currency), currency: ctx.currency, original: { priceMinor: item.priceMinor, currency: item.currency } };
}
