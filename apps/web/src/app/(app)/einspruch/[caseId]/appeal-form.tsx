"use client";

import { useState } from "react";
import { useAction } from "@/lib/use-action";
import { Button } from "@/components/ui/button";
import { Field, Textarea } from "@/components/ui/field";
import { submitAppealAction } from "./actions";

export function AppealForm({ caseId, token }: { caseId: string; token?: string }) {
  const [text, setText] = useState("");
  const { run, pending, fields } = useAction(submitAppealAction);
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        run(caseId, { statement: text }, token);
      }}
    >
      <Field
        label="Deine Begründung"
        hint={`Was sollten wir wissen? Beschreibe sachlich, warum die Entscheidung aus deiner Sicht nicht zutrifft. ${text.trim().length}/3000 Zeichen, mindestens 30.`}
        error={fields.statement}
      >
        {(p) => <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={8} minLength={30} maxLength={3000} required {...p} />}
      </Field>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-muted">Du kannst pro Fall einmal Einspruch erheben. Eine andere Person aus dem Team prüft ihn.</p>
        <Button type="submit" variant="ink" disabled={pending || text.trim().length < 30} aria-busy={pending}>
          {pending ? "Wird gesendet …" : "Einspruch einreichen"}
        </Button>
      </div>
    </form>
  );
}
