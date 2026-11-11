"use client";

import { useState } from "react";
import { BRAND } from "@/config/brand";
import { DM_POLICIES, DM_POLICY_LABEL } from "@werkraum/shared";
import { useAction } from "@/lib/use-action";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/field";
import { SettingsSection } from "./section";
import { ShortcutsToggle, openShortcutsHelp } from "@/components/shell/shortcuts";
import { updatePrivacyAction } from "@/app/(app)/einstellungen/actions";

const DM_HINT: Record<(typeof DM_POLICIES)[number], string> = {
  EVERYONE: "Alle Mitglieder können dir direkt schreiben – Nachrichten landen in deinem Posteingang.",
  FOLLOWING: "Empfohlen. Personen, denen du folgst, schreiben dir direkt; alle anderen landen als Anfrage unter „Anfragen“, die du annehmen oder ablehnen kannst.",
  NOBODY: "Neue Unterhaltungen sind nur im Zusammenhang mit einer Bestellung möglich.",
};

export function PrivacyForm({ dmPolicy, reduceMotion, readReceipts, showOnline }: { dmPolicy: string; reduceMotion: boolean; readReceipts: boolean; showOnline: boolean }) {
  const [rr, setRr] = useState(readReceipts);
  const [so, setSo] = useState(showOnline);
  const [dm, setDm] = useState((DM_POLICIES as readonly string[]).includes(dmPolicy) ? dmPolicy : "FOLLOWING");
  const [rm, setRm] = useState(reduceMotion);
  const { run, pending } = useAction(updatePrivacyAction);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        run({ dmPolicy: dm, reduceMotion: rm, readReceipts: rr, showOnline: so });
      }}
    >
      <SettingsSection n="01" title="Wer darf dir schreiben?">
        <fieldset className="space-y-2">
          <legend className="sr-only">Direktnachrichten</legend>
          {DM_POLICIES.map((p) => (
            <label key={p} className={cn("flex cursor-pointer gap-3 border px-4 py-3 rounded-2xl", dm === p ? "border-moss bg-moss-soft/60" : "border-line-strong bg-card hover:border-rule-strong")}>
              <input type="radio" name="dmPolicy" checked={dm === p} onChange={() => setDm(p)} className="mt-1 accent-[var(--color-moss)]" />
              <span>
                <span className="block text-sm font-semibold">{DM_POLICY_LABEL[p]}</span>
                <span className="block text-xs text-muted">{DM_HINT[p]}</span>
              </span>
            </label>
          ))}
        </fieldset>
      </SettingsSection>

      <SettingsSection n="02" title="Lesebestätigungen & Online-Status" description="✓ gesendet · ✓✓ zugestellt · ✓✓ blau gelesen.">
        <Checkbox
          checked={rr}
          onChange={(e) => setRr(e.currentTarget.checked)}
          label={
            <>
              <span className="font-semibold">Lesebestätigungen senden</span>
              <span className="block text-xs text-muted">Wenn du sie ausschaltest, sehen andere in Einzelchats nicht, ob du ihre Nachrichten gelesen hast – und du siehst es bei ihnen auch nicht. In Gruppen werden Lesebestätigungen immer angezeigt.</span>
            </>
          }
        />
        <div className="mt-4 border-t border-line pt-4">
          <Checkbox
            checked={so}
            onChange={(e) => setSo(e.currentTarget.checked)}
            label={
              <>
                <span className="font-semibold">Online-Status zeigen</span>
                <span className="block text-xs text-muted">Personen, mit denen du schreibst, sehen „Online“ bzw. „Zuletzt online …“. Ausgeschaltet siehst du es bei anderen auch nicht. Das Team von {BRAND.name} sieht den Status zur Sicherheit der Plattform immer.</span>
              </>
            }
          />
        </div>
      </SettingsSection>

      <SettingsSection n="03" title="Darstellung" description="Unabhängig von dieser Einstellung respektieren wir die Systemeinstellung „Bewegung reduzieren“ deines Geräts.">
        <Checkbox checked={rm} onChange={(e) => setRm(e.currentTarget.checked)} label={<><span className="font-semibold">Bewegung reduzieren</span><span className="block text-xs text-muted">Animationen, Zeichenlinien und automatische Übergänge werden ausgeschaltet.</span></>} />
        <div className="mt-4 border-t border-line pt-4">
          <ShortcutsToggle />
          <button type="button" onClick={openShortcutsHelp} className="mt-2 ml-[30px] text-sm font-semibold text-moss underline-offset-2 hover:underline">
            Alle Tastenkürzel anzeigen
          </button>
        </div>
      </SettingsSection>

      <div className="mb-12 flex justify-end border-t border-line pt-4">
        <Button type="submit" variant="ink" disabled={pending} aria-busy={pending}>
          {pending ? "Speichert …" : "Speichern"}
        </Button>
      </div>
    </form>
  );
}
