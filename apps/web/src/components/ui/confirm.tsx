"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Eigener Bestätigungsdialog statt window.confirm (das je nach Browser/OS anders aussieht und
 * auf Mobilgeräten wie eine Systemwarnung wirkt).
 *
 *   if (!(await confirmDialog("Datei endgültig löschen? Das kann nicht rückgängig gemacht werden."))) return;
 *
 * Ein Text „Frage? Erläuterung“ wird automatisch in Titel und Erläuterung geteilt; die
 * Schaltfläche heisst nach dem Verb der Frage („… löschen?“ → „Löschen“).
 */

export type ConfirmOptions = {
  title: string;
  body?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** danger: rote Schaltfläche (Löschen, Blockieren …); wird bei solchen Verben automatisch gesetzt */
  tone?: "danger" | "default";
};

type Request = ConfirmOptions & { id: number; resolve: (ok: boolean) => void };

const DANGER = /^(löschen|entfernen|blockieren|erstatten|verlassen|beenden|sperren|kündigen|verwerfen|zurückziehen)$/i;

export function parseConfirm(input: string | ConfirmOptions): Required<Omit<ConfirmOptions, "body">> & { body?: string } {
  const o: ConfirmOptions = typeof input === "string" ? splitQuestion(input) : input;
  const verb = o.title.replace(/[?!.…\s]+$/, "").split(/\s+/).at(-1) ?? "";
  const label = o.confirmLabel ?? (/^[a-zäöü]+en$/i.test(verb) ? verb[0]!.toUpperCase() + verb.slice(1) : "Bestätigen");
  return {
    title: o.title,
    body: o.body,
    confirmLabel: label,
    cancelLabel: o.cancelLabel ?? "Abbrechen",
    tone: o.tone ?? (DANGER.test(label) || /endgültig/i.test(o.title) ? "danger" : "default"),
  };
}

function splitQuestion(text: string): ConfirmOptions {
  const i = text.indexOf("? ");
  if (i === -1) return { title: text };
  return { title: text.slice(0, i + 1), body: text.slice(i + 2).trim() || undefined };
}

const listeners = new Set<(r: Request) => void>();
let seq = 0;

export function confirmDialog(input: string | ConfirmOptions): Promise<boolean> {
  if (!listeners.size) {
    // Kein Host eingebunden (sollte nicht vorkommen) → nie stillschweigend bestätigen
    const o = parseConfirm(input);
    return Promise.resolve(window.confirm([o.title, o.body].filter(Boolean).join("\n\n")));
  }
  return new Promise((resolve) => {
    const r: Request = { ...parseConfirm(input), id: ++seq, resolve };
    listeners.forEach((l) => l(r));
  });
}

/** Einmal im Root-Layout eingebunden. */
export function ConfirmHost() {
  const [queue, setQueue] = useState<Request[]>([]);
  const ref = useRef<HTMLDialogElement>(null);
  const current = queue[0];

  useEffect(() => {
    const on = (r: Request) => setQueue((q) => [...q, r]);
    listeners.add(on);
    return () => void listeners.delete(on);
  }, []);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (current && !d.open) d.showModal();
    if (!current && d.open) d.close();
  }, [current]);

  const answer = (ok: boolean) => {
    if (!current) return;
    current.resolve(ok);
    setQueue((q) => q.slice(1));
  };

  return (
    <dialog
      ref={ref}
      onCancel={(e) => {
        e.preventDefault();
        answer(false);
      }}
      onClick={(e) => e.target === ref.current && answer(false)}
      aria-labelledby="confirm-title"
      aria-describedby={current?.body ? "confirm-body" : undefined}
      className="m-auto w-[min(100vw-2rem,26rem)] rounded-3xl border border-line bg-card p-0 text-ink open:animate-rise"
    >
      {current && (
        <div className="p-6">
          <div className="flex gap-4">
            {current.tone === "danger" && (
              <span className="grid size-10 shrink-0 place-items-center rounded-full bg-danger/10 text-danger" aria-hidden>
                <AlertTriangle size={19} strokeWidth={1.8} />
              </span>
            )}
            <div className="min-w-0 pt-0.5">
              <h2 id="confirm-title" className="text-[17px] font-semibold leading-snug">
                {current.title}
              </h2>
              {current.body && (
                <p id="confirm-body" className="mt-1.5 text-[14px] leading-relaxed text-muted">
                  {current.body}
                </p>
              )}
            </div>
          </div>
          <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={() => answer(false)} autoFocus>
              {current.cancelLabel}
            </Button>
            <Button variant={current.tone === "danger" ? "danger" : "primary"} onClick={() => answer(true)} className={cn("sm:min-w-28")}>
              {current.confirmLabel}
            </Button>
          </div>
        </div>
      )}
    </dialog>
  );
}
