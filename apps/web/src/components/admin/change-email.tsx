"use client";

import { useState } from "react";
import { Mail } from "lucide-react";
import type { ActionResult } from "@/server/errors";
import { useAction } from "@/lib/use-action";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Checkbox, Field, Input, Textarea } from "@/components/ui/field";
import { Notice } from "@/components/ui/misc";

type Input = { email: string; reason: string; markVerified: boolean };

/** Admin → Nutzer:in: E-Mail-Adresse ändern (Support-Fall). */
export function ChangeEmailButton({ current, action }: { current: string; action: (input: Input) => Promise<ActionResult<unknown>> }) {
  const [open, setOpen] = useState(false);
  const [markVerified, setMarkVerified] = useState(false);
  const { run, pending, fields, error } = useAction(action, { refresh: true, onSuccess: () => setOpen(false) });
  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <Mail size={14} aria-hidden /> E-Mail ändern
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} title="E-Mail-Adresse ändern" description={`Aktuell: ${current}`}>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            run({ email: String(fd.get("email") ?? ""), reason: String(fd.get("reason") ?? ""), markVerified });
          }}
        >
          <Field label="Neue E-Mail-Adresse" error={fields.email}>
            {(p) => <Input name="email" type="email" autoComplete="off" required maxLength={254} placeholder="name@beispiel.ch" {...p} />}
          </Field>
          <Field label="Begründung (intern, im Audit-Protokoll)" hint="Zum Beispiel Ticketnummer und wie die Identität geprüft wurde." error={fields.reason}>
            {(p) => <Textarea name="reason" required minLength={10} maxLength={1000} rows={3} {...p} />}
          </Field>
          <Checkbox
            checked={markVerified}
            onChange={(e) => setMarkVerified(e.target.checked)}
            label="Neue Adresse direkt als bestätigt markieren (nur wenn sie nachweislich der Person gehört – sonst geht ein Bestätigungslink an die neue Adresse)"
          />
          <Notice tone="warn">
            Die Person meldet sich danach mit der neuen Adresse an. Die alte Adresse erhält eine Sicherheitsmeldung, offene Bestätigungs- und Passwort-Links verfallen.
          </Notice>
          {error && <p className="text-sm text-danger" role="alert">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Abbrechen
            </Button>
            <Button type="submit" variant="ink" disabled={pending} aria-busy={pending}>
              Adresse ändern
            </Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
