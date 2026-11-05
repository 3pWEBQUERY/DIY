"use client";

import { useId, useState, type ReactNode } from "react";
import { Pencil } from "lucide-react";
import { useAction } from "@/lib/use-action";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, FieldError, Hint, Input, Textarea } from "@/components/ui/field";
import { cn } from "@/lib/utils";
import { updateContentAction } from "@/app/admin/inhalte/actions";

type Kind = "PROJECT" | "TUTORIAL" | "POST" | "ARTICLE";
type Option = { value: string; label: string };

export type ContentEditValues = {
  title?: string;
  summary?: string;
  category?: string | null;
  categoryId?: string | null;
  visibility?: string;
  difficulty?: number;
};

/**
 * Auswahl als Pillen (Radiogruppe). Bewusst ohne Popover: Im modalen <dialog>
 * liegt alles ausserhalb im „inert“-Bereich, eine ausgelagerte Liste wäre nicht bedienbar.
 */
function PillGroup({ label, name, options, defaultValue, error, hint, optional }: { label: string; name: string; options: Option[]; defaultValue?: string | null; error?: string; hint?: ReactNode; optional?: boolean }) {
  const id = useId();
  return (
    <fieldset aria-describedby={error ? `${id}-err` : hint ? `${id}-hint` : undefined}>
      <legend className="mb-1.5 block text-[13px] font-semibold text-ink">
        {label}
        {optional && <span className="ml-1.5 font-normal text-muted">optional</span>}
      </legend>
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => (
          <label
            key={o.value}
            className={cn(
              "inline-flex h-8 cursor-pointer items-center rounded-full border border-line-strong bg-card px-3 text-[13px] text-ink-2 transition-colors hover:border-rule-strong",
              "has-[:checked]:border-moss has-[:checked]:bg-moss-soft has-[:checked]:font-semibold has-[:checked]:text-moss-ink",
              "has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-1 has-[:focus-visible]:outline-moss",
            )}
          >
            <input type="radio" name={name} value={o.value} defaultChecked={(defaultValue ?? "") === o.value} className="sr-only" />
            {o.label}
          </label>
        ))}
      </div>
      {hint && !error && <Hint id={`${id}-hint`}>{hint}</Hint>}
      <FieldError id={`${id}-err`}>{error}</FieldError>
    </fieldset>
  );
}

/** Metadaten eines Inhalts korrigieren (Admin → Inhalte → Detail). Slugs bleiben unverändert. */
export function EditContentButton({
  kind,
  id,
  values,
  categories,
  visibilities,
  difficulties,
}: {
  kind: Kind;
  id: string;
  values: ContentEditValues;
  categories: Option[];
  visibilities?: Option[];
  difficulties?: Option[];
}) {
  const [open, setOpen] = useState(false);
  const { run, pending, fields } = useAction(updateContentAction.bind(null, kind, id), {
    success: (d) => (d.changed ? "Änderungen gespeichert. Die Person wurde informiert." : "Keine Änderungen."),
    onSuccess: () => setOpen(false),
  });
  const hasTitle = kind !== "POST";
  const summaryLabel = kind === "PROJECT" ? "Beschreibung" : kind === "ARTICLE" ? "Vorspann (Dek)" : "Zusammenfassung";
  const summaryMax = kind === "PROJECT" ? 10_000 : kind === "ARTICLE" ? 400 : 2000;
  const known = ["title", "summary", "category", "categoryId", "visibility", "difficulty", "reason"];
  const other = Object.entries(fields).find(([k]) => !known.includes(k))?.[1];

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <Pencil size={14} aria-hidden /> Bearbeiten
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} wide title="Angaben bearbeiten" description="Korrekturen an Metadaten – der Link (Slug) bleibt unverändert. Jede Änderung wird begründet protokolliert und die Person informiert.">
        <form
          className="space-y-5"
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            const s = (k: string) => (fd.has(k) ? String(fd.get(k) ?? "") : undefined);
            run({
              title: s("title"),
              summary: s("summary"),
              category: kind === "ARTICLE" ? undefined : (s("category") ?? ""),
              categoryId: kind === "ARTICLE" ? (s("categoryId") ?? "") : undefined,
              visibility: s("visibility"),
              difficulty: s("difficulty"),
              reason: s("reason") ?? "",
            });
          }}
        >
          {hasTitle && (
            <Field label="Titel" error={fields.title}>
              {(p) => <Input name="title" defaultValue={values.title ?? ""} required minLength={3} maxLength={kind === "ARTICLE" ? 160 : kind === "TUTORIAL" ? 140 : 120} {...p} />}
            </Field>
          )}
          {hasTitle && (
            <Field label={summaryLabel} optional error={fields.summary}>
              {(p) => <Textarea name="summary" defaultValue={values.summary ?? ""} maxLength={summaryMax} rows={kind === "PROJECT" ? 6 : 3} {...p} />}
            </Field>
          )}
          {kind === "ARTICLE" ? (
            <PillGroup label="Rubrik" name="categoryId" options={[{ value: "", label: "Ohne Rubrik" }, ...categories]} defaultValue={values.categoryId ?? ""} error={fields.categoryId} />
          ) : (
            <PillGroup
              label="Kategorie"
              name="category"
              options={kind === "POST" ? [{ value: "", label: "Ohne Kategorie" }, ...categories] : categories}
              defaultValue={values.category ?? ""}
              error={fields.category}
            />
          )}
          {visibilities && <PillGroup label="Sichtbarkeit" name="visibility" options={visibilities} defaultValue={values.visibility} error={fields.visibility} hint="Nicht öffentliche Projekte verlieren eine allfällige Hervorhebung." />}
          {difficulties && <PillGroup label="Niveau" name="difficulty" options={difficulties} defaultValue={values.difficulty != null ? String(values.difficulty) : undefined} error={fields.difficulty} />}
          <Field label="Interne Begründung" hint="Wird im Audit-Protokoll gespeichert – nicht für die betroffene Person sichtbar." error={fields.reason ?? fields._ ?? other}>
            {(p) => <Textarea name="reason" required minLength={5} maxLength={1000} rows={3} {...p} />}
          </Field>
          <div className="flex justify-end gap-2 border-t border-line pt-4">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Abbrechen
            </Button>
            <Button type="submit" variant="ink" disabled={pending} aria-busy={pending}>
              {pending ? "Wird gespeichert …" : "Änderungen speichern"}
            </Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
