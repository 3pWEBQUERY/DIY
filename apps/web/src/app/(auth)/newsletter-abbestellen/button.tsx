"use client";

import { useState, useTransition } from "react";
import { Button, LinkButton } from "@/components/ui/button";
import { unsubscribeNewsletterAction } from "./actions";

export function NewsletterUnsubscribeButton({ token, creatorName, handle }: { token: string; creatorName: string; handle: string }) {
  const [state, setState] = useState<"idle" | "done" | "error">("idle");
  const [pending, start] = useTransition();
  if (state === "done")
    return (
      <div className="mt-8" role="status">
        <p className="font-semibold">Erledigt – du bekommst keinen Newsletter von {creatorName} mehr.</p>
        <p className="mt-1 text-[14px] text-muted">Du folgst {creatorName} weiterhin. Auf dem Profil kannst du den Newsletter jederzeit wieder abonnieren.</p>
        <LinkButton href={`/u/${handle}`} variant="outline" size="lg" className="mt-4 w-full">
          Zum Profil
        </LinkButton>
      </div>
    );
  return (
    <>
      <Button size="lg" className="mt-8 w-full" disabled={pending} onClick={() => start(async () => setState((await unsubscribeNewsletterAction(token)).ok ? "done" : "error"))}>
        {pending ? "Wird abbestellt …" : "Newsletter abbestellen"}
      </Button>
      {state === "error" && (
        <p className="mt-3 text-sm text-danger" role="alert">
          Das hat nicht geklappt. Bitte versuche es erneut.
        </p>
      )}
    </>
  );
}
