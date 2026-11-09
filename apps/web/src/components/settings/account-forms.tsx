"use client";

import { useState } from "react";
import { useAction } from "@/lib/use-action";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/field";
import { changePasswordAction, deleteAccountAction, requestEmailChangeAction, resendVerificationAction } from "@/app/(app)/einstellungen/actions";

export function ResendVerificationButton() {
  const { run, pending } = useAction(resendVerificationAction, { refresh: false });
  return (
    <Button size="sm" variant="outline" onClick={() => run()} disabled={pending} aria-busy={pending}>
      {pending ? "Wird gesendet …" : "Bestätigungslink erneut senden"}
    </Button>
  );
}

export function ChangeEmailButton({ hasPassword }: { hasPassword: boolean }) {
  const [open, setOpen] = useState(false);
  const { run, pending, fields } = useAction(requestEmailChangeAction, { refresh: false });
  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        Adresse ändern
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} title="E-Mail-Adresse ändern" description="Wir schicken einen Bestätigungslink an die neue Adresse. Erst nach dem Klick wird umgestellt – bis dahin gilt deine bisherige Adresse.">
        {hasPassword ? (
          <form
            className="space-y-4"
            onSubmit={async (e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              const r = await run({ email: String(fd.get("email") ?? ""), password: String(fd.get("password") ?? "") });
              if (r.ok) setOpen(false);
            }}
          >
            <Field label="Neue E-Mail-Adresse" error={fields.email}>
              {(p) => <Input name="email" type="email" autoComplete="email" required maxLength={254} {...p} />}
            </Field>
            <Field label="Aktuelles Passwort" hint="Zur Sicherheit bestätigst du die Änderung mit deinem Passwort." error={fields._ ?? fields.password}>
              {(p) => <Input name="password" type="password" autoComplete="current-password" required {...p} />}
            </Field>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setOpen(false)}>
                Abbrechen
              </Button>
              <Button type="submit" variant="ink" disabled={pending} aria-busy={pending}>
                {pending ? "Wird gesendet …" : "Bestätigungslink senden"}
              </Button>
            </div>
          </form>
        ) : (
          <p className="text-sm text-ink-2">Du meldest dich bisher nur mit Apple an. Lege unten zuerst ein Passwort fest – damit bestätigst du die Änderung.</p>
        )}
      </Dialog>
    </>
  );
}

export function ChangePasswordForm({ hasPassword }: { hasPassword: boolean }) {
  const { run, pending, fields } = useAction(changePasswordAction);
  return (
    <form
      className="grid max-w-md gap-4"
      onSubmit={async (e) => {
        e.preventDefault();
        const form = e.currentTarget;
        const fd = new FormData(form);
        const r = await run({ current: String(fd.get("current") ?? ""), next: String(fd.get("next") ?? ""), confirm: String(fd.get("confirm") ?? "") });
        if (r.ok) form.reset();
      }}
    >
      {hasPassword && (
        <Field label="Aktuelles Passwort" error={fields.current}>
          {(p) => <Input name="current" type="password" autoComplete="current-password" required {...p} />}
        </Field>
      )}
      <Field label={hasPassword ? "Neues Passwort" : "Passwort festlegen"} hint="Mindestens 10 Zeichen, mit Buchstaben und einer Ziffer oder einem Sonderzeichen." error={fields._ ?? fields.next}>
        {(p) => <Input name="next" type="password" autoComplete="new-password" minLength={10} required {...p} />}
      </Field>
      <Field label="Neues Passwort wiederholen" error={fields.confirm}>
        {(p) => <Input name="confirm" type="password" autoComplete="new-password" minLength={10} required {...p} />}
      </Field>
      <div>
        <Button type="submit" variant="ink" disabled={pending} aria-busy={pending}>
          {pending ? "Speichert …" : hasPassword ? "Passwort ändern" : "Passwort festlegen"}
        </Button>
        <p className="mt-2 text-xs text-muted">Alle anderen Geräte werden danach abgemeldet.</p>
      </div>
    </form>
  );
}

export function DeleteAccountButton({ hasPassword }: { hasPassword: boolean }) {
  const [open, setOpen] = useState(false);
  const { run, pending, fields } = useAction(deleteAccountAction);
  return (
    <>
      <Button variant="danger" onClick={() => setOpen(true)}>
        Konto endgültig löschen
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Konto löschen?" description="Dieser Schritt kann nicht rückgängig gemacht werden.">
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            run({ password: String(fd.get("password") ?? ""), confirm: String(fd.get("confirm") ?? "") });
          }}
        >
          {hasPassword && (
            <Field label="Passwort" error={fields.password}>
              {(p) => <Input name="password" type="password" autoComplete="current-password" required {...p} />}
            </Field>
          )}
          <Field label="Tippe LÖSCHEN zur Bestätigung" error={fields.confirm}>
            {(p) => <Input name="confirm" required autoComplete="off" autoCapitalize="characters" spellCheck={false} {...p} />}
          </Field>
          <div className="flex justify-end gap-2 border-t border-line pt-4">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Abbrechen
            </Button>
            <Button type="submit" variant="danger" disabled={pending} aria-busy={pending}>
              {pending ? "Wird gelöscht …" : "Endgültig löschen"}
            </Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
