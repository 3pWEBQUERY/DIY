"use client";

import { useState } from "react";
import { CATEGORIES, FEED_DEFAULTS, FEED_DEFAULT_LABEL } from "@werkraum/shared";
import { useAction } from "@/lib/use-action";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Glyph } from "@/components/ui/glyphs";
import { SettingsSection } from "./section";
import { updateFeedPrefsAction } from "@/app/(app)/einstellungen/actions";

type Mode = "interest" | "neutral" | "hidden";

/** Je Kategorie ein Dreifach-Schalter: Interessiert mich · Neutral · Ausblenden. */
export function FeedForm({ interests, hidden, feedDefault }: { interests: string[]; hidden: string[]; feedDefault: string }) {
  const [modes, setModes] = useState<Record<string, Mode>>(() => Object.fromEntries(CATEGORIES.map((c) => [c.slug, interests.includes(c.slug) ? "interest" : hidden.includes(c.slug) ? "hidden" : "neutral"])));
  const [def, setDef] = useState(FEED_DEFAULTS.includes(feedDefault as (typeof FEED_DEFAULTS)[number]) ? feedDefault : "FOR_YOU");
  const { run, pending } = useAction(updateFeedPrefsAction);
  const count = (m: Mode) => Object.values(modes).filter((x) => x === m).length;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        run({
          interests: Object.entries(modes).filter(([, m]) => m === "interest").map(([k]) => k),
          hiddenCategories: Object.entries(modes).filter(([, m]) => m === "hidden").map(([k]) => k),
          feedDefault: def,
        });
      }}
    >
      <SettingsSection n="01" title="Interessen & ausgeblendete Kategorien" description={`„Interessiert mich“ stärkt Kategorien im Feed „Für dich“ und erscheint als Schwerpunkt auf deinem Profil. Ausgeblendete Kategorien zeigen wir dir nicht mehr. ${count("interest")} Interessen · ${count("hidden")} ausgeblendet.`}>
        <ul className="divide-y divide-line border-y border-line">
          {CATEGORIES.map((c) => (
            <li key={c.slug} className="flex flex-wrap items-center gap-3 py-2.5">
              <Glyph name={c.glyph} size={20} className="text-ink" />
              <span className="min-w-0 flex-1 text-sm font-medium">{c.name}</span>
              <span role="radiogroup" aria-label={c.name} className="flex border border-line-strong">
                {(["interest", "neutral", "hidden"] as const).map((m, i) => (
                  <button
                    key={m}
                    type="button"
                    role="radio"
                    aria-checked={modes[c.slug] === m}
                    onClick={() => setModes((s) => ({ ...s, [c.slug]: m }))}
                    className={cn(
                      "h-8 px-2.5 text-[12.5px] text-ink-2 hover:bg-sunken",
                      i > 0 && "border-l border-line-strong",
                      modes[c.slug] === m && (m === "interest" ? "bg-moss text-paper hover:bg-moss" : m === "hidden" ? "bg-ink text-paper hover:bg-ink" : "bg-sunken font-semibold"),
                    )}
                  >
                    {m === "interest" ? "Interessiert mich" : m === "neutral" ? "Neutral" : "Ausblenden"}
                  </button>
                ))}
              </span>
            </li>
          ))}
        </ul>
      </SettingsSection>

      <SettingsSection n="02" title="Startansicht" description="Welcher Feed beim Öffnen der Startseite zuerst erscheint.">
        <fieldset className="flex flex-wrap gap-2">
          <legend className="sr-only">Standard-Feed</legend>
          {FEED_DEFAULTS.map((f) => (
            <label key={f} className={cn("flex cursor-pointer items-center gap-2.5 border px-3 py-2 text-sm", def === f ? "border-ink bg-card" : "border-line-strong hover:border-ink")}>
              <input type="radio" name="feedDefault" checked={def === f} onChange={() => setDef(f)} className="accent-[var(--color-ink)]" />
              {FEED_DEFAULT_LABEL[f]}
            </label>
          ))}
        </fieldset>
        <p className="mt-2 text-xs text-muted">„Folge ich“ ist immer chronologisch – ohne Algorithmus.</p>
      </SettingsSection>

      <div className="mb-12 flex justify-end border-t border-line pt-4">
        <Button type="submit" variant="ink" disabled={pending} aria-busy={pending}>
          {pending ? "Speichert …" : "Feed speichern"}
        </Button>
      </div>
    </form>
  );
}
