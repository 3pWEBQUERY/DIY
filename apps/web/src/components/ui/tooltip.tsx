"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

/**
 * Werkuno-Tooltip: eigene UI statt `title`-Attribut. Erscheint bei Hover (mit kurzer
 * Verzögerung) und bei Tastaturfokus, rechts vom Element – ideal für die eingeklappte Rail.
 * Nach dem ersten Tooltip öffnen weitere sofort („Warm-up“), wie in nativen Apps.
 */
let warmUntil = 0;

export function Tip({
  content,
  disabled,
  className,
  children,
  side = "right",
}: {
  content: ReactNode;
  disabled?: boolean;
  className?: string;
  children: ReactNode;
  side?: "right" | "top";
}) {
  const ref = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);

  const show = useCallback(() => {
    if (disabled) return;
    clearTimeout(timer.current);
    const open = () => {
      const r = ref.current?.getBoundingClientRect();
      if (!r) return;
      setPos(side === "right" ? { x: r.right + 12, y: r.top + r.height / 2 } : { x: r.left + r.width / 2, y: r.top - 10 });
    };
    if (Date.now() < warmUntil) open();
    else timer.current = setTimeout(open, 280);
  }, [disabled, side]);

  const hide = useCallback(() => {
    clearTimeout(timer.current);
    setPos((p) => {
      if (p) warmUntil = Date.now() + 500;
      return null;
    });
  }, []);

  useEffect(() => {
    if (disabled) hide();
  }, [disabled, hide]);
  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => {
    if (!pos) return;
    const off = () => hide();
    window.addEventListener("scroll", off, true);
    return () => window.removeEventListener("scroll", off, true);
  }, [pos, hide]);

  return (
    <div
      ref={ref}
      className={className}
      onPointerEnter={(e) => e.pointerType === "mouse" && show()}
      onPointerLeave={hide}
      onFocus={(e) => e.target.matches(":focus-visible") && show()}
      onBlur={hide}
      onKeyDown={(e) => e.key === "Escape" && hide()}
      onClick={hide}
    >
      {children}
      {pos &&
        createPortal(
          <div
            role="tooltip"
            style={{ left: pos.x, top: pos.y }}
            className={cn(
              "pointer-events-none fixed z-[130]",
              side === "right" ? "-translate-y-1/2" : "-translate-x-1/2 -translate-y-full",
            )}
          >
            <div
              className={cn(
                "relative rounded-xl bg-ink px-3 py-2 text-paper shadow-float",
                side === "right" ? "animate-[tip-x_0.18s_var(--ease-out-quint)_both]" : "animate-pop",
              )}
            >
              <span
                aria-hidden
                className={cn(
                  "absolute size-2.5 rotate-45 rounded-[2px] bg-ink",
                  side === "right" ? "-left-1 top-1/2 -translate-y-1/2" : "-bottom-1 left-1/2 -translate-x-1/2",
                )}
              />
              <div className="relative">{content}</div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
