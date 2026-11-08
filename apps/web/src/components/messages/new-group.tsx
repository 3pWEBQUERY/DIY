"use client";

import { useState } from "react";
import { GROUP_MAX_MEMBERS } from "@werkraum/shared";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/field";
import { toast } from "@/components/ui/toast";
import { useAction } from "@/lib/use-action";
import { createGroupAction } from "@/app/(app)/nachrichten/actions";
import { PeoplePicker, type Candidate } from "./people-picker";

export function NewGroupForm({ candidates }: { candidates: Candidate[] }) {
  const [title, setTitle] = useState("");
  const [handles, setHandles] = useState<string[]>([]);
  const [body, setBody] = useState("");
  const { run, pending, fields } = useAction(createGroupAction, {
    redirect: (d) => `/nachrichten/${d.conversationId}`,
    onSuccess: (d) => d.invited.length && toast(`${d.invited.join(", ")} ${d.invited.length > 1 ? "erhalten" : "erhält"} eine Einladung, weil sie dir nicht folgen.`),
  });
  return (
    <form
      className="space-y-6"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        run({ title, handles, body });
      }}
    >
      <Field label="Name der Gruppe" error={fields.title}>
        {(p) => <Input {...p} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={60} placeholder="z. B. Strickrunde Oerlikon" autoFocus />}
      </Field>
      <div>
        <p className="mb-1.5 text-[13px] font-semibold">
          Mitglieder <span className="font-normal text-muted">· {handles.length} gewählt, mindestens 2</span>
        </p>
        <PeoplePicker candidates={candidates} value={handles} onChange={setHandles} max={GROUP_MAX_MEMBERS - 1} />
        {fields.handles && <p className="mt-1.5 text-[13px] font-medium text-danger" role="alert">{fields.handles}</p>}
        <p className="mt-2 text-xs text-muted">Wer nur Nachrichten von Personen annimmt, denen sie oder er folgt, bekommt eine Einladung und entscheidet selbst.</p>
      </div>
      <Field label="Erste Nachricht" optional>
        {(p) => <Textarea {...p} value={body} onChange={(e) => setBody(e.target.value)} maxLength={5000} rows={3} placeholder="Hallo zusammen …" />}
      </Field>
      <div className="flex justify-end">
        <Button type="submit" disabled={pending || !title.trim() || handles.length < 2}>
          {pending ? "Wird erstellt …" : "Gruppe erstellen"}
        </Button>
      </div>
    </form>
  );
}
