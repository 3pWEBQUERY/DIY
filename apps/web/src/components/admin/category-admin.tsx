"use client";

import { confirmDialog } from "@/components/ui/confirm";
import { useState } from "react";
import { GitMerge, Pencil, Trash2 } from "lucide-react";
import type { ActionResult } from "@/server/errors";
import { useAction } from "@/lib/use-action";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/field";

type ReasonInput = { reason: string; choice?: string };

/** Bearbeiten der Overrides einer DIY-Kategorie. Leere Felder = Standard aus packages/shared. */
export function CategoryEditButton({
  initial,
  defaults,
  action,
}: {
  initial: { name: string; short: string; description: string; sortOrder: number | null; focus: boolean | null };
  defaults: { name: string; short: string; focus: boolean; position: number };
  action: (input: Record<string, unknown>) => Promise<ActionResult<unknown>>;
}) {
  const [open, setOpen] = useState(false);
  const { run, pending, fields } = useAction(action, { onSuccess: () => setOpen(false) });
  const focusDefault = initial.focus === null ? "default" : initial.focus ? "yes" : "no";
  return (
    <>
      <Button size="sm" variant="ink" onClick={() => setOpen(true)}>
        <Pencil size={14} aria-hidden /> Bearbeiten
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Kategorie bearbeiten" description="Der Slug bleibt fix (geteilt mit der iOS-App und auf Inhalten gespeichert). Leere Felder verwenden den Standard.">
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            run(Object.fromEntries(new FormData(e.currentTarget).entries()));
          }}
        >
          <Field label="Name" optional hint={`Standard: ${defaults.name}`} error={fields.name}>
            {(p) => <Input name="name" defaultValue={initial.name} placeholder={defaults.name} maxLength={80} {...p} />}
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Kurzname" optional hint={`Standard: ${defaults.short}`} error={fields.short}>
              {(p) => <Input name="short" defaultValue={initial.short} placeholder={defaults.short} maxLength={24} {...p} />}
            </Field>
            <Field label="Reihenfolge" optional hint={`Standard: ${defaults.position}`} error={fields.sortOrder}>
              {(p) => <Input name="sortOrder" type="number" min={1} max={999} defaultValue={initial.sortOrder ?? ""} placeholder={String(defaults.position)} {...p} />}
            </Field>
          </div>
          <Field label="Beschreibung" optional hint="Erscheint als Einleitung auf „Entdecken“ für diese Kategorie." error={fields.description}>
            {(p) => <Textarea name="description" defaultValue={initial.description} rows={3} maxLength={500} {...p} />}
          </Field>
          <Field label="Startschwerpunkt" error={fields.focus}>
            {(p) => (
              <Select name="focus" defaultValue={focusDefault} {...p}>
                <option value="default">Standard ({defaults.focus ? "Ja" : "Nein"})</option>
                <option value="yes">Ja</option>
                <option value="no">Nein</option>
              </Select>
            )}
          </Field>
          <div className="flex justify-end gap-2 border-t border-line pt-4">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Abbrechen
            </Button>
            <Button type="submit" variant="ink" disabled={pending} aria-busy={pending}>
              {pending ? "Speichert …" : "Speichern"}
            </Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}

/**
 * Dublette zusammenführen: Verweise auf das Ziel umhängen, Quelle löschen.
 * Leitet danach auf die Detailseite des Ziels weiter (die Quelle existiert nicht mehr).
 */
export function MergeButton({
  noun,
  sourceName,
  options,
  usage,
  hrefBase,
  action,
}: {
  noun: "Material" | "Werkzeug";
  sourceName: string;
  options: { value: string; label: string }[];
  usage: number;
  hrefBase: string;
  action: (input: ReasonInput) => Promise<ActionResult<{ targetId: string; moved: number }>>;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const { run, pending, fields } = useAction(action, { redirect: (d) => `${hrefBase}/${d.targetId}`, onSuccess: () => setOpen(false) });
  const needle = q.trim().toLowerCase();
  const filtered = needle ? options.filter((o) => o.label.toLowerCase().includes(needle)) : options;
  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)} disabled={options.length === 0}>
        <GitMerge size={14} aria-hidden /> Zusammenführen
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={`${noun} zusammenführen`}
        description={`„${sourceName}“ wird gelöscht. ${usage} Verweis${usage === 1 ? "" : "e"} in Projekten${noun === "Material" ? " und Einkaufslisten" : ""} zeigen danach auf das gewählte Ziel.`}
      >
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            run({ choice: String(fd.get("choice") ?? ""), reason: String(fd.get("reason") ?? "") });
          }}
        >
          <Field label="Ziel filtern" optional>
            {(p) => <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name eingeben …" {...p} />}
          </Field>
          <Field label={`Ziel (${filtered.length})`} error={fields.choice ?? fields.targetId}>
            {(p) => (
              <Select key={needle} name="choice" defaultValue={filtered[0]?.value} placeholder="Kein Treffer" {...p}>
                {filtered.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Interne Begründung" hint="Wird im Audit-Protokoll gespeichert." error={fields.reason ?? fields._}>
            {(p) => <Textarea name="reason" required minLength={5} maxLength={1000} rows={3} {...p} />}
          </Field>
          <div className="flex justify-end gap-2 border-t border-line pt-4">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Abbrechen
            </Button>
            <Button type="submit" variant="danger" disabled={pending || filtered.length === 0} aria-busy={pending}>
              {pending ? "Wird zusammengeführt …" : "Zusammenführen"}
            </Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}

/** Löschen von einer Detailseite aus – leitet danach zur Übersicht zurück. */
export function DeleteEntryButton({ action, confirm, redirect }: { action: () => Promise<ActionResult<unknown>>; confirm: string; redirect: string }) {
  const { run, pending } = useAction(action, { redirect });
  return (
    <Button
      size="sm"
      variant="ghost"
      disabled={pending}
      aria-busy={pending}
      onClick={async () => {
        if ((await confirmDialog(confirm))) run();
      }}
    >
      <Trash2 size={14} aria-hidden /> Löschen
    </Button>
  );
}
