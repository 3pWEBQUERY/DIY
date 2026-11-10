"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Notice } from "@/components/ui/misc";
import { formToObject, useAction } from "@/lib/use-action";
import { signInAction } from "../actions";
import { AppleButton } from "../apple-button";

export function SignInForm({ next, apple, error }: { next?: string; apple: boolean; error?: string }) {
  const { run, pending, fields, error: err } = useAction(signInAction, { redirect: (d) => d.next });
  return (
    <div className="mt-8">
      {error === "apple" && <Notice tone="danger" alert className="mb-6">Die Anmeldung mit Apple ist fehlgeschlagen. Bitte versuche es erneut.</Notice>}
      {apple && (
        <>
          <AppleButton />
          <div className="my-6 flex items-center gap-4 spec">
            <span className="h-px flex-1 bg-line" />
            oder mit E-Mail
            <span className="h-px flex-1 bg-line" />
          </div>
        </>
      )}
      <form
        className="space-y-5"
        onSubmit={(e) => {
          e.preventDefault();
          run({ ...formToObject(e.currentTarget), weiter: next });
        }}
        noValidate
      >
        <Field label="E-Mail" error={fields.email}>
          {(p) => <Input {...p} name="email" type="email" autoComplete="email" required inputMode="email" />}
        </Field>
        <Field label="Passwort" error={fields.password}>
          {(p) => <Input {...p} name="password" type="password" autoComplete="current-password" required />}
        </Field>
        {err && !Object.keys(fields).length && (
          <p role="alert" className="text-sm font-medium text-danger">
            {err}
          </p>
        )}
        <div className="flex items-center justify-between">
          <Link href="/passwort-vergessen" className="text-sm text-muted underline-offset-4 hover:text-ink hover:underline">
            Passwort vergessen?
          </Link>
        </div>
        <Button type="submit" size="lg" className="w-full" disabled={pending}>
          {pending ? "Wird angemeldet …" : "Anmelden"}
        </Button>
      </form>
      <p className="mt-8 text-sm text-muted">
        Neu hier?{" "}
        <Link href="/registrieren" className="font-semibold text-ink underline underline-offset-4">
          Konto erstellen
        </Link>
      </p>
    </div>
  );
}
