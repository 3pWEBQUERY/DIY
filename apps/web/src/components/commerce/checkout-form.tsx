"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Lock } from "lucide-react";
import { COUNTRY_LABEL, SHIP_COUNTRIES, formatMoney, type Currency } from "@werkraum/shared";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Notice } from "@/components/ui/misc";
import { toast } from "@/components/ui/toast";
import { startCheckoutAction } from "@/app/(app)/markt/actions";

type Address = { name: string; line1: string; line2: string; postalCode: string; city: string; country: string };

/**
 * Kasse: Liefer-/Rechnungsadresse → Weiterleitung zum Zahlungsanbieter.
 * Ein Idempotenzschlüssel pro Formular verhindert Doppelbestellungen bei Doppelklick oder Retry.
 */
export function CheckoutForm({
  initial,
  totalMinor,
  currency,
  orderCount,
  mode,
  digitalOnly,
}: {
  initial: Partial<Address>;
  totalMinor: number;
  currency: Currency;
  orderCount: number;
  mode: "stripe" | "simulated";
  digitalOnly: boolean;
}) {
  const router = useRouter();
  const idempotencyKey = useMemo(() => crypto.randomUUID(), []);
  const [a, setA] = useState<Address>({ name: "", line1: "", line2: "", postalCode: "", city: "", country: "CH", ...initial } as Address);
  const [note, setNote] = useState("");
  const [fields, setFields] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const set = (k: keyof Address) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setA((s) => ({ ...s, [k]: e.target.value }));
  const f = (k: keyof Address) => fields[`address.${k}`];

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    start(async () => {
      const r = await startCheckoutAction({ address: a, buyerNote: note, idempotencyKey, expectedTotalMinor: totalMinor });
      if (r.ok) {
        if (/^https?:\/\//.test(r.data.url)) window.location.assign(r.data.url);
        else router.push(r.data.url);
        return;
      }
      setFields(r.fields ?? {});
      setError(r.error);
      if (r.code === "UNAUTHENTICATED") router.push("/anmelden?weiter=/kasse");
      else if (r.code === "CONFLICT") {
        toast(r.error, "error");
        router.refresh();
      }
    });
  }

  return (
    <form onSubmit={submit} className="space-y-8" noValidate>
      <fieldset className="space-y-4">
        <legend className="mb-1 text-[15px] font-bold">{digitalOnly ? "Rechnungsadresse" : "Lieferadresse"}</legend>
        <Field label="Vor- und Nachname" error={f("name")}>
          {(p) => <Input {...p} autoComplete="name" value={a.name} onChange={set("name")} required />}
        </Field>
        <Field label="Strasse und Hausnummer" error={f("line1")}>
          {(p) => <Input {...p} autoComplete="address-line1" value={a.line1} onChange={set("line1")} required />}
        </Field>
        <Field label="Adresszusatz" optional error={f("line2")}>
          {(p) => <Input {...p} autoComplete="address-line2" value={a.line2} onChange={set("line2")} />}
        </Field>
        <div className="grid grid-cols-[8rem_1fr] gap-3">
          <Field label="PLZ" error={f("postalCode")}>
            {(p) => <Input {...p} autoComplete="postal-code" inputMode="numeric" value={a.postalCode} onChange={set("postalCode")} required />}
          </Field>
          <Field label="Ort" error={f("city")}>
            {(p) => <Input {...p} autoComplete="address-level2" value={a.city} onChange={set("city")} required />}
          </Field>
        </div>
        <Field label="Land" error={f("country")} hint="Versand derzeit innerhalb der Schweiz, nach Deutschland, Österreich und Liechtenstein.">
          {(p) => (
            <Select {...p} autoComplete="country" value={a.country} onChange={set("country")}>
              {SHIP_COUNTRIES.map((c) => (
                <option key={c} value={c}>
                  {COUNTRY_LABEL[c]}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </fieldset>

      <Field label="Nachricht an den Shop" optional hint="Z.B. Wunschfarbe oder Liefertermin. Der Shop sieht sie mit deiner Bestellung.">
        {(p) => <Textarea {...p} value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} rows={3} />}
      </Field>

      {mode === "simulated" && (
        <Notice tone="warn" title="Testmodus – keine echte Zahlung">
          Stripe ist in dieser Umgebung nicht konfiguriert. Du wirst zu einer klar gekennzeichneten Testseite geleitet, auf der du eine Zahlung simulieren kannst.
        </Notice>
      )}
      {orderCount > 1 && (
        <Notice title={`${orderCount} getrennte Bestellungen`}>
          Deine Artikel stammen aus {orderCount} Shops. Jede Bestellung wird einzeln bezahlt und direkt vom jeweiligen Shop versendet. Nach der ersten Zahlung zeigen wir dir die nächste.
        </Notice>
      )}
      {error && !Object.keys(fields).length && (
        <p role="alert" className="text-[14px] font-medium text-danger">
          {error}
        </p>
      )}

      <div className="space-y-3">
        <Button type="submit" size="lg" className="w-full" disabled={pending}>
          <Lock size={15} />
          {pending ? "Einen Moment …" : `Zahlungspflichtig bestellen · ${formatMoney(totalMinor, currency)}`}
        </Button>
        <p className="text-center text-[12.5px] leading-relaxed text-muted">
          {mode === "stripe" ? "Du bezahlst sicher über Stripe. Kartendaten werden nicht bei WERKRAUM gespeichert." : "Im Testmodus wird nichts belastet."} Mit der Bestellung akzeptierst du die{" "}
          <a href="/richtlinien/marktplatz" className="underline underline-offset-2 hover:text-ink">Marktplatz-Richtlinien</a> und die Rückgabebedingungen der Shops.
        </p>
      </div>
    </form>
  );
}
