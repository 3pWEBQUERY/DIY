"use client";

import { usePathname } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";

export type LiveCounts = { notifications: number; messages: number; requests: number; cart: number };

const EMPTY: LiveCounts = { notifications: 0, messages: 0, requests: 0, cart: 0 };
const Ctx = createContext<LiveCounts>(EMPTY);
const EVENT = "werkuno:counts";
/** Live-Ereignisse vom Server: detail = { type: "message" | "read" | "counts", c?: Unterhaltungs-ID } */
export const LIVE_EVENT = "werkuno:live";
export type LiveDetail = { type: "message" | "read" | "counts"; c?: string };

const ADJUST = "werkuno:counts-adjust";

/** Zähler sofort lokal anpassen (optimistisch), z. B. beim Anklicken einer ungelesenen Benachrichtigung. */
export function adjustCounts(delta: Partial<LiveCounts>) {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(ADJUST, { detail: delta }));
}

/** Badges sofort neu laden, z. B. nach dem Lesen einer Unterhaltung oder dem Senden. */
export function refreshCounts() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(EVENT));
}

export function useLiveCounts() {
  return useContext(Ctx);
}

/**
 * Hält die Zähler der Navigation aktuell, ohne die Seite neu zu laden: Die Shell bleibt bei
 * Seitenwechseln stehen, deshalb fragt der Client regelmässig nach (alle 15 s im sichtbaren Tab),
 * beim Zurückkehren in den Tab, nach jedem Seitenwechsel und auf Zuruf (`refreshCounts`).
 * Zusätzlich zeigt der Tab-Titel die Zahl ungelesener Nachrichten und Benachrichtigungen.
 */
export function LiveCountsProvider({ initial, enabled, children }: { initial: LiveCounts; enabled: boolean; children: ReactNode }) {
  const [counts, setCounts] = useState<LiveCounts>(initial);
  const pathname = usePathname();
  const inflight = useRef(false);

  const load = useCallback(async () => {
    if (!enabled || inflight.current) return;
    inflight.current = true;
    try {
      const r = await fetch("/api/v1/me/counts", { cache: "no-store", credentials: "same-origin" });
      if (r.ok) {
        const j = (await r.json()) as { data?: LiveCounts };
        if (j.data) setCounts(j.data);
      }
    } catch {
      /* offline – nächster Versuch beim nächsten Intervall */
    } finally {
      inflight.current = false;
    }
  }, [enabled]);

  // Server-Werte übernehmen, wenn die Shell neu gerendert wurde
  useEffect(() => setCounts(initial), [initial]);

  useEffect(() => {
    if (!enabled) return;
    const tick = () => document.visibilityState === "visible" && void load();
    const id = window.setInterval(tick, 15_000);
    const onVis = () => document.visibilityState === "visible" && void load();
    window.addEventListener("focus", onVis);
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener(EVENT, load);
    const onAdjust = (e: Event) => {
      const d = (e as CustomEvent<Partial<LiveCounts>>).detail ?? {};
      setCounts((c) => ({
        notifications: Math.max(0, c.notifications + (d.notifications ?? 0)),
        messages: Math.max(0, c.messages + (d.messages ?? 0)),
        requests: Math.max(0, c.requests + (d.requests ?? 0)),
        cart: Math.max(0, c.cart + (d.cart ?? 0)),
      }));
    };
    window.addEventListener(ADJUST, onAdjust);
    return () => {
      window.removeEventListener(ADJUST, onAdjust);
      window.clearInterval(id);
      window.removeEventListener("focus", onVis);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener(EVENT, load);
    };
  }, [enabled, load]);

  // Echtzeit: ein Server-Sent-Events-Stream pro Tab (Nachrichten, Lesebestätigungen, Zähler)
  useEffect(() => {
    if (!enabled || typeof EventSource === "undefined") return;
    let es: EventSource | null = null;
    let debounce: number | undefined;
    const soon = () => {
      window.clearTimeout(debounce);
      debounce = window.setTimeout(() => void load(), 250);
    };
    const open = () => {
      es = new EventSource("/api/v1/stream");
      const relay = (type: string) => (ev: MessageEvent) => {
        try {
          window.dispatchEvent(new CustomEvent(LIVE_EVENT, { detail: { type, ...JSON.parse(ev.data) } }));
        } catch {}
        soon();
      };
      es.addEventListener("message", relay("message"));
      es.addEventListener("read", relay("read"));
      es.addEventListener("counts", relay("counts"));
    };
    open();
    return () => {
      window.clearTimeout(debounce);
      es?.close();
    };
  }, [enabled, load]);

  // Nach Seitenwechseln (z. B. Gespräch geöffnet → gelesen) kurz verzögert nachladen
  useEffect(() => {
    if (!enabled) return;
    const t = window.setTimeout(() => void load(), 700);
    return () => window.clearTimeout(t);
  }, [pathname, enabled, load]);

  // Tab-Titel: „(3) Startseite · Werkuno“
  useEffect(() => {
    const total = counts.messages + counts.notifications;
    const apply = () => {
      const base = document.title.replace(/^\(\d+\+?\)\s/, "");
      const next = total > 0 ? `(${total > 99 ? "99+" : total}) ${base}` : base;
      if (document.title !== next) document.title = next;
    };
    apply();
    // Next.js ersetzt das <title>-Element beim Seitenwechsel → ganzen <head> beobachten
    const obs = new MutationObserver(apply);
    obs.observe(document.head, { childList: true, subtree: true, characterData: true });
    return () => obs.disconnect();
  }, [counts.messages, counts.notifications, pathname]);

  return <Ctx.Provider value={counts}>{children}</Ctx.Provider>;
}

/** Zahl für Badges (9+ / 99+). */
export function badgeText(n: number, max = 99) {
  return n > max ? `${max}+` : String(n);
}
