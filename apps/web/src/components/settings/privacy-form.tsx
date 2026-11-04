"use client";

import { useState } from "react";
import { DM_POLICIES, DM_POLICY_LABEL } from "@werkraum/shared";
import { useAction } from "@/lib/use-action";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/field";
import { SettingsSection } from "./section";
import { updatePrivacyAction } from "@/app/(app)/einstellungen/actions";

const DM_HINT: Record<(typeof DM_POLICIES)[number], string> = {
  EVERYONE: "Nachrichten von Personen, denen du nicht folgst, landen als Anfrage in einem separaten Ordner.",
  FOLLOWING: "Empfohlen. Andere können dir keine neue Unterhaltung starten.",
  NOBODY: "Neue Unterhaltungen sind nur im Zusammenhang mit einer Bestellung möglich.",
};

export function PrivacyForm({ dmPolicy, reduceMotion }: { dmPolicy: string; reduceMotion: boolean }) {
  const [dm, setDm] = useState((DM_POLICIES as readonly string[]).includes(dmPolicy) ? dmPolicy : "FOLLOWING");
  const [rm, setRm] = useState(reduceMotion);
  const { run, pending } = useAction(updatePrivacyAction);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        run({ dmPolicy: dm, reduceMotion: rm });
      }}
    >
      <SettingsSection n="01" title="Wer darf dir schreiben?">
        <fieldset className="space-y-2">
          <legend className="sr-only">Direktnachrichten</legend>
          {DM_POLICIES.map((p) => (
            <label key={p} className={cn("flex cursor-pointer gap-3 border px-4 py-3 rounded-2xl", dm === p ? "border-ink bg-card" : "border-line-strong hover:border-ink")}>
              <input type="radio" name="dmPolicy" checked={dm === p} onChange={() => setDm(p)} className="mt-1 accent-[var(--color-ink)]" />
              <span>
                <span className="block text-sm font-semibold">{DM_POLICY_LABEL[p]}</span>
                <span className="block text-xs text-muted">{DM_HINT[p]}</span>
              </span>
            </label>
          ))}
        </fieldset>
      </SettingsSection>

      <SettingsSection n="02" title="Darstellung" description="Unabhängig von dieser Einstellung respektieren wir die Systemeinstellung „Bewegung reduzieren“ deines Geräts.">
        <Checkbox checked={rm} onChange={(e) => setRm(e.currentTarget.checked)} label={<><span className="font-semibold">Bewegung reduzieren</span><span className="block text-xs text-muted">Animationen, Zeichenlinien und automatische Übergänge werden ausgeschaltet.</span></>} />
      </SettingsSection>

      <div className="mb-12 flex justify-end border-t border-line pt-4">
        <Button type="submit" variant="ink" disabled={pending} aria-busy={pending}>
          {pending ? "Speichert …" : "Speichern"}
        </Button>
      </div>
    </form>
  );
}
