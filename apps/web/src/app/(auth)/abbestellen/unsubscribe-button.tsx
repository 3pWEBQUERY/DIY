"use client";

import { useState, useTransition } from "react";
import { Button, LinkButton } from "@/components/ui/button";
import { unsubscribeAction } from "./actions";

export function UnsubscribeButton({ token }: { token: string }) {
  const [state, setState] = useState<"idle" | "done" | "error">("idle");
  const [pending, start] = useTransition();
  if (state === "done")
    return (
      <div className="mt-8" role="status">
        <p className="font-semibold">Erledigt – du bekommst keine Benachrichtigungs-E-Mails mehr.</p>
        <LinkButton href="/einstellungen/benachrichtigungen" variant="outline" size="lg" className="mt-4 w-full">
          Einstellungen anpassen
        </LinkButton>
      </div>
    );
  return (
    <>
      <Button size="lg" className="mt-8 w-full" disabled={pending} onClick={() => start(async () => setState((await unsubscribeAction(token)).ok ? "done" : "error"))}>
        {pending ? "Wird abbestellt …" : "E-Mails abbestellen"}
      </Button>
      {state === "error" && <p className="mt-3 text-sm text-danger" role="alert">Das hat nicht geklappt. Bitte versuche es erneut.</p>}
    </>
  );
}
