"use client";

import { useState } from "react";
import { COUNTRY_LABEL, SHIP_COUNTRIES } from "@werkraum/shared";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { useAction } from "@/lib/use-action";
import { saveCustomerDetailsAction } from "@/app/(app)/einstellungen/actions";
import type { Details } from "@/components/commerce/checkout-form";

const EMPTY: Details = { firstName: "", lastName: "", line1: "", line2: "", postalCode: "", city: "", country: "CH", phone: "" };

/** Name, Rechnungsadresse und Telefon für Bestellungen – einmal erfasst, überall verwendet. */
export function CustomerDetailsForm({ initial }: { initial: Details | null }) {
  const [d, setD] = useState<Details>(initial ?? EMPTY);
  const { run, pending, fields } = useAction(saveCustomerDetailsAction);
  const set = (k: keyof Details) => (e: { target: { value: string } }) => setD((s) => ({ ...s, [k]: e.target.value }));
  const dirty = JSON.stringify(d) !== JSON.stringify(initial ?? EMPTY);
  return (
    <form
      className="max-w-xl space-y-4"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        run(d);
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Vorname" error={fields.firstName}>
          {(p) => <Input {...p} autoComplete="given-name" value={d.firstName} onChange={set("firstName")} />}
        </Field>
        <Field label="Nachname" error={fields.lastName}>
          {(p) => <Input {...p} autoComplete="family-name" value={d.lastName} onChange={set("lastName")} />}
        </Field>
      </div>
      <Field label="Strasse und Hausnummer" error={fields.line1}>
        {(p) => <Input {...p} autoComplete="address-line1" value={d.line1} onChange={set("line1")} />}
      </Field>
      <Field label="Adresszusatz" optional error={fields.line2}>
        {(p) => <Input {...p} autoComplete="address-line2" value={d.line2} onChange={set("line2")} />}
      </Field>
      <div className="grid grid-cols-[8rem_1fr] gap-3">
        <Field label="PLZ" error={fields.postalCode}>
          {(p) => <Input {...p} autoComplete="postal-code" inputMode="numeric" value={d.postalCode} onChange={set("postalCode")} />}
        </Field>
        <Field label="Ort" error={fields.city}>
          {(p) => <Input {...p} autoComplete="address-level2" value={d.city} onChange={set("city")} />}
        </Field>
      </div>
      <Field label="Land" error={fields.country}>
        {(p) => (
          <Select {...p} autoComplete="country" value={d.country} onChange={set("country")}>
            {SHIP_COUNTRIES.map((c) => (
              <option key={c} value={c}>
                {COUNTRY_LABEL[c]}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <Field label="Telefon" optional error={fields.phone} hint="Nur für Rückfragen zu einer Lieferung.">
        {(p) => <Input {...p} type="tel" autoComplete="tel" value={d.phone} onChange={set("phone")} />}
      </Field>
      <Button type="submit" disabled={pending || !dirty}>
        {pending ? "Speichert …" : "Angaben speichern"}
      </Button>
    </form>
  );
}
