"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2 } from "lucide-react";
import { COUNTRY_LABEL, SELLER_TYPE, SELLER_TYPE_LABEL, SHIP_COUNTRIES } from "@werkraum/shared";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Notice } from "@/components/ui/misc";
import { toast } from "@/components/ui/toast";
import { cn, slugify } from "@/lib/utils";
import { checkShopSlugAction, saveShopAction } from "@/app/studio/shop/actions";

export type ShopFormValues = {
  name: string;
  slug: string;
  tagline: string;
  description: string;
  sellerType: "PRIVATE" | "BUSINESS";
  legalName: string;
  businessName: string;
  vatId: string;
  addressLine: string;
  postalCode: string;
  city: string;
  country: "CH" | "DE" | "AT" | "LI";
  shippingPolicy: string;
  returnPolicy: string;
  processingDays: number;
};

const STEPS = [
  { key: "shop", label: "Shop" },
  { key: "anbieter", label: "Anbieter" },
  { key: "regeln", label: "Versand & Rückgabe" },
  { key: "pruefen", label: "Prüfen" },
] as const;

const STEP_FIELDS: Record<(typeof STEPS)[number]["key"], (keyof ShopFormValues)[]> = {
  shop: ["name", "slug", "tagline", "description"],
  anbieter: ["sellerType", "legalName", "businessName", "vatId", "addressLine", "postalCode", "city", "country"],
  regeln: ["shippingPolicy", "returnPolicy", "processingDays"],
  pruefen: [],
};

/**
 * Shop-Eröffnung (§13.2) als vierstufiger Assistent. Nach der Eröffnung dient dasselbe
 * Formular als Einstellungsseite (`mode="settings"`). Speichern ist jederzeit möglich.
 */
export function ShopWizard({ initial, mode, slugLocked, emailVerified }: { initial: ShopFormValues; mode: "wizard" | "settings"; slugLocked: boolean; emailVerified: boolean }) {
  const router = useRouter();
  const [v, setV] = useState<ShopFormValues>(initial);
  const [step, setStep] = useState(0);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [slugState, setSlugState] = useState<{ ok: boolean; message: string } | null>(null);
  const [slugTouched, setSlugTouched] = useState(!!initial.slug);
  const [pending, start] = useTransition();
  const set = <K extends keyof ShopFormValues>(k: K, val: ShopFormValues[K]) => setV((s) => ({ ...s, [k]: val }));

  useEffect(() => {
    if (slugLocked || !v.slug) return;
    const t = setTimeout(async () => setSlugState(await checkShopSlugAction(v.slug)), 350);
    return () => clearTimeout(t);
  }, [v.slug, slugLocked]);

  function save(submit: boolean) {
    start(async () => {
      const r = await saveShopAction(v, submit);
      if (r.ok) {
        setFields({});
        toast(submit ? "Antrag eingereicht. Als Nächstes verbindest du dein Auszahlungskonto." : "Gespeichert.");
        router.refresh();
      } else {
        setFields(r.fields ?? {});
        const bad = STEPS.findIndex((s) => STEP_FIELDS[s.key].some((k) => r.fields?.[k]));
        if (mode === "wizard" && bad >= 0) setStep(bad);
        toast(r.error, "error");
      }
    });
  }

  const showAll = mode === "settings";
  const visible = (k: (typeof STEPS)[number]["key"]) => showAll || STEPS[step]!.key === k;

  return (
    <div className="max-w-2xl">
      {mode === "wizard" && (
        <ol className="mb-10 grid grid-cols-4 border-t border-ink" aria-label="Schritte">
          {STEPS.map((s, i) => (
            <li key={s.key}>
              <button
                type="button"
                onClick={() => setStep(i)}
                aria-current={i === step ? "step" : undefined}
                className={cn("flex w-full flex-col items-start gap-1 border-t-2 pt-2 text-left", i === step ? "border-ink" : i < step ? "border-moss" : "border-transparent")}
              >
                <span className="spec flex items-center gap-1">
                  {i < step ? <Check size={11} className="text-moss" /> : String(i + 1).padStart(2, "0")}
                </span>
                <span className={cn("text-[13px]", i === step ? "font-semibold text-ink" : "text-muted")}>{s.label}</span>
              </button>
            </li>
          ))}
        </ol>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (mode === "wizard" && step < STEPS.length - 1) setStep(step + 1);
          else save(mode === "wizard");
        }}
        className="space-y-10"
        noValidate
      >
        {visible("shop") && (
          <fieldset className="space-y-5">
            <legend className="headline mb-1 text-2xl">Dein Shop</legend>
            <Field label="Shopname" error={fields.name} hint="So erscheint dein Shop im Marktplatz.">
              {(p) => (
                <Input
                  {...p}
                  value={v.name}
                  maxLength={60}
                  onChange={(e) => {
                    set("name", e.target.value);
                    if (!slugTouched && !slugLocked) set("slug", slugify(e.target.value, 40));
                  }}
                />
              )}
            </Field>
            <Field
              label="Shop-Adresse"
              error={fields.slug ?? (slugState && !slugState.ok ? slugState.message : undefined)}
              hint={slugLocked ? "Die Adresse bleibt nach der Eröffnung fest, damit Links funktionieren." : slugState?.ok ? "Verfügbar" : "Kleinbuchstaben, Ziffern und Bindestriche."}
            >
              {(p) => (
                <div className="flex items-stretch">
                  <span className="flex items-center border border-r-0 border-line-strong bg-sunken px-3 font-mono text-[12px] text-muted">werkraum.ch/markt/</span>
                  <Input
                    {...p}
                    value={v.slug}
                    disabled={slugLocked}
                    maxLength={40}
                    className="font-mono text-[14px]"
                    onChange={(e) => {
                      setSlugTouched(true);
                      set("slug", e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""));
                    }}
                  />
                </div>
              )}
            </Field>
            <Field label="Kurzbeschreibung" optional error={fields.tagline} hint="Ein Satz, z.B. „Körbe und Taschen aus recycelter Kordel, gehäkelt in Luzern“.">
              {(p) => <Input {...p} value={v.tagline} maxLength={120} onChange={(e) => set("tagline", e.target.value)} />}
            </Field>
            <Field label="Über deinen Shop" optional error={fields.description}>
              {(p) => <Textarea {...p} rows={5} value={v.description} maxLength={4000} onChange={(e) => set("description", e.target.value)} />}
            </Field>
          </fieldset>
        )}

        {visible("anbieter") && (
          <fieldset className="space-y-5">
            <legend className="headline mb-1 text-2xl">Anbieterangaben</legend>
            <p className="text-[14px] leading-relaxed text-muted">
              Diese Angaben brauchen wir für die Verkäuferprüfung. Bei gewerblichen Shops erscheinen Firmenname, Adresse und MWST-Nummer als Anbieterkennzeichnung auf deiner Shopseite.
            </p>
            <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Verkäufertyp">
              {SELLER_TYPE.map((t) => (
                <label key={t} className={cn("flex cursor-pointer flex-col gap-1 border px-4 py-3", v.sellerType === t ? "border-ink bg-sunken" : "border-line bg-card hover:border-line-strong")}>
                  <span className="flex items-center gap-2 text-[14px] font-semibold">
                    <input type="radio" name="sellerType" checked={v.sellerType === t} onChange={() => set("sellerType", t)} className="accent-[#B64B3A]" />
                    {SELLER_TYPE_LABEL[t]}
                  </span>
                  <span className="pl-5 text-[12.5px] text-muted">{t === "PRIVATE" ? "Gelegentliche Verkäufe eigener Arbeiten." : "Einzelfirma, GmbH, Verein o.ä. mit regelmässigem Verkauf."}</span>
                </label>
              ))}
            </div>
            <Field label={v.sellerType === "BUSINESS" ? "Verantwortliche Person" : "Vor- und Nachname"} error={fields.legalName} hint="Wie im amtlichen Ausweis.">
              {(p) => <Input {...p} autoComplete="name" value={v.legalName} maxLength={120} onChange={(e) => set("legalName", e.target.value)} />}
            </Field>
            {v.sellerType === "BUSINESS" && (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Firmenname" error={fields.businessName}>
                  {(p) => <Input {...p} autoComplete="organization" value={v.businessName} maxLength={120} onChange={(e) => set("businessName", e.target.value)} />}
                </Field>
                <Field label="MWST-/USt-Nummer" optional error={fields.vatId} hint="Z.B. CHE-123.456.789 MWST">
                  {(p) => <Input {...p} value={v.vatId} maxLength={40} onChange={(e) => set("vatId", e.target.value)} />}
                </Field>
              </div>
            )}
            <Field label="Strasse und Hausnummer" error={fields.addressLine}>
              {(p) => <Input {...p} autoComplete="street-address" value={v.addressLine} maxLength={200} onChange={(e) => set("addressLine", e.target.value)} />}
            </Field>
            <div className="grid grid-cols-[8rem_1fr] gap-3">
              <Field label="PLZ" error={fields.postalCode}>
                {(p) => <Input {...p} autoComplete="postal-code" value={v.postalCode} maxLength={12} onChange={(e) => set("postalCode", e.target.value)} />}
              </Field>
              <Field label="Ort" error={fields.city}>
                {(p) => <Input {...p} autoComplete="address-level2" value={v.city} maxLength={100} onChange={(e) => set("city", e.target.value)} />}
              </Field>
            </div>
            <Field label="Land" error={fields.country}>
              {(p) => (
                <Select {...p} value={v.country} onChange={(e) => set("country", e.target.value as ShopFormValues["country"])}>
                  {SHIP_COUNTRIES.map((c) => (
                    <option key={c} value={c}>
                      {COUNTRY_LABEL[c]}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          </fieldset>
        )}

        {visible("regeln") && (
          <fieldset className="space-y-5">
            <legend className="headline mb-1 text-2xl">Versand & Rückgabe</legend>
            <Field label="Bearbeitungszeit (Werktage)" error={fields.processingDays} hint="Standard für neue Produkte – pro Produkt anpassbar.">
              {(p) => <Input {...p} type="number" min={0} max={120} value={v.processingDays} className="num w-32" onChange={(e) => set("processingDays", Math.max(0, Number(e.target.value) || 0))} />}
            </Field>
            <Field label="Versandbedingungen" optional error={fields.shippingPolicy} hint="Versandart, Verpackung, Lieferländer, kombinierter Versand.">
              {(p) => <Textarea {...p} rows={4} value={v.shippingPolicy} maxLength={4000} onChange={(e) => set("shippingPolicy", e.target.value)} />}
            </Field>
            <Field
              label="Rückgabe & Umtausch"
              optional
              error={fields.returnPolicy}
              hint="Z.B. „Rückgabe innert 14 Tagen in unbenutztem Zustand; Sonderanfertigungen sind vom Umtausch ausgeschlossen.“"
            >
              {(p) => <Textarea {...p} rows={4} value={v.returnPolicy} maxLength={4000} onChange={(e) => set("returnPolicy", e.target.value)} />}
            </Field>
          </fieldset>
        )}

        {mode === "wizard" && STEPS[step]!.key === "pruefen" && (
          <div className="space-y-6">
            <h2 className="headline text-2xl">Alles korrekt?</h2>
            <dl className="divide-y divide-line border-y border-line text-[14px]">
              {[
                ["Shop", `${v.name || "–"} · werkraum.ch/markt/${v.slug || "…"}`],
                ["Verkäufertyp", SELLER_TYPE_LABEL[v.sellerType]],
                ["Anbieter", [v.sellerType === "BUSINESS" ? v.businessName : null, v.legalName].filter(Boolean).join(", ") || "–"],
                ["Adresse", [v.addressLine, `${v.postalCode} ${v.city}`.trim(), COUNTRY_LABEL[v.country]].filter(Boolean).join(", ")],
                ["Bearbeitungszeit", `${v.processingDays} Werktage`],
              ].map(([k, val]) => (
                <div key={k} className="grid grid-cols-[9rem_1fr] gap-4 py-2.5">
                  <dt className="spec pt-0.5">{k}</dt>
                  <dd>{val}</dd>
                </div>
              ))}
            </dl>
            <Notice title="So geht es weiter">
              1. Antrag einreichen · 2. Auszahlungskonto bei Stripe verbinden und Identität bestätigen · 3. Sobald Stripe die Prüfung abgeschlossen hat, wird dein Shop aktiv und du kannst Produkte veröffentlichen.
            </Notice>
            {!emailVerified && (
              <Notice tone="warn" title="E-Mail noch nicht bestätigt">
                Bitte bestätige zuerst deine E-Mail-Adresse – den Link findest du in deinem Postfach.
              </Notice>
            )}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3 border-t border-line pt-6">
          {mode === "wizard" ? (
            <>
              {step > 0 && (
                <Button variant="ghost" onClick={() => setStep(step - 1)}>
                  Zurück
                </Button>
              )}
              <Button variant="outline" disabled={pending} onClick={() => save(false)}>
                Zwischenspeichern
              </Button>
              <Button type="submit" className="ml-auto" disabled={pending || (STEPS[step]!.key === "pruefen" && !emailVerified)}>
                {pending && <Loader2 size={15} className="animate-spin" />}
                {STEPS[step]!.key === "pruefen" ? "Antrag einreichen" : "Weiter"}
              </Button>
            </>
          ) : (
            <Button type="submit" disabled={pending}>
              {pending && <Loader2 size={15} className="animate-spin" />}
              Änderungen speichern
            </Button>
          )}
        </div>
      </form>
    </div>
  );
}
