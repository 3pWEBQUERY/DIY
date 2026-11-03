"use client";

import { useState } from "react";
import { MODERATION_ACTION_LABEL, type ModerationActionKind } from "@werkraum/shared";
import type { ActionResult } from "@/server/errors";
import { useAction } from "@/lib/use-action";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/field";

const HELP: Record<ModerationActionKind, string> = {
  NONE: "Meldung unbegründet. Inhalt bleibt unverändert; Meldende erfahren nur, dass der Fall geprüft wurde.",
  WARN: "Hinweis an die Person ohne Einschränkung. Wird im Verlauf festgehalten.",
  LIMIT_REACH: "Beitrag bleibt sichtbar, erscheint aber nicht mehr in Feeds und Empfehlungen.",
  HIDE: "Inhalt wird ausgeblendet und ist nur noch für die Person selbst sichtbar.",
  REMOVE: "Inhalt wird entfernt. Bei stattgegebenem Einspruch wird er wiederhergestellt.",
  DISABLE_LISTING: "Angebot wird deaktiviert und ist nicht mehr kaufbar.",
  RESTRICT_MESSAGING: "Die Person kann für die gewählte Dauer keine Nachrichten senden.",
  SUSPEND: "Konto wird zeitweise gesperrt, alle Sitzungen werden beendet.",
  BAN: "Konto wird dauerhaft gesperrt, Sitzungen beendet, Shop gesperrt. Nur bei schweren oder wiederholten Verstössen.",
};

const SEVERITY: Record<ModerationActionKind, number> = { NONE: 0, WARN: 1, LIMIT_REACH: 1, HIDE: 2, REMOVE: 3, DISABLE_LISTING: 3, RESTRICT_MESSAGING: 3, SUSPEND: 4, BAN: 5 };

export function DecisionForm({
  allowed,
  action,
}: {
  allowed: ModerationActionKind[];
  action: (input: { action: string; reason: string; publicNote: string; days?: number }) => Promise<ActionResult<unknown>>;
}) {
  const [choice, setChoice] = useState<ModerationActionKind>(allowed.includes("NONE") ? "NONE" : allowed[0]!);
  const { run, pending, fields } = useAction(action);
  const needsDays = choice === "SUSPEND" || choice === "RESTRICT_MESSAGING";
  const needsNote = choice === "SUSPEND" || choice === "BAN";
  const sev = SEVERITY[choice];

  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        if (sev >= 4 && !window.confirm(`${MODERATION_ACTION_LABEL[choice]} wirklich verhängen?`)) return;
        run({
          action: choice,
          reason: String(fd.get("reason") ?? ""),
          publicNote: String(fd.get("publicNote") ?? ""),
          days: needsDays ? Number(fd.get("days") || 0) || undefined : undefined,
        });
      }}
    >
      <fieldset>
        <legend className="mb-2 text-[13px] font-semibold">Massnahme</legend>
        <div className="divide-y divide-line border border-line-strong">
          {allowed.map((a) => (
            <label key={a} className={cn("flex cursor-pointer items-start gap-3 px-3 py-2.5 hover:bg-sunken", choice === a && "bg-sunken")}>
              <input type="radio" name="action" value={a} checked={choice === a} onChange={() => setChoice(a)} className="mt-1 accent-[var(--color-ink)]" />
              <span className="min-w-0">
                <span className="flex items-center gap-2 text-sm font-semibold">
                  {MODERATION_ACTION_LABEL[a]}
                  <span aria-hidden className="inline-flex gap-[2px]">
                    {[1, 2, 3, 4, 5].map((i) => (
                      <span key={i} className={cn("h-2 w-[4px]", i <= SEVERITY[a] ? (SEVERITY[a] >= 4 ? "bg-danger" : "bg-ink") : "bg-line-strong")} />
                    ))}
                  </span>
                </span>
                {choice === a && <span className="mt-0.5 block text-xs leading-snug text-muted">{HELP[a]}</span>}
              </span>
            </label>
          ))}
        </div>
        {fields.action && <p className="mt-1.5 text-[13px] text-danger">{fields.action}</p>}
      </fieldset>

      {needsDays && (
        <Field label="Dauer in Tagen" error={fields.days}>
          {(p) => <Input name="days" type="number" min={1} max={365} defaultValue={choice === "SUSPEND" ? 7 : 14} required {...p} />}
        </Field>
      )}

      <Field label="Interne Begründung" hint="Pflicht. Für das Team und das Audit-Protokoll – nicht öffentlich." error={fields.reason}>
        {(p) => <Textarea name="reason" required minLength={10} maxLength={2000} rows={4} placeholder="Welche Regel ist betroffen? Was gab den Ausschlag?" {...p} />}
      </Field>

      {choice !== "NONE" && (
        <Field
          label="Begründung für die betroffene Person"
          optional={!needsNote}
          hint="Erscheint in der Benachrichtigung mit Einspruchslink. Sachlich, ohne Namen von Meldenden."
          error={fields.publicNote}
        >
          {(p) => <Textarea name="publicNote" required={needsNote} maxLength={1000} rows={3} {...p} />}
        </Field>
      )}

      <Button type="submit" variant={sev >= 4 ? "danger" : "ink"} className="w-full" disabled={pending} aria-busy={pending}>
        {pending ? "Wird gespeichert …" : `Entscheiden: ${MODERATION_ACTION_LABEL[choice]}`}
      </Button>
    </form>
  );
}
