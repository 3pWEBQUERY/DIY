"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { Download, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BRAND } from "@/config/brand";

/**
 * Installierbare Web-App (v. a. Android): Service Worker registrieren, das Installationsangebot des
 * Browsers (`beforeinstallprompt`) abfangen und als eigenen Knopf anbieten. Auf iOS gibt es die
 * native App (Smart App Banner im Layout), dort erscheint hier nichts.
 */

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

let deferred: InstallEvent | null = null;
let installed = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}
const canInstall = () => !!deferred && !installed;

/** Einmal im Root-Layout: registriert den Service Worker und merkt sich das Installationsangebot. */
export function PwaRegistrar() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      const register = () => navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {});
      if (document.readyState === "complete") register();
      else window.addEventListener("load", register, { once: true });
    }
    const onPrompt = (e: Event) => {
      e.preventDefault(); // eigenes Angebot statt Mini-Infoleiste des Browsers
      deferred = e as InstallEvent;
      emit();
    };
    const onInstalled = () => {
      installed = true;
      deferred = null;
      emit();
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);
  return null;
}

/** Kann die App gerade installiert werden? Und die Aktion dazu. */
export function useInstallPrompt() {
  const available = useSyncExternalStore(subscribe, canInstall, () => false);
  const install = async () => {
    const e = deferred;
    if (!e) return false;
    deferred = null; // das Angebot gilt nur einmal
    emit();
    await e.prompt();
    const choice = await e.userChoice.catch(() => ({ outcome: "dismissed" as const }));
    return choice.outcome === "accepted";
  };
  return { available, install };
}

const DISMISS_KEY = "werkuno.install.dismissed";
const DISMISS_DAYS = 30;

function dismissedRecently() {
  try {
    const t = Number(window.localStorage.getItem(DISMISS_KEY) ?? 0);
    return t > 0 && Date.now() - t < DISMISS_DAYS * 86_400_000;
  } catch {
    return false;
  }
}

/** Hinweis auf dem Handy: „Werkuno als App installieren“ – nur wenn der Browser es anbietet. */
export function InstallBanner() {
  const { available, install } = useInstallPrompt();
  const [hidden, setHidden] = useState(true);
  useEffect(() => setHidden(dismissedRecently()), []);
  if (!available || hidden) return null;
  const dismiss = () => {
    setHidden(true);
    try {
      window.localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {}
  };
  return (
    <div role="region" aria-label="App installieren" className="border-b border-line bg-card px-4 py-3 md:hidden">
      <div className="mx-auto flex max-w-[660px] items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/werkuno-icon-192.png" alt="" width={40} height={40} className="size-10 shrink-0 rounded-xl" />
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-semibold leading-tight">{BRAND.name} als App</p>
          <p className="text-[12.5px] leading-snug text-muted">Auf dem Startbildschirm, mit Benachrichtigungen.</p>
        </div>
        <Button size="sm" onClick={() => void install()}>
          <Download size={14} aria-hidden /> Installieren
        </Button>
        <button type="button" onClick={dismiss} aria-label="Hinweis ausblenden" className="-mr-1 grid size-9 shrink-0 place-items-center rounded-xl text-muted hover:bg-sunken hover:text-ink">
          <X size={16} aria-hidden />
        </button>
      </div>
    </div>
  );
}

/** Eintrag im Mehr-Menü / in den Einstellungen – erscheint nur, wenn installierbar. */
export function InstallAppButton({ className, onDone }: { className?: string; onDone?: () => void }) {
  const { available, install } = useInstallPrompt();
  if (!available) return null;
  return (
    <button
      type="button"
      onClick={() => void install().then(() => onDone?.())}
      className={className ?? "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[15px] hover:bg-sunken"}
    >
      <Download size={18} aria-hidden /> App installieren
    </button>
  );
}
