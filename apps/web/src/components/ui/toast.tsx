"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

type ToastItem = { id: number; text: string; tone: "ok" | "error" };
const listeners = new Set<(t: ToastItem) => void>();
let seq = 0;

/** Minimaler, barrierefreier Toast (role=status, aria-live). */
export function toast(text: string, tone: "ok" | "error" = "ok") {
  const t = { id: ++seq, text, tone };
  listeners.forEach((l) => l(t));
}

/** Anzeigedauer: 5 s plus 60 ms je Zeichen, höchstens 10 s – längere Texte bleiben länger stehen. */
export function toastDuration(text: string) {
  return Math.min(10_000, 5_000 + text.length * 60);
}

/** Oberster offener modaler Dialog – sonst body. Alles ausserhalb wäre inert (nicht sicht-/vorlesbar). */
function topHost(): HTMLElement {
  const modals = Array.from(document.querySelectorAll<HTMLDialogElement>("dialog[open]")).filter((d) => {
    try {
      return d.matches(":modal");
    } catch {
      return false;
    }
  });
  return modals.at(-1) ?? document.body;
}

/** Region in den obersten Dialog verschieben und als Popover über alle Top-Layer-Elemente heben. */
function raise(region: HTMLElement, visible: boolean) {
  const host = topHost();
  const moved = region.parentElement !== host;
  if (moved) host.append(region);
  if (typeof region.showPopover !== "function") return;
  try {
    const isOpen = region.matches(":popover-open");
    if (!visible) {
      if (isOpen) region.hidePopover();
      return;
    }
    // Erneut zeigen = ganz nach oben im Top-Layer (über später geöffnete Dialoge/Popover)
    if (isOpen) region.hidePopover();
    region.showPopover();
  } catch {
    /* ältere Browser: bleibt fixed mit hohem z-index */
  }
}

export function Toaster() {
  const [items, setItems] = useState<ToastItem[]>([]);
  const [region, setRegion] = useState<HTMLDivElement | null>(null);
  const visible = useRef(false);
  visible.current = items.length > 0;

  // Live-Region einmalig anlegen (muss vor dem ersten Toast im DOM stehen, damit er angesagt wird)
  useEffect(() => {
    const el = document.createElement("div");
    el.setAttribute("role", "status");
    el.setAttribute("aria-live", "polite");
    el.setAttribute("popover", "manual");
    el.className = "pointer-events-none fixed inset-x-0 top-auto bottom-20 z-[90] m-0 block h-auto w-auto max-w-none overflow-visible border-0 bg-transparent p-0 md:bottom-6";
    document.body.append(el);
    setRegion(el);
    // Öffnet/schliesst sich ein modaler Dialog, zieht die Region mit
    const mo = new MutationObserver(() => raise(el, visible.current));
    mo.observe(document.body, { subtree: true, attributes: true, attributeFilter: ["open"] });
    raise(el, false);
    return () => {
      mo.disconnect();
      el.remove();
    };
  }, []);

  useEffect(() => {
    if (!region) return;
    const on = (t: ToastItem) => {
      raise(region, true);
      setItems((s) => [...s.slice(-2), t]);
    };
    listeners.add(on);
    return () => void listeners.delete(on);
  }, [region]);

  useEffect(() => {
    if (region && !items.length) raise(region, false);
  }, [region, items.length]);

  const dismiss = useCallback((id: number) => setItems((s) => s.filter((x) => x.id !== id)), []);

  if (!region) return null;
  return createPortal(
    <div className="flex flex-col items-center gap-2 px-4">
      {items.map((t) => (
        <ToastCard key={t.id} item={t} onDone={dismiss} />
      ))}
    </div>,
    region,
  );
}

/** Ein Toast; der Timer pausiert, solange der Zeiger darüber liegt oder er den Fokus hat. */
function ToastCard({ item, onDone }: { item: ToastItem; onDone: (id: number) => void }) {
  const [hover, setHover] = useState(false);
  const [focus, setFocus] = useState(false);
  const remaining = useRef(toastDuration(item.text));
  const paused = hover || focus;

  useEffect(() => {
    if (paused) return;
    const started = Date.now();
    const t = setTimeout(() => onDone(item.id), remaining.current);
    return () => {
      clearTimeout(t);
      remaining.current = Math.max(1_000, remaining.current - (Date.now() - started));
    };
  }, [paused, item.id, onDone]);

  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onFocus={() => setFocus(true)}
      onBlur={() => setFocus(false)}
      className={cn(
        "pointer-events-auto flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-medium animate-rise",
        item.tone === "ok" ? "bg-moss text-paper" : "bg-danger text-paper",
      )}
    >
      <span className={cn("size-1.5 shrink-0 rounded-full", item.tone === "ok" ? "bg-moss-soft" : "bg-paper")} />
      {item.text}
    </div>
  );
}
