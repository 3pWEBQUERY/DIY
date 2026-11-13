"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Wordmark } from "@/components/shell/wordmark";
import { cn } from "@/lib/utils";

/**
 * Mobile Startseite wie der Willkommensbildschirm der iOS-App (AuthFlowView): Faden-Story in vier Kapiteln
 * mit derselben Three.js-Szene, darunter Konto erstellen, Apple und „Erst einmal umsehen“.
 * Nur unter md sichtbar; die 3D-Szene wird nur auf schmalen Bildschirmen geladen.
 */
const CHAPTERS = [
  { kicker: "01 · Entdecken", title: "Ein Faden.", text: "Alles beginnt mit einer Idee – und mit Menschen, die zeigen, wie sie entsteht.", spec: ["Baumwollgarn", "300 g", "Nadel 4 mm"] },
  { kicker: "02 · Erschaffen", title: "Schicht für Schicht.", text: "Dokumentiere dein Projekt im Journal – mit Fortschritt, Problemen und Lösungen.", spec: ["Steinzeug", "Ø 18 cm", "34 Wülste"] },
  { kicker: "03 · Teilen", title: "Zum Nachbauen.", text: "Aus Projekten werden Anleitungen, Materiallisten und Nachbauten anderer.", spec: ["Eiche massiv", "Sitzhöhe 45 cm", "4 Beine"] },
  { kicker: "04 · Gemeinsam wachsen", title: "Viele Projekte.", text: "Der Projektfaden verbindet Beiträge, Anleitungen, Shops und Communities.", spec: ["1 Projekt", "5 Verbindungen", "∞ Nachbauten"] },
];

const AUTOPLAY_MS = 4600;

export function MobileWelcome({ apple, pinterest }: { apple: boolean; pinterest: boolean }) {
  const [chapter, setChapter] = useState(0);
  const [autoplay, setAutoplay] = useState(true);
  const [show3d, setShow3d] = useState(false);
  const track = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLIFrameElement>(null);

  // 3D nur auf schmalen Bildschirmen laden (auf dem Desktop ist dieser Bereich ausgeblendet)
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const on = () => setShow3d(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);

  const send = useCallback((progress: number) => {
    frame.current?.contentWindow?.postMessage({ wr: true, progress }, window.location.origin);
  }, []);

  const goTo = useCallback((i: number, smooth = true) => {
    const el = track.current;
    if (!el) return;
    el.scrollTo({ left: i * el.clientWidth, behavior: smooth && !window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "smooth" : "auto" });
  }, []);

  // Kapitel → Faden formt sich um
  useEffect(() => send(chapter), [chapter, send]);

  // Story läuft von selbst, bis jemand wischt oder tippt
  useEffect(() => {
    if (!autoplay) return;
    const t = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      setChapter((c) => {
        const next = (c + 1) % CHAPTERS.length;
        goTo(next);
        return next;
      });
    }, AUTOPLAY_MS);
    return () => window.clearInterval(t);
  }, [autoplay, goTo]);

  return (
    <section aria-label="Willkommen bei Werkuno" className="relative flex min-h-[100svh] flex-col overflow-hidden bg-paper md:hidden">
      {/* Punktraster wie in der App */}
      <div aria-hidden className="pointer-events-none absolute inset-0 opacity-60 [background-image:radial-gradient(var(--color-line-strong)_1px,transparent_1px)] [background-size:18px_18px]" />

      <header className="relative flex items-center justify-between px-5 pt-[max(env(safe-area-inset-top),12px)]">
        <Link href="/" aria-label="Werkuno – Startseite">
          <Wordmark height={24} />
        </Link>
        <Link href="/anmelden" className="rounded-full border border-line-strong bg-card/70 px-4 py-2 text-[14px] font-semibold text-ink shadow-xs backdrop-blur-md active:scale-[0.97]">
          Anmelden
        </Link>
      </header>

      <div className="relative mt-1 h-[min(46svh,360px)] w-full" aria-hidden>
        {show3d && (
          <iframe
            ref={frame}
            src="/three/story.html"
            title="Faden-Animation"
            tabIndex={-1}
            className="size-full border-0 bg-transparent"
            onLoad={() => send(chapter)}
          />
        )}
      </div>

      <div
        ref={track}
        className="relative flex snap-x snap-mandatory overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        onPointerDown={() => setAutoplay(false)}
        onScroll={(e) => {
          const el = e.currentTarget;
          const i = Math.round(el.scrollLeft / Math.max(1, el.clientWidth));
          if (i !== chapter && i >= 0 && i < CHAPTERS.length) setChapter(i);
        }}
        aria-roledescription="Karussell"
        aria-label="Die Werkuno-Geschichte"
      >
        {CHAPTERS.map((c, i) => (
          <article key={c.kicker} className="w-full shrink-0 snap-start px-5" aria-roledescription="Kapitel" aria-label={`${i + 1} von ${CHAPTERS.length}`} aria-hidden={i !== chapter}>
            <p className="spec text-moss">{c.kicker}</p>
            <h2 className="display mt-2 text-[38px] leading-[1.05] text-ink">{c.title}</h2>
            <p className="mt-2.5 text-[16px] leading-relaxed text-ink-2">{c.text}</p>
            <ul className="mt-3 flex flex-wrap gap-2">
              {c.spec.map((s) => (
                <li key={s} className="spec rounded-full border border-line px-2 py-1 text-muted">
                  {s}
                </li>
              ))}
            </ul>
          </article>
        ))}
      </div>

      <div className="relative flex justify-center py-3">
        <div className="flex items-center gap-1.5 rounded-full border border-line bg-card/70 px-3 py-2.5 backdrop-blur-md">
          {CHAPTERS.map((c, i) => (
            <button
              key={c.kicker}
              type="button"
              aria-label={`Kapitel ${i + 1}: ${c.title}`}
              aria-current={i === chapter}
              onClick={() => {
                setAutoplay(false);
                setChapter(i);
                goTo(i);
              }}
              className={cn("h-[7px] rounded-full transition-all duration-300", i === chapter ? "w-[26px] bg-ink" : "w-[7px] bg-line-strong")}
            />
          ))}
        </div>
      </div>

      <div className="flex-1" />

      <div className="relative space-y-2.5 px-5 pb-[max(env(safe-area-inset-bottom),14px)]">
        <Link href="/registrieren" className="flex h-[50px] w-full items-center justify-center rounded-full bg-moss text-[16px] font-semibold text-paper shadow-sm active:scale-[0.98]">
          Konto erstellen – kostenlos
        </Link>
        {apple && (
          <a href="/api/auth/apple" className="flex h-[50px] w-full items-center justify-center gap-2 rounded-full bg-ink text-[16px] font-semibold text-paper active:scale-[0.98]">
            <svg width="15" height="18" viewBox="0 0 16 19" aria-hidden fill="currentColor">
              <path d="M13.2 10.1c0-2.4 2-3.5 2-3.6-1.1-1.6-2.8-1.8-3.4-1.8-1.4-.1-2.8.9-3.5.9-.7 0-1.9-.9-3.1-.8C3.6 4.8 2.1 5.7 1.3 7.2c-1.7 2.9-.4 7.2 1.2 9.6.8 1.2 1.7 2.4 3 2.4 1.2 0 1.6-.8 3.1-.8 1.4 0 1.8.8 3.1.8 1.3 0 2.1-1.2 2.9-2.3.9-1.3 1.3-2.6 1.3-2.7 0 0-2.6-1-2.7-4.1zM10.8 3c.6-.8 1.1-1.9 1-3-1 0-2.1.6-2.8 1.4-.6.7-1.1 1.8-1 2.9 1.1.1 2.1-.5 2.8-1.3z" />
            </svg>
            Mit Apple fortfahren
          </a>
        )}
        {pinterest && (
          <a href="/api/auth/pinterest" className="flex h-[50px] w-full items-center justify-center rounded-full bg-[#BD081C] text-[16px] font-semibold text-white active:scale-[0.98]">
            Mit Pinterest fortfahren
          </a>
        )}
        <a href="#neu" className="block py-1.5 text-center text-[15px] font-semibold text-moss">
          Erst einmal umsehen
        </a>
        <p className="text-center text-[11.5px] leading-snug text-muted">
          Ab 18 Jahren. Mit der Registrierung akzeptierst du die{" "}
          <Link href="/rechtliches/agb" className="underline underline-offset-2">Nutzungsbedingungen</Link> und die{" "}
          <Link href="/rechtliches/datenschutz" className="underline underline-offset-2">Datenschutzerklärung</Link>.
        </p>
      </div>
    </section>
  );
}
