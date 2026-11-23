"use client";

import { useState } from "react";
import { REPORT_REASONS, REPORT_REASON_LABEL, type ReportReason } from "@werkraum/shared";
import { Button, LinkButton } from "@/components/ui/button";
import { Field, Textarea } from "@/components/ui/field";
import { useAction } from "@/lib/use-action";
import { cn } from "@/lib/utils";
import { reportNewsletterAction } from "./actions";

/** Gründe, die bei einem Newsletter Sinn ergeben */
const REASONS: ReportReason[] = REPORT_REASONS.filter((r) => ["SPAM", "SCAM", "HARASSMENT", "HATE", "NUDITY", "MISINFORMATION", "OTHER"].includes(r));

export function NewsletterReportForm({ token, handle }: { token: string; handle: string }) {
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [details, setDetails] = useState("");
  const [done, setDone] = useState<{ caseNumber: string | number | null } | null>(null);
  const save = useAction(reportNewsletterAction, { refresh: false, success: () => undefined, onSuccess: (d) => setDone({ caseNumber: d.caseNumber }) });

  if (done)
    return (
      <div className="mt-8" role="status">
        <p className="font-semibold">Danke – deine Meldung ist bei unserem Moderationsteam{done.caseNumber ? ` (Fall ${done.caseNumber})` : ""}.</p>
        <p className="mt-1 text-[14px] text-muted">Wir prüfen den Newsletter und melden uns, falls wir Fragen haben. Wenn du keine Newsletter mehr möchtest, kannst du ihn über den Link in der Mail abbestellen.</p>
        <LinkButton href={handle ? `/u/${handle}` : "/"} variant="outline" size="lg" className="mt-4 w-full">
          {handle ? "Zum Profil" : "Zu Werkuno"}
        </LinkButton>
      </div>
    );

  return (
    <form
      className="mt-8 space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        if (reason) save.run(token, { reason, details });
      }}
    >
      <fieldset aria-describedby={save.fields.reason ? "nl-reason-err" : undefined}>
        <legend className="mb-2 text-[14px] font-semibold">Was stimmt nicht?</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {REASONS.map((r) => (
            <label
              key={r}
              className={cn(
                "flex cursor-pointer items-center gap-2.5 rounded-xl border border-field bg-card px-3.5 py-2.5 text-[14px] transition-colors",
                "hover:border-ink-2 has-[:checked]:border-moss has-[:checked]:bg-moss-soft has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-1 has-[:focus-visible]:outline-moss",
              )}
            >
              <input type="radio" name="reason" value={r} className="sr-only" checked={reason === r} onChange={() => setReason(r)} />
              {REPORT_REASON_LABEL[r]}
            </label>
          ))}
        </div>
        {save.fields.reason && (
          <p id="nl-reason-err" role="alert" className="mt-1.5 text-[13px] text-danger">
            {save.fields.reason}
          </p>
        )}
      </fieldset>
      <Field label="Ergänzung" optional hint="Was ist dir aufgefallen? Betreff und Textauszug schicken wir automatisch mit.">
        {(p) => <Textarea {...p} rows={4} maxLength={1000} value={details} onChange={(e) => setDetails(e.target.value)} />}
      </Field>
      {save.error && !Object.keys(save.fields).length && (
        <p role="alert" className="text-sm text-danger">
          {save.error}
        </p>
      )}
      <Button type="submit" size="lg" className="w-full" disabled={!reason || save.pending}>
        {save.pending ? "Wird gesendet …" : "Newsletter melden"}
      </Button>
    </form>
  );
}
