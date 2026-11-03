"use client";

import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Notice } from "@/components/ui/misc";
import { useAction } from "@/lib/use-action";
import { requestResetAction } from "../actions";

export default function ForgotPage() {
  const [sent, setSent] = useState(false);
  const { run, pending } = useAction(requestResetAction, { refresh: false, onSuccess: () => setSent(true) });
  return (
    <>
      <p className="spec mb-3">Zugang wiederherstellen</p>
      <h1 className="display text-5xl">Passwort vergessen</h1>
      <p className="mt-3 text-muted">Wir schicken dir einen Link, mit dem du ein neues Passwort festlegen kannst.</p>
      {sent ? (
        <Notice tone="moss" className="mt-8" title="E-Mail unterwegs">
          Falls ein Konto mit dieser Adresse existiert, erhältst du in wenigen Minuten eine E-Mail. Prüfe auch deinen Spam-Ordner.
        </Notice>
      ) : (
        <form
          className="mt-8 space-y-5"
          onSubmit={(e) => {
            e.preventDefault();
            run(String(new FormData(e.currentTarget).get("email") ?? ""));
          }}
        >
          <Field label="E-Mail">{(p) => <Input {...p} name="email" type="email" autoComplete="email" required />}</Field>
          <Button type="submit" size="lg" className="w-full" disabled={pending}>
            Link anfordern
          </Button>
        </form>
      )}
      <p className="mt-8 text-sm">
        <Link href="/anmelden" className="text-muted underline underline-offset-4 hover:text-ink">
          Zurück zur Anmeldung
        </Link>
      </p>
    </>
  );
}
