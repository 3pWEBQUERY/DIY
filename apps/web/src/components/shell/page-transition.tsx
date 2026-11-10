"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { ViewTransition, useEffect, useRef, useState, type ReactNode } from "react";
import { NAV_START_EVENT } from "@/lib/nav-progress";

/**
 * Seitenwechsel ohne „Neuladen“-Gefühl: Navigation, Seitenleiste und Kopf bleiben stehen,
 * nur der Inhalt blendet weich über (View Transitions API, React <ViewTransition>).
 * Der Schlüssel ist der Pfad – Aktualisierungen innerhalb einer Seite (Likes, Filter,
 * router.refresh) animieren deshalb nicht.
 */
export function PageTransition({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  return (
    <ViewTransition key={pathname} name="page" share="page" enter="page" default="none">
      <div>{children}</div>
    </ViewTransition>
  );
}

/**
 * Dezente Ladeleiste am oberen Rand, solange eine Navigation läuft. Erscheint erst nach
 * kurzer Verzögerung – schnelle (vorab geladene) Wechsel bleiben völlig ruhig.
 */
export function NavProgress() {
  const pathname = usePathname();
  const search = useSearchParams();
  const [state, setState] = useState<"idle" | "loading" | "done">("idle");
  const safety = useRef<ReturnType<typeof setTimeout>>(undefined);
  const first = useRef(true);

  useEffect(() => {
    // Navigationen meldet der Router selbst (instrumentation-client.ts → onRouterTransitionStart). Ein
    // eigener Klick-Listener sähe dagegen auch abgebrochene Klicks (preventDefault), Modifikatortasten,
    // target="_blank" oder Links auf die aktuelle Seite – die Leiste bliebe dann bis zu 12 s stehen.
    const onNav = () => start();
    // Native GET-Formulare mit action laden die Zielseite (z. B. Suche ohne JS-Handler)
    const onSubmit = (e: SubmitEvent) => {
      if (e.defaultPrevented) return;
      const f = e.target as HTMLFormElement;
      if (f.target && f.target !== "_self") return;
      if ((f.getAttribute("method") ?? "get").toLowerCase() === "get" && f.getAttribute("action") != null) start();
    };
    function start() {
      setState("loading");
      clearTimeout(safety.current);
      safety.current = setTimeout(() => setState("done"), 12000);
    }
    window.addEventListener(NAV_START_EVENT, onNav);
    document.addEventListener("submit", onSubmit);
    return () => {
      window.removeEventListener(NAV_START_EVENT, onNav);
      document.removeEventListener("submit", onSubmit);
    };
  }, []);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    clearTimeout(safety.current);
    setState((s) => (s === "loading" ? "done" : s));
  }, [pathname, search]);

  useEffect(() => {
    if (state !== "done") return;
    const t = setTimeout(() => setState("idle"), 420);
    return () => clearTimeout(t);
  }, [state]);

  return (
    <div aria-hidden className="pointer-events-none fixed inset-x-0 top-0 z-[140] h-[2.5px]">
      <div
        data-state={state}
        className="h-full origin-left bg-moss opacity-0 data-[state=done]:opacity-0 data-[state=loading]:opacity-100 data-[state=loading]:[transition:transform_8s_cubic-bezier(0.1,0.7,0.2,1),opacity_0.2s_ease_0.15s] data-[state=done]:[transition:transform_0.25s_ease-out,opacity_0.3s_ease_0.15s] data-[state=done]:scale-x-100 data-[state=idle]:scale-x-0 data-[state=loading]:scale-x-[0.86]"
        style={{ boxShadow: "0 0 10px rgb(182 75 58 / 0.45)" }}
      />
    </div>
  );
}
