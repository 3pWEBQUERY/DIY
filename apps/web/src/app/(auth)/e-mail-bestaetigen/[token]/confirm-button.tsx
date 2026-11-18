"use client";

import { useState, useTransition } from "react";
import { Button, LinkButton } from "@/components/ui/button";
import { callAction } from "@/lib/use-action";
import { confirmEmailChangeAction } from "./actions";

export function ConfirmEmailChangeButton({ token }: { token: string }) {
  // undefined = noch nicht bestätigt, null = Link ungültig, string = neue Adresse
  const [email, setEmail] = useState<string | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (email !== undefined)
    return (
      <>
        <h1 className="display text-5xl">{email ? "Geändert." : "Link ungültig"}</h1>
        <p className="mt-3 text-muted" role="status">
          {email
            ? `Deine E-Mail-Adresse lautet jetzt ${email}. Melde dich ab sofort damit an.`
            : "Dieser Link ist abgelaufen, wurde bereits verwendet oder die Adresse ist inzwischen vergeben. Du kannst die Änderung in den Einstellungen neu anfordern."}
        </p>
        <LinkButton href="/einstellungen/konto" size="lg" className="mt-8 w-full">
          Zu den Einstellungen
        </LinkButton>
      </>
    );

  return (
    <>
      <h1 className="display text-5xl">Neue Adresse bestätigen</h1>
      <p className="mt-3 text-muted">Bestätige mit einem Klick, dass deine Anmelde-E-Mail auf diese Adresse umgestellt wird.</p>
      <Button
        size="lg"
        className="mt-8 w-full"
        disabled={pending}
        onClick={() =>
          start(async () => {
            setError(null);
            const r = await callAction(() => confirmEmailChangeAction(token));
            if (r.ok) setEmail(r.data.email);
            else setError(r.error);
          })
        }
      >
        {pending ? "Wird bestätigt …" : "E-Mail-Adresse ändern"}
      </Button>
      {error && (
        <p className="mt-3 text-sm text-danger" role="alert">
          {error}
        </p>
      )}
    </>
  );
}
