"use client";

import { useState } from "react";
import { BadgeCheck, ExternalLink, Pencil, Plus, Trash2 } from "lucide-react";
import { formatMoney, type Currency } from "@werkraum/shared";
import type { AdminOffer } from "@/server/materials/offers";
import { useAction } from "@/lib/use-action";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Checkbox, Field, Input, Select } from "@/components/ui/field";
import { Badge } from "@/components/ui/misc";
import { confirmDialog } from "@/components/ui/confirm";
import { confirmOfferAction, deleteOfferAction, upsertOfferAction } from "@/app/admin/kategorien/actions";
import { EmptyRow, Table, Td, Th, Tr } from "./ui";
import { num, shortDate } from "./format";

/** Bezugsquellen eines Materials pflegen (Preisvergleich, Partnerlinks) – Admin-Materialseite. */
export function OfferManager({ materialId, unit, offers }: { materialId: string; unit: string; offers: AdminOffer[] }) {
  const [edit, setEdit] = useState<AdminOffer | "new" | null>(null);
  const confirm = useAction(confirmOfferAction, { refresh: true });
  const del = useAction(deleteOfferAction, { refresh: true });
  const clicks = offers.reduce((s, o) => s + o.clickCount, 0);

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <p className="text-[13px] text-muted">
          {offers.length} {offers.length === 1 ? "Quelle" : "Quellen"} · {num(clicks)} Klicks gesamt. Preise je Packung; die Packungsgrösse in <span className="font-mono">{unit}</span> ergibt den Preis je Einheit.
        </p>
        <Button size="sm" variant="outline" onClick={() => setEdit("new")}>
          <Plus size={14} aria-hidden /> Bezugsquelle
        </Button>
      </div>
      <Table caption="Bezugsquellen">
        <thead>
          <tr>
            <Th>Händler</Th>
            <Th>Preis</Th>
            <Th>Packung</Th>
            <Th>Stand</Th>
            <Th>Klicks</Th>
            <Th>
              <span className="sr-only">Aktionen</span>
            </Th>
          </tr>
        </thead>
        <tbody>
          {offers.length === 0 && <EmptyRow cols={6}>Noch keine Bezugsquellen.</EmptyRow>}
          {offers.map((o) => (
            <Tr key={o.id}>
              <Td>
                <span className="flex flex-wrap items-center gap-1.5">
                  <a href={o.url} target="_blank" rel="noopener noreferrer" className="font-semibold hover:underline">
                    {o.retailer}
                  </a>
                  <ExternalLink size={12} className="text-muted" aria-hidden />
                  {o.isAffiliate && <Badge tone="outline">Partnerlink</Badge>}
                  {!o.active && <Badge tone="warn">Inaktiv</Badge>}
                </span>
                {o.title && <span className="block max-w-[34ch] truncate text-xs text-muted">{o.title}</span>}
              </Td>
              <Td mono>{formatMoney(o.priceMinor, o.currency as Currency)}</Td>
              <Td className="text-ink-2">{o.packLabel || (o.packAmount ? `${o.packAmount} ${unit}` : "–")}</Td>
              <Td className={o.stale ? "whitespace-nowrap text-warn" : "whitespace-nowrap text-muted"}>{shortDate(o.checkedAt)}</Td>
              <Td mono>
                {num(o.clickCount)}
                {o.lastClickAt && <span className="block text-[11px] text-muted">zuletzt {shortDate(o.lastClickAt)}</span>}
              </Td>
              <Td>
                <span className="flex justify-end gap-1">
                  <Button size="sm" variant="ghost" disabled={confirm.pending} onClick={() => confirm.run(o.id)} aria-label={`Preis von ${o.retailer} als geprüft markieren`} title="Preis geprüft (Stand heute)">
                    <BadgeCheck size={15} aria-hidden />
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setEdit(o)} aria-label={`${o.retailer} bearbeiten`} title="Bearbeiten">
                    <Pencil size={14} aria-hidden />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={del.pending}
                    onClick={async () => (await confirmDialog({ title: `Bezugsquelle «${o.retailer}» löschen?`, body: "Die Klickzahlen gehen dabei verloren. Zum vorübergehenden Ausblenden besser „inaktiv“ setzen.", confirmLabel: "Löschen", tone: "danger" })) && del.run(o.id)}
                    aria-label={`${o.retailer} löschen`}
                    title="Löschen"
                  >
                    <Trash2 size={14} aria-hidden />
                  </Button>
                </span>
              </Td>
            </Tr>
          ))}
        </tbody>
      </Table>
      {edit && <OfferDialog materialId={materialId} unit={unit} offer={edit === "new" ? null : edit} onClose={() => setEdit(null)} />}
    </div>
  );
}

function OfferDialog({ materialId, unit, offer, onClose }: { materialId: string; unit: string; offer: AdminOffer | null; onClose: () => void }) {
  const { run, pending, fields } = useAction(upsertOfferAction, { refresh: true, onSuccess: onClose });
  return (
    <Dialog open onClose={onClose} title={offer ? "Bezugsquelle bearbeiten" : "Bezugsquelle anlegen"} description="Speichern setzt das Stand-Datum auf heute.">
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          const v = Object.fromEntries(fd.entries()) as Record<string, string>;
          run(materialId, offer?.id ?? null, {
            ...v,
            packAmount: v.packAmount ? v.packAmount.replace(",", ".") : null,
            price: v.price?.replace(",", "."),
            isAffiliate: fd.get("isAffiliate") === "on",
            active: fd.get("active") === "on",
          });
        }}
      >
        <div className="grid grid-cols-2 gap-3">
          <Field label="Händler" error={fields.retailer}>
            {(p) => <Input name="retailer" defaultValue={offer?.retailer} required maxLength={80} placeholder="z. B. Jumbo, Coop Bau+Hobby" {...p} />}
          </Field>
          <Field label="Produkt" optional error={fields.title}>
            {(p) => <Input name="title" defaultValue={offer?.title} maxLength={160} {...p} />}
          </Field>
        </div>
        <Field label="Link" hint="https-Adresse zur Produktseite (bei Partnerprogrammen der Partnerlink)" error={fields.url}>
          {(p) => <Input name="url" type="url" defaultValue={offer?.url} required maxLength={2000} placeholder="https://" {...p} />}
        </Field>
        <div className="grid grid-cols-[minmax(0,1fr)_6rem] gap-3">
          <Field label="Preis je Packung" error={fields.price}>
            {(p) => <Input name="price" inputMode="decimal" defaultValue={offer ? (offer.priceMinor / 100).toFixed(2) : ""} required placeholder="12.90" {...p} />}
          </Field>
          <Field label="Währung" error={fields.currency}>
            {(p) => (
              <Select name="currency" defaultValue={offer?.currency ?? "CHF"} {...p}>
                <option value="CHF">CHF</option>
                <option value="EUR">EUR</option>
              </Select>
            )}
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label={`Packungsgrösse in ${unit}`} optional hint="für den Preis je Einheit" error={fields.packAmount}>
            {(p) => <Input name="packAmount" inputMode="decimal" defaultValue={offer?.packAmount ?? ""} placeholder="z. B. 50" {...p} />}
          </Field>
          <Field label="Packung (Anzeige)" optional error={fields.packLabel}>
            {(p) => <Input name="packLabel" defaultValue={offer?.packLabel} maxLength={60} placeholder="z. B. Knäuel 50 g" {...p} />}
          </Field>
        </div>
        <div className="space-y-2 rounded-2xl bg-sunken p-3">
          <Checkbox name="isAffiliate" defaultChecked={offer?.isAffiliate ?? false} label="Partnerlink (Affiliate) – wird öffentlich als „Partnerlink“ gekennzeichnet" />
          <Checkbox name="active" defaultChecked={offer?.active ?? true} label="Aktiv (öffentlich sichtbar)" />
        </div>
        <Button type="submit" className="w-full" disabled={pending}>
          {offer ? "Speichern" : "Anlegen"}
        </Button>
      </form>
    </Dialog>
  );
}
