"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Check, Camera } from "lucide-react";
import { CATEGORIES, categoryBySlug, listCategories } from "@werkraum/shared";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea, Checkbox } from "@/components/ui/field";
import { Avatar, Notice } from "@/components/ui/misc";
import { Glyph } from "@/components/ui/glyphs";
import { FollowButton } from "@/components/social/actions";
import { toast } from "@/components/ui/toast";
import { uploadFile } from "@/components/media/uploader";
import { cn, pad } from "@/lib/utils";
import { checkHandleAction } from "@/app/(auth)/actions";
import { finishOnboardingAction, skipOnboardingAction, suggestionsAction, joinCommunityQuickAction } from "./actions";
import { callAction } from "@/lib/use-action";

type Initial = { displayName: string; handle: string; interests: string[]; bio: string; region: string; avatarUrl: string | null };
type Suggestions = Awaited<ReturnType<typeof suggestionsAction>>;

const STEPS = ["Profil", "Interessen", "Über dich", "Menschen", "Los geht’s"];

export function Onboarding({ initial, needsAge }: { initial: Initial; needsAge: boolean }) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [data, setData] = useState({ ...initial, adult: !needsAge });
  const [handleState, setHandleState] = useState<{ ok: boolean; reason?: string } | null>(null);
  const [suggestions, setSuggestions] = useState<Suggestions | null>(null);
  const [joined, setJoined] = useState<Set<string>>(new Set());
  const [pending, start] = useTransition();
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (data.handle === initial.handle) return setHandleState({ ok: true });
    const t = setTimeout(() => checkHandleAction(data.handle).then(setHandleState), 300);
    return () => clearTimeout(t);
  }, [data.handle, initial.handle]);

  useEffect(() => {
    if (step === 3 && !suggestions) suggestionsAction(data.interests).then(setSuggestions).catch(() => setSuggestions({ creators: [], communities: [] }));
  }, [step, suggestions, data.interests]);

  const canNext = step === 0 ? !!data.displayName.trim() && handleState?.ok !== false && data.adult : true;

  function save(next: () => void) {
    setError(null);
    start(async () => {
      const r = await callAction(() => finishOnboardingAction(data));
      if (r.ok) next();
      else {
        setError(r.error);
        setStep(0);
      }
    });
  }

  const toggleInterest = (slug: string) =>
    setData((d) => ({ ...d, interests: d.interests.includes(slug) ? d.interests.filter((s) => s !== slug) : [...d.interests, slug] }));

  return (
    <div className="pt-6 lg:pt-12">
      {/* Fortschritt als Masslinie */}
      <ol className="relative mb-12 grid grid-cols-5" aria-label="Fortschritt">
        <span className="absolute inset-x-0 top-[5px] h-px bg-line" aria-hidden />
        <span className="absolute left-0 top-[5px] h-px bg-rule-strong transition-[width] duration-500" style={{ width: `${(step / (STEPS.length - 1)) * 100}%` }} aria-hidden />
        {STEPS.map((s, i) => (
          <li key={s} className="relative" aria-current={i === step ? "step" : undefined}>
            <span className={cn("block size-[11px] border transition-colors rounded-full", i <= step ? "border-moss bg-moss" : "border-line-strong bg-paper")} />
            <span className={cn("mt-3 block spec", i === step && "text-ink")}>
              {pad(i + 1)} <span className="hidden sm:inline">{s}</span>
            </span>
          </li>
        ))}
      </ol>

      <div className="grid gap-12 lg:grid-cols-[1fr_1.2fr]">
        <div>
          {step === 0 && (
            <>
              <h1 className="display text-5xl sm:text-6xl">Schön, dass du da bist.</h1>
              <p className="mt-4 max-w-md text-lg text-ink-2">So erscheinst du in der Community. Alles lässt sich später ändern.</p>
            </>
          )}
          {step === 1 && (
            <>
              <h1 className="display text-5xl sm:text-6xl">Woran arbeitest du gerne?</h1>
              <p className="mt-4 max-w-md text-lg text-ink-2">Wähle so viele Werkstätten, wie du magst. Dein Feed „Für dich“ richtet sich danach.</p>
              <p className="mt-6 font-mono text-sm">{data.interests.length} ausgewählt</p>
            </>
          )}
          {step === 2 && (
            <>
              <h1 className="display text-5xl sm:text-6xl">Ein paar Worte über dich.</h1>
              <p className="mt-4 max-w-md text-lg text-ink-2">Optional – aber Profile mit Bild und Kurzbiografie finden schneller Anschluss.</p>
            </>
          )}
          {step === 3 && (
            <>
              <h1 className="display text-5xl sm:text-6xl">Menschen, die zu dir passen.</h1>
              <p className="mt-4 max-w-md text-lg text-ink-2">Folge ersten Creatorn und tritt Communities bei. Du kannst jederzeit entfolgen.</p>
            </>
          )}
          {step === 4 && (
            <>
              <h1 className="display text-5xl sm:text-6xl">Deine Werkbank ist bereit.</h1>
              <p className="mt-4 max-w-md text-lg text-ink-2">Beginne mit einem einfachen Foto deiner aktuellen Arbeit – oder lege direkt ein Projekt an und dokumentiere es Schritt für Schritt.</p>
            </>
          )}
          {error && <Notice tone="danger" className="mt-6">{error}</Notice>}
        </div>

        <div>
          {step === 0 && (
            <div className="space-y-5">
              <Field label="Anzeigename">{(p) => <Input {...p} value={data.displayName} onChange={(e) => setData({ ...data, displayName: e.target.value })} />}</Field>
              <Field label="Benutzername" error={handleState && !handleState.ok ? handleState.reason : undefined} hint={`werkuno.ch/u/${data.handle}`}>
                {(p) => (
                  <div className="relative">
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted">@</span>
                    <Input {...p} className="pl-7" value={data.handle} onChange={(e) => setData({ ...data, handle: e.target.value.toLowerCase().replace(/[^a-z0-9._]/g, "") })} />
                  </div>
                )}
              </Field>
              {needsAge && <Checkbox checked={data.adult} onChange={(e) => setData({ ...data, adult: e.target.checked })} label="Ich bin mindestens 18 Jahre alt." />}
            </div>
          )}

          {step === 1 && (
            <ul className="grid grid-cols-2 gap-px border border-line bg-line sm:grid-cols-3 rounded-2xl overflow-hidden">
              {listCategories({ activeOnly: true }).filter((c) => c.isActive || data.interests.includes(c.slug)).map((c) => {
                const on = data.interests.includes(c.slug);
                return (
                  <li key={c.slug}>
                    <button
                      type="button"
                      aria-pressed={on}
                      onClick={() => toggleInterest(c.slug)}
                      className={cn("relative flex h-full min-h-28 w-full flex-col justify-between p-4 text-left transition-colors", on ? "bg-moss text-paper" : "bg-paper hover:bg-card")}
                    >
                      <Glyph name={c.glyph} size={28} strokeWidth={1.6} className={on ? "text-paper" : "text-ink"} />
                      <span className="mt-4 text-sm font-semibold leading-tight">{c.name}</span>
                      {on && <Check size={14} className="absolute right-3 top-3" />}
                      {c.focus && !on && <span className="absolute right-3 top-3 font-mono text-[9px] uppercase tracking-[0.12em] text-clay">Start</span>}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          {step === 2 && (
            <div className="space-y-5">
              <div className="flex items-center gap-5">
                <Avatar src={data.avatarUrl} name={data.displayName} size={88} />
                <label className={cn("inline-flex cursor-pointer items-center gap-2 border border-line-strong px-4 py-2.5 text-sm font-semibold hover:border-rule-strong rounded-2xl", uploading && "opacity-50")}>
                  <Camera size={16} /> {uploading ? "Lädt hoch …" : "Profilbild wählen"}
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/heic"
                    className="sr-only"
                    onChange={async (e) => {
                      const f = e.target.files?.[0];
                      if (!f) return;
                      setUploading(true);
                      try {
                        const r = await uploadFile(f);
                        setData((d) => ({ ...d, avatarUrl: r.variants?.sm ?? r.variants?.md ?? null }));
                      } catch (err) {
                        toast(err instanceof Error ? err.message : "Upload fehlgeschlagen", "error");
                      } finally {
                        setUploading(false);
                      }
                    }}
                  />
                </label>
              </div>
              <Field label="Kurzbiografie" optional hint={`${data.bio.length}/300`}>
                {(p) => <Textarea {...p} maxLength={300} value={data.bio} onChange={(e) => setData({ ...data, bio: e.target.value })} placeholder="z. B. Häkle seit drei Wintern, liebe Naturgarne und alte Muster." />}
              </Field>
              <Field label="Region" optional hint="Nur grob, z. B. „Zürich“ oder „Bodensee“ – nie deine Adresse.">
                {(p) => <Input {...p} value={data.region} maxLength={80} onChange={(e) => setData({ ...data, region: e.target.value })} />}
              </Field>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-10">
              <section>
                <p className="spec mb-3 text-ink">Creator</p>
                {!suggestions && <p className="spec">Lade Vorschläge …</p>}
                {suggestions?.creators.length === 0 && <p className="text-sm text-muted">Noch keine passenden Creator – du kannst später auf „Entdecken“ suchen.</p>}
                <ul className="divide-y divide-line border-y border-line">
                  {suggestions?.creators.map((c) => (
                    <li key={c.userId} className="flex items-center gap-4 py-3.5">
                      <Avatar src={c.avatarUrl} name={c.displayName} size={44} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold">{c.displayName}</p>
                        <p className="truncate text-xs text-muted">{c.bio || c.categories.map((s) => categoryBySlug(s)?.short).join(" · ")}</p>
                      </div>
                      <FollowButton userId={c.userId} following={false} size="sm" />
                    </li>
                  ))}
                </ul>
              </section>
              {suggestions && suggestions.communities.length > 0 && (
                <section>
                  <p className="spec mb-3 text-ink">Communities</p>
                  <ul className="grid gap-2 sm:grid-cols-2">
                    {suggestions.communities.map((c) => (
                      <li key={c.id}>
                        <button
                          type="button"
                          aria-pressed={joined.has(c.id)}
                          onClick={async () => {
                            const r = await callAction(() => joinCommunityQuickAction(c.id));
                            if (r.ok && r.data.joined) setJoined((s) => new Set(s).add(c.id));
                          }}
                          className={cn("flex w-full items-center justify-between border px-4 py-3 text-left rounded-2xl", joined.has(c.id) ? "border-moss bg-moss-soft" : "border-line hover:border-rule-strong")}
                        >
                          <span>
                            <span className="block text-sm font-semibold">{c.name}</span>
                            <span className="spec">{c.memberCount} Mitglieder</span>
                          </span>
                          {joined.has(c.id) ? <Check size={16} className="text-moss" /> : <span className="text-xs font-semibold">Beitreten</span>}
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </div>
          )}

          {step === 4 && (
            <div className="grid gap-px border border-line bg-line sm:grid-cols-2 rounded-2xl overflow-hidden">
              {[
                ["/erstellen?typ=beitrag", "Ersten Beitrag teilen", "Ein Foto, ein Gedanke – so einfach wie überall."],
                ["/erstellen?typ=projekt", "Projekt anlegen", "Mit Journal, Materialliste und Status."],
                ["/entdecken", "Erst einmal stöbern", "Projekte, Anleitungen und Creator entdecken."],
                ["/feed", "Zum Feed", "Sehen, was in deinen Werkstätten passiert."],
              ].map(([href, t, b], i) => (
                <button key={href} type="button" onClick={() => router.push(href)} className="group bg-paper p-6 text-left hover:bg-card">
                  <span className="font-mono text-xs text-clay">{pad(i + 1)}</span>
                  <span className="mt-4 flex items-center justify-between text-lg font-semibold">
                    {t} <ArrowRight size={16} className="transition-transform group-hover:translate-x-1" />
                  </span>
                  <span className="mt-1 block text-sm text-muted">{b}</span>
                </button>
              ))}
            </div>
          )}

          <div className="mt-10 flex items-center justify-between border-t border-line pt-6">
            {step > 0 && step < 4 ? (
              <Button variant="ghost" onClick={() => setStep((s) => s - 1)}>
                <ArrowLeft size={16} /> Zurück
              </Button>
            ) : (
              <span />
            )}
            <div className="flex items-center gap-3">
              {step < 4 && (
                <button
                  type="button"
                  className="text-sm text-muted underline-offset-4 hover:text-ink hover:underline"
                  onClick={() =>
                    start(async () => {
                      const r = step === 0 ? await callAction(() => skipOnboardingAction()) : await callAction(() => finishOnboardingAction(data));
                      if (r.ok) router.push("/feed");
                      else setError(r.error);
                    })
                  }
                >
                  Überspringen
                </button>
              )}
              {step < 2 && (
                <Button onClick={() => setStep((s) => s + 1)} disabled={!canNext}>
                  Weiter <ArrowRight size={16} />
                </Button>
              )}
              {step === 2 && (
                <Button disabled={pending || uploading} onClick={() => save(() => setStep(3))}>
                  {pending ? "Speichert …" : "Speichern & weiter"} <ArrowRight size={16} />
                </Button>
              )}
              {step === 3 && (
                <Button onClick={() => setStep(4)}>
                  Fertig <ArrowRight size={16} />
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
