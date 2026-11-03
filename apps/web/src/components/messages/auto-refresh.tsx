"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Einfaches Polling der Unterhaltungsliste (kein WebSocket nötig, §16). Pausiert in Hintergrund-Tabs. */
export function AutoRefresh({ interval = 8000 }: { interval?: number }) {
  const router = useRouter();
  useEffect(() => {
    const tick = () => document.visibilityState === "visible" && router.refresh();
    const t = setInterval(tick, interval);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [router, interval]);
  return null;
}
