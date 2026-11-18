"use client";

import { useState, useTransition } from "react";
import { Button, LinkButton } from "@/components/ui/button";
import { callAction } from "@/lib/use-action";
import { verifyEmailAction } from "./actions";

export function VerifyEmailButton({ token }: { token: string }) {
  const [result, setResult] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (result !== null)
    return (
      <>
        <h1 className="display text-5xl">{result ? "Bestätigt." : "Link ungültig"}</h1>
        <p className="mt-3 text-muted" role="status">
          {result
            ? "Danke! Deine E-Mail-Adresse ist bestätigt. Du kannst jetzt alle Funktionen nutzen."
            : "Dieser Link ist abgelaufen oder wurde bereits verwendet. Du kannst in den Einstellungen einen neuen anfordern."}
        </p>
        <LinkButton href={result ? "/feed" : "/einstellungen/konto"} size="lg" className="mt-8 w-full">
          {result ? "Zum Feed" : "Zu den Einstellungen"}
        </LinkButton>
      </>
    );

  return (
    <>
      <h1 className="display text-5xl">E-Mail bestätigen</h1>
      <p className="mt-3 text-muted">Bestätige mit einem Klick, dass diese E-Mail-Adresse dir gehört.</p>
      <Button
        size="lg"
        className="mt-8 w-full"
        disabled={pending}
        onClick={() =>
          start(async () => {
            setError(null);
            const r = await callAction(() => verifyEmailAction(token));
            if (r.ok) setResult(r.data.verified);
            else setError(r.error);
          })
        }
      >
        {pending ? "Wird bestätigt …" : "E-Mail-Adresse bestätigen"}
      </Button>
      {error && (
        <p className="mt-3 text-sm text-danger" role="alert">
          {error}
        </p>
      )}
    </>
  );
}
