"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { useAction } from "@/lib/use-action";
import { cancelMfaAction, verifyMfaAction } from "../../actions";

export function MfaForm({ next }: { next: string }) {
  const [kind, setKind] = useState<"totp" | "recovery">("totp");
  const [code, setCode] = useState("");
  const { run, pending, fields } = useAction(verifyMfaAction, { redirect: (d) => d.next });

  const submit = (value = code) => {
    if (!value.trim()) return;
    run({ code: value, kind, weiter: next }).then((r) => {
      if (!r.ok) setCode("");
    });
  };

  return (
    <div className="mt-8">
      <form
        className="space-y-5"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        noValidate
      >
        {kind === "totp" ? (
          <Field label="Code aus der App" error={fields.code} hint="Der Code wechselt alle 30 Sekunden.">
            {(p) => (
              <Input
                {...p}
                key="totp"
                name="code"
                value={code}
                onChange={(e) => {
                  const v = e.target.value.replace(/\D/g, "").slice(0, 6);
                  setCode(v);
                  if (v.length === 6 && !pending) submit(v);
                }}
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]*"
                maxLength={6}
                autoFocus
                placeholder="000000"
                className="h-14 text-center font-mono text-2xl tracking-[0.5em]"
              />
            )}
          </Field>
        ) : (
          <Field label="Wiederherstellungscode" error={fields.code} hint="Jeder Code funktioniert genau einmal.">
            {(p) => (
              <Input
                {...p}
                key="recovery"
                name="code"
                value={code}
                onChange={(e) => setCode(e.target.value.slice(0, 20))}
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                autoFocus
                placeholder="xxxxx-xxxxx"
                className="h-14 text-center font-mono text-xl tracking-widest"
              />
            )}
          </Field>
        )}
        <Button type="submit" size="lg" className="w-full" disabled={pending || !code.trim()}>
          {pending ? "Wird geprüft …" : "Bestätigen"}
        </Button>
      </form>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3 text-sm">
        <button
          type="button"
          className="font-semibold text-moss underline-offset-4 hover:underline"
          onClick={() => {
            setKind((k) => (k === "totp" ? "recovery" : "totp"));
            setCode("");
          }}
        >
          {kind === "totp" ? "Wiederherstellungscode verwenden" : "Code aus der App verwenden"}
        </button>
        <form action={cancelMfaAction}>
          <button type="submit" className="text-muted hover:text-ink">
            Abbrechen
          </button>
        </form>
      </div>
      <p className="mt-8 text-xs leading-relaxed text-muted">
        Kein Zugriff auf die App und keine Wiederherstellungscodes mehr? Melde dich beim Support – die Zwei-Faktor-Anmeldung kann nach einer Identitätsprüfung zurückgesetzt werden.
      </p>
    </div>
  );
}
