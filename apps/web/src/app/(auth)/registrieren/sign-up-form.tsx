"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input } from "@/components/ui/field";
import { formToObject, useAction } from "@/lib/use-action";
import { slugify } from "@/lib/utils";
import { signUpAction, checkHandleAction } from "../actions";
import { AppleButton } from "../apple-button";

export function SignUpForm({ apple }: { apple: boolean }) {
  const { run, pending, fields } = useAction(signUpAction, { redirect: (d) => d.next });
  const [name, setName] = useState("");
  const [handle, setHandle] = useState("");
  const [touched, setTouched] = useState(false);
  const [avail, setAvail] = useState<{ ok: boolean; reason?: string } | null>(null);
  const [pw, setPw] = useState("");

  useEffect(() => {
    if (!touched) setHandle(slugify(name, 20).replace(/-/g, "."));
  }, [name, touched]);

  useEffect(() => {
    if (handle.length < 3) return setAvail(null);
    const t = setTimeout(() => checkHandleAction(handle).then(setAvail), 300);
    return () => clearTimeout(t);
  }, [handle]);

  const strength = [pw.length >= 10, /[a-zA-Z]/.test(pw), /\d|[^\w\s]/.test(pw), pw.length >= 14].filter(Boolean).length;

  return (
    <div className="mt-8">
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
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          const o = formToObject(e.currentTarget);
          run({ ...o, adult: o.adult === true, terms: o.terms === true });
        }}
      >
        <Field label="Anzeigename" error={fields.displayName} hint="So erscheinst du in der Community. Jederzeit änderbar.">
          {(p) => <Input {...p} name="displayName" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} required />}
        </Field>
        <Field label="Benutzername" error={fields.handle ?? (avail && !avail.ok ? avail.reason : undefined)} hint={handle ? `Deine Profiladresse: werkraum.ch/u/${handle}` : "Eindeutig, für deine Profil-URL"}>
          {(p) => (
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted">@</span>
              <Input
                {...p}
                name="handle"
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                className="pl-7 pr-9"
                value={handle}
                onChange={(e) => {
                  setTouched(true);
                  setHandle(e.target.value.toLowerCase().replace(/[^a-z0-9._]/g, ""));
                }}
                required
              />
              {avail && (
                <span className="absolute right-3 top-1/2 -translate-y-1/2" aria-live="polite">
                  {avail.ok ? <Check size={16} className="text-moss" aria-label="verfügbar" /> : <X size={16} className="text-danger" aria-label="nicht verfügbar" />}
                </span>
              )}
            </div>
          )}
        </Field>
        <Field label="E-Mail" error={fields.email}>
          {(p) => <Input {...p} name="email" type="email" autoComplete="email" inputMode="email" required />}
        </Field>
        <Field label="Passwort" error={fields.password} hint="Mindestens 10 Zeichen, mit Ziffer oder Sonderzeichen.">
          {(p) => (
            <>
              <Input {...p} name="password" type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} required />
              <div className="mt-2 grid grid-cols-4 gap-1" aria-hidden>
                {[0, 1, 2, 3].map((i) => (
                  <span key={i} className={`h-[3px] ${i < strength ? (strength >= 3 ? "bg-moss" : "bg-clay") : "bg-line"}`} />
                ))}
              </div>
            </>
          )}
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
        <Button type="submit" size="lg" className="w-full" disabled={pending}>
          {pending ? "Konto wird erstellt …" : "Konto erstellen"}
        </Button>
      </form>
      <p className="mt-8 text-sm text-muted">
        Schon dabei?{" "}
        <Link href="/anmelden" className="font-semibold text-ink underline underline-offset-4">
          Anmelden
        </Link>
      </p>
    </div>
  );
}
