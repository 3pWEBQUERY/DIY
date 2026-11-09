"use client";

import { useState } from "react";
import { Pencil, Plus } from "lucide-react";
import type { ActionResult } from "@/server/errors";
import { useAction } from "@/lib/use-action";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/field";

type Entity = "materialCategory" | "material" | "tool";
type Values = Record<string, string>;

const TITLES: Record<Entity, string> = { materialCategory: "Materialkategorie", material: "Material", tool: "Werkzeug" };

/** Anlegen/Bearbeiten eines Eintrags der Materialdatenbank im Dialog. */
export function CatalogDialogButton({
  entity,
  id,
  initial,
  categories = [],
  action,
  variant = "ghost",
}: {
  entity: Entity;
  id?: string;
  initial?: Values;
  categories?: { id: string; name: string }[];
  action: (entity: Entity, id: string | null, input: Record<string, unknown>) => Promise<ActionResult<unknown>>;
  /** Darstellung des Bearbeiten-Buttons (Detailseiten: „ink“) */
  variant?: "ghost" | "ink" | "outline";
}) {
  const [open, setOpen] = useState(false);
  const { run, pending, fields } = useAction(action, { onSuccess: () => setOpen(false) });
  const v = initial ?? {};
  return (
    <>
      {id ? (
        <Button size="sm" variant={variant} onClick={() => setOpen(true)} aria-label={`${TITLES[entity]} „${v.name}“ bearbeiten`}>
          <Pencil size={14} aria-hidden /> Bearbeiten
        </Button>
      ) : (
        <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
          <Plus size={14} aria-hidden /> {TITLES[entity]}
        </Button>
      )}
      <Dialog open={open} onClose={() => setOpen(false)} title={`${TITLES[entity]} ${id ? "bearbeiten" : "anlegen"}`}>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            run(entity, id ?? null, Object.fromEntries(fd.entries()));
          }}
        >
          <Field label="Name" error={fields.name}>
            {(p) => <Input name="name" defaultValue={v.name} required maxLength={120} {...p} />}
          </Field>
          {entity === "material" && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Typ" hint="z. B. Garn, Stoff, Holz" error={fields.type}>
                  {(p) => <Input name="type" defaultValue={v.type} required maxLength={60} {...p} />}
                </Field>
                <Field label="Einheit" error={fields.unit}>
                  {(p) => <Input name="unit" defaultValue={v.unit ?? "Stk"} required maxLength={20} {...p} />}
                </Field>
              </div>
              <Field label="Kategorie" error={fields.categoryId}>
                {(p) => (
                  <Select name="categoryId" defaultValue={v.categoryId ?? categories[0]?.id} required {...p}>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
              <Field label="Marke" optional error={fields.brand}>
                {(p) => <Input name="brand" defaultValue={v.brand} maxLength={80} {...p} />}
              </Field>
            </>
          )}
          {entity !== "materialCategory" && (
            <>
              <Field label="Hinweise" optional error={fields.notes}>
                {(p) => <Textarea name="notes" defaultValue={v.notes} rows={2} maxLength={1000} {...p} />}
              </Field>
              <Field label="Sicherheitshinweis" optional hint="Wird bei Projekten und Anleitungen angezeigt, die diesen Eintrag verwenden." error={fields.safetyInfo}>
                {(p) => <Textarea name="safetyInfo" defaultValue={v.safetyInfo} rows={2} maxLength={1000} {...p} />}
              </Field>
            </>
          )}
          <div className="flex justify-end gap-2 border-t border-line pt-4">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Abbrechen
            </Button>
            <Button type="submit" variant="ink" disabled={pending}>
              {pending ? "Speichert …" : "Speichern"}
            </Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
