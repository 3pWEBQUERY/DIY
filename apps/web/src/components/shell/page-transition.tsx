"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { ViewTransition, useEffect, useRef, useState, type ReactNode } from "react";

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
    const onClick = (e: MouseEvent) => {
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
      const url = new URL(a.href, location.href);
      if (url.origin !== location.origin) return;
      if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/media/")) return;
      if (url.pathname === location.pathname && url.search === location.search) return; // nur Anker / gleiche Seite
      start();
    };
    const onSubmit = (e: SubmitEvent) => {
      const f = e.target as HTMLFormElement;
      if ((f.getAttribute("method") ?? "get").toLowerCase() === "get" && f.getAttribute("action") != null) start();
    };
    function start() {
      setState("loading");
      clearTimeout(safety.current);
      safety.current = setTimeout(() => setState("done"), 12000);
    }
    document.addEventListener("click", onClick);
    document.addEventListener("submit", onSubmit);
    return () => {
      document.removeEventListener("click", onClick);
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
