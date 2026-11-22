"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { SALE_MAX_PERCENT, SALE_MIN_PERCENT, formatMoney, salePrice, type Currency } from "@werkraum/shared";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input } from "@/components/ui/field";
import { Dialog } from "@/components/ui/dialog";
import { Badge, Empty } from "@/components/ui/misc";
import { MoreMenu } from "@/components/social/actions";
import { confirmDialog } from "@/components/ui/confirm";
import { toast } from "@/components/ui/toast";
import { callAction, useAction } from "@/lib/use-action";
import type { ActionResult } from "@/server/errors";
import { deleteSaleAction, endSaleAction, saveSaleAction } from "@/app/studio/aktionen/actions";
import { SaleCountdown } from "./sale-countdown";

export type SaleRowView = {
  id: string;
  title: string;
  percent: number;
  startsAt: string;
  endsAt: string;
  productIds: string[];
  active: boolean;
  status: "SCHEDULED" | "RUNNING" | "ENDED" | "PAUSED";
};
type ProductOption = { id: string; title: string; priceMinor: number; status: string };

const STATUS: Record<SaleRowView["status"], { label: string; tone: "moss" | "neutral" | "warn" | "outline" }> = {
  RUNNING: { label: "Läuft", tone: "moss" },
  SCHEDULED: { label: "Geplant", tone: "warn" },
  PAUSED: { label: "Pausiert", tone: "outline" },
  ENDED: { label: "Beendet", tone: "neutral" },
};

const when = (iso: string) => new Date(iso).toLocaleString("de-CH", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Zurich" });
/** ISO → Wert für <input type="datetime-local"> (Ortszeit des Geräts) */
function toLocalInput(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Aktionen eines Shops: Liste mit Status und Countdown, Anlegen/Bearbeiten im Dialog, vorzeitig beenden. */
export function SaleManager({ sales, products, currency, maxDays, now, pro }: { sales: SaleRowView[]; products: ProductOption[]; currency: Currency; maxDays: number; now: number; pro: boolean }) {
  const router = useRouter();
  const [editing, setEditing] = useState<SaleRowView | "new" | null>(null);
  const [, start] = useTransition();
  const title = (id: string) => products.find((p) => p.id === id)?.title ?? "Entferntes Produkt";

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
        <p className="max-w-[62ch] text-[13.5px] leading-relaxed text-muted">
          Der Rabatt senkt den Stückpreis während der Aktion; Provision und Einnahmen rechnen mit dem Aktionspreis. Aktionsartikel sind von Gutscheinen und Sets ausgenommen. In der iOS-App gekaufte digitale Produkte bleiben beim regulären App-Preis.
        </p>
        {pro && (
          <Button size="sm" onClick={() => setEditing("new")}>
            <Plus size={15} /> Neue Aktion
          </Button>
        )}
      </div>

      {sales.length === 0 ? (
        <Empty title="Noch keine Aktionen" body="Zum Beispiel „Herbst-Aktion: −20 % bis Sonntag“ auf den ganzen Shop oder auf ausgewählte Arbeiten." action={pro ? <Button onClick={() => setEditing("new")}>Erste Aktion anlegen</Button> : undefined} />
      ) : (
        <ul className="border-t border-rule">
          {sales.map((s) => {
            const st = STATUS[s.status];
            const scope = s.productIds.length ? `${s.productIds.length} ${s.productIds.length === 1 ? "Arbeit" : "Arbeiten"}: ${s.productIds.slice(0, 3).map(title).join(", ")}${s.productIds.length > 3 ? " …" : ""}` : "ganzer Shop";
            return (
              <li key={s.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 border-b border-line py-3.5 md:grid-cols-[minmax(0,1fr)_5rem_12rem_auto]">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2">
                    <span className="text-[14.5px] font-semibold">{s.title}</span>
                    <Badge tone={st.tone}>{st.label}</Badge>
                  </p>
                  <p className="mt-0.5 truncate text-[13px] text-muted">{scope}</p>
                </div>
                <p className="num order-3 text-[15px] font-bold text-clay-ink md:order-none">−{s.percent} %</p>
                <p className="num order-4 text-[13px] text-ink-2 md:order-none">
                  {when(s.startsAt)} – {when(s.endsAt)}
                  {s.status === "RUNNING" && <SaleCountdown endsAt={s.endsAt} className="block text-[12px] text-clay-ink" />}
                </p>
                <div className="order-2 justify-self-end md:order-none">
                  <MoreMenu
                    label={`Aktionen für ${s.title}`}
                    items={[
                      ...(s.status !== "ENDED" && pro ? [{ label: s.status === "RUNNING" ? "Ende ändern" : "Bearbeiten", onSelect: () => setEditing(s) }] : []),
                      ...(s.status === "RUNNING" || s.status === "SCHEDULED"
                        ? [
                            {
                              label: s.status === "RUNNING" ? "Jetzt beenden" : "Absagen",
                              danger: true,
                              onSelect: async () =>
                                (await confirmDialog({ title: `„${s.title}“ beenden?`, body: "Ab sofort gelten wieder die regulären Preise. Bereits bezahlte Bestellungen behalten den Aktionspreis.", confirmLabel: "Beenden", tone: "danger" })) &&
                                run(() => endSaleAction(s.id)),
                            },
                          ]
                        : []),
                      ...(s.status !== "RUNNING"
                        ? [
                            {
                              label: "Löschen",
                              danger: true,
                              onSelect: async () => (await confirmDialog({ title: `„${s.title}“ löschen?`, confirmLabel: "Löschen", tone: "danger" })) && run(() => deleteSaleAction(s.id)),
                            },
                          ]
                        : []),
                    ]}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {editing && <SaleDialog sale={editing === "new" ? null : editing} products={products} currency={currency} maxDays={maxDays} now={now} onClose={() => setEditing(null)} />}
    </div>
  );
}

function SaleDialog({ sale, products, currency, maxDays, now, onClose }: { sale: SaleRowView | null; products: ProductOption[]; currency: Currency; maxDays: number; now: number; onClose: () => void }) {
  const running = sale?.status === "RUNNING";
  const [title, setTitle] = useState(sale?.title ?? "");
  const [percent, setPercent] = useState(String(sale?.percent ?? 20));
  const [from, setFrom] = useState(toLocalInput(sale?.startsAt ?? new Date(now).toISOString()));
  const [until, setUntil] = useState(toLocalInput(sale?.endsAt ?? new Date(now + 3 * 86_400_000).toISOString()));
  const [all, setAll] = useState(!sale || sale.productIds.length === 0);
  const [picked, setPicked] = useState<Set<string>>(new Set(sale?.productIds ?? []));
  const [local, setLocal] = useState<Record<string, string>>({});
  const save = useAction(saveSaleAction, { onSuccess: onClose });
  const err = (k: string) => local[k] ?? save.fields[k];
  const pct = Number(percent);
  const fmt = (m: number) => formatMoney(m, currency);

  const preview = useMemo(() => {
    const list = all ? products.filter((p) => p.status === "ACTIVE") : products.filter((p) => picked.has(p.id));
    return list.slice(0, 5);
  }, [all, picked, products]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const errors: Record<string, string> = {};
    if (!/^\d{1,2}$/.test(percent.trim()) || pct < SALE_MIN_PERCENT || pct > SALE_MAX_PERCENT) errors.percent = `Ganze Prozent von ${SALE_MIN_PERCENT} bis ${SALE_MAX_PERCENT}`;
    if (!from) errors.startsAt = "Beginn wählen";
    if (!until) errors.endsAt = "Ende wählen";
    if (!all && picked.size === 0) errors.productIds = "Wähle mindestens eine Arbeit oder den ganzen Shop";
    setLocal(errors);
    if (Object.keys(errors).length) return;
    save.run(sale?.id ?? null, {
      title,
      percent: pct,
      startsAt: new Date(from).toISOString(),
      endsAt: new Date(until).toISOString(),
      productIds: all ? [] : [...picked],
      active: true,
    });
  }

  return (
    <Dialog open wide onClose={onClose} title={sale ? (running ? `„${sale.title}“ – Ende ändern` : `„${sale.title}“ bearbeiten`) : "Neue Aktion"} description={running ? "Bei einer laufenden Aktion bleiben Rabatt, Beginn und Arbeiten fest – so können sich Käufer:innen darauf verlassen." : `Höchstens ${maxDays} Tage, ${SALE_MIN_PERCENT}–${SALE_MAX_PERCENT} %.`}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <Field label="Titel" error={err("title")} hint="Sichtbar für Käufer:innen, z. B. „Herbst-Aktion“">
          {(p) => <Input {...p} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={60} required />}
        </Field>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Rabatt in %" error={err("percent")}>
            {(p) => <Input {...p} value={percent} onChange={(e) => setPercent(e.target.value)} inputMode="numeric" disabled={running} />}
          </Field>
          <Field label="Beginn" error={err("startsAt")}>
            {(p) => <Input {...p} type="datetime-local" value={from} onChange={(e) => setFrom(e.target.value)} disabled={running} />}
          </Field>
          <Field label="Ende" error={err("endsAt")}>
            {(p) => <Input {...p} type="datetime-local" value={until} onChange={(e) => setUntil(e.target.value)} min={from || undefined} />}
          </Field>
        </div>

        <fieldset disabled={running}>
          <legend className="mb-1.5 text-[13px] font-semibold">Gilt für</legend>
          <Checkbox label="Den ganzen Shop (auch Arbeiten, die du während der Aktion neu einstellst)" checked={all} onChange={(e) => setAll(e.target.checked)} />
          {!all && (
            <ul className="mt-3 max-h-56 divide-y divide-line overflow-y-auto rounded-xl border border-line">
              {products.map((p) => (
                <li key={p.id} className="px-3 py-2">
                  <Checkbox
                    label={
                      <span className="flex w-full justify-between gap-3">
                        <span className="truncate">{p.title}</span>
                        <span className="num shrink-0 text-muted">{fmt(p.priceMinor)}</span>
                      </span>
                    }
                    checked={picked.has(p.id)}
                    onChange={(e) =>
                      setPicked((cur) => {
                        const n = new Set(cur);
                        if (e.target.checked) n.add(p.id);
                        else n.delete(p.id);
                        return n;
                      })
                    }
                  />
                </li>
              ))}
            </ul>
          )}
          {err("productIds") && <p className="mt-1.5 text-[13px] text-danger">{err("productIds")}</p>}
        </fieldset>

        {pct >= SALE_MIN_PERCENT && pct <= SALE_MAX_PERCENT && preview.length > 0 && (
          <div className="rounded-xl bg-sunken px-4 py-3">
            <p className="spec mb-2">Vorschau</p>
            <ul className="space-y-1 text-[13.5px]">
              {preview.map((p) => (
                <li key={p.id} className="flex justify-between gap-3">
                  <span className="truncate">{p.title}</span>
                  <span className="num shrink-0">
                    <span className="mr-2 text-muted line-through decoration-1">{fmt(p.priceMinor)}</span>
                    <span className="font-semibold text-clay-ink">{fmt(salePrice(p.priceMinor, pct))}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex justify-end gap-2 border-t border-line pt-4">
          <Button type="button" variant="ghost" onClick={onClose}>
            Abbrechen
          </Button>
          <Button type="submit" disabled={save.pending}>
            {save.pending ? "Speichere …" : sale ? "Speichern" : "Aktion anlegen"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
