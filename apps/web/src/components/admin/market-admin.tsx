"use client";

import { useState } from "react";
import { Pencil } from "lucide-react";
import type { ActionResult } from "@/server/errors";
import { useAction } from "@/lib/use-action";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/field";

/**
 * Bearbeiten-Dialoge der Marktplatz-Verwaltung. Jede Änderung braucht eine interne
 * Begründung (Audit); die optionale Nachricht sieht die Verkäuferin bzw. der Verkäufer.
 */

type Fields = Record<string, string>;
type EditAction = (input: Record<string, unknown>) => Promise<ActionResult<unknown>>;

function ReasonFields({ fields }: { fields: Fields }) {
  return (
    <div className="space-y-4 rounded-2xl bg-sunken/60 p-4">
      <Field label="Interne Begründung" hint="Wird im Audit-Protokoll gespeichert – nicht für die Verkäuferin bzw. den Verkäufer sichtbar." error={fields.reason ?? fields._}>
        {(p) => <Textarea name="reason" required minLength={5} maxLength={1000} rows={2} {...p} />}
      </Field>
      <Field label="Nachricht an den Shop" optional hint="Sachlich und konkret. Erscheint in der Benachrichtigung." error={fields.publicNote}>
        {(p) => <Textarea name="publicNote" maxLength={1000} rows={2} {...p} />}
      </Field>
    </div>
  );
}

function Footer({ pending, onCancel }: { pending: boolean; onCancel: () => void }) {
  return (
    <div className="flex justify-end gap-2 border-t border-line pt-4">
      <Button variant="ghost" onClick={onCancel}>
        Abbrechen
      </Button>
      <Button type="submit" disabled={pending} aria-busy={pending}>
        {pending ? "Wird gespeichert …" : "Änderungen speichern"}
      </Button>
    </div>
  );
}

function useEditDialog(action: EditAction) {
  const [open, setOpen] = useState(false);
  const { run, pending, fields } = useAction(action, { onSuccess: () => setOpen(false) });
  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    run(Object.fromEntries(new FormData(e.currentTarget).entries()) as Record<string, unknown>);
  };
  return { open, setOpen, pending, fields, submit };
}

export function ShopEditButton({
  action,
  initial,
}: {
  action: EditAction;
  initial: { name: string; tagline: string; description: string; shippingPolicy: string; returnPolicy: string; processingDays: number };
}) {
  const d = useEditDialog(action);
  const f = d.fields;
  return (
    <>
      <Button size="sm" variant="outline" onClick={() => d.setOpen(true)}>
        <Pencil size={14} aria-hidden /> Bearbeiten
      </Button>
      <Dialog open={d.open} onClose={() => d.setOpen(false)} title="Shopangaben bearbeiten" description="Korrekturen an öffentlichen Angaben. Die Shop-Adresse (Slug) bleibt unverändert, damit Links nicht brechen." wide>
        <form className="space-y-4" onSubmit={d.submit}>
          <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_160px]">
            <Field label="Name" error={f.name}>
              {(p) => <Input name="name" defaultValue={initial.name} required minLength={2} maxLength={60} {...p} />}
            </Field>
            <Field label="Bearbeitungszeit (Tage)" error={f.processingDays}>
              {(p) => <Input name="processingDays" type="number" min={0} max={120} defaultValue={initial.processingDays} required {...p} />}
            </Field>
          </div>
          <Field label="Kurzbeschreibung" optional error={f.tagline}>
            {(p) => <Input name="tagline" defaultValue={initial.tagline} maxLength={120} {...p} />}
          </Field>
          <Field label="Beschreibung" optional error={f.description}>
            {(p) => <Textarea name="description" defaultValue={initial.description} maxLength={4000} rows={4} {...p} />}
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Versandbedingungen" optional error={f.shippingPolicy}>
              {(p) => <Textarea name="shippingPolicy" defaultValue={initial.shippingPolicy} maxLength={4000} rows={3} {...p} />}
            </Field>
            <Field label="Rückgabebedingungen" optional error={f.returnPolicy}>
              {(p) => <Textarea name="returnPolicy" defaultValue={initial.returnPolicy} maxLength={4000} rows={3} {...p} />}
            </Field>
          </div>
          <ReasonFields fields={f} />
          <Footer pending={d.pending} onCancel={() => d.setOpen(false)} />
        </form>
      </Dialog>
    </>
  );
}

export function ProductEditButton({
  action,
  initial,
  categories,
  canEditPrice,
  currency,
  size = "sm",
  variant = "outline",
}: {
  action: EditAction;
  initial: { title: string; description: string; category: string; materials: string; dimensions: string; safetyInfo: string; returnPolicy: string; price: string };
  categories: { value: string; label: string }[];
  canEditPrice: boolean;
  currency: string;
  size?: "sm" | "md";
  variant?: "outline" | "ghost";
}) {
  const d = useEditDialog(action);
  const f = d.fields;
  return (
    <>
      <Button size={size} variant={variant} onClick={() => d.setOpen(true)} aria-label={`„${initial.title}“ bearbeiten`}>
        <Pencil size={14} aria-hidden /> Bearbeiten
      </Button>
      <Dialog open={d.open} onClose={() => d.setOpen(false)} title="Angebot bearbeiten" description="Korrekturen an Titel, Beschreibung und Angaben. Bilder, Varianten und Bestand pflegt der Shop selbst." wide>
        <form className="space-y-4" onSubmit={d.submit}>
          <Field label="Titel" error={f.title}>
            {(p) => <Input name="title" defaultValue={initial.title} required minLength={3} maxLength={140} {...p} />}
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Kategorie" error={f.category}>
              {(p) => (
                <Select name="category" defaultValue={initial.category} {...p}>
                  {categories.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field
              label={`Preis (${currency})`}
              hint={canEditPrice ? "Grundpreis ohne Varianten-Aufpreis. Bestehende Bestellungen bleiben unverändert." : "Preise ändert nur die Administration."}
              error={f.price}
            >
              {(p) => <Input name="price" inputMode="decimal" defaultValue={initial.price} disabled={!canEditPrice} {...p} />}
            </Field>
          </div>
          <Field label="Beschreibung" optional error={f.description}>
            {(p) => <Textarea name="description" defaultValue={initial.description} maxLength={10000} rows={5} {...p} />}
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Materialien" optional error={f.materials}>
              {(p) => <Textarea name="materials" defaultValue={initial.materials} maxLength={1000} rows={2} {...p} />}
            </Field>
            <Field label="Masse" optional error={f.dimensions}>
              {(p) => <Input name="dimensions" defaultValue={initial.dimensions} maxLength={200} {...p} />}
            </Field>
            <Field label="Sicherheitshinweise" optional error={f.safetyInfo}>
              {(p) => <Textarea name="safetyInfo" defaultValue={initial.safetyInfo} maxLength={2000} rows={2} {...p} />}
            </Field>
            <Field label="Rückgabe" optional error={f.returnPolicy}>
              {(p) => <Textarea name="returnPolicy" defaultValue={initial.returnPolicy} maxLength={2000} rows={2} {...p} />}
            </Field>
          </div>
          <ReasonFields fields={f} />
          <Footer pending={d.pending} onCancel={() => d.setOpen(false)} />
        </form>
      </Dialog>
    </>
  );
}
