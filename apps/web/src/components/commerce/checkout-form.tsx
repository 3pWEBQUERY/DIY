"use client";

import Link from "next/link";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Lock } from "lucide-react";
import { COUNTRY_LABEL, SHIP_COUNTRIES, formatMoney, type Currency } from "@werkraum/shared";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/field";
import { Notice } from "@/components/ui/misc";
import { toast } from "@/components/ui/toast";
import { startCheckoutAction } from "@/app/(app)/markt/actions";

type Address = { name: string; line1: string; line2: string; postalCode: string; city: string; country: string };
export type Details = { firstName: string; lastName: string; line1: string; line2: string; postalCode: string; city: string; country: string; phone: string };
const EMPTY: Details = { firstName: "", lastName: "", line1: "", line2: "", postalCode: "", city: "", country: "CH", phone: "" };

/**
 * Kasse: persönliche Angaben (einmal erfasst, danach gespeichert) → optional abweichende
 * Lieferadresse → Weiterleitung zum Zahlungsanbieter. Ein Idempotenzschlüssel pro Formular
 * verhindert Doppelbestellungen bei Doppelklick oder Retry.
 */
export function CheckoutForm({
  saved,
  totalMinor,
  currency,
  orderCount,
  mode,
  digitalOnly,
}: {
  saved: Details | null;
  totalMinor: number;
  currency: Currency;
  orderCount: number;
  mode: "stripe" | "simulated";
  digitalOnly: boolean;
}) {
  const router = useRouter();
  const idempotencyKey = useMemo(() => crypto.randomUUID(), []);
  const [d, setD] = useState<Details>(saved ?? EMPTY);
  const [editing, setEditing] = useState(!saved);
  const [saveDetails, setSaveDetails] = useState(true);
  const [shipToOther, setShipToOther] = useState(false);
  const [a, setA] = useState<Address>({ name: "", line1: "", line2: "", postalCode: "", city: "", country: "CH" });
  const [note, setNote] = useState("");
  const [fields, setFields] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  // Fehlermeldung eines Feldes verschwindet, sobald es korrigiert wird
  const clear = (key: string) => setFields((f) => (f[key] ? Object.fromEntries(Object.entries(f).filter(([k]) => k !== key)) : f));
  const setDet = (k: keyof Details) => (e: { target: { value: string } }) => {
    setD((s) => ({ ...s, [k]: e.target.value }));
    clear(`details.${k}`);
  };
  const set = (k: keyof Address) => (e: { target: { value: string } }) => {
    setA((s) => ({ ...s, [k]: e.target.value }));
    clear(`address.${k}`);
  };
  const fd = (k: keyof Details) => fields[`details.${k}`];
  const f = (k: keyof Address) => fields[`address.${k}`];

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    start(async () => {
      const r = await startCheckoutAction({
        details: editing ? d : undefined,
        saveDetails: !saved || saveDetails,
        shipToOther: !digitalOnly && shipToOther,
        address: !digitalOnly && shipToOther ? a : undefined,
        buyerNote: note,
        idempotencyKey,
        expectedTotalMinor: totalMinor,
      });
      if (r.ok) {
        if (/^https?:\/\//.test(r.data.url)) window.location.assign(r.data.url);
        else router.push(r.data.url);
        return;
      }
      setFields(r.fields ?? {});
      if (r.fields && Object.keys(r.fields).some((k) => k.startsWith("details."))) setEditing(true);
      setError(r.error);
      if (r.code === "UNAUTHENTICATED") router.push("/anmelden?weiter=/kasse");
      else if (r.code === "CONFLICT") {
        toast(r.error, "error");
        router.refresh();
      }
    });
  }

  const countrySelect = (value: string, onChange: (e: { target: { value: string } }) => void, error?: string, hint?: string) => (
    <Field label="Land" error={error} hint={hint}>
      {(p) => (
        <Select {...p} value={value} onChange={onChange}>
          {SHIP_COUNTRIES.map((c) => (
            <option key={c} value={c}>
              {COUNTRY_LABEL[c]}
            </option>
          ))}
        </Select>
      )}
    </Field>
  );

  return (
    <form onSubmit={submit} className="space-y-8" noValidate>
      <fieldset className="space-y-4">
        <legend className="mb-1 text-[15px] font-bold">Deine Angaben</legend>
        {!editing && saved ? (
          <div className="flex items-start justify-between gap-4 rounded-2xl border border-line bg-card p-4">
            <address className="not-italic text-[14.5px] leading-relaxed">
              <span className="block font-semibold">{d.firstName} {d.lastName}</span>
              <span className="block">{d.line1}</span>
              {d.line2 && <span className="block">{d.line2}</span>}
              <span className="block">{d.postalCode} {d.city}, {COUNTRY_LABEL[d.country as keyof typeof COUNTRY_LABEL] ?? d.country}</span>
              {d.phone && <span className="block text-muted">{d.phone}</span>}
            </address>
            <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(true)}>
              Ändern
            </Button>
          </div>
        ) : (
          <>
            {!saved && (
              <p className="text-[13.5px] leading-relaxed text-muted">
                Einmalig: Name und Adresse brauchen die Shops für Rechnung und Versand. Wir speichern sie für deine nächsten Bestellungen – ändern kannst du sie jederzeit unter Einstellungen → Konto.
              </p>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Vorname" error={fd("firstName")}>
                {(p) => <Input {...p} autoComplete="given-name" value={d.firstName} onChange={setDet("firstName")} required />}
              </Field>
              <Field label="Nachname" error={fd("lastName")}>
                {(p) => <Input {...p} autoComplete="family-name" value={d.lastName} onChange={setDet("lastName")} required />}
              </Field>
            </div>
            <Field label="Strasse und Hausnummer" error={fd("line1")}>
              {(p) => <Input {...p} autoComplete="address-line1" value={d.line1} onChange={setDet("line1")} required />}
            </Field>
            <Field label="Adresszusatz" optional error={fd("line2")}>
              {(p) => <Input {...p} autoComplete="address-line2" value={d.line2} onChange={setDet("line2")} />}
            </Field>
            <div className="grid grid-cols-[8rem_1fr] gap-3">
              <Field label="PLZ" error={fd("postalCode")}>
                {(p) => <Input {...p} autoComplete="postal-code" inputMode="numeric" value={d.postalCode} onChange={setDet("postalCode")} required />}
              </Field>
              <Field label="Ort" error={fd("city")}>
                {(p) => <Input {...p} autoComplete="address-level2" value={d.city} onChange={setDet("city")} required />}
              </Field>
            </div>
            {countrySelect(d.country, setDet("country"), fd("country"), "Bestellungen derzeit aus der Schweiz, Deutschland, Österreich und Liechtenstein.")}
            <Field label="Telefon" optional error={fd("phone")} hint="Nur für Rückfragen zur Lieferung.">
              {(p) => <Input {...p} type="tel" autoComplete="tel" value={d.phone} onChange={setDet("phone")} />}
            </Field>
            {saved && (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <Checkbox label="Für künftige Bestellungen speichern" checked={saveDetails} onChange={(e) => setSaveDetails(e.target.checked)} />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setD(saved);
                    setEditing(false);
                    setFields({});
                  }}
                >
                  Abbrechen
                </Button>
              </div>
            )}
          </>
        )}
      </fieldset>

      {!digitalOnly && (
        <fieldset className="space-y-4">
          <legend className="sr-only">Lieferadresse</legend>
          <Checkbox label="An eine andere Adresse liefern" checked={shipToOther} onChange={(e) => setShipToOther(e.target.checked)} />
          {shipToOther && (
            <div className="space-y-4 rounded-2xl border border-line bg-card p-4">
              <Field label="Name der Empfängerin / des Empfängers" error={f("name")}>
                {(p) => <Input {...p} autoComplete="shipping name" value={a.name} onChange={set("name")} required />}
              </Field>
              <Field label="Strasse und Hausnummer" error={f("line1")}>
                {(p) => <Input {...p} autoComplete="shipping address-line1" value={a.line1} onChange={set("line1")} required />}
              </Field>
              <Field label="Adresszusatz" optional error={f("line2")}>
                {(p) => <Input {...p} autoComplete="shipping address-line2" value={a.line2} onChange={set("line2")} />}
              </Field>
              <div className="grid grid-cols-[8rem_1fr] gap-3">
                <Field label="PLZ" error={f("postalCode")}>
                  {(p) => <Input {...p} autoComplete="shipping postal-code" inputMode="numeric" value={a.postalCode} onChange={set("postalCode")} required />}
                </Field>
                <Field label="Ort" error={f("city")}>
                  {(p) => <Input {...p} autoComplete="shipping address-level2" value={a.city} onChange={set("city")} required />}
                </Field>
              </div>
              {countrySelect(a.country, set("country"), f("country"))}
            </div>
          )}
        </fieldset>
      )}

      <Field label="Nachricht an den Shop" optional hint="Z. B. Wunschfarbe oder Liefertermin. Der Shop sieht sie mit deiner Bestellung.">
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
          {mode === "stripe" ? "Du bezahlst sicher über Stripe. Kartendaten werden nicht bei Werkuno gespeichert." : "Im Testmodus wird nichts belastet."} Mit der Bestellung akzeptierst du die{" "}
          <Link href="/richtlinien/marktplatz" className="underline underline-offset-2 hover:text-ink">Marktplatz-Richtlinien</Link> und die Rückgabebedingungen der Shops.
        </p>
      </div>
    </form>
  );
}
