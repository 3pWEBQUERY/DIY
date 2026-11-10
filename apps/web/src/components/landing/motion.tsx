"use client";

import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Pause, Play } from "lucide-react";
import { cn } from "@/lib/utils";

/** Bewegung nur, wenn weder das System noch die Werkuno-Einstellung sie reduziert. */
function motionAllowed() {
  return !window.matchMedia("(prefers-reduced-motion: reduce)").matches && !document.querySelector("[data-reduce-motion]");
}

const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/**
 * Scroll-Reveal für alle Elemente mit `data-reveal` innerhalb der Seite.
 * Serverseitig ist alles sichtbar (ohne JS, für Suchmaschinen und bei reduzierter Bewegung).
 * Erst hier werden Elemente unterhalb des Viewports versteckt und beim Erreichen eingeblendet –
 * nur über opacity/transform, also ohne Layout-Verschiebung.
 */
export function RevealObserver() {
  useIsoLayoutEffect(() => {
    if (!motionAllowed() || !("IntersectionObserver" in window)) return;
    const els = Array.from(document.querySelectorAll<HTMLElement>("[data-reveal]"));
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          (e.target as HTMLElement).dataset.reveal = "in";
          io.unobserve(e.target);
        }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.12 },
    );
    for (const el of els) {
      if (el.getBoundingClientRect().top < window.innerHeight * 0.92) continue; // bereits sichtbar: nicht verstecken
      el.dataset.reveal = "hidden";
      io.observe(el);
    }
    return () => io.disconnect();
  }, []);
  return null;
}

/**
 * Zählt eine Kennzahl beim ersten Erscheinen hoch. Der Endwert steht serverseitig im HTML
 * und für Screenreader immer fest; die Animation ist rein visuell (tabellarische Ziffern → kein Springen).
 */
export function CountUp({ value, className }: { value: number; className?: string }) {
  const fmt = (n: number) => new Intl.NumberFormat("de-CH").format(n);
  const [shown, setShown] = useState(value);
  const ref = useRef<HTMLSpanElement>(null);

  useIsoLayoutEffect(() => {
    const el = ref.current;
    if (!el || value <= 0 || !motionAllowed() || !("IntersectionObserver" in window)) return;
    setShown(0);
    let raf = 0;
    const io = new IntersectionObserver(
      ([e]) => {
        if (!e?.isIntersecting) return;
        io.disconnect();
        const start = performance.now();
        const dur = Math.min(1600, 700 + value * 8);
        const tick = (t: number) => {
          const p = Math.min(1, (t - start) / dur);
          setShown(Math.round(value * (1 - Math.pow(1 - p, 4))));
          if (p < 1) raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
      },
      { threshold: 0.6 },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [value]);

  return (
    <span ref={ref} className={cn("num", className)}>
      <span aria-hidden>{fmt(shown)}</span>
      <span className="sr-only">{fmt(value)}</span>
    </span>
  );
}

const MarqueeCtx = createContext(false);

/**
 * Gruppe von Laufbändern mit gemeinsamem Pause-Knopf (WCAG 2.2.2: automatisch bewegte Inhalte
 * lassen sich anhalten). Bänder pausieren zusätzlich bei Hover und Tastaturfokus.
 */
export function MarqueeGroup({ children, label, className }: { children: ReactNode; label: string; className?: string }) {
  const [paused, setPaused] = useState(false);
  return (
    <MarqueeCtx.Provider value={paused}>
      <div className={cn("relative", className)}>
        <div className="mx-auto flex max-w-[1240px] justify-end px-5 sm:px-8 motion-reduce:hidden">
          <button
            type="button"
            onClick={() => setPaused((p) => !p)}
            aria-pressed={paused}
            className="inline-flex h-8 items-center gap-1.5 rounded-full border border-line-strong bg-card px-3 text-[12px] font-semibold text-muted shadow-xs transition-colors hover:border-rule-strong hover:text-ink"
          >
            {paused ? <Play size={12} aria-hidden /> : <Pause size={12} aria-hidden />}
            {paused ? "Abspielen" : "Anhalten"}
            <span className="sr-only">: {label}</span>
          </button>
        </div>
        {children}
      </div>
    </MarqueeCtx.Provider>
  );
}

/**
 * Laufband: zeigt die Kinder zweimal hintereinander und verschiebt sie endlos (reines CSS).
 * Bei reduzierter Bewegung: kein Autoplay, sondern eine normal scrollbare Reihe.
 */
export function Marquee({ children, label, duration = 60, reverse, className }: { children: ReactNode; label: string; duration?: number; reverse?: boolean; className?: string }) {
  const paused = useContext(MarqueeCtx);
  return (
    <div className={cn("marquee", className)} data-paused={paused ? "" : undefined} role="region" aria-label={label}>
      <div className="marquee-track py-3" style={{ ["--marquee-duration" as string]: `${duration}s`, animationDirection: reverse ? "reverse" : undefined }}>
        <div className="flex shrink-0 gap-[var(--marquee-gap)]">{children}</div>
        {/* Zweite Hälfte nur fürs nahtlose Band: für Screenreader und Tastatur unsichtbar */}
        <div className="flex shrink-0 gap-[var(--marquee-gap)]" aria-hidden="true" inert>
          {children}
        </div>
      </div>
    </div>
  );
}
