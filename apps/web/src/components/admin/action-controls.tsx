"use client";

import { confirmDialog } from "@/components/ui/confirm";
import { useState, type ReactNode } from "react";
import type { ActionResult } from "@/server/errors";
import { useAction } from "@/lib/use-action";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Textarea, Select } from "@/components/ui/field";

type Variant = "primary" | "ink" | "outline" | "ghost" | "clay" | "danger";

/** Direkte Aktion mit optionaler Bestätigung (z. B. Hervorheben, Freigeben). */
export function ActionButton({
  action,
  label,
  variant = "outline",
  confirm,
  success,
  size = "sm",
  className,
}: {
  action: () => Promise<ActionResult<unknown>>;
  label: ReactNode;
  variant?: Variant;
  confirm?: string;
  success?: string;
  size?: "sm" | "md";
  className?: string;
}) {
  const { run, pending } = useAction(action, { success });
  return (
    <Button
      size={size}
      variant={variant}
      className={className}
      disabled={pending}
      aria-busy={pending}
      onClick={async () => {
        if (confirm && !(await confirmDialog(confirm))) return;
        run();
      }}
    >
      {label}
    </Button>
  );
}

export type ReasonInput = { reason: string; publicNote?: string; days?: number | null; choice?: string };

/**
 * Aktion mit Pflichtbegründung im Dialog (Sperren, Ausblenden, Rollen …).
 * Begründungen landen im Audit-Protokoll; `publicNote` sieht die betroffene Person.
 */
export function ReasonButton({
  action,
  label,
  title,
  description,
  confirmLabel = "Bestätigen",
  variant = "outline",
  confirmVariant = "ink",
  withPublicNote,
  withDays,
  daysOptional,
  choices,
  choiceLabel,
  reasonLabel = "Interne Begründung",
  reasonHint = "Wird im Audit-Protokoll gespeichert – nicht für die betroffene Person sichtbar.",
  success,
  size = "sm",
}: {
  action: (input: ReasonInput) => Promise<ActionResult<unknown>>;
  label: ReactNode;
  title: string;
  description?: string;
  confirmLabel?: string;
  variant?: Variant;
  confirmVariant?: Variant;
  withPublicNote?: boolean;
  withDays?: boolean;
  daysOptional?: boolean;
  choices?: { value: string; label: string }[];
  choiceLabel?: string;
  reasonLabel?: string;
  reasonHint?: string;
  success?: string;
  size?: "sm" | "md";
}) {
  const [open, setOpen] = useState(false);
  const { run, pending, fields } = useAction(action, { success, onSuccess: () => setOpen(false) });
  // Feldfehler ohne eigenes Eingabefeld (z. B. „note“) nicht verschlucken
  const known = ["reason", "publicNote", "days", "choice", "role", "_"];
  const other = Object.entries(fields).find(([k]) => !known.includes(k))?.[1];
  return (
    <>
      <Button size={size} variant={variant} onClick={() => setOpen(true)}>
        {label}
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} title={title} description={description}>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            const days = fd.get("days");
            run({
              reason: String(fd.get("reason") ?? ""),
              publicNote: withPublicNote ? String(fd.get("publicNote") ?? "") : undefined,
              days: withDays ? (days ? Number(days) : null) : undefined,
              choice: choices ? String(fd.get("choice") ?? "") : undefined,
            });
          }}
        >
          {choices && (
            <Field label={choiceLabel ?? "Auswahl"} error={fields.choice ?? fields.role}>
              {(p) => (
                <Select name="choice" {...p} defaultValue={choices[0]?.value}>
                  {choices.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          )}
          {withDays && (
            <Field label="Dauer in Tagen" optional={daysOptional} hint={daysOptional ? "Leer lassen = bis auf Weiteres" : undefined} error={fields.days}>
              {(p) => <Input name="days" type="number" min={1} max={365} defaultValue={daysOptional ? "" : 7} required={!daysOptional} {...p} />}
            </Field>
          )}
          <Field label={reasonLabel} hint={reasonHint} error={fields.reason ?? fields._ ?? other}>
            {(p) => <Textarea name="reason" required minLength={5} maxLength={1000} rows={3} {...p} />}
          </Field>
          {withPublicNote && (
            <Field label="Nachricht an die betroffene Person" hint="Sachlich, konkret, ohne interne Details. Wird in der Benachrichtigung angezeigt." error={fields.publicNote}>
              {(p) => <Textarea name="publicNote" required minLength={10} maxLength={1000} rows={3} {...p} />}
            </Field>
          )}
          <div className="flex justify-end gap-2 border-t border-line pt-4">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Abbrechen
            </Button>
            <Button type="submit" variant={confirmVariant} disabled={pending} aria-busy={pending}>
              {pending ? "Wird gespeichert …" : confirmLabel}
            </Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
