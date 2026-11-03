"use client";

import { use } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { useAction } from "@/lib/use-action";
import { resetPasswordAction } from "../../actions";

export default function ResetPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const { run, pending, fields, error } = useAction(resetPasswordAction, { redirect: "/feed" });
  return (
    <>
      <p className="spec mb-3">Sicherheit</p>
      <h1 className="display text-5xl">Neues Passwort</h1>
      <p className="mt-3 text-muted">Nach dem Speichern werden alle anderen Sitzungen abgemeldet.</p>
      <form
        className="mt-8 space-y-5"
        onSubmit={(e) => {
          e.preventDefault();
          run(token, String(new FormData(e.currentTarget).get("password") ?? ""));
        }}
      >
        <Field label="Neues Passwort" error={fields._ ?? error ?? undefined} hint="Mindestens 10 Zeichen, mit Ziffer oder Sonderzeichen.">
          {(p) => <Input {...p} name="password" type="password" autoComplete="new-password" required />}
        </Field>
        <Button type="submit" size="lg" className="w-full" disabled={pending}>
          Passwort speichern
        </Button>
      </form>
    </>
  );
}
