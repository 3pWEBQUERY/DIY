"use client";

import { useEffect, useRef, useState } from "react";
import { RefreshCw, X } from "lucide-react";

/**
 * Erkennt neue Versionen (nach einem Deploy) und bietet dezent das Neuladen an – bevor eine
 * veraltete Seite beim Speichern scheitert. Geprüft wird beim Zurückkehren in den Tab und
 * alle 10 Minuten.
 */
export function VersionWatcher() {
  const base = useRef<string | null | undefined>(undefined);
  const [outdated, setOutdated] = useState(false);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    let stop = false;
    const check = async () => {
      if (stop || document.visibilityState !== "visible") return;
      try {
        const r = await fetch("/api/v1/version", { cache: "no-store" });
        if (!r.ok) return;
        const { release } = (await r.json()) as { release: string | null };
        if (!release) return;
        if (base.current === undefined) base.current = release;
        else if (base.current !== release) setOutdated(true);
      } catch {}
    };
    void check();
    const t = setInterval(check, 10 * 60_000);
    document.addEventListener("visibilitychange", check);
    return () => {
      stop = true;
      clearInterval(t);
      document.removeEventListener("visibilitychange", check);
    };
  }, []);

  if (!outdated || hidden) return null;
  return (
    <div role="status" className="fixed bottom-20 left-1/2 z-[85] flex -translate-x-1/2 items-center gap-1 rounded-2xl border border-line bg-card py-1.5 pl-4 pr-1.5 text-[13.5px] shadow-[0_8px_30px_rgb(0_0_0/0.10)] animate-rise md:bottom-6 md:left-6 md:translate-x-0">
      <span className="mr-2">Neue Version verfügbar</span>
      <button type="button" onClick={() => location.reload()} className="inline-flex h-8 items-center gap-1.5 rounded-xl bg-moss px-3 font-semibold text-paper hover:bg-moss-ink">
        <RefreshCw size={13} aria-hidden /> Neu laden
      </button>
      <button type="button" onClick={() => setHidden(true)} className="grid size-8 place-items-center rounded-xl text-muted hover:bg-sunken hover:text-ink" aria-label="Hinweis schliessen">
        <X size={15} />
      </button>
    </div>
  );
}
