"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

type ToastItem = { id: number; text: string; tone: "ok" | "error" };
const listeners = new Set<(t: ToastItem) => void>();
let seq = 0;

/** Minimaler, barrierefreier Toast (role=status, aria-live). */
export function toast(text: string, tone: "ok" | "error" = "ok") {
  const t = { id: ++seq, text, tone };
  listeners.forEach((l) => l(t));
}

export function Toaster() {
  const [items, setItems] = useState<ToastItem[]>([]);
  useEffect(() => {
    const on = (t: ToastItem) => {
      setItems((s) => [...s.slice(-2), t]);
      setTimeout(() => setItems((s) => s.filter((x) => x.id !== t.id)), 4200);
    };
    listeners.add(on);
    return () => void listeners.delete(on);
  }, []);
  return (
    <div aria-live="polite" role="status" className="pointer-events-none fixed inset-x-0 bottom-20 z-[90] flex flex-col items-center gap-2 px-4 md:bottom-6">
      {items.map((t) => (
        <div
          key={t.id}
          className={cn(
            "pointer-events-auto flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-medium animate-rise",
            t.tone === "ok" ? "bg-moss text-paper" : "bg-danger text-paper",
          )}
        >
          <span className={cn("size-1.5 rounded-full", t.tone === "ok" ? "bg-moss-soft" : "bg-paper")} />
          {t.text}
        </div>
      ))}
    </div>
  );
}
