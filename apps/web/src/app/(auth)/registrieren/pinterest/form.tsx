"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input } from "@/components/ui/field";
import { formToObject, useAction } from "@/lib/use-action";
import { pinterestSignUpAction } from "../../actions";

export function PinterestSignUpForm({ suggestedName }: { suggestedName: string }) {
  const { run, pending, fields, error } = useAction(pinterestSignUpAction, { redirect: (d) => d.next });
  return (
    <form
      className="mt-8 space-y-5"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        const o = formToObject(e.currentTarget);
        run({ ...o, adult: o.adult === true, terms: o.terms === true });
      }}
    >
      <Field label="Anzeigename" error={fields.displayName} hint="So erscheinst du in der Community. Jederzeit änderbar.">
        {(p) => <Input {...p} name="displayName" autoComplete="name" defaultValue={suggestedName} required />}
      </Field>
      <Field label="E-Mail" error={fields.email} hint="Wir schicken dir einen Link zur Bestätigung.">
        {(p) => <Input {...p} name="email" type="email" autoComplete="email" inputMode="email" required />}
      </Field>
      <div className="space-y-3 border-t border-line pt-5">
        <Checkbox name="adult" label="Ich bin mindestens 18 Jahre alt." />
        {fields.adult && <p className="text-[13px] text-danger">{fields.adult}</p>}
        <Checkbox
          name="terms"
          label={
            <>
              Ich akzeptiere die{" "}
              <Link href="/rechtliches/agb" className="underline underline-offset-2" target="_blank">
                Nutzungsbedingungen
              </Link>{" "}
              und habe die{" "}
              <Link href="/rechtliches/datenschutz" className="underline underline-offset-2" target="_blank">
                Datenschutzerklärung
              </Link>{" "}
              gelesen.
            </>
          }
        />
        {fields.terms && <p className="text-[13px] text-danger">{fields.terms}</p>}
      </div>
      {error && !Object.keys(fields).length && (
        <p role="alert" className="text-sm font-medium text-danger">
          {error}
        </p>
      )}
      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending ? "Konto wird erstellt …" : "Konto erstellen"}
      </Button>
      <p className="text-sm text-muted">
        Schon ein Konto mit dieser E-Mail?{" "}
        <Link href="/anmelden" className="font-semibold text-ink underline underline-offset-4">Anmelden</Link> und Pinterest danach unter Einstellungen → Konto verbinden.
      </p>
    </form>
  );
}
