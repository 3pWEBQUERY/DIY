"use client";

import { useCallback, useEffect, useId, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Schliessen per Klick auf den Backdrop – aber nur, wenn der Zeiger auch dort gedrückt wurde.
 * Sonst schliesst z. B. eine Textauswahl im Dialog, die über dem Backdrop losgelassen wird.
 */
export function useBackdropDismiss(onDismiss: () => void) {
  const downOnBackdrop = useRef(false);
  return {
    onPointerDown: (e: React.PointerEvent<HTMLElement>) => {
      downOnBackdrop.current = e.target === e.currentTarget;
    },
    onClick: (e: React.MouseEvent<HTMLElement>) => {
      const hit = downOnBackdrop.current && e.target === e.currentTarget;
      downOnBackdrop.current = false;
      if (hit) onDismiss();
    },
  };
}

/** Nativer <dialog>: Fokusfalle, Esc und Backdrop ohne Zusatzbibliothek (§29.4). */
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  className,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descId = useId();
  const backdrop = useBackdropDismiss(onClose);
  // Fokus zurückgeben (WCAG 2.4.3): auch wenn der Dialog nicht geschlossen, sondern ausgehängt wird
  // (`{x && <Dialog open … />}`) – dann greift die Fokus-Rückgabe des nativen <dialog> nicht.
  const returnTo = useRef<{ el: HTMLElement; dialog: HTMLDialogElement } | null>(null);
  const restoreFocus = useCallback(() => {
    const saved = returnTo.current;
    returnTo.current = null;
    if (!saved?.el.isConnected) return;
    const active = document.activeElement;
    // Nur zurückholen, wenn der Fokus im Dialog lag oder verloren ging – nicht, wenn er bewusst woanders hin gewandert ist
    if (active && active !== document.body && !saved.dialog.contains(active)) return;
    saved.el.focus({ preventScroll: true });
  }, []);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      const active = document.activeElement;
      returnTo.current = active instanceof HTMLElement && active !== document.body ? { el: active, dialog: d } : null;
      d.showModal();
    }
    if (!open) {
      if (d.open) d.close();
      restoreFocus();
    }
  }, [open, restoreFocus]);
  useEffect(() => restoreFocus, [restoreFocus]);
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      {...backdrop}
      aria-labelledby={titleId}
      aria-describedby={description ? descId : undefined}
      className={cn(
        "m-auto w-[min(100vw-2rem,32rem)] max-h-[min(90dvh,48rem)] overflow-hidden rounded-3xl border border-line bg-card p-0 text-ink open:animate-rise",
        wide && "w-[min(100vw-2rem,48rem)]",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-4 border-b border-line px-6 py-4">
        <div>
          <h2 id={titleId} className="headline text-xl">
            {title}
          </h2>
          {description && (
            <p id={descId} className="mt-1 text-sm text-muted">
              {description}
            </p>
          )}
        </div>
        <button onClick={onClose} className="-mr-2 grid size-9 place-items-center hover:bg-sunken rounded-xl" aria-label="Schliessen">
          <X size={18} />
        </button>
      </div>
      <div className="overflow-y-auto px-6 py-5">{open && children}</div>
    </dialog>
  );
}
