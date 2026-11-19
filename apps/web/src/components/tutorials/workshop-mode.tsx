"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { ArrowLeft, ArrowRight, Check, Minus, Plus, Sun, SunDim, Timer, X } from "lucide-react";
import { SAFETY_LABEL } from "@werkraum/shared";
import type { TutorialStepView } from "@/server/tutorials/service";
import { completeTutorialAction, toggleTutorialStepAction } from "@/app/(app)/anleitungen/actions";
import { callAction } from "@/lib/use-action";
import { toast } from "@/components/ui/toast";
import { cn, formatMinutes, pad } from "@/lib/utils";

type Line = { name: string; quantity: string; note: string };

type Props = {
  tutorial: { id: string; title: string; href: string; materials: Line[]; tools: Line[] };
  steps: TutorialStepView[];
  completedKeys: string[];
  completedAt: string | null;
  signedIn: boolean;
  preview: boolean;
};

const SIZES = [
  { body: "text-[18px]", title: "text-[1.75rem]" },
  { body: "text-[21px]", title: "text-[2.1rem]" },
  { body: "text-[25px]", title: "text-[2.5rem]" },
] as const;
const TIMER_PRESETS = [1, 5, 10, 15, 30, 60];

function store<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v == null ? fallback : (JSON.parse(v) as T);
  } catch {
    return fallback;
  }
}
function save(key: string, v: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(v));
  } catch {
    /* privater Modus: dann eben ohne Merken */
  }
}

/** Drei kurze Töne, wenn der Timer abläuft (ohne Audiodatei) */
function beep() {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    [0, 0.35, 0.7].forEach((t) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = 880;
      g.gain.setValueAtTime(0.0001, ctx.currentTime + t);
      g.gain.exponentialRampToValueAtTime(0.4, ctx.currentTime + t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + t + 0.25);
      o.connect(g).connect(ctx.destination);
      o.start(ctx.currentTime + t);
      o.stop(ctx.currentTime + t + 0.3);
    });
    setTimeout(() => ctx.close(), 1500);
  } catch {
    /* ohne Ton */
  }
  navigator.vibrate?.([300, 150, 300, 150, 300]);
}

function fmtClock(ms: number) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h ? `${h}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
}

/**
 * Werkstatt-Modus: ein Schritt pro Bildschirm, grosse Schrift, Bildschirm bleibt an (Wake Lock),
 * Timer für Leim- und Trocknungszeiten, Bedienung mit Pfeiltasten, Leertaste oder Wischen.
 * Fortschritt wie in der Anleitung (angemeldet: auf dem Konto, sonst in diesem Browser).
 */
export function WorkshopMode({ tutorial, steps, completedKeys, completedAt, signedIn, preview }: Props) {
  const hasPrep = tutorial.materials.length > 0 || tutorial.tools.length > 0;
  // Seiten: [Bereitlegen?] + Schritte + Abschluss
  const pages = (hasPrep ? 1 : 0) + steps.length + 1;
  const localKey = `wr-werkstatt-${tutorial.id}`;
  const canTrack = signedIn && !preview;

  const [index, setIndex] = useState(0);
  const [done, setDone] = useState<Set<string>>(() => new Set(completedKeys));
  const doneRef = useRef(done);
  doneRef.current = done;
  const [ready, setReady] = useState<Set<string>>(new Set());
  const [completed, setCompleted] = useState(!!completedAt);
  const [size, setSize] = useState(1);
  const [wake, setWake] = useState<"on" | "off" | "unsupported">("off");
  const [timer, setTimer] = useState<{ endsAt: number; total: number; label: string } | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [timerOpen, setTimerOpen] = useState(false);
  const [ringing, setRinging] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [, start] = useTransition();
  const lockRef = useRef<{ release: () => Promise<void> } | null>(null);
  const touch = useRef<{ x: number; y: number } | null>(null);
  const live = useRef<HTMLParagraphElement>(null);

  // Gemerktes aus dem Browser: Stelle, Schriftgrösse, Bereitgelegtes, laufender Timer, Fortschritt ohne Konto
  useEffect(() => {
    const s = store<{ index?: number; size?: number; ready?: string[]; done?: string[]; timer?: { endsAt: number; total: number; label: string } | null }>(localKey, {});
    if (typeof s.index === "number") setIndex(Math.min(Math.max(s.index, 0), pages - 1));
    if (typeof s.size === "number") setSize(Math.min(Math.max(s.size, 0), SIZES.length - 1));
    if (s.ready) setReady(new Set(s.ready));
    if (!canTrack && s.done) setDone(new Set(s.done));
    if (s.timer && s.timer.endsAt > Date.now()) setTimer(s.timer);
    setLoaded(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    // Erst nach dem Laden speichern – sonst überschreibt der Anfangszustand das Gemerkte
    if (loaded) save(localKey, { index, size, ready: [...ready], done: canTrack ? undefined : [...done], timer });
  }, [loaded, localKey, index, size, ready, done, timer, canTrack]);

  // Bildschirm anlassen
  const acquire = useCallback(async () => {
    const wl = (navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void>; addEventListener: (e: string, f: () => void) => void }> } }).wakeLock;
    if (!wl) return setWake("unsupported");
    try {
      const lock = await wl.request("screen");
      lockRef.current = lock;
      lock.addEventListener("release", () => {
        if (lockRef.current === lock) setWake("off");
      });
      setWake("on");
    } catch {
      setWake("off");
    }
  }, []);
  useEffect(() => {
    void acquire();
    const onVis = () => document.visibilityState === "visible" && wake !== "unsupported" && lockRef.current == null && void acquire();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      void lockRef.current?.release();
      lockRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const toggleWake = async () => {
    if (wake === "on") {
      const l = lockRef.current;
      lockRef.current = null;
      await l?.release();
      setWake("off");
    } else await acquire();
  };

  // Timer
  useEffect(() => {
    if (!timer) return;
    const id = setInterval(() => {
      const t = Date.now();
      setNow(t);
      if (t >= timer.endsAt) {
        setTimer(null);
        setRinging(true);
        beep();
      }
    }, 250);
    return () => clearInterval(id);
  }, [timer]);
  const startTimer = (minutes: number, label: string) => {
    const ms = Math.round(minutes * 60_000);
    setTimer({ endsAt: Date.now() + ms, total: ms, label });
    setNow(Date.now());
    setTimerOpen(false);
    setRinging(false);
  };

  const stepAt = (i: number) => steps[i - (hasPrep ? 1 : 0)] ?? null;
  const step = stepAt(index);
  const isPrep = hasPrep && index === 0;
  const isEnd = index === pages - 1;
  const doneCount = steps.filter((s) => done.has(s.stableKey)).length;
  const pct = steps.length ? Math.round((doneCount / steps.length) * 100) : 0;
  const remaining = useMemo(() => steps.filter((s) => !done.has(s.stableKey)).reduce((a, s) => a + (s.minutes ?? 0), 0), [steps, done]);

  const go = useCallback((i: number) => {
    setIndex(Math.min(Math.max(i, 0), pages - 1));
    window.scrollTo({ top: 0 });
  }, [pages]);

  const setStepDone = (key: string, value: boolean) => {
    if (doneRef.current.has(key) === value) return;
    setDone((s) => {
      const n = new Set(s);
      if (value) n.add(key);
      else n.delete(key);
      return n;
    });
    if (!canTrack) return;
    start(async () => {
      const r = await callAction(() => toggleTutorialStepAction(tutorial.id, key, value));
      if (!r.ok) {
        setDone((s) => {
          const n = new Set(s);
          if (value) n.delete(key);
          else n.add(key);
          return n;
        });
        toast(r.error, "error");
      }
    });
  };

  const next = useCallback(() => {
    const s = stepAt(index);
    if (s) setStepDone(s.stableKey, true);
    go(index + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, go]);
  const prev = useCallback(() => go(index - 1), [go, index]);

  // Tastatur
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target;
      if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement) return;
      // Leertaste/Enter lösen auf Knöpfen und Links deren eigene Aktion aus – Pfeile gelten immer
      if ((e.key === " " || e.key === "Enter") && t instanceof HTMLElement && t.closest("button, a")) return;
      if (e.key === "ArrowRight" || e.key === " " || e.key === "Enter") {
        e.preventDefault();
        if (!isEnd) next();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        prev();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [next, prev, isEnd]);

  // Ansage für Bildschirmleser
  useEffect(() => {
    if (live.current) live.current.textContent = isPrep ? "Bereitlegen" : isEnd ? "Geschafft" : step ? `Schritt ${step.position + 1} von ${steps.length}: ${step.title}` : "";
  }, [index, isPrep, isEnd, step, steps.length]);

  const complete = () =>
    start(async () => {
      if (!signedIn) {
        window.location.href = `/anmelden?weiter=${encodeURIComponent(tutorial.href)}`;
        return;
      }
      const r = await callAction(() => completeTutorialAction(tutorial.id));
      if (r.ok) {
        setCompleted(true);
        setDone(new Set(steps.map((s) => s.stableKey)));
        toast(r.message ?? "Als nachgebaut markiert.");
      } else toast(r.error, "error");
    });

  const sz = SIZES[size]!;
  const left = timer ? timer.endsAt - now : 0;

  return (
    <div
      className="flex min-h-dvh flex-col bg-paper text-ink"
      onTouchStart={(e) => (touch.current = { x: e.touches[0]!.clientX, y: e.touches[0]!.clientY })}
      onTouchEnd={(e) => {
        const t0 = touch.current;
        touch.current = null;
        if (!t0) return;
        const dx = e.changedTouches[0]!.clientX - t0.x;
        const dy = e.changedTouches[0]!.clientY - t0.y;
        if (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 1.6) {
          if (dx < 0 && !isEnd) next();
          else if (dx > 0) prev();
        }
      }}
    >
      <p ref={live} className="sr-only" aria-live="polite" />

      {/* Kopf */}
      <header className="sticky top-0 z-20 border-b border-line bg-paper/95 backdrop-blur-sm">
        <div className="mx-auto flex max-w-[900px] items-center gap-2 px-3 py-2 sm:px-5">
          <Link href={tutorial.href} aria-label="Werkstatt-Modus beenden" className="grid size-11 shrink-0 place-items-center rounded-full hover:bg-sunken">
            <X size={22} aria-hidden />
          </Link>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-semibold">{tutorial.title}</p>
            <p className="font-mono text-[11px] text-muted num">
              {pad(doneCount)} / {pad(steps.length)} erledigt{remaining ? ` · noch ca. ${formatMinutes(remaining)}` : ""}
            </p>
          </div>
          {timer && (
            <button type="button" onClick={() => setTimerOpen(true)} className="flex h-11 items-center gap-1.5 rounded-full bg-ink px-4 font-mono text-[15px] font-semibold text-paper num" aria-label={`Timer ${timer.label}: noch ${fmtClock(left)}`}>
              <Timer size={16} aria-hidden /> {fmtClock(left)}
            </button>
          )}
          <button type="button" onClick={() => setTimerOpen((o) => !o)} aria-expanded={timerOpen} aria-label="Timer" title="Timer" className={cn("grid size-11 place-items-center rounded-full hover:bg-sunken", timer && "hidden sm:grid")}>
            <Timer size={20} aria-hidden />
          </button>
          <div className="hidden items-center sm:flex" role="group" aria-label="Schriftgrösse">
            <button type="button" onClick={() => setSize((s) => Math.max(0, s - 1))} disabled={size === 0} aria-label="Schrift kleiner" className="grid size-11 place-items-center rounded-full hover:bg-sunken disabled:opacity-35">
              <Minus size={18} aria-hidden />
            </button>
            <span className="text-[13px] font-semibold" aria-hidden>Aa</span>
            <button type="button" onClick={() => setSize((s) => Math.min(SIZES.length - 1, s + 1))} disabled={size === SIZES.length - 1} aria-label="Schrift grösser" className="grid size-11 place-items-center rounded-full hover:bg-sunken disabled:opacity-35">
              <Plus size={18} aria-hidden />
            </button>
          </div>
          {wake !== "unsupported" && (
            <button
              type="button"
              onClick={toggleWake}
              aria-pressed={wake === "on"}
              aria-label={wake === "on" ? "Bildschirm bleibt an – ausschalten" : "Bildschirm anlassen"}
              title={wake === "on" ? "Bildschirm bleibt an" : "Bildschirm darf ausgehen"}
              className={cn("grid size-11 place-items-center rounded-full", wake === "on" ? "bg-moss-soft text-moss-ink" : "hover:bg-sunken")}
            >
              {wake === "on" ? <Sun size={20} aria-hidden /> : <SunDim size={20} aria-hidden />}
            </button>
          )}
        </div>
        <div className="h-[3px] bg-line" role="progressbar" aria-label="Erledigte Schritte" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
          <div className="h-full bg-moss transition-[width] duration-500" style={{ width: `${pct}%` }} />
        </div>

        {/* Timer-Auswahl */}
        {timerOpen && (
          <div className="mx-auto max-w-[900px] border-t border-line px-3 py-3 sm:px-5">
            <div className="flex flex-wrap items-center gap-2">
              {step?.minutes ? (
                <button type="button" onClick={() => startTimer(step.minutes!, `Schritt ${step.position + 1}`)} className="h-11 rounded-full bg-ink px-4 text-[14px] font-semibold text-paper">
                  {formatMinutes(step.minutes)} für diesen Schritt
                </button>
              ) : null}
              {TIMER_PRESETS.map((m) => (
                <button key={m} type="button" onClick={() => startTimer(m, `${m} min`)} className="h-11 rounded-full border border-line-strong px-4 text-[14px] font-semibold hover:border-ink">
                  {m} min
                </button>
              ))}
              <form
                className="flex items-center gap-1.5"
                onSubmit={(e) => {
                  e.preventDefault();
                  const v = Number(new FormData(e.currentTarget).get("min"));
                  if (v > 0 && v <= 24 * 60) startTimer(v, `${v} min`);
                }}
              >
                <label className="sr-only" htmlFor="ws-min">Eigene Minuten</label>
                <input id="ws-min" name="min" type="number" min={1} max={1440} placeholder="Min." className="h-11 w-20 rounded-full border border-line-strong bg-card px-3 text-[14px]" />
                <button type="submit" className="h-11 rounded-full border border-line-strong px-4 text-[14px] font-semibold hover:border-ink">Start</button>
              </form>
              {timer && (
                <button type="button" onClick={() => (setTimer(null), setTimerOpen(false))} className="h-11 rounded-full px-4 text-[14px] font-semibold text-danger hover:bg-danger-soft">
                  Timer stoppen
                </button>
              )}
            </div>
            <p className="mt-2 text-[12.5px] text-muted">Läuft weiter, auch wenn du die Schritte wechselst. Am Ende piept und vibriert das Gerät, solange diese Seite offen ist.</p>
          </div>
        )}
      </header>

      {ringing && (
        <div role="alert" className="mx-auto mt-3 flex w-[min(900px,calc(100%-1.5rem))] items-center gap-3 rounded-2xl bg-ink px-5 py-4 text-paper">
          <Timer size={22} aria-hidden />
          <p className="flex-1 text-[17px] font-semibold">Zeit ist um.</p>
          <button type="button" onClick={() => setRinging(false)} className="h-11 rounded-full bg-paper px-5 text-[14px] font-semibold text-ink">OK</button>
        </div>
      )}

      {/* Inhalt */}
      <main className="mx-auto w-full max-w-[900px] flex-1 px-4 pb-36 pt-6 sm:px-6">
        {isPrep && (
          <section aria-labelledby="ws-prep">
            <p className="spec">Vor dem Start</p>
            <h1 id="ws-prep" className={cn("headline mt-1", sz.title)}>Alles bereitlegen</h1>
            <p className={cn("mt-2 text-ink-2", sz.body)}>Hake ab, was griffbereit liegt.</p>
            {[["Material", tutorial.materials], ["Werkzeug", tutorial.tools]].map(([label, list]) =>
              (list as Line[]).length ? (
                <div key={label as string} className="mt-6">
                  <p className="spec mb-1">{label as string}</p>
                  <ul className="border-t border-line">
                    {(list as Line[]).map((m, i) => {
                      const k = `${label}:${m.name}:${i}`;
                      const on = ready.has(k);
                      return (
                        <li key={k} className="border-b border-line">
                          <button
                            type="button"
                            role="checkbox"
                            aria-checked={on}
                            onClick={() => setReady((s) => { const n = new Set(s); if (on) n.delete(k); else n.add(k); return n; })}
                            className={cn("flex min-h-14 w-full items-center gap-4 py-2 text-left", sz.body)}
                          >
                            <span className={cn("grid size-7 shrink-0 place-items-center rounded-lg border-2", on ? "border-moss bg-moss text-paper" : "border-line-strong")}>
                              {on && <Check size={18} strokeWidth={3} aria-hidden />}
                            </span>
                            <span className={cn("min-w-0 flex-1", on && "text-muted line-through decoration-line-strong")}>
                              <b className="font-semibold">{m.name}</b>
                              {m.note && <span className="text-muted"> · {m.note}</span>}
                            </span>
                            {m.quantity && <span className="shrink-0 text-ink-2 num">{m.quantity}</span>}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ) : null,
            )}
          </section>
        )}

        {step && (
          <article aria-labelledby="ws-step">
            <p className="spec">
              Schritt {step.position + 1} von {steps.length}
              {step.minutes ? ` · ca. ${formatMinutes(step.minutes)}` : ""}
              {done.has(step.stableKey) ? " · erledigt" : ""}
            </p>
            <h1 id="ws-step" className={cn("headline mt-1 text-balance", sz.title)}>
              <span className="mr-3 text-muted num">{pad(step.position + 1)}</span>
              {step.title}
            </h1>
            {step.safety && (
              <div role="note" className="mt-5 rounded-2xl border border-danger/40 border-l-[4px] border-l-danger bg-danger-soft px-5 py-4">
                <p className="font-mono text-[12px] font-semibold uppercase tracking-[0.1em] text-danger">
                  Sicherheit{step.safetyKinds.length ? ` · ${step.safetyKinds.map((k) => SAFETY_LABEL[k]).join(", ")}` : ""}
                </p>
                <p className={cn("mt-1 whitespace-pre-line leading-relaxed", sz.body)}>{step.safety}</p>
              </div>
            )}
            {step.media.length > 0 && (
              <div className={cn("mt-5 grid gap-3", step.media.length > 1 && "sm:grid-cols-2")}>
                {step.media.map((m, i) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={m.mediaId} src={m.url!} alt={m.alt || `Schritt ${step.position + 1}, Bild ${i + 1}`} className="max-h-[52vh] w-full rounded-2xl border border-line bg-card object-contain" />
                ))}
              </div>
            )}
            {step.body && <p className={cn("mt-5 max-w-[60ch] whitespace-pre-line leading-relaxed", sz.body)}>{step.body}</p>}
            {step.tip && (
              <div className="mt-5 rounded-2xl border-l-[4px] border-moss bg-moss-soft px-5 py-4">
                <p className="font-mono text-[12px] font-semibold uppercase tracking-[0.1em] text-moss-ink">Tipp</p>
                <p className={cn("mt-1 whitespace-pre-line leading-relaxed text-ink-2", sz.body)}>{step.tip}</p>
              </div>
            )}
            {(step.materials.length > 0 || step.tools.length > 0) && (
              <p className="mt-5 text-[15px] text-muted">
                {step.materials.length > 0 && <>Material: {step.materials.join(", ")}</>}
                {step.materials.length > 0 && step.tools.length > 0 && " · "}
                {step.tools.length > 0 && <>Werkzeug: {step.tools.join(", ")}</>}
              </p>
            )}
            {step.minutes && !timer ? (
              <button type="button" onClick={() => startTimer(step.minutes!, `Schritt ${step.position + 1}`)} className="mt-6 inline-flex h-12 items-center gap-2 rounded-full border border-line-strong px-5 text-[15px] font-semibold hover:border-ink">
                <Timer size={18} aria-hidden /> Timer {formatMinutes(step.minutes)} starten
              </button>
            ) : null}
          </article>
        )}

        {isEnd && (
          <section aria-labelledby="ws-end" className="pt-6 text-center">
            <span className="mx-auto grid size-16 place-items-center rounded-full bg-moss text-paper">
              <Check size={32} strokeWidth={3} aria-hidden />
            </span>
            <h1 id="ws-end" className={cn("headline mt-4", sz.title)}>{completed ? "Nachgebaut!" : "Alle Schritte durch"}</h1>
            <p className={cn("mx-auto mt-2 max-w-[44ch] text-ink-2", sz.body)}>
              {doneCount} von {steps.length} Schritten erledigt. {completed ? "Zeig dein Ergebnis als Projekt." : "Markiere die Anleitung als nachgebaut, damit andere sehen, dass sie funktioniert."}
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              {!completed && !preview && (
                <button type="button" onClick={complete} className="h-14 rounded-full bg-ink px-7 text-[16px] font-semibold text-paper">
                  {signedIn ? "Als nachgebaut markieren" : "Anmelden und markieren"}
                </button>
              )}
              <Link href={tutorial.href} className="inline-flex h-14 items-center rounded-full border border-line-strong px-7 text-[16px] font-semibold hover:border-ink">
                Zurück zur Anleitung
              </Link>
            </div>
            {!signedIn && <p className="mt-4 text-[14px] text-muted">Dein Fortschritt ist nur in diesem Browser gespeichert.</p>}
          </section>
        )}
      </main>

      {/* Bedienleiste */}
      <nav aria-label="Schritte wechseln" className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-paper/95 backdrop-blur-sm safe-bottom">
        <div className="mx-auto flex max-w-[900px] items-center gap-3 px-3 py-3 sm:px-5">
          <button type="button" onClick={prev} disabled={index === 0} className="inline-flex h-16 min-w-16 items-center justify-center gap-2 rounded-2xl border border-line-strong px-5 text-[16px] font-semibold disabled:opacity-35">
            <ArrowLeft size={22} aria-hidden /> <span className="hidden sm:inline">Zurück</span>
          </button>
          <span className="flex-1 text-center font-mono text-[13px] text-muted num" aria-hidden>
            {pad(index + 1)} / {pad(pages)}
          </span>
          {!isEnd && (
            <button type="button" onClick={next} className="inline-flex h-16 items-center justify-center gap-2 rounded-2xl bg-ink px-6 text-[17px] font-semibold text-paper">
              {step ? (done.has(step.stableKey) ? "Weiter" : "Erledigt – weiter") : "Los geht's"} <ArrowRight size={22} aria-hidden />
            </button>
          )}
          {isEnd && step == null && index > 0 && (
            <button type="button" onClick={() => go(hasPrep ? 1 : 0)} className="inline-flex h-16 items-center rounded-2xl border border-line-strong px-5 text-[15px] font-semibold">
              Von vorne
            </button>
          )}
        </div>
      </nav>
    </div>
  );
}
