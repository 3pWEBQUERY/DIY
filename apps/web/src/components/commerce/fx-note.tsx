import { CURRENCY_LABEL, type Currency } from "@werkraum/shared";
import { cn } from "@/lib/utils";

const rate = (n: number) => new Intl.NumberFormat("de-CH", { minimumFractionDigits: 4, maximumFractionDigits: 4 }).format(n);
const day = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("de-CH", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Zurich" });

/** Kurs als Zeile: „1 EUR = 0,9412 CHF“ (immer EUR als Basis, so wie die EZB ihn veröffentlicht) */
export function fxLine(eurChf: number) {
  return `1 EUR = ${rate(eurChf)} CHF`;
}

/**
 * Hinweis, wenn Preise eines Shops in die Währung der Käufer:in umgerechnet sind.
 * Ruhig und sachlich: was umgerechnet wurde, mit welchem Kurs, und in welcher Währung bezahlt wird.
 */
export function FxNote({ currency, shopCurrency, eurChf, date, className, compact }: { currency: Currency; shopCurrency?: string; eurChf: number; date: string | null; className?: string; compact?: boolean }) {
  const from = shopCurrency ?? (currency === "EUR" ? "CHF" : "EUR");
  return (
    <p className={cn("text-[12.5px] leading-relaxed text-muted", className)}>
      {compact ? (
        <>Umgerechnet aus {from} · {fxLine(eurChf)}{date ? ` (EZB, ${day(date)})` : ""}</>
      ) : (
        <>
          Preise aus {from} umgerechnet zum Referenzkurs der EZB{date ? ` vom ${day(date)}` : ""} ({fxLine(eurChf)}), gerundet auf 10 {currency === "EUR" ? "Cent" : "Rappen"}. Du bezahlst in{" "}
          {CURRENCY_LABEL[currency].replace(/ \(.*\)$/, "")}; der Betrag bleibt bis zur Zahlung fest.
        </>
      )}
    </p>
  );
}
