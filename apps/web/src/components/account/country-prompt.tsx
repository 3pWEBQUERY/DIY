"use client";

import { useEffect, useRef, useState } from "react";
import { currencyForCountry, type MemberCountry } from "@werkraum/shared";
import { Button } from "@/components/ui/button";
import { useAction } from "@/lib/use-action";
import { toast } from "@/components/ui/toast";
import { confirmCountryAction } from "@/app/(app)/country-actions";
import { CountryPicker } from "./country-picker";

/**
 * Einmalige Abfrage für bestehende Mitglieder ohne bestätigtes Land. Nicht wegklickbar (Esc, Backdrop),
 * aber vorausgefüllt – meist genügt ein Klick. Danach erscheinen alle Preise in der passenden Währung.
 */
export function CountryPrompt({ suggested }: { suggested: MemberCountry | null }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [country, setCountry] = useState<MemberCountry | null>(suggested);
  const [done, setDone] = useState<MemberCountry | null>(null);
  const save = useAction(confirmCountryAction, { refresh: true, success: () => undefined, onSuccess: (d) => setDone(d.country) });

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (!done && !d.open) d.showModal();
    if (done && d.open) d.close();
  }, [done]);
  // Bestätigung erst nach dem Schliessen: Toasts hängen sich in den obersten offenen Dialog
  useEffect(() => {
    if (done) toast(`Gespeichert – du siehst Preise jetzt in ${currencyForCountry(done) === "EUR" ? "Euro" : "Franken"}.`);
  }, [done]);

  if (done) return null;
  return (
    <dialog
      ref={ref}
      onCancel={(e) => e.preventDefault()}
      aria-labelledby="country-prompt-title"
      aria-describedby="country-prompt-desc"
      className="m-auto w-[min(100vw-2rem,30rem)] rounded-3xl border border-line bg-card p-0 text-ink open:animate-rise"
    >
      <form
        className="px-6 pb-6 pt-5"
        onSubmit={(e) => {
          e.preventDefault();
          if (country) save.run({ country });
        }}
      >
        <p className="spec mb-2">Einmalig</p>
        <h2 id="country-prompt-title" className="headline text-[1.45rem]">
          Woher kommst du?
        </h2>
        <p id="country-prompt-desc" className="mt-1.5 text-[14px] leading-relaxed text-ink-2">
          Damit du alle Preise in deiner Währung siehst: aus der Schweiz und Liechtenstein in Franken, aus Deutschland und Österreich in Euro.
        </p>
        <CountryPicker className="mt-5" legend="Land" hint={null} value={country} onChange={setCountry} error={save.fields.country} />
        {save.error && !save.fields.country && (
          <p role="alert" className="mt-3 text-[13px] text-danger">
            {save.error}
          </p>
        )}
        <Button type="submit" size="lg" className="mt-5 w-full" disabled={!country || save.pending}>
          {save.pending ? "Einen Moment …" : country ? `Weiter mit Preisen in ${currencyForCountry(country) === "EUR" ? "Euro" : "Franken"}` : "Land wählen"}
        </Button>
        <p className="mt-3 text-center text-[12.5px] text-muted">Jederzeit änderbar unter Einstellungen → Profil.</p>
      </form>
    </dialog>
  );
}
