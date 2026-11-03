"use client";

import { useState } from "react";
import { SUPPORT_TOPICS, SUPPORT_TOPIC_LABEL } from "@werkraum/shared";
import { useAction } from "@/lib/use-action";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Notice } from "@/components/ui/misc";
import { createTicketAction } from "@/app/(app)/einstellungen/actions";

export function SupportForm({ email }: { email: string }) {
  const [done, setDone] = useState<string | null>(null);
  const [topic, setTopic] = useState<string>("GENERAL");
  const { run, pending, fields } = useAction(createTicketAction, { onSuccess: (d) => setDone(d.ref) });
  if (done) {
    return (
      <Notice tone="moss" title={`Anfrage #${done} ist eingegangen`}>
        Wir antworten in der Regel innerhalb von zwei Werktagen an {email}.{" "}
        <button type="button" className="font-semibold underline" onClick={() => setDone(null)}>
          Weitere Anfrage stellen
        </button>
      </Notice>
    );
  }
  return (
    <form
      className="grid max-w-xl gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        run({ topic, subject: fd.get("subject"), body: fd.get("body") });
      }}
    >
      <Field label="Thema" error={fields.topic}>
        {(p) => (
          <Select value={topic} onChange={(e) => setTopic(e.target.value)} {...p}>
            {SUPPORT_TOPICS.map((t) => (
              <option key={t} value={t}>
                {SUPPORT_TOPIC_LABEL[t]}
              </option>
            ))}
          </Select>
        )}
      </Field>
      {topic === "SAFETY" && (
        <Notice tone="warn">
          Bei unmittelbarer Gefahr wende dich bitte an die Polizei (117) oder den Notruf (112). Konkrete Inhalte meldest du am schnellsten direkt über „Melden“ – so landen sie sofort in der Moderation.
        </Notice>
      )}
      <Field label="Betreff" error={fields.subject}>
        {(p) => <Input name="subject" required minLength={4} maxLength={140} {...p} />}
      </Field>
      <Field label="Nachricht" hint="Je genauer, desto schneller können wir helfen – z.B. Bestellnummer, Link oder was du zuletzt getan hast. Bitte keine Passwörter." error={fields.body}>
        {(p) => <Textarea name="body" required minLength={20} maxLength={5000} rows={7} {...p} />}
      </Field>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-muted">Antwort an: {email}</p>
        <Button type="submit" variant="ink" disabled={pending} aria-busy={pending}>
          {pending ? "Wird gesendet …" : "Anfrage senden"}
        </Button>
      </div>
    </form>
  );
}
