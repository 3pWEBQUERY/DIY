"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Smartphone, X } from "lucide-react";
import { cn } from "@/lib/utils";

const DISMISS_KEY = "werkuno.iosBetaHint.closed";

/** iPhone (oder iPad) – TestFlight gibt es nur dort. iPadOS meldet sich als Mac mit Touch. */
function isAppleMobile() {
  const ua = navigator.userAgent;
  return /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

/**
 * Hinweis auf die iOS-Beta (TestFlight). Erscheint nur auf iPhones und nur, solange in Admin →
 * Systemkonfiguration ein TestFlight-Link gesetzt ist (sonst rendert die Seite die Komponente gar nicht).
 * - `card`: Karte oben im Feed, schliessbar
 * - `chip`: kleine Pille auf dem dunklen Willkommensbildschirm
 */
export function IosBetaHint({ variant }: { variant: "card" | "chip" }) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    let closed = false;
    try {
      closed = window.localStorage.getItem(DISMISS_KEY) === "1";
    } catch {}
    setShow(isAppleMobile() && (variant === "chip" || !closed));
  }, [variant]);

  if (!show) return null;

  if (variant === "chip") {
    return (
      <Link
        href="/beta"
        className="inline-flex items-center gap-2 rounded-full border border-white/25 bg-black/30 py-1.5 pl-2 pr-3 text-[13px] font-semibold text-white backdrop-blur-md active:scale-[0.97]"
      >
        <span className="rounded-full bg-[#e2bd84] px-1.5 py-0.5 text-[10.5px] font-bold uppercase tracking-wide text-[#0d1626]">Beta</span>
        iPhone-App jetzt testen
      </Link>
    );
  }

  return (
    <div className={cn("relative mb-6 flex items-center gap-4 overflow-hidden rounded-2xl border border-line bg-card p-4 pr-12")}>
      <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-ink text-paper">
        <Smartphone size={20} strokeWidth={1.8} aria-hidden />
      </span>
      <div className="min-w-0">
        <p className="text-[15px] font-bold text-ink">Teste die iPhone-App vor allen anderen</p>
        <p className="text-[13.5px] text-muted">Beta über TestFlight – deine Rückmeldung fliesst direkt in die App.</p>
        <Link href="/beta" className="mt-1.5 inline-block text-[14px] font-semibold text-moss underline-offset-2 hover:underline">
          So machst du mit →
        </Link>
      </div>
      <button
        type="button"
        aria-label="Hinweis schliessen"
        onClick={() => {
          setShow(false);
          try {
            window.localStorage.setItem(DISMISS_KEY, "1");
          } catch {}
        }}
        className="absolute right-2 top-2 grid size-9 place-items-center rounded-full text-muted hover:bg-sunken hover:text-ink"
      >
        <X size={16} aria-hidden />
      </button>
    </div>
  );
}
