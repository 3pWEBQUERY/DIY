"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Flag, RotateCcw } from "lucide-react";
import { SAFETY_LABEL } from "@werkraum/shared";
import type { TutorialStepView } from "@/server/tutorials/service";
import { ReportDialog } from "@/components/social/actions";
import { MediaImage } from "@/components/ui/media";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { cn, formatMinutes, pad } from "@/lib/utils";
import { completeTutorialAction, resetTutorialProgressAction, toggleTutorialStepAction } from "@/app/(app)/anleitungen/actions";

type Props = {
  tutorialId: string;
  steps: TutorialStepView[];
  completedKeys: string[];
  completedAt: string | null;
  signedIn: boolean;
  isOwner: boolean;
  preview: boolean;
  remixHref: string;
};

/**
 * Lesemodus einer Anleitung: Schrittnavigation (sticky) mit Fortschritt,
 * Schritte mit Abhaken, Tipps (Erfahrung) klar getrennt von Sicherheitshinweisen (§11.6).
 */
export function TutorialReader({ tutorialId, steps, completedKeys, completedAt, signedIn, isOwner, preview, remixHref }: Props) {
  const router = useRouter();
  const [done, setDone] = useState<Set<string>>(() => new Set(completedKeys));
  const [completed, setCompleted] = useState(!!completedAt);
  const [active, setActive] = useState(steps[0]?.stableKey ?? "");
  const [reportStep, setReportStep] = useState<string | null>(null);
  const [, start] = useTransition();
  const canTrack = signedIn && !preview;
  const total = steps.length;
  const count = steps.filter((s) => done.has(s.stableKey)).length;
  const pct = total ? Math.round((count / total) * 100) : 0;
  const totalMinutes = useMemo(() => steps.reduce((a, s) => a + (s.minutes ?? 0), 0), [steps]);
  const remaining = useMemo(() => steps.filter((s) => !done.has(s.stableKey)).reduce((a, s) => a + (s.minutes ?? 0), 0), [steps, done]);

  // Aktiven Schritt beim Scrollen verfolgen
  useEffect(() => {
    const els = steps.map((s) => document.getElementById(`schritt-${s.position + 1}`)).filter((x): x is HTMLElement => !!x);
    if (!els.length) return;
    const io = new IntersectionObserver(
      (entries) => {
        const vis = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (vis) setActive(vis.target.getAttribute("data-key") ?? "");
      },
      { rootMargin: "-20% 0px -65% 0px" },
    );
    els.forEach((e) => io.observe(e));
    return () => io.disconnect();
  }, [steps]);

  const toggle = (key: string) => {
    const next = !done.has(key);
    setDone((s) => {
      const n = new Set(s);
      if (next) n.add(key);
      else n.delete(key);
      return n;
    });
    if (!canTrack) {
      if (!signedIn && !preview) toast("Melde dich an, damit dein Fortschritt gespeichert wird.");
      return;
    }
    start(async () => {
      const r = await toggleTutorialStepAction(tutorialId, key, next);
      if (!r.ok) {
        setDone((s) => {
          const n = new Set(s);
          if (next) n.delete(key);
          else n.add(key);
          return n;
        });
        toast(r.error, "error");
      }
    });
  };

  const complete = () => {
    if (!signedIn) return router.push(`/anmelden?weiter=${encodeURIComponent(location.pathname)}`);
    start(async () => {
      const r = await completeTutorialAction(tutorialId);
      if (r.ok) {
        setCompleted(true);
        setDone(new Set(steps.map((s) => s.stableKey)));
        toast(r.message ?? "Als nachgebaut markiert.");
        router.refresh();
      } else toast(r.error, "error");
    });
  };

  const reset = () =>
    start(async () => {
      if (canTrack) {
        const r = await resetTutorialProgressAction(tutorialId);
        if (!r.ok) return toast(r.error, "error");
      }
      setDone(new Set());
    });

  return (
    <div className="grid gap-10 lg:grid-cols-[250px_minmax(0,1fr)] lg:gap-14">
      {/* ───── Schrittnavigation ───── */}
      <nav aria-label="Schritte" className="lg:sticky lg:top-8 lg:h-fit lg:max-h-[calc(100dvh-4rem)] lg:overflow-y-auto lg:pr-2">
        <div className="border-b border-rule pb-3">
          <div className="flex items-baseline justify-between">
            <p className="spec text-ink">Fortschritt</p>
            <p className="font-mono text-[12px] num" aria-live="polite">
              {pad(count)} / {pad(total)}
            </p>
          </div>
          <div className="mt-2 h-[3px] bg-line" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label="Erledigte Schritte">
            <div className="h-full bg-moss transition-[width] duration-500" style={{ width: `${pct}%` }} />
          </div>
          <p className="spec mt-2">
            {completed ? "Nachgebaut" : remaining && count ? `Noch ca. ${formatMinutes(remaining)}` : totalMinutes ? `Gesamt ca. ${formatMinutes(totalMinutes)}` : `${total} Schritte`}
          </p>
        </div>
        <ol className="mt-2 hidden lg:block">
          {steps.map((s) => {
            const isDone = done.has(s.stableKey);
            const isActive = active === s.stableKey;
            return (
              <li key={s.stableKey} className="flex items-start gap-2.5">
                <button
                  type="button"
                  onClick={() => toggle(s.stableKey)}
                  aria-pressed={isDone}
                  aria-label={`Schritt ${s.position + 1} ${isDone ? "als offen markieren" : "als erledigt markieren"}`}
                  className={cn("mt-[9px] grid size-4 shrink-0 place-items-center border transition-colors rounded-2xl", isDone ? "border-moss bg-moss text-paper" : "border-line-strong bg-card hover:border-rule-strong")}
                >
                  {isDone && <Check size={11} strokeWidth={3} />}
                </button>
                <a
                  href={`#schritt-${s.position + 1}`}
                  aria-current={isActive ? "step" : undefined}
                  className={cn("flex min-w-0 flex-1 gap-2 border-l py-2 pl-3 text-[13.5px] leading-snug", isActive ? "border-rule font-semibold text-ink" : "border-line text-muted hover:text-ink", isDone && !isActive && "text-muted line-through decoration-line-strong")}
                >
                  <span className="font-mono text-[11px] num">{pad(s.position + 1)}</span>
                  <span className="min-w-0">{s.title}</span>
                </a>
              </li>
            );
          })}
        </ol>
        <div className="mt-4 hidden gap-2 lg:flex">
          {count > 0 && !completed && (
            <button type="button" onClick={reset} className="inline-flex items-center gap-1.5 text-[12px] text-muted hover:text-ink">
              <RotateCcw size={12} /> Zurücksetzen
            </button>
          )}
        </div>
      </nav>

      {/* ───── Schritte ───── */}
      <div className="min-w-0">
        <ol className="space-y-16">
          {steps.map((s) => {
            const isDone = done.has(s.stableKey);
            return (
              <li key={s.stableKey}>
                <article id={`schritt-${s.position + 1}`} data-key={s.stableKey} aria-labelledby={`st-${s.stableKey}`} className="scroll-mt-24 border-t border-rule pt-6">
                  <header className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-x-5">
                    <span className={cn("display text-[3.4rem] leading-[0.85] num transition-colors", isDone ? "text-moss" : "text-ink")} aria-hidden>
                      {pad(s.position + 1)}
                    </span>
                    <div className="min-w-0">
                      <p className="spec">
                        Schritt {s.position + 1} von {total}
                        {s.minutes ? ` · ${formatMinutes(s.minutes)}` : ""}
                      </p>
                      <h3 id={`st-${s.stableKey}`} className="headline mt-1 text-[1.6rem] text-balance">
                        {s.title}
                      </h3>
                    </div>
                  </header>

                  {s.safety && (
                    <div role="alert" className="mt-6 border border-danger/40 border-l-[3px] border-l-danger bg-danger-soft px-4 py-3 rounded-2xl">
                      <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-danger">Sicherheitshinweis</span>
                        {s.safetyKinds.map((k) => (
                          <span key={k} className="border border-danger/40 px-1.5 font-mono text-[10px] uppercase tracking-[0.06em] text-danger rounded-2xl">
                            {SAFETY_LABEL[k]}
                          </span>
                        ))}
                      </p>
                      <p className="mt-1.5 whitespace-pre-line text-[14.5px] leading-relaxed text-ink">{s.safety}</p>
                    </div>
                  )}
                  {!s.safety && s.safetyKinds.length > 0 && (
                    <p className="mt-5 flex flex-wrap items-center gap-2 text-[12px] text-danger">
                      <span className="font-mono font-semibold uppercase tracking-[0.1em]">Achtung</span>
                      {s.safetyKinds.map((k) => SAFETY_LABEL[k]).join(" · ")}
                    </p>
                  )}

                  {s.media.length > 0 && (
                    <ul className={cn("mt-6 grid gap-2", s.media.length === 1 ? "grid-cols-1" : "grid-cols-2")}>
                      {s.media.map((m, i) => (
                        <li key={m.mediaId}>
                          <figure>
                            <div className="relative overflow-hidden border border-line bg-sunken rounded-2xl" style={{ aspectRatio: s.media.length === 1 ? "16/10" : "4/3" }}>
                              <MediaImage url={m.url} alt={m.alt || `Schritt ${s.position + 1}, Bild ${i + 1}`} className="absolute inset-0" sizes="(min-width: 1024px) 760px, 100vw" />
                            </div>
                            <figcaption className="mt-1.5 flex gap-2 text-[12px] text-muted">
                              <span className="font-mono">Abb. {s.position + 1}.{i + 1}</span>
                              {m.alt && <span className="line-clamp-1">{m.alt}</span>}
                            </figcaption>
                          </figure>
                        </li>
                      ))}
                    </ul>
                  )}

                  {s.body && <div className="prose-werk mt-6 max-w-[66ch] whitespace-pre-line">{s.body}</div>}

                  {(s.materials.length > 0 || s.tools.length > 0) && (
                    <dl className="mt-6 grid max-w-[66ch] gap-3 border-y border-line py-3 sm:grid-cols-2">
                      {s.materials.length > 0 && (
                        <div>
                          <dt className="spec">Material in diesem Schritt</dt>
                          <dd className="mt-1 text-[14px] text-ink-2">{s.materials.join(" · ")}</dd>
                        </div>
                      )}
                      {s.tools.length > 0 && (
                        <div>
                          <dt className="spec">Werkzeug</dt>
                          <dd className="mt-1 text-[14px] text-ink-2">{s.tools.join(" · ")}</dd>
                        </div>
                      )}
                    </dl>
                  )}

                  {s.tip && (
                    <aside className="rounded-2xl mt-6 max-w-[66ch] bg-moss-soft px-4 py-3" aria-label="Tipp">
                      <p className="flex flex-wrap items-baseline gap-x-2">
                        <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-moss-ink">Tipp aus der Werkstatt</span>
                        <span className="text-[11px] text-muted">Erfahrung der Autorin bzw. des Autors</span>
                      </p>
                      <p className="mt-1 whitespace-pre-line text-[14.5px] leading-relaxed text-ink-2">{s.tip}</p>
                    </aside>
                  )}

                  <footer className="mt-6 flex flex-wrap items-center justify-between gap-3">
                    <button
                      type="button"
                      onClick={() => toggle(s.stableKey)}
                      aria-pressed={isDone}
                      className={cn("inline-flex h-10 items-center gap-2.5 border px-4 text-sm font-semibold transition-colors rounded-xl", isDone ? "border-moss bg-moss text-paper" : "border-line-strong bg-card hover:border-rule-strong")}
                    >
                      <span className={cn("grid size-4 place-items-center border rounded-2xl", isDone ? "border-paper" : "border-rule")}>{isDone && <Check size={11} strokeWidth={3} />}</span>
                      {isDone ? "Erledigt" : "Schritt erledigt"}
                    </button>
                    {signedIn && !isOwner && !preview && (
                      <button type="button" onClick={() => setReportStep(s.id)} className="inline-flex items-center gap-1.5 text-[12px] text-muted hover:text-danger">
                        <Flag size={13} /> Schritt melden
                      </button>
                    )}
                  </footer>
                </article>
              </li>
            );
          })}
        </ol>

        {/* Abschluss */}
        <section aria-label="Abschluss" className="mt-16 border border-rule bg-card p-6 sm:p-8 rounded-2xl">
          <p className="spec text-ink">Ende der Anleitung</p>
          <p className="headline mt-2 text-[1.8rem] text-balance">{completed ? "Nachgebaut – stark!" : count === total && total > 0 ? "Alle Schritte erledigt." : "Fertig gebaut?"}</p>
          <p className="mt-2 max-w-[56ch] text-[15px] text-muted">
            {completed
              ? "Zeig, wie dein Stück geworden ist: Lege ein eigenes Projekt an. Es verweist auf das Original."
              : "Markiere die Anleitung als nachgebaut und dokumentiere deine Version als Projekt – mit deinen Abweichungen."}
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            {!completed && !isOwner && !preview && (
              <Button onClick={complete} variant="primary">
                <Check size={15} /> Als nachgebaut markieren
              </Button>
            )}
            {!isOwner && (
              <Link href={remixHref} className="inline-flex h-10 items-center gap-2 border border-line-strong bg-card px-4 text-sm font-semibold hover:border-rule-strong rounded-xl">
                Eigenes Nachbauprojekt erstellen
              </Link>
            )}
          </div>
        </section>
      </div>

      {reportStep && <ReportDialog open onClose={() => setReportStep(null)} targetType="TUTORIAL_STEP" targetId={reportStep} />}
    </div>
  );
}
