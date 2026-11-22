import "server-only";
import { formatMoney } from "@werkraum/shared";
import { BRAND } from "@/config/brand";
import { getSetting } from "@/server/settings";
import { HELP_CATEGORIES, articleAnswer, plainHelp, type HelpVars } from "@/lib/help/content";
import type { HelpIndexEntry } from "@/lib/help/search";

const pct = (bps: number) => `${(bps / 100).toLocaleString("de-CH", { maximumFractionDigits: 2 })} %`;
// Akkusativ: „3 Tage nach dem Abschluss“
const tage = (n: number) => `${n} ${n === 1 ? "Tag" : "Tage"}`;

/** Werte für die Platzhalter im Hilfe-Center – aus den Systemeinstellungen, damit Hilfe und Abrechnung nie auseinanderlaufen */
export async function helpVars(): Promise<HelpVars> {
  const [minAge, feeBps, proFeeBps, supportFeeBps, iosMarkupBps, holdDays, autoCompleteDays, reservationMinutes, proMonth, proYear] = await Promise.all([
    getSetting("signup.minAge"),
    getSetting("commerce.feeBps"),
    getSetting("pro.feeBps"),
    getSetting("supporters.feeBps"),
    getSetting("commerce.iosMarkupBps"),
    getSetting("commerce.payoutHoldDays"),
    getSetting("commerce.autoCompleteDays"),
    getSetting("commerce.reservationMinutes"),
    getSetting("pro.priceMonthMinor"),
    getSetting("pro.priceYearMinor"),
  ]);
  return {
    brand: BRAND.name,
    minAge,
    fee: pct(feeBps),
    proFee: pct(proFeeBps),
    supportFee: pct(supportFeeBps),
    iosMarkup: pct(iosMarkupBps),
    holdDays: tage(holdDays),
    autoCompleteDays: tage(autoCompleteDays),
    reservationMinutes,
    proMonth: formatMoney(proMonth, "CHF"),
    proYear: formatMoney(proYear, "CHF"),
  };
}

/** Suchindex für die Suche im Browser (Klartext, Werte eingesetzt) */
export function helpIndex(vars: HelpVars, inApp: boolean): HelpIndexEntry[] {
  return HELP_CATEGORIES.flatMap((c) =>
    c.articles.map((a) => ({
      categoryId: c.id,
      categoryTitle: c.title,
      id: a.id,
      q: a.q.replace(/\{brand\}/g, vars.brand),
      text: plainHelp(articleAnswer(a, vars, inApp)),
      tags: a.tags ?? "",
    })),
  );
}
