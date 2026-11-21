"use client";

import Link from "next/link";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Currency } from "@werkraum/shared";
import { cn } from "@/lib/utils";
import { setGuestCurrencyAction } from "@/app/(app)/country-actions";

/**
 * Währung der Preise. Gäste wählen direkt (Cookie), Mitglieder sehen ihre Währung aus dem Land im Profil.
 */
export function CurrencySwitch({ currency, signedIn, className }: { currency: Currency; signedIn: boolean; className?: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  if (signedIn) {
    return (
      <p className={cn("text-[13px] text-muted", className)}>
        Preise in {currency === "EUR" ? "Euro" : "Franken"} ·{" "}
        <Link href="/einstellungen/profil" className="underline underline-offset-2 hover:text-ink">
          Land ändern
        </Link>
      </p>
    );
  }
  return (
    <div className={cn("flex items-center gap-2 text-[13px] text-muted", className)} role="group" aria-label="Währung der Preise">
      <span>Preise in</span>
      <span className="inline-flex overflow-hidden rounded-full border border-rule">
        {(["CHF", "EUR"] as const).map((c) => (
          <button
            key={c}
            type="button"
            aria-pressed={currency === c}
            disabled={pending}
            onClick={() =>
              start(async () => {
                await setGuestCurrencyAction(c);
                router.refresh();
              })
            }
            className={cn("px-3 py-1 font-mono text-[11.5px] tracking-[0.06em] transition-colors", currency === c ? "bg-ink text-paper" : "hover:text-ink")}
          >
            {c === "EUR" ? "€ EUR" : "CHF"}
          </button>
        ))}
      </span>
    </div>
  );
}
