"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { ArrowDown, ArrowUp, Eye, EyeOff } from "lucide-react";
import {
  PROFILE_ACCENTS,
  PROFILE_ACCENT_KEYS,
  PROFILE_COVER_LABEL,
  PROFILE_COVER_LAYOUTS,
  PROFILE_SECTIONS,
  PROFILE_SECTION_LABEL,
  type ProfileSection,
  type ProfileTheme,
} from "@werkraum/shared";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/misc";
import { toast } from "@/components/ui/toast";
import { callAction } from "@/lib/use-action";
import { cn } from "@/lib/utils";
import { saveProfileThemeAction } from "@/app/studio/profil-design/actions";
import { proHref } from "@/lib/pro-features";

type Profile = { handle: string; displayName: string; avatarUrl: string | null; coverUrl: string | null };

/** Editor mit Live-Vorschau. Ohne Pro: ausprobieren ja, speichern nein. */
export function ProfileThemeEditor({ initial, custom, pro, profile }: { initial: ProfileTheme; custom: boolean; pro: boolean; profile: Profile }) {
  const [theme, setTheme] = useState<ProfileTheme>(initial);
  const [saved, setSaved] = useState(JSON.stringify(initial));
  const [isCustom, setIsCustom] = useState(custom);
  const [pending, start] = useTransition();
  const dirty = JSON.stringify(theme) !== saved;
  const hidden = PROFILE_SECTIONS.filter((s) => !theme.sections.includes(s));

  const move = (i: number, by: -1 | 1) => {
    const next = [...theme.sections];
    const j = i + by;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j]!, next[i]!];
    setTheme({ ...theme, sections: next });
  };
  const toggle = (s: ProfileSection) =>
    setTheme({ ...theme, sections: theme.sections.includes(s) ? theme.sections.filter((x) => x !== s) : [...theme.sections, s] });

  const save = (value: ProfileTheme | null) =>
    start(async () => {
      const r = await callAction(() => saveProfileThemeAction(value));
      if (!r.ok) return void toast(r.error, "error");
      toast(r.message ?? "Gespeichert.");
      setTheme(r.data.theme);
      setSaved(JSON.stringify(r.data.theme));
      setIsCustom(r.data.custom);
    });

  return (
    <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <div className="space-y-8">
        <fieldset>
          <legend className="mb-3 text-[14px] font-semibold">Akzentfarbe</legend>
          <div className="grid grid-cols-4 gap-2 sm:grid-cols-7 lg:grid-cols-4 xl:grid-cols-7">
            {PROFILE_ACCENT_KEYS.map((k) => {
              const a = PROFILE_ACCENTS[k];
              return (
                <label key={k} className="flex cursor-pointer flex-col items-center gap-1.5 rounded-xl border border-line p-2 text-[12px] has-[:checked]:border-ink has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-moss">
                  <input type="radio" name="accent" value={k} checked={theme.accent === k} onChange={() => setTheme({ ...theme, accent: k })} className="sr-only" />
                  <span aria-hidden className="size-8 rounded-full border border-black/10" style={{ background: a.base }} />
                  {a.label}
                </label>
              );
            })}
          </div>
        </fieldset>

        <fieldset>
          <legend className="mb-3 text-[14px] font-semibold">Titelbild</legend>
          <div className="flex flex-wrap gap-2">
            {PROFILE_COVER_LAYOUTS.map((l) => (
              <label key={l} className="cursor-pointer rounded-full border border-line px-4 py-2 text-[13.5px] has-[:checked]:border-ink has-[:checked]:font-semibold has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-moss">
                <input type="radio" name="cover" value={l} checked={theme.coverLayout === l} onChange={() => setTheme({ ...theme, coverLayout: l })} className="sr-only" />
                {PROFILE_COVER_LABEL[l]}
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend className="mb-1 text-[14px] font-semibold">Bereiche und Reihenfolge</legend>
          <p className="mb-3 text-[13px] text-muted">Der erste Bereich öffnet sich beim Besuch. Ausgeblendete Bereiche erscheinen nicht als Reiter. Bereiche ohne Inhalte bleiben ohnehin verborgen.</p>
          <ol className="divide-y divide-line rounded-2xl border border-line">
            {theme.sections.map((s, i) => (
              <li key={s} className="flex items-center gap-2 px-3 py-2">
                <span className="num w-5 text-[12px] text-muted">{i + 1}</span>
                <span className="flex-1 text-[14px] font-medium">{PROFILE_SECTION_LABEL[s]}</span>
                <Button variant="ghost" size="sm" aria-label={`${PROFILE_SECTION_LABEL[s]} nach oben`} disabled={i === 0} onClick={() => move(i, -1)}>
                  <ArrowUp size={15} />
                </Button>
                <Button variant="ghost" size="sm" aria-label={`${PROFILE_SECTION_LABEL[s]} nach unten`} disabled={i === theme.sections.length - 1} onClick={() => move(i, 1)}>
                  <ArrowDown size={15} />
                </Button>
                <Button variant="ghost" size="sm" aria-label={`${PROFILE_SECTION_LABEL[s]} ausblenden`} disabled={theme.sections.length === 1} onClick={() => toggle(s)}>
                  <EyeOff size={15} />
                </Button>
              </li>
            ))}
            {hidden.map((s) => (
              <li key={s} className="flex items-center gap-2 px-3 py-2 text-muted">
                <span className="w-5" />
                <span className="flex-1 text-[14px] line-through decoration-1">{PROFILE_SECTION_LABEL[s]}</span>
                <Button variant="ghost" size="sm" aria-label={`${PROFILE_SECTION_LABEL[s]} einblenden`} onClick={() => toggle(s)}>
                  <Eye size={15} />
                </Button>
              </li>
            ))}
          </ol>
        </fieldset>

        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={() => save(theme)} disabled={!pro || pending || (!dirty && isCustom)}>
            {pending ? "Speichert …" : "Design speichern"}
          </Button>
          {isCustom && (
            <Button variant="ghost" onClick={() => save(null)} disabled={pending}>
              Standard wiederherstellen
            </Button>
          )}
          {!pro && (
            <Link href={proHref("profil-design")} className="text-[13px] font-semibold text-ink-2 underline-offset-2 hover:underline">
              Mit Creator Pro speichern →
            </Link>
          )}
          <Link href={`/u/${profile.handle}`} className="ml-auto text-[13px] text-muted hover:text-ink">
            Profil ansehen →
          </Link>
        </div>
      </div>

      <ThemePreview theme={theme} profile={profile} />
    </div>
  );
}

/** Verkleinerte Profilansicht – Farben über dieselben Variablen wie das echte Profil */
function ThemePreview({ theme, profile }: { theme: ProfileTheme; profile: Profile }) {
  const a = PROFILE_ACCENTS[theme.accent];
  const style = { "--color-moss": a.base, "--color-moss-ink": a.ink, "--color-moss-soft": a.soft } as React.CSSProperties;
  return (
    <figure aria-label="Vorschau deines Profils" style={style} className="h-fit overflow-hidden rounded-3xl border border-line bg-paper p-4">
      <figcaption className="spec mb-3">Vorschau</figcaption>
      {theme.coverLayout !== "none" && (
        <div className={cn("overflow-hidden border border-line bg-sunken", theme.coverLayout === "wide" ? "h-28 rounded-2xl" : "mx-auto h-20 w-4/5 rounded-xl")}>
          {profile.coverUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={profile.coverUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="h-full w-full bg-moss-soft" />
          )}
        </div>
      )}
      <div className={cn("flex items-end gap-3", theme.coverLayout === "none" ? "mt-1" : "-mt-6 ml-3")}>
        <Avatar src={profile.avatarUrl} name={profile.displayName} size={56} className="rounded-xl border border-rule" />
        <div className="pb-1">
          <p className="text-[17px] font-bold leading-tight">{profile.displayName}</p>
          <p className="text-[12px] text-muted">@{profile.handle}</p>
        </div>
        <span className="mb-1 ml-auto rounded-full bg-moss px-3 py-1 text-[12px] font-semibold text-paper">Folgen</span>
      </div>
      <div className="mt-4 flex gap-4 overflow-x-auto border-b border-line text-[13px]">
        {theme.sections.map((s, i) => (
          <span key={s} className={cn("shrink-0 pb-2", i === 0 ? "border-b-2 border-moss font-semibold text-ink" : "text-muted")}>
            {PROFILE_SECTION_LABEL[s]}
          </span>
        ))}
        <span className="shrink-0 pb-2 text-muted">Über mich</span>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2">
        {[0, 1, 2].map((i) => (
          <div key={i} className="aspect-[4/3] rounded-lg bg-sunken" />
        ))}
      </div>
      <p className="mt-3 text-[12.5px]">
        <span className="font-semibold text-moss-ink underline underline-offset-2">Links</span> und Knöpfe erscheinen in deiner Farbe.
      </p>
    </figure>
  );
}
