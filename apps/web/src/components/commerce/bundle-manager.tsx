"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, Plus, X } from "lucide-react";
import { BUNDLE_MAX_PERCENT, PRODUCT_STATUS_LABEL, formatMoney, type Currency } from "@werkraum/shared";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/field";
import { Dialog } from "@/components/ui/dialog";
import { Badge, Empty } from "@/components/ui/misc";
import { MoreMenu } from "@/components/social/actions";
import { confirmDialog } from "@/components/ui/confirm";
import { toast } from "@/components/ui/toast";
import { callAction, useAction } from "@/lib/use-action";
import type { ActionResult } from "@/server/errors";
import { bundlePrice } from "@/server/commerce/rules";
import { deleteBundleAction, saveBundleAction } from "@/app/studio/rabatte/actions";

export type BundleOption = { id: string; title: string; kind: string; status: string; priceMinor: number; hasVariants: boolean };
export type BundleRowView = {
  id: string;
  title: string;
  description: string;
  discountPct: number;
  active: boolean;
  tutorial: { id: string; title: string; slug: string; state: string } | null;
  items: { productId: string; quantity: number; product: { title: string; priceMinor: number; status: string } }[];
  price: { fullMinor: number; discountMinor: number; priceMinor: number };
  unavailable: string[];
};

/** Sets eines Shops: mehrere Produkte zum Set-Preis, optional als Materialset zu einer Anleitung. */
export function BundleManager({
  bundles,
  products,
  tutorials,
  currency,
}: {
  bundles: BundleRowView[];
  products: BundleOption[];
  tutorials: { id: string; title: string; state: string }[];
  currency: Currency;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<BundleRowView | "new" | null>(null);
  const [, start] = useTransition();
  const fmt = (m: number) => formatMoney(m, currency);
  const usable = products.filter((p) => !p.hasVariants);

  function run<T>(p: () => Promise<ActionResult<T>>) {
    start(async () => {
      const r = await callAction(p);
      if (r.ok) {
        if (r.message) toast(r.message);
        router.refresh();
      } else toast(r.error, "error");
    });
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-[60ch] text-[13.5px] leading-relaxed text-muted">
          Ein Set fasst Produkte zu einem Preis zusammen – etwa alles Material für eine Anleitung. Mit Anleitung verknüpft, erscheint es direkt bei der Materialliste. Der Set-Rabatt gilt, solange alle Teile im Warenkorb liegen.
        </p>
        <Button size="sm" onClick={() => setEditing("new")} disabled={usable.length < 2}>
          <Plus size={15} /> Neues Set
        </Button>
      </div>

      {bundles.length === 0 ? (
        <Empty
          title="Noch keine Sets"
          body={usable.length < 2 ? "Für ein Set brauchst du mindestens zwei Produkte ohne Varianten in deinem Shop." : "Zum Beispiel „Vogelhaus komplett“: Zuschnitt, Schrauben und Öl zusammen 10 % günstiger."}
          action={usable.length >= 2 ? <Button onClick={() => setEditing("new")}>Erstes Set anlegen</Button> : undefined}
        />
      ) : (
        <ul className="divide-y divide-line border-y border-line">
          {bundles.map((b) => (
            <li key={b.id} className="grid gap-3 py-4 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-start">
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2 text-[15px] font-semibold">
                  {b.title}
                  {!b.active ? <Badge tone="outline">Pausiert</Badge> : b.unavailable.length ? <Badge tone="warn">Nicht kaufbar</Badge> : <Badge tone="moss">Aktiv</Badge>}
                </p>
                <p className="mt-1 text-[13px] text-ink-2">{b.items.map((i) => `${i.quantity > 1 ? `${i.quantity} × ` : ""}${i.product.title}`).join(" · ")}</p>
                {b.tutorial && <p className="mt-1 text-[12.5px] text-muted">Materialset zu „{b.tutorial.title}“{b.tutorial.state !== "PUBLISHED" ? " (Entwurf)" : ""}</p>}
                {b.unavailable.length > 0 && <p className="mt-1 text-[12.5px] text-warn">Nicht aktiv: {b.unavailable.join(", ")} – das Set wird erst wieder angezeigt, wenn alle Teile aktiv sind.</p>}
              </div>
              <p className="num text-[14px] sm:text-right">
                <span className="font-semibold">{fmt(b.price.priceMinor)}</span>
                <span className="block text-[12.5px] text-muted">
                  statt {fmt(b.price.fullMinor)} · −{b.discountPct} %
                </span>
              </p>
              <MoreMenu
                label={`Aktionen für ${b.title}`}
                items={[
                  { label: "Bearbeiten", onSelect: () => setEditing(b) },
                  ...(b.tutorial && b.tutorial.state === "PUBLISHED" ? [{ label: "Bei der Anleitung ansehen", onSelect: () => router.push(`/anleitungen/${b.tutorial!.slug}#material`) }] : []),
                  {
                    label: "Löschen",
                    danger: true,
                    onSelect: async () =>
                      (await confirmDialog({ title: `Set „${b.title}“ löschen?`, body: "Die Produkte selbst bleiben erhalten.", confirmLabel: "Löschen", tone: "danger" })) && run(() => deleteBundleAction(b.id)),
                  },
                ]}
              />
            </li>
          ))}
        </ul>
      )}

      {editing && <BundleDialog bundle={editing === "new" ? null : editing} products={products} tutorials={tutorials} currency={currency} onClose={() => setEditing(null)} />}
    </div>
  );
}

function BundleDialog({
  bundle,
  products,
  tutorials,
  currency,
  onClose,
}: {
  bundle: BundleRowView | null;
  products: BundleOption[];
  tutorials: { id: string; title: string; state: string }[];
  currency: Currency;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(bundle?.title ?? "");
  const [description, setDescription] = useState(bundle?.description ?? "");
  const [pct, setPct] = useState(String(bundle?.discountPct ?? 10));
  const [tutorialId, setTutorialId] = useState(bundle?.tutorial?.id ?? "");
  const [active, setActive] = useState(bundle?.active ?? true);
  const [items, setItems] = useState<{ productId: string; quantity: number }[]>(bundle?.items.map((i) => ({ productId: i.productId, quantity: i.quantity })) ?? []);
  const [pick, setPick] = useState("");
  const save = useAction(saveBundleAction, { onSuccess: onClose });
  const byId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const choosable = products.filter((p) => !p.hasVariants && !items.some((i) => i.productId === p.id));
  const pctNum = /^\d{1,2}$/.test(pct.trim()) ? Number(pct) : NaN;
  const price = bundlePrice(
    items.map((i) => ({ unitMinor: byId.get(i.productId)?.priceMinor ?? 0, quantity: i.quantity })),
    Number.isFinite(pctNum) ? pctNum : 0,
  );
  const fmt = (m: number) => formatMoney(m, currency);
  const pctError = !Number.isFinite(pctNum) || pctNum > BUNDLE_MAX_PERCENT ? `Ganze Prozent von 0 bis ${BUNDLE_MAX_PERCENT}` : undefined;

  const move = (i: number, d: -1 | 1) =>
    setItems((xs) => {
      const j = i + d;
      if (j < 0 || j >= xs.length) return xs;
      const n = [...xs];
      [n[i], n[j]] = [n[j]!, n[i]!];
      return n;
    });

  return (
    <Dialog open onClose={onClose} wide title={bundle ? `Set „${bundle.title}“ bearbeiten` : "Neues Set"} description="Wähle mindestens zwei Produkte aus deinem Shop.">
      <form
        className="space-y-4"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          if (pctError) return;
          save.run(bundle?.id ?? null, { title, description, discountPct: pctNum, tutorialId: tutorialId || null, active, items });
        }}
      >
        <Field label="Name des Sets" error={save.fields.title}>
          {(p) => <Input {...p} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} placeholder="z. B. Vogelhaus – alles Material" required />}
        </Field>
        <Field label="Beschreibung" optional error={save.fields.description}>
          {(p) => <Textarea {...p} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={500} rows={2} placeholder="Was ist drin, wofür reicht es?" />}
        </Field>

        <fieldset>
          <legend className="mb-1.5 text-[13px] font-semibold">Produkte im Set</legend>
          {items.length > 0 && (
            <ul className="mb-3 divide-y divide-line rounded-xl border border-line">
              {items.map((it, i) => {
                const p = byId.get(it.productId);
                return (
                  <li key={it.productId} className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2 px-3 py-2">
                    <span className="min-w-0 text-[14px]">
                      <span className="block truncate font-medium">{p?.title ?? "Unbekanntes Produkt"}</span>
                      <span className="text-[12px] text-muted">
                        {p ? fmt(p.priceMinor) : ""}
                        {p && p.status !== "ACTIVE" ? ` · ${PRODUCT_STATUS_LABEL[p.status as keyof typeof PRODUCT_STATUS_LABEL] ?? p.status}` : ""}
                      </span>
                    </span>
                    <label className="flex items-center gap-1.5 text-[12.5px] text-muted">
                      Menge
                      <Input
                        type="number"
                        min={1}
                        max={p?.kind === "DIGITAL" ? 1 : 20}
                        value={it.quantity}
                        onChange={(e) => setItems((xs) => xs.map((x, k) => (k === i ? { ...x, quantity: Math.max(1, Math.min(p?.kind === "DIGITAL" ? 1 : 20, Number(e.target.value) || 1)) } : x)))}
                        className="h-9 w-16 px-2 text-center"
                        aria-label={`Menge für ${p?.title ?? "Produkt"}`}
                      />
                    </label>
                    <span className="flex">
                      <button type="button" onClick={() => move(i, -1)} disabled={i === 0} className="grid size-8 place-items-center rounded-lg text-muted hover:bg-sunken hover:text-ink disabled:opacity-30" aria-label={`${p?.title} nach oben`}>
                        <ArrowUp size={14} />
                      </button>
                      <button type="button" onClick={() => move(i, 1)} disabled={i === items.length - 1} className="grid size-8 place-items-center rounded-lg text-muted hover:bg-sunken hover:text-ink disabled:opacity-30" aria-label={`${p?.title} nach unten`}>
                        <ArrowDown size={14} />
                      </button>
                      <button type="button" onClick={() => setItems((xs) => xs.filter((_, k) => k !== i))} className="grid size-8 place-items-center rounded-lg text-muted hover:bg-sunken hover:text-danger" aria-label={`${p?.title} entfernen`}>
                        <X size={14} />
                      </button>
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
          <div className="flex gap-2">
            <Select value={pick} onChange={(e) => setPick(e.target.value)} aria-label="Produkt hinzufügen" className="min-w-0 flex-1">
              <option value="">{choosable.length ? "Produkt wählen …" : "Keine weiteren Produkte"}</option>
              {choosable.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title} · {fmt(p.priceMinor)}
                </option>
              ))}
            </Select>
            <Button
              type="button"
              variant="outline"
              className="h-11 shrink-0"
              disabled={!pick}
              onClick={() => {
                setItems((xs) => [...xs, { productId: pick, quantity: 1 }]);
                setPick("");
              }}
            >
              <Plus size={15} /> Hinzufügen
            </Button>
          </div>
          {products.some((p) => p.hasVariants) && <p className="mt-1.5 text-[12.5px] text-muted">Produkte mit Varianten (z. B. Grössen) können nicht in ein Set.</p>}
          {save.fields.items && (
            <p role="alert" className="mt-1.5 text-[13px] font-medium text-danger">
              {save.fields.items}
            </p>
          )}
        </fieldset>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Set-Rabatt in %" error={pctError ?? save.fields.discountPct} hint={`0 bis ${BUNDLE_MAX_PERCENT} %`}>
            {(p) => <Input {...p} value={pct} onChange={(e) => setPct(e.target.value)} inputMode="numeric" />}
          </Field>
          <Field label="Materialset zur Anleitung" optional error={save.fields.tutorialId} hint="Erscheint bei der Materialliste der Anleitung.">
            {(p) => (
              <Select {...p} value={tutorialId} onChange={(e) => setTutorialId(e.target.value)}>
                <option value="">Keine Anleitung</option>
                {tutorials.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.title}
                    {t.state !== "PUBLISHED" ? " (Entwurf)" : ""}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </div>

        {items.length > 0 && (
          <p className="rounded-xl bg-sunken px-4 py-3 text-[14px]" aria-live="polite">
            Set-Preis <b className="num">{fmt(price.priceMinor)}</b> <span className="text-muted">statt {fmt(price.fullMinor)} · Kund:innen sparen {fmt(price.discountMinor)}</span>
          </p>
        )}

        <Checkbox label="Aktiv – im Marktplatz und bei der Anleitung zeigen" checked={active} onChange={(e) => setActive(e.target.checked)} />

        <div className="flex justify-end gap-2 border-t border-line pt-4">
          <Button type="button" variant="ghost" onClick={onClose}>
            Abbrechen
          </Button>
          <Button type="submit" disabled={save.pending || items.length < 2 || !title.trim()}>
            {save.pending ? "Speichere …" : bundle ? "Speichern" : "Set anlegen"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
