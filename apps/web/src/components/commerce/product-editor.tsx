"use client";

import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FileText, Loader2, Plus, Trash2, Upload } from "lucide-react";
import { CATEGORIES, COUNTRY_LABEL, PRODUCT_KIND, PRODUCT_KIND_LABEL, SHIP_COUNTRIES, computeFees, formatMoney, type ProductKind } from "@werkraum/shared";
import { MediaPicker, uploadFile, type UploadedMedia } from "@/components/media/uploader";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/field";
import { Notice, SectionTitle } from "@/components/ui/misc";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import type { CategoryOption } from "@/server/categories/types";
import { minorToInput, parseMoneyInput, formatBps } from "@/server/commerce/rules";
import { saveProductAction } from "@/app/studio/produkte/actions";

export type ProductEditorInitial = {
  id: string | null;
  title: string;
  description: string;
  kind: ProductKind;
  category: string;
  priceMinor: number;
  stock: number;
  reserved: number;
  materials: string;
  dimensions: string;
  productionDays: number;
  shippingMinor: number;
  shipsFrom: string;
  safetyInfo: string;
  returnPolicy: string;
  projectId: string;
  tutorialId: string;
  status: "DRAFT" | "ACTIVE" | "PAUSED" | "SOLD_OUT" | "DISABLED";
  media: UploadedMedia[];
  variants: { name: string; priceDelta: string; stock: number; reserved: number }[];
  digital: { mediaId: string; label: string; state: string } | null;
  publishedAt: string | null;
};

const KIND_HINT: Record<ProductKind, string> = {
  UNIQUE: "Genau ein Stück, nicht wiederholbar.",
  SMALL_BATCH: "Wenige gleiche Stücke mit Bestand.",
  MADE_TO_ORDER: "Wird nach der Bestellung gefertigt.",
  KIT: "Material und Anleitung zum Selbermachen.",
  DIGITAL: "Muster oder Anleitung als PDF/ZIP.",
};

/**
 * Produkteditor (§13.4): alle Pflicht- und Zusatzangaben, Varianten mit Bestand,
 * Versand, Sicherheits- und Rückgabeinfos sowie der Projektfaden zu eigenem Projekt/Anleitung.
 */
export function ProductEditor({
  initial,
  projects,
  tutorials,
  shopActive,
  shopReturnPolicy,
  feeBps,
  digitalEnabled,
  categories = CATEGORIES,
}: {
  initial: ProductEditorInitial;
  projects: { id: string; title: string }[];
  tutorials: { id: string; title: string }[];
  shopActive: boolean;
  shopReturnPolicy: string;
  feeBps: number;
  digitalEnabled: boolean;
  /** Angebotene Kategorien (aktive + ggf. bereits gespeicherte); Standard: alle */
  categories?: readonly CategoryOption[];
}) {
  const router = useRouter();
  const [v, setV] = useState(() => ({
    ...initial,
    price: initial.priceMinor ? minorToInput(initial.priceMinor) : "",
    shipping: minorToInput(initial.shippingMinor),
    returnPolicy: initial.returnPolicy || (initial.id ? "" : shopReturnPolicy),
  }));
  const [media, setMedia] = useState<UploadedMedia[]>(initial.media);
  const [digital, setDigital] = useState(initial.digital);
  const [digitalBusy, setDigitalBusy] = useState(false);
  const [announce, setAnnounce] = useState(false);
  const [announceText, setAnnounceText] = useState("");
  const [fields, setFields] = useState<Record<string, string>>({});
  const [pending, start] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);
  const set = <K extends keyof typeof v>(k: K, val: (typeof v)[K]) => setV((s) => ({ ...s, [k]: val }));

  const isDigital = v.kind === "DIGITAL";
  const priceMinor = parseMoneyInput(v.price) ?? 0;
  const shippingMinor = isDigital ? 0 : (parseMoneyInput(v.shipping) ?? 0);
  const preview = priceMinor >= 100 ? computeFees(priceMinor, shippingMinor, feeBps) : null;
  const uploading = media.some((m) => m.state === "uploading");
  const disabled = initial.status === "DISABLED";
  const firstPublish = !initial.publishedAt;

  async function onDigitalFile(file: File | undefined) {
    if (!file) return;
    if (!["application/pdf", "application/zip", "application/x-zip-compressed"].includes(file.type)) {
      toast("Bitte lade eine PDF- oder ZIP-Datei hoch.", "error");
      return;
    }
    setDigitalBusy(true);
    try {
      const f = file.type === "application/x-zip-compressed" ? new File([file], file.name, { type: "application/zip" }) : file;
      const r = await uploadFile(f, "private");
      setDigital({ mediaId: r.mediaId, label: `${file.name} · ${(file.size / 1024 / 1024).toFixed(1)} MB`, state: r.state });
    } catch (e) {
      toast(e instanceof Error ? e.message : "Upload fehlgeschlagen", "error");
    } finally {
      setDigitalBusy(false);
    }
  }

  function submit(status: "DRAFT" | "ACTIVE" | "PAUSED") {
    const errs: Record<string, string> = {};
    const price = parseMoneyInput(v.price);
    if (price == null) errs.priceMinor = "Bitte gib einen gültigen Preis an (z.B. 48.00)";
    const ship = isDigital ? 0 : parseMoneyInput(v.shipping);
    if (ship == null) errs.shippingMinor = "Bitte gib gültige Versandkosten an";
    const variants = v.variants.map((x) => ({ name: x.name.trim(), priceDeltaMinor: Math.round((Number(x.priceDelta.replace(",", ".")) || 0) * 100), stock: x.stock }));
    if (variants.some((x) => !x.name)) errs.variants = "Jede Variante braucht einen Namen";
    if (Object.keys(errs).length) {
      setFields(errs);
      toast(Object.values(errs)[0]!, "error");
      return;
    }
    start(async () => {
      const r = await saveProductAction(
        initial.id,
        {
          title: v.title,
          description: v.description,
          kind: v.kind,
          category: v.category,
          priceMinor: price,
          currency: "CHF",
          stock: v.stock,
          materials: v.materials,
          dimensions: v.dimensions,
          productionDays: v.productionDays,
          shippingMinor: ship,
          safetyInfo: v.safetyInfo,
          returnPolicy: v.returnPolicy,
          projectId: v.projectId || undefined,
          tutorialId: v.tutorialId || undefined,
          media: media.filter((m) => m.state === "ready").map((m) => ({ id: m.id, alt: m.alt })),
          variants: isDigital ? [] : variants,
          status,
        },
        { shipsFrom: v.shipsFrom, digitalMediaId: isDigital ? (digital?.mediaId ?? null) : null, announce: announce && status === "ACTIVE", announceText },
      );
      if (r.ok) {
        setFields({});
        toast(
          r.data.status === "SOLD_OUT"
            ? "Gespeichert – ohne Bestand wird es als „Vergriffen“ angezeigt."
            : r.data.status === "ACTIVE"
              ? r.data.announced
                ? "Veröffentlicht und im Feed angekündigt."
                : "Veröffentlicht."
              : "Gespeichert.",
        );
        if (!initial.id) router.push(`/studio/produkte/${r.data.id}`);
        else router.refresh();
      } else {
        setFields(r.fields ?? {});
        toast(r.error, "error");
      }
    });
  }

  return (
    <form
      className="grid gap-12 pb-32 lg:grid-cols-[1fr_300px]"
      onSubmit={(e) => {
        e.preventDefault();
        submit(initial.status === "DRAFT" || !initial.id ? "DRAFT" : initial.status === "PAUSED" ? "PAUSED" : "ACTIVE");
      }}
      noValidate
    >
      <div className="min-w-0 space-y-12">
        {disabled && (
          <Notice tone="danger" title="Von der Moderation deaktiviert">
            Dieses Angebot wurde wegen eines Verstosses gegen die Marktplatz-Richtlinien deaktiviert. Details findest du in deinen Benachrichtigungen.
          </Notice>
        )}

        <section className="space-y-5">
          <SectionTitle n="01" title="Was verkaufst du?" />
          <Field label="Titel" error={fields.title} hint="Konkret und ehrlich, z.B. „Gehäkelter Korb aus Baumwollkordel, natur“.">
            {(p) => <Input {...p} value={v.title} onChange={(e) => set("title", e.target.value)} maxLength={140} required />}
          </Field>
          <fieldset>
            <legend className="mb-2 text-[13px] font-semibold">Art des Angebots</legend>
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {PRODUCT_KIND.filter((k) => k !== "DIGITAL" || digitalEnabled || v.kind === "DIGITAL").map((k) => (
                <label key={k} className={cn("flex cursor-pointer flex-col gap-0.5 border px-3.5 py-3 transition-colors rounded-2xl", v.kind === k ? "border-moss bg-moss-soft/60" : "border-line bg-card hover:border-line-strong")}>
                  <span className="flex items-center gap-2 text-[14px] font-semibold">
                    <input type="radio" name="kind" value={k} checked={v.kind === k} onChange={() => set("kind", k)} className="accent-[#B64B3A]" />
                    {PRODUCT_KIND_LABEL[k]}
                  </span>
                  <span className="pl-5 text-[12.5px] text-muted">{KIND_HINT[k]}</span>
                </label>
              ))}
            </div>
            {fields.kind && <p className="mt-1.5 text-[13px] text-danger">{fields.kind}</p>}
          </fieldset>
          <Field label="Kategorie" error={fields.category}>
            {(p) => (
              <Select {...p} value={v.category} onChange={(e) => set("category", e.target.value)}>
                {categories.map((c) => (
                  <option key={c.slug} value={c.slug}>
                    {c.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Beschreibung" optional error={fields.description} hint="Wie ist es entstanden, wofür eignet es sich, wie pflegt man es?">
            {(p) => <Textarea {...p} rows={7} value={v.description} onChange={(e) => set("description", e.target.value)} maxLength={10000} />}
          </Field>
        </section>

        <section className="space-y-4">
          <SectionTitle n="02" title="Bilder" action={<span className="spec">{media.length} / 12</span>} />
          <p className="text-[13.5px] text-muted">Das erste Bild ist das Titelbild (Hochformat 4:5 wirkt am besten). Echte Fotos deiner Arbeit, keine Fremdbilder. Bitte beschreibe jedes Bild kurz.</p>
          <MediaPicker value={media} onChange={setMedia} max={12} accept="image/jpeg,image/png,image/webp,image/heic,image/avif" />
          {fields.media && <p className="text-[13px] font-medium text-danger">{fields.media}</p>}
        </section>

        <section className="space-y-5">
          <SectionTitle n="03" title="Preis & Bestand" />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Preis in CHF" error={fields.priceMinor} hint="Inklusive allfälliger MWST. Mindestens CHF 1.00.">
              {(p) => <Input {...p} inputMode="decimal" value={v.price} onChange={(e) => set("price", e.target.value)} placeholder="48.00" className="num" />}
            </Field>
            {!isDigital && v.variants.length === 0 && (
              <Field
                label={v.kind === "MADE_TO_ORDER" ? "Kapazität (Stück)" : "Bestand (Stück)"}
                error={fields.stock}
                hint={v.kind === "UNIQUE" ? "Einzelstücke haben höchstens 1 Stück." : initial.reserved ? `${initial.reserved} Stück in offenen Bestellungen reserviert.` : undefined}
              >
                {(p) => <Input {...p} type="number" min={0} max={v.kind === "UNIQUE" ? 1 : 100000} value={v.stock} onChange={(e) => set("stock", Math.max(0, Number(e.target.value) || 0))} className="num" />}
              </Field>
            )}
          </div>

          {!isDigital && (
            <div className="border border-line bg-card rounded-2xl">
              <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
                <p className="text-[13px] font-semibold">Varianten <span className="font-normal text-muted">optional – z.B. Farbe oder Grösse</span></p>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={v.variants.length >= 20}
                  onClick={() => set("variants", [...v.variants, { name: "", priceDelta: "0", stock: v.kind === "UNIQUE" ? 1 : 1, reserved: 0 }])}
                >
                  <Plus size={14} /> Variante
                </Button>
              </div>
              {v.variants.length ? (
                <div className="divide-y divide-line">
                  <div className="hidden grid-cols-[1fr_8rem_7rem_2.5rem] gap-3 px-4 py-2 sm:grid">
                    <span className="spec">Bezeichnung</span>
                    <span className="spec">Aufpreis CHF</span>
                    <span className="spec">Bestand</span>
                    <span />
                  </div>
                  {v.variants.map((x, i) => (
                    <div key={i} className="grid grid-cols-2 gap-3 px-4 py-3 sm:grid-cols-[1fr_8rem_7rem_2.5rem] sm:items-center">
                      <Input
                        aria-label={`Variante ${i + 1}: Bezeichnung`}
                        value={x.name}
                        placeholder="z.B. Salbeigrün"
                        maxLength={60}
                        className="col-span-2 sm:col-span-1"
                        onChange={(e) => set("variants", v.variants.map((y, j) => (j === i ? { ...y, name: e.target.value } : y)))}
                      />
                      <Input
                        aria-label={`Variante ${i + 1}: Aufpreis in CHF`}
                        inputMode="decimal"
                        value={x.priceDelta}
                        className="num"
                        onChange={(e) => set("variants", v.variants.map((y, j) => (j === i ? { ...y, priceDelta: e.target.value } : y)))}
                      />
                      <Input
                        aria-label={`Variante ${i + 1}: Bestand`}
                        type="number"
                        min={x.reserved}
                        value={x.stock}
                        className="num"
                        onChange={(e) => set("variants", v.variants.map((y, j) => (j === i ? { ...y, stock: Math.max(0, Number(e.target.value) || 0) } : y)))}
                      />
                      <button
                        type="button"
                        aria-label={`Variante ${i + 1} entfernen`}
                        disabled={x.reserved > 0}
                        title={x.reserved > 0 ? "Hat offene Reservierungen" : undefined}
                        className="grid size-10 place-items-center text-muted hover:text-danger disabled:opacity-30"
                        onClick={() => set("variants", v.variants.filter((_, j) => j !== i))}
                      >
                        <Trash2 size={15} />
                      </button>
                      {x.reserved > 0 && <p className="col-span-2 text-[12px] text-muted sm:col-span-4">{x.reserved} reserviert</p>}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="px-4 py-3 text-[13px] text-muted">Keine Varianten – der Bestand oben gilt für das Produkt.</p>
              )}
              {fields.variants && <p className="border-t border-line px-4 py-2 text-[13px] font-medium text-danger">{fields.variants}</p>}
            </div>
          )}
        </section>

        {isDigital ? (
          <section className="space-y-4">
            <SectionTitle n="04" title="Datei zum Download" />
            <p className="text-[13.5px] text-muted">Die Datei wird privat gespeichert. Käufer:innen erhalten sie nur über einen persönlichen, zeitlich begrenzten Link (max. 20 Downloads je Lizenz).</p>
            <div className="flex flex-wrap items-center gap-4 border border-line bg-card px-4 py-4 rounded-2xl">
              <FileText size={20} className="text-muted" aria-hidden />
              <div className="min-w-0 flex-1 text-[14px]">
                {digital ? (
                  <>
                    <p className="truncate font-semibold">{digital.label}</p>
                    <p className="spec mt-0.5">{digital.state === "READY" ? "Bereit" : digital.state === "FAILED" ? "Fehlgeschlagen" : "Wird verarbeitet"}</p>
                  </>
                ) : (
                  <p className="text-muted">Noch keine Datei (PDF oder ZIP, max. 100 MB).</p>
                )}
              </div>
              <Button variant="outline" size="sm" disabled={digitalBusy} onClick={() => fileRef.current?.click()}>
                {digitalBusy ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                {digital ? "Ersetzen" : "Datei wählen"}
              </Button>
              <input ref={fileRef} type="file" hidden accept="application/pdf,application/zip,.zip" onChange={(e) => onDigitalFile(e.target.files?.[0])} />
            </div>
            {fields.digital && <p className="text-[13px] font-medium text-danger">{fields.digital}</p>}
          </section>
        ) : (
          <section className="space-y-5">
            <SectionTitle n="04" title="Herstellung & Versand" />
            <Field label="Materialien" optional hint="Z.B. „100 % Baumwolle, Buchenholz, geölt“ – wichtig für Allergien und Pflege.">
              {(p) => <Input {...p} value={v.materials} onChange={(e) => set("materials", e.target.value)} maxLength={1000} />}
            </Field>
            <Field label="Masse" optional hint="Z.B. „Ø 24 cm, Höhe 18 cm, 320 g“">
              {(p) => <Input {...p} value={v.dimensions} onChange={(e) => set("dimensions", e.target.value)} maxLength={200} />}
            </Field>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Bearbeitungszeit (Tage)" error={fields.productionDays}>
                {(p) => <Input {...p} type="number" min={0} max={365} value={v.productionDays} onChange={(e) => set("productionDays", Math.max(0, Number(e.target.value) || 0))} className="num" />}
              </Field>
              <Field label="Versand CHF" error={fields.shippingMinor} hint="Pro Bestellung gilt der höchste Satz.">
                {(p) => <Input {...p} inputMode="decimal" value={v.shipping} onChange={(e) => set("shipping", e.target.value)} className="num" />}
              </Field>
              <Field label="Versand ab">
                {(p) => (
                  <Select {...p} value={v.shipsFrom} onChange={(e) => set("shipsFrom", e.target.value)}>
                    {SHIP_COUNTRIES.map((c) => (
                      <option key={c} value={c}>
                        {COUNTRY_LABEL[c]}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
            </div>
          </section>
        )}

        <section className="space-y-5">
          <SectionTitle n="05" title="Sicherheit & Pflichtangaben" />
          <Field
            label="Sicherheitshinweise"
            optional
            error={fields.safetyInfo}
            hint="Pflicht bei Kinderprodukten, Kerzen, Elektronik, Kosmetik u.ä.: Warnhinweise, Altersempfehlung, Hersteller-/Kontaktangaben."
          >
            {(p) => <Textarea {...p} rows={4} value={v.safetyInfo} onChange={(e) => set("safetyInfo", e.target.value)} maxLength={2000} />}
          </Field>
          <Field label="Rückgabe & Umtausch" optional error={fields.returnPolicy} hint={shopReturnPolicy ? "Vorausgefüllt mit der Rückgaberegel deines Shops." : "Leer lassen, um die Regel deines Shops zu verwenden."}>
            {(p) => <Textarea {...p} rows={3} value={v.returnPolicy} onChange={(e) => set("returnPolicy", e.target.value)} maxLength={2000} />}
          </Field>
        </section>

        <section className="space-y-5">
          <SectionTitle n="06" title="Projektfaden" />
          <p className="text-[13.5px] text-muted">Zeig, wie das Stück entstanden ist: Verknüpfe dein Projekt oder deine Anleitung. Auf der Produktseite erscheint „So ist es entstanden“.</p>
          <div className="grid gap-4 border-l border-rule pl-4 sm:grid-cols-2">
            <Field label="Projekt" optional>
              {(p) => (
                <Select {...p} value={v.projectId} onChange={(e) => set("projectId", e.target.value)}>
                  <option value="">Kein Projekt</option>
                  {projects.map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.title}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label="Anleitung" optional>
              {(p) => (
                <Select {...p} value={v.tutorialId} onChange={(e) => set("tutorialId", e.target.value)}>
                  <option value="">Keine Anleitung</option>
                  {tutorials.map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.title}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          </div>
        </section>
      </div>

      <aside className="space-y-6 lg:sticky lg:top-20 lg:h-fit">
        <div className="border border-rule bg-card p-5 rounded-2xl">
          <p className="spec mb-3">Abrechnung pro Stück</p>
          {preview ? (
            <dl className="space-y-1.5 text-[13.5px]">
              <div className="flex justify-between">
                <dt>Preis</dt>
                <dd className="num">{formatMoney(preview.subtotal)}</dd>
              </div>
              {!isDigital && (
                <div className="flex justify-between">
                  <dt>Versand</dt>
                  <dd className="num">{formatMoney(preview.shipping)}</dd>
                </div>
              )}
              <div className="flex justify-between text-muted">
                <dt>Plattformgebühr {formatBps(feeBps)}</dt>
                <dd className="num">− {formatMoney(preview.platformFee)}</dd>
              </div>
              <div className="mt-2 flex justify-between border-t border-rule pt-2 font-semibold">
                <dt>Du erhältst</dt>
                <dd className="num">{formatMoney(preview.sellerNet)}</dd>
              </div>
              <p className="pt-2 text-[12px] leading-relaxed text-muted">Die Provision fällt nur auf den Warenwert und nur bei abgeschlossenen Verkäufen an. Gebühren von Stripe werden separat abgezogen.</p>
            </dl>
          ) : (
            <p className="text-[13px] text-muted">Gib einen Preis ein, um deine Auszahlung zu sehen.</p>
          )}
        </div>

        <div className="space-y-3 border border-line bg-card p-5 rounded-2xl">
          <p className="spec">Veröffentlichung</p>
          {!shopActive && <p className="text-[13px] text-muted">Dein Shop ist noch nicht aktiv. Du kannst Produkte als Entwurf vorbereiten und nach der Verifizierung veröffentlichen.</p>}
          {shopActive && firstPublish && (
            <div className="space-y-2">
              <Checkbox label="Im Feed ankündigen" checked={announce} onChange={(e) => setAnnounce(e.currentTarget.checked)} />
              {announce && (
                <Textarea aria-label="Text der Ankündigung" rows={3} maxLength={1000} placeholder={`Neu in meinem Shop: ${v.title || "…"}`} value={announceText} onChange={(e) => setAnnounceText(e.target.value)} />
              )}
              <p className="text-[12px] text-muted">Erscheint als gekennzeichneter Verkaufsbeitrag.</p>
            </div>
          )}
          <div className="flex flex-col gap-2 pt-1">
            <Button disabled={pending || uploading || disabled || !shopActive} onClick={() => submit("ACTIVE")}>
              {pending ? <Loader2 size={15} className="animate-spin" /> : null}
              {initial.status === "ACTIVE" || initial.status === "SOLD_OUT" ? "Speichern" : "Veröffentlichen"}
            </Button>
            <Button variant="outline" disabled={pending || uploading || disabled} onClick={() => submit("DRAFT")}>
              Als Entwurf speichern
            </Button>
            {(initial.status === "ACTIVE" || initial.status === "SOLD_OUT") && (
              <Button variant="ghost" disabled={pending || disabled} onClick={() => submit("PAUSED")}>
                Pausieren
              </Button>
            )}
          </div>
          {uploading && <p className="text-[12px] text-muted">Bilder werden hochgeladen …</p>}
        </div>
        {initial.id && (
          <p className="text-[12.5px] text-muted">
            <Link href="/studio/produkte" className="underline underline-offset-2 hover:text-ink">Zurück zur Übersicht</Link>
          </p>
        )}
      </aside>
    </form>
  );
}
