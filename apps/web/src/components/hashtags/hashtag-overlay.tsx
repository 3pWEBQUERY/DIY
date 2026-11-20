"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { useBackdropDismiss } from "@/components/ui/dialog";

/**
 * Hashtag-Ansicht als Fenster über der aktuellen Seite (abgefangene Route `/hashtag/…`).
 * Schliessen (×, Esc, Klick daneben, Zurück im Browser) führt zur Seite zurück, von der aus der
 * Hashtag geöffnet wurde – mit unveränderter Scrollposition.
 */
export function HashtagOverlay({ title, children }: { title: string; children: ReactNode }) {
  const router = useRouter();
  const ref = useRef<HTMLDialogElement>(null);
  const close = () => router.back();
  const backdrop = useBackdropDismiss(close);

  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
    // Seite dahinter nicht mitscrollen
    const html = document.documentElement;
    const prev = html.style.overflow;
    html.style.overflow = "hidden";
    return () => {
      html.style.overflow = prev;
    };
  }, []);

  return (
    <dialog
      ref={ref}
      aria-label={title}
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
      {...backdrop}
      className="m-0 h-dvh max-h-none w-full max-w-none overflow-hidden bg-paper p-0 text-ink backdrop:bg-ink/45 open:animate-rise sm:m-auto sm:h-[min(92dvh,62rem)] sm:w-[min(100vw-3rem,68rem)] sm:rounded-3xl sm:border sm:border-line"
    >
      <div className="flex h-full flex-col">
        <div className="flex shrink-0 items-center justify-between border-b border-line px-5 py-3 sm:px-8">
          <p className="spec truncate">{title}</p>
          <button type="button" onClick={close} className="-mr-2 grid size-10 place-items-center rounded-xl hover:bg-sunken" aria-label="Schliessen">
            <X size={20} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-12 pt-6 sm:px-10 sm:pt-8">{children}</div>
      </div>
    </dialog>
  );
}
