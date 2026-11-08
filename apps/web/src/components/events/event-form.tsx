"use client";

import { useEffect, useState } from "react";
import { MapPin, Video } from "lucide-react";
import { EVENT_KINDS, EVENT_KIND_LABEL } from "@werkraum/shared";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/field";
import { useAction } from "@/lib/use-action";
import { cn } from "@/lib/utils";
import { createEventAction, updateEventAction } from "@/app/(app)/communities/event-actions";

export type EventFormValues = {
  title: string;
  description: string;
  kind: string;
  mode: "IN_PERSON" | "ONLINE";
  startsAt: string;
  endsAt: string;
  locationName: string;
  address: string;
  onlineUrl: string;
  capacity: string;
  costNote: string;
};

/** ISO → Wert für <input type="datetime-local"> in der Zeitzone des Browsers. */
export function toLocalInput(iso: string | null | undefined) {
  if (!iso) return "";
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

const chip = (on: boolean) =>
  cn("inline-flex h-10 items-center gap-2 rounded-xl border px-4 text-sm font-semibold transition-colors", on ? "border-moss bg-moss text-paper" : "border-line-strong bg-card hover:border-rule-strong");

export function EventForm({ communityId, slug, eventId, initial }: { communityId: string; slug: string; eventId?: string; initial?: Partial<EventFormValues> }) {
  const [v, setV] = useState<EventFormValues>({
    title: "",
    description: "",
    kind: "MEETUP",
    mode: "IN_PERSON",
    startsAt: "",
    endsAt: "",
    locationName: "",
    address: "",
    onlineUrl: "",
    capacity: "",
    costNote: "",
    ...initial,
  });
  const set = <K extends keyof EventFormValues>(k: K, val: EventFormValues[K]) => setV((p) => ({ ...p, [k]: val }));
  // Gespeicherte Zeiten (ISO) erst im Browser in dessen Ortszeit umrechnen
  useEffect(() => {
    if (initial?.startsAt?.endsWith("Z")) setV((p) => ({ ...p, startsAt: toLocalInput(initial.startsAt), endsAt: toLocalInput(initial.endsAt) }));
  }, [initial?.startsAt, initial?.endsAt]);
  const create = useAction(createEventAction.bind(null, communityId, slug), { redirect: (d) => d.href });
  const update = useAction(updateEventAction.bind(null, eventId ?? "", slug), { redirect: (d) => d.href });
  const { run, pending, fields } = eventId ? update : create;
  const min = toLocalInput(new Date().toISOString());

  return (
    <form
      className="space-y-7"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        run({
          ...v,
          startsAt: v.startsAt ? new Date(v.startsAt).toISOString() : "",
          endsAt: v.endsAt ? new Date(v.endsAt).toISOString() : "",
          capacity: v.capacity ? Number(v.capacity) : null,
        });
      }}
    >
      <Field label="Titel" error={fields.title}>
        {(p) => <Input {...p} value={v.title} onChange={(e) => set("title", e.target.value)} maxLength={120} placeholder="z. B. Amigurumi für Anfänger:innen" autoFocus={!eventId} />}
      </Field>

      <fieldset>
        <legend className="mb-2 text-[13px] font-semibold">Art</legend>
        <div className="flex flex-wrap gap-2">
          {EVENT_KINDS.map((k) => (
            <button key={k} type="button" className={chip(v.kind === k)} aria-pressed={v.kind === k} onClick={() => set("kind", k)}>
              {EVENT_KIND_LABEL[k]}
            </button>
          ))}
        </div>
      </fieldset>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Beginn" error={fields.startsAt}>
          {(p) => (
            <Input
              {...p}
              type="datetime-local"
              min={eventId ? undefined : min}
              value={v.startsAt}
              onChange={(e) => {
                const start = e.target.value;
                // Ende automatisch zwei Stunden später vorschlagen
                if (start && (!v.endsAt || v.endsAt <= start)) set("endsAt", toLocalInput(new Date(new Date(start).getTime() + 2 * 3600_000).toISOString()));
                set("startsAt", start);
              }}
            />
          )}
        </Field>
        <Field label="Ende" error={fields.endsAt}>
          {(p) => <Input {...p} type="datetime-local" min={v.startsAt || min} value={v.endsAt} onChange={(e) => set("endsAt", e.target.value)} />}
        </Field>
      </div>

      <fieldset>
        <legend className="mb-2 text-[13px] font-semibold">Ort</legend>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={chip(v.mode === "IN_PERSON")} aria-pressed={v.mode === "IN_PERSON"} onClick={() => set("mode", "IN_PERSON")}>
            <MapPin size={15} aria-hidden /> Vor Ort
          </button>
          <button type="button" className={chip(v.mode === "ONLINE")} aria-pressed={v.mode === "ONLINE"} onClick={() => set("mode", "ONLINE")}>
            <Video size={15} aria-hidden /> Online
          </button>
        </div>
        {v.mode === "IN_PERSON" ? (
          <div className="mt-4 grid gap-5 sm:grid-cols-2">
            <Field label="Treffpunkt" error={fields.locationName} hint="Name des Ortes, z. B. Café, Werkstatt, Quartiertreff.">
              {(p) => <Input {...p} value={v.locationName} onChange={(e) => set("locationName", e.target.value)} maxLength={120} />}
            </Field>
            <Field label="Adresse" optional error={fields.address}>
              {(p) => <Input {...p} value={v.address} onChange={(e) => set("address", e.target.value)} maxLength={200} placeholder="Strasse, PLZ Ort" />}
            </Field>
          </div>
        ) : (
          <div className="mt-4">
            <Field label="Link zum Online-Treffen" error={fields.onlineUrl} hint="Nur Teilnehmende mit Zusage sehen den Link.">
              {(p) => <Input {...p} type="url" inputMode="url" value={v.onlineUrl} onChange={(e) => set("onlineUrl", e.target.value)} maxLength={500} placeholder="https://" />}
            </Field>
          </div>
        )}
      </fieldset>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Plätze" optional error={fields.capacity} hint="Leer lassen für unbegrenzt.">
          {(p) => <Input {...p} type="number" inputMode="numeric" min={1} value={v.capacity} onChange={(e) => set("capacity", e.target.value)} />}
        </Field>
        <Field label="Kosten" optional error={fields.costNote} hint="Hinweis, z. B. „CHF 15 Material, bar vor Ort“.">
          {(p) => <Input {...p} value={v.costNote} onChange={(e) => set("costNote", e.target.value)} maxLength={120} />}
        </Field>
      </div>

      <Field label="Beschreibung" optional error={fields.description} hint="Was passiert, was bringt man mit, für wen ist es geeignet?">
        {(p) => <Textarea {...p} value={v.description} onChange={(e) => set("description", e.target.value)} maxLength={4000} rows={6} />}
      </Field>

      <div className="flex justify-end gap-2 border-t border-line pt-5">
        <Button type="submit" disabled={pending}>
          {pending ? "Wird gespeichert …" : eventId ? "Änderungen speichern" : "Event veröffentlichen"}
        </Button>
      </div>
    </form>
  );
}
