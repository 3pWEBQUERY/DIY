"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Share2, Shuffle } from "lucide-react";
import { COUPON_MAX_PERCENT, formatMoney, type Currency } from "@werkraum/shared";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input } from "@/components/ui/field";
import { Dialog } from "@/components/ui/dialog";
import { Badge, Empty } from "@/components/ui/misc";
import { MoreMenu } from "@/components/social/actions";
import { confirmDialog } from "@/components/ui/confirm";
import { toast } from "@/components/ui/toast";
import { callAction, useAction } from "@/lib/use-action";
import type { ActionResult } from "@/server/errors";
import { minorToInput, parseMoneyInput } from "@/server/commerce/rules";
import { CouponShareDialog } from "./coupon-share-dialog";
import { deleteCouponAction, saveCouponAction, setCouponActiveAction } from "@/app/studio/rabatte/actions";

export type CouponRowView = {
  id: string;
  code: string;
  kind: "PERCENT" | "FIXED";
  value: number;
  minSubtotalMinor: number;
  startsAt: string | null;
  endsAt: string | null;
  maxUses: number | null;
  usedCount: number;
  onePerBuyer: boolean;
  active: boolean;
  stats: { orders: number; discountMinor: number };
};

const dayFmt = (iso: string) => new Date(iso).toLocaleDateString("de-CH", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/Zurich" });
/** ISO → Wert für <input type="date"> (Schweizer Zeit) */
const toDateInput = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("sv-SE", { timeZone: "Europe/Zurich" }) : "");

function couponState(c: CouponRowView, now: number): { label: string; tone: "moss" | "neutral" | "warn" | "outline" } {
  if (!c.active) return { label: "Pausiert", tone: "outline" };
  if (c.endsAt && new Date(c.endsAt).getTime() < now) return { label: "Abgelaufen", tone: "neutral" };
  if (c.maxUses != null && c.usedCount >= c.maxUses) return { label: "Vergeben", tone: "neutral" };
  if (c.startsAt && new Date(c.startsAt).getTime() > now) return { label: "Geplant", tone: "warn" };
  return { label: "Aktiv", tone: "moss" };
}

function randomCode() {
  const abc = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const b = crypto.getRandomValues(new Uint8Array(8));
  return Array.from(b, (x) => abc[x % abc.length]).join("");
}

/** Gutscheine eines Shops: Liste mit Status und Einlösungen, Anlegen und Bearbeiten im Dialog. */
export function CouponManager({ coupons, currency, now, shopName }: { coupons: CouponRowView[]; currency: Currency; now: number; shopName: string }) {
  const router = useRouter();
  const [editing, setEditing] = useState<CouponRowView | "new" | null>(null);
  const [sharing, setSharing] = useState<CouponRowView | null>(null);
  const [, start] = useTransition();
  const fmt = (m: number) => formatMoney(m, currency);

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
          Ein Code gilt für den Warenwert in deinem Shop, nicht für den Versand. Den Rabatt trägst du; die Plattformgebühr wird auf den Betrag nach Rabatt berechnet.
        </p>
        <Button size="sm" onClick={() => setEditing("new")}>
          <Plus size={15} /> Neuer Gutschein
        </Button>
      </div>

      {coupons.length === 0 ? (
        <Empty title="Noch keine Gutscheine" body="Zum Beispiel HERBST10 für 10 % auf alles oder WILLKOMMEN für CHF 5 ab einem Warenwert von CHF 40." action={<Button onClick={() => setEditing("new")}>Ersten Gutschein anlegen</Button>} />
      ) : (
        // Liste statt Tabelle mit Scroll-Container: das Aktionsmenü darf über den Rand hinausragen
        <ul className="border-t border-rule">
          {coupons.map((c) => {
            const st = couponState(c, now);
            const cond = [
              c.minSubtotalMinor ? `ab ${fmt(c.minSubtotalMinor)}` : null,
              c.startsAt || c.endsAt ? [c.startsAt ? `ab ${dayFmt(c.startsAt)}` : null, c.endsAt ? `bis ${dayFmt(c.endsAt)}` : null].filter(Boolean).join(" ") : null,
              c.onePerBuyer ? "1× je Konto" : null,
            ].filter(Boolean);
            const shareable = st.label === "Aktiv" || st.label === "Geplant";
            return (
              <li key={c.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 border-b border-line py-3.5 md:grid-cols-[minmax(0,1fr)_6rem_9rem_auto_auto]">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-[14px] font-semibold tracking-[0.04em]">{c.code}</span>
                    <Badge tone={st.tone}>{st.label}</Badge>
                  </p>
                  <p className="mt-0.5 text-[13px] text-muted">{cond.length ? cond.join(" · ") : "ohne Bedingungen"}</p>
                </div>
                <p className="num order-3 text-[14px] font-semibold md:order-none">
                  {c.kind === "PERCENT" ? `${c.value} %` : fmt(c.value)}
                  <span className="block text-[12px] font-normal text-muted md:hidden">Rabatt</span>
                </p>
                <p className="num order-4 text-[13.5px] md:order-none">
                  {c.usedCount}
                  {c.maxUses != null && <span className="text-muted"> / {c.maxUses}</span>} eingelöst
                  {c.stats.orders > 0 && (
                    <span className="block text-[12px] text-muted">
                      −{fmt(c.stats.discountMinor)} · {c.stats.orders} {c.stats.orders === 1 ? "Bestellung" : "Bestellungen"}
                    </span>
                  )}
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="order-5 justify-self-start md:order-none"
                  onClick={() => setSharing(c)}
                  disabled={!shareable}
                  title={shareable ? undefined : "Nur aktive Gutscheine können geteilt werden"}
                  aria-label={`Gutschein ${c.code} teilen`}
                >
                  <Share2 size={14} /> Teilen
                </Button>
                <div className="order-2 justify-self-end md:order-none">
                  <MoreMenu
                    label={`Aktionen für ${c.code}`}
                    items={[
                      { label: "Bearbeiten", onSelect: () => setEditing(c) },
                      ...(shareable ? [{ label: "Teilen", onSelect: () => setSharing(c) }] : []),
                      {
                        label: "Code kopieren",
                        onSelect: () =>
                          navigator.clipboard.writeText(c.code).then(
                            () => toast(`${c.code} kopiert.`),
                            () => toast("Kopieren nicht möglich.", "error"),
                          ),
                      },
                      c.active ? { label: "Pausieren", onSelect: () => run(() => setCouponActiveAction(c.id, false)) } : { label: "Aktivieren", onSelect: () => run(() => setCouponActiveAction(c.id, true)) },
                      {
                        label: "Löschen",
                        danger: true,
                        onSelect: async () =>
                          (await confirmDialog({ title: `Gutschein ${c.code} löschen?`, body: "Der Code kann danach nicht mehr eingelöst werden. Bisherige Bestellungen behalten ihren Rabatt.", confirmLabel: "Löschen", tone: "danger" })) &&
                          run(() => deleteCouponAction(c.id)),
                      },
                    ]}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {editing && <CouponDialog coupon={editing === "new" ? null : editing} currency={currency} onClose={() => setEditing(null)} />}
      {sharing && (
        <CouponShareDialog
          coupon={{ id: sharing.id, code: sharing.code, valueLabel: sharing.kind === "PERCENT" ? `${sharing.value} %` : fmt(sharing.value), shopName, minLabel: sharing.minSubtotalMinor ? `ab ${fmt(sharing.minSubtotalMinor)} Warenwert` : null, endsAt: sharing.endsAt }}
          onClose={() => setSharing(null)}
        />
      )}
    </div>
  );
}

function CouponDialog({ coupon, currency, onClose }: { coupon: CouponRowView | null; currency: Currency; onClose: () => void }) {
  const [code, setCode] = useState(coupon?.code ?? "");
  const [kind, setKind] = useState<"PERCENT" | "FIXED">(coupon?.kind ?? "PERCENT");
  const [value, setValue] = useState(coupon ? (coupon.kind === "PERCENT" ? String(coupon.value) : minorToInput(coupon.value)) : "10");
  const [min, setMin] = useState(coupon?.minSubtotalMinor ? minorToInput(coupon.minSubtotalMinor) : "");
  const [from, setFrom] = useState(toDateInput(coupon?.startsAt ?? null));
  const [until, setUntil] = useState(toDateInput(coupon?.endsAt ?? null));
  const [maxUses, setMaxUses] = useState(coupon?.maxUses != null ? String(coupon.maxUses) : "");
  const [onePerBuyer, setOnePerBuyer] = useState(coupon?.onePerBuyer ?? true);
  const [active, setActive] = useState(coupon?.active ?? true);
  const [local, setLocal] = useState<Record<string, string>>({});
  const save = useAction(saveCouponAction, { onSuccess: onClose });
  const err = (k: string) => local[k] ?? save.fields[k];

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const errors: Record<string, string> = {};
    let v: number | null;
    if (kind === "PERCENT") {
      v = /^\d{1,2}$/.test(value.trim()) ? Number(value.trim()) : null;
      if (v == null || v < 1 || v > COUPON_MAX_PERCENT) errors.value = `Ganze Prozent von 1 bis ${COUPON_MAX_PERCENT}`;
    } else {
      v = parseMoneyInput(value);
      if (v == null || v < 1) errors.value = "Betrag in CHF, z. B. 5 oder 7.50";
    }
    const minMinor = min.trim() ? parseMoneyInput(min) : 0;
    if (minMinor == null) errors.minSubtotalMinor = "Betrag in CHF, z. B. 40";
    if (maxUses.trim() && !/^\d{1,6}$/.test(maxUses.trim())) errors.maxUses = "Ganze Zahl";
    setLocal(errors);
    if (Object.keys(errors).length) return;
    save.run(coupon?.id ?? null, {
      code,
      kind,
      value: v,
      minSubtotalMinor: minMinor,
      startsAt: from ? new Date(`${from}T00:00:00`).toISOString() : null,
      endsAt: until ? new Date(`${until}T23:59:59`).toISOString() : null,
      maxUses: maxUses.trim() ? Number(maxUses) : null,
      onePerBuyer,
      active,
    });
  }

  return (
    <Dialog open onClose={onClose} title={coupon ? `Gutschein ${coupon.code} bearbeiten` : "Neuer Gutschein"} description="Kund:innen geben den Code im Warenkorb ein.">
      <form onSubmit={submit} className="space-y-4" noValidate>
        <Field label="Code" error={err("code")} hint="3–24 Zeichen: Buchstaben, Ziffern, - oder _. Gross- und Kleinschreibung spielt keine Rolle.">
          {(p) => (
            <div className="flex gap-2">
              <Input {...p} value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} maxLength={24} autoComplete="off" spellCheck={false} className="font-mono uppercase tracking-[0.04em]" required />
              <Button type="button" variant="outline" className="h-11 shrink-0" onClick={() => setCode(randomCode())} aria-label="Zufälligen Code erzeugen">
                <Shuffle size={15} /> Zufällig
              </Button>
            </div>
          )}
        </Field>

        <fieldset>
          <legend className="mb-1.5 text-[13px] font-semibold">Art</legend>
          <div className="inline-flex rounded-xl border border-line-strong p-0.5" role="radiogroup">
            {(
              [
                ["PERCENT", "Prozent"],
                ["FIXED", `Betrag (${currency})`],
              ] as const
            ).map(([k, label]) => (
              <label key={k} className={`cursor-pointer rounded-[10px] px-3.5 py-1.5 text-[13.5px] font-semibold has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-moss ${kind === k ? "bg-ink text-paper" : "text-ink-2 hover:text-ink"}`}>
                <input
                  type="radio"
                  name="kind"
                  value={k}
                  checked={kind === k}
                  onChange={() => {
                    setKind(k);
                    setValue(k === "PERCENT" ? "10" : "5.00");
                  }}
                  className="sr-only"
                />
                {label}
              </label>
            ))}
          </div>
        </fieldset>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={kind === "PERCENT" ? "Rabatt in %" : `Rabatt in ${currency}`} error={err("value")}>
            {(p) => <Input {...p} value={value} onChange={(e) => setValue(e.target.value)} inputMode={kind === "PERCENT" ? "numeric" : "decimal"} />}
          </Field>
          <Field label={`Mindestwarenwert in ${currency}`} optional error={err("minSubtotalMinor")}>
            {(p) => <Input {...p} value={min} onChange={(e) => setMin(e.target.value)} inputMode="decimal" placeholder="keiner" />}
          </Field>
          <Field label="Gültig ab" optional error={err("startsAt")}>
            {(p) => <Input {...p} type="date" value={from} onChange={(e) => setFrom(e.target.value)} />}
          </Field>
          <Field label="Gültig bis (einschliesslich)" optional error={err("endsAt")}>
            {(p) => <Input {...p} type="date" value={until} onChange={(e) => setUntil(e.target.value)} min={from || undefined} />}
          </Field>
          <Field label="Einlösungen insgesamt" optional error={err("maxUses")} hint="Leer = unbegrenzt">
            {(p) => <Input {...p} value={maxUses} onChange={(e) => setMaxUses(e.target.value)} inputMode="numeric" placeholder="unbegrenzt" />}
          </Field>
        </div>

        <div className="space-y-2.5">
          <Checkbox label="Nur einmal pro Konto einlösbar" checked={onePerBuyer} onChange={(e) => setOnePerBuyer(e.target.checked)} />
          <Checkbox label="Aktiv – kann eingelöst werden" checked={active} onChange={(e) => setActive(e.target.checked)} />
        </div>

        <div className="flex justify-end gap-2 border-t border-line pt-4">
          <Button type="button" variant="ghost" onClick={onClose}>
            Abbrechen
          </Button>
          <Button type="submit" disabled={save.pending}>
            {save.pending ? "Speichere …" : coupon ? "Speichern" : "Gutschein anlegen"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
