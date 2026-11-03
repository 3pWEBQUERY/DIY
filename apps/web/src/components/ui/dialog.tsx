"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

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
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      aria-labelledby="dlg-title"
      className={cn(
        "m-auto w-[min(100vw-2rem,32rem)] max-h-[min(90dvh,48rem)] border border-ink bg-card p-0 text-ink open:animate-rise",
        wide && "w-[min(100vw-2rem,48rem)]",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-4 border-b border-line px-6 py-4">
        <div>
          <h2 id="dlg-title" className="headline text-xl">
            {title}
          </h2>
          {description && <p className="mt-1 text-sm text-muted">{description}</p>}
        </div>
        <button onClick={onClose} className="-mr-2 grid size-9 place-items-center hover:bg-sunken" aria-label="Schliessen">
          <X size={18} />
        </button>
      </div>
      <div className="overflow-y-auto px-6 py-5">{open && children}</div>
    </dialog>
  );
}
