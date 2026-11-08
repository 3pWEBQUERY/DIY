"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ArrowUpRight, Banknote, CalendarClock, Landmark, Loader2 } from "lucide-react";
import { formatMoney, type Currency } from "@werkraum/shared";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input, Select } from "@/components/ui/field";
import { Notice } from "@/components/ui/misc";
import { toast } from "@/components/ui/toast";
import { bankUpdateLinkAction, requestPayoutAction, setPayoutScheduleAction } from "@/app/studio/einnahmen/actions";
import { parseMoneyInput, minorToInput } from "@/server/commerce/rules";
import { cn, formatDate } from "@/lib/utils";

type Interval = "manual" | "daily" | "weekly" | "monthly";
export type PayoutPanelData = {
  mode: "stripe" | "simulated" | "disabled";
  connected: boolean;
  payoutsEnabled: boolean;
  currency: string;
  available: number;
  pending: number;
  schedule: { interval: Interval; weeklyAnchor: string | null; monthlyAnchor: number | null } | null;
  bank: { name: string | null; last4: string; currency: string } | null;
  unavailable?: boolean;
};

const INTERVALS: { key: Interval; label: string }[] = [
  { key: "manual", label: "Auf Anfrage" },
  { key: "daily", label: "Täglich" },
  { key: "weekly", label: "Wöchentlich" },
  { key: "monthly", label: "Monatlich" },
];
const WEEKDAY: Record<string, string> = { monday: "Montag", tuesday: "Dienstag", wednesday: "Mittwoch", thursday: "Donnerstag", friday: "Freitag" };

export function scheduleText(s: PayoutPanelData["schedule"]) {
  if (!s) return null;
  if (s.interval === "manual") return "Auszahlung nur auf deine Anfrage";
  if (s.interval === "daily") return "Stripe zahlt verfügbares Guthaben täglich automatisch aus";
  if (s.interval === "weekly") return `Automatisch jeden ${WEEKDAY[s.weeklyAnchor ?? "monday"] ?? "Montag"}`;
  return `Automatisch am ${s.monthlyAnchor ?? 1}. des Monats`;
}

/** Guthaben, Auszahlung beantragen, Auszahlungsplan und Bankkonto – ohne Stripe-Dashboard. */
export function PayoutPanel({ data }: { data: PayoutPanelData }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const c = data.currency as Currency;
  const money = (n: number) => formatMoney(n, c);

  if (data.mode === "disabled") return null;
  if (!data.connected || !data.payoutsEnabled) {
    return (
      <section id="auszahlungen" className="rounded-2xl border border-line bg-card p-5 sm:p-6">
        <p className="flex items-center gap-2 text-[15px] font-semibold">
          <Banknote size={18} className="text-muted" aria-hidden /> Auszahlungen
        </p>
        <p className="mt-2 max-w-xl text-[14px] leading-relaxed text-muted">
          {data.connected ? "Stripe prüft dein Auszahlungskonto noch. Sobald Auszahlungen freigeschaltet sind, kannst du dein Guthaben hier auszahlen lassen." : "Verbinde zuerst ein Auszahlungskonto, damit du Einnahmen auf dein Bankkonto auszahlen lassen kannst."}
        </p>
        <Link href="/studio/shop" className="mt-4 inline-flex items-center gap-1 text-[14px] font-semibold text-moss hover:underline">
          Zur Shopverwaltung <ArrowUpRight size={14} aria-hidden />
        </Link>
      </section>
    );
  }

  const openBank = () =>
    start(async () => {
      const r = await bankUpdateLinkAction();
      if (r.ok) location.assign(r.data.url);
      else toast(r.error, "error");
    });

  return (
    <section id="auszahlungen" aria-label="Guthaben und Auszahlungen" className="overflow-hidden rounded-2xl border border-line bg-card">
      {data.unavailable && (
        <Notice tone="warn" className="m-4 mb-0" title="Stripe ist gerade nicht erreichbar">
          Guthaben und Auszahlungsplan können im Moment nicht geladen werden. Bitte versuche es in ein paar Minuten erneut.
        </Notice>
      )}
      <div className="flex flex-col gap-5 p-5 sm:flex-row sm:items-end sm:justify-between sm:p-6">
        <div>
          <p className="text-[13px] font-medium text-muted">Verfügbares Guthaben</p>
          <p className="num mt-1 text-[2.4rem] font-bold leading-none tracking-tight">{money(data.available)}</p>
          <p className="mt-2 text-[13px] text-muted">
            {data.pending > 0 ? (
              <>
                + <span className="num font-medium text-ink-2">{money(data.pending)}</span> in Bearbeitung – wird nach der Sperrfrist von Stripe verfügbar
              </>
            ) : (
              "Alles Verfügbare kann ausgezahlt werden."
            )}
          </p>
        </div>
        <Button size="lg" onClick={() => setOpen(true)} disabled={data.available < 100 || data.unavailable} className="sm:min-w-56">
          <Banknote size={17} aria-hidden /> Auszahlung beantragen
        </Button>
      </div>

      <div className="grid border-t border-line md:grid-cols-[1.4fr_1fr]">
        <SchedulePicker key={JSON.stringify(data.schedule)} schedule={data.schedule} disabled={data.unavailable} onSaved={() => router.refresh()} />
        <div className="border-t border-line p-5 sm:p-6 md:border-l md:border-t-0">
          <p className="flex items-center gap-2 text-[13px] font-semibold">
            <Landmark size={15} className="text-muted" aria-hidden /> Bankkonto
          </p>
          {data.bank ? (
            <p className="mt-2.5 text-[14px]">
              <span className="font-medium">{data.bank.name ?? "Bankkonto"}</span> <span className="num text-muted">···· {data.bank.last4}</span>
              <span className="ml-2 rounded-full bg-sunken px-2 py-0.5 text-[11px] font-medium text-ink-2">{data.bank.currency}</span>
            </p>
          ) : (
            <p className="mt-2.5 text-[14px] text-muted">Noch kein Bankkonto hinterlegt.</p>
          )}
          {data.mode === "stripe" && (
            <button type="button" onClick={openBank} disabled={pending} className="mt-3 inline-flex items-center gap-1.5 text-[13.5px] font-semibold text-moss hover:underline disabled:opacity-50">
              {pending && <Loader2 size={13} className="animate-spin" />}
              {data.bank ? "Bankkonto ändern" : "Bankkonto hinterlegen"}
            </button>
          )}
          <p className="mt-2 text-[12px] leading-relaxed text-muted">Aus Sicherheitsgründen wird die IBAN im gesicherten Formular unseres Zahlungspartners Stripe erfasst.</p>
        </div>
      </div>

      <RequestDialog key={`${open}:${data.available}`} open={open} onClose={() => setOpen(false)} data={data} onDone={() => router.refresh()} />
    </section>
  );
}

function SchedulePicker({ schedule, disabled, onSaved }: { schedule: PayoutPanelData["schedule"]; disabled?: boolean; onSaved: () => void }) {
  const [interval, setIv] = useState<Interval>(schedule?.interval ?? "daily");
  const [weekly, setWeekly] = useState(schedule?.weeklyAnchor ?? "monday");
  const [monthly, setMonthly] = useState(String(schedule?.monthlyAnchor ?? 1));
  const [pending, start] = useTransition();
  const dirty = !!schedule && (interval !== schedule.interval || (interval === "weekly" && weekly !== (schedule.weeklyAnchor ?? "monday")) || (interval === "monthly" && Number(monthly) !== (schedule.monthlyAnchor ?? 1)));

  const save = () =>
    start(async () => {
      const r = await setPayoutScheduleAction({ interval, weeklyAnchor: interval === "weekly" ? weekly : null, monthlyAnchor: interval === "monthly" ? Number(monthly) : null });
      if (r.ok) {
        toast("Auszahlungsplan gespeichert.");
        onSaved();
      } else toast(r.error, "error");
    });

  return (
    <div className="p-5 sm:p-6">
      <p className="flex items-center gap-2 text-[13px] font-semibold">
        <CalendarClock size={15} className="text-muted" aria-hidden /> Auszahlungsplan
      </p>
      <div role="radiogroup" aria-label="Auszahlungsplan" className="mt-3 grid grid-cols-2 gap-1 rounded-xl bg-sunken p-1 text-[13px] sm:grid-cols-4">
        {INTERVALS.map((i) => (
          <button
            key={i.key}
            type="button"
            role="radio"
            aria-checked={interval === i.key}
            disabled={disabled || pending}
            onClick={() => setIv(i.key)}
            className={cn("h-9 rounded-lg px-2 font-medium text-muted transition-colors hover:text-ink disabled:opacity-50", interval === i.key && "bg-card text-ink shadow-[0_1px_2px_rgb(0_0_0/0.06)]")}
          >
            {i.label}
          </button>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        {interval === "weekly" && (
          <div className="w-44">
            <Select value={weekly} onChange={(e) => setWeekly(e.target.value)} aria-label="Wochentag">
              {Object.entries(WEEKDAY).map(([k, l]) => (
                <option key={k} value={k}>
                  jeden {l}
                </option>
              ))}
            </Select>
          </div>
        )}
        {interval === "monthly" && (
          <div className="w-44">
            <Select value={monthly} onChange={(e) => setMonthly(e.target.value)} aria-label="Tag im Monat">
              {Array.from({ length: 28 }, (_, i) => String(i + 1)).map((d) => (
                <option key={d} value={d}>
                  am {d}. des Monats
                </option>
              ))}
            </Select>
          </div>
        )}
        <p className="text-[13px] text-muted">
          {interval === "manual" ? "Du entscheidest, wann ausgezahlt wird." : interval === "daily" ? "Verfügbares Guthaben geht täglich automatisch raus." : "Verfügbares Guthaben geht automatisch raus."} Über jede Auszahlung wirst du benachrichtigt.
        </p>
        {dirty && (
          <Button size="sm" onClick={save} disabled={pending}>
            {pending && <Loader2 size={13} className="animate-spin" />} Speichern
          </Button>
        )}
      </div>
    </div>
  );
}

function RequestDialog({ open, onClose, data, onDone }: { open: boolean; onClose: () => void; data: PayoutPanelData; onDone: () => void }) {
  const [amount, setAmount] = useState(minorToInput(data.available));
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const c = data.currency as Currency;
  const minor = parseMoneyInput(amount);
  const automatic = !!data.schedule && data.schedule.interval !== "manual";
  const valid = !!minor && minor >= 100 && minor <= data.available;

  const submit = () =>
    start(async () => {
      setError(null);
      const r = await requestPayoutAction({ amountMinor: minor ?? undefined, switchToManual: automatic });
      if (r.ok) {
        const when = r.data.arrivalAt ? formatDate(r.data.arrivalAt, { weekday: "long", day: "numeric", month: "long" }) : null;
        toast(`Auszahlung von ${formatMoney(r.data.amountMinor, c)} ausgelöst${when ? ` – voraussichtlich am ${when} auf deinem Konto` : ""}.`);
        onClose();
        onDone();
      } else setError(r.error);
    });

  return (
    <Dialog open={open} onClose={onClose} title="Auszahlung beantragen" description={`Verfügbar: ${formatMoney(data.available, c)}`}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (valid) submit();
        }}
        className="space-y-4"
      >
        <div>
          <label htmlFor="payout-amount" className="mb-1.5 block text-[13px] font-semibold">
            Betrag in {data.currency}
          </label>
          <div className="flex gap-2">
            <Input id="payout-amount" inputMode="decimal" className="num flex-1" value={amount} onChange={(e) => setAmount(e.target.value)} aria-invalid={!valid} />
            <Button type="button" variant="outline" onClick={() => setAmount(minorToInput(data.available))}>
              Alles
            </Button>
          </div>
          {!valid && amount && <p className="mt-1.5 text-[12.5px] text-danger">{minor && minor > data.available ? "Höher als dein verfügbares Guthaben." : "Mindestens 1.00."}</p>}
        </div>
        {data.bank && (
          <p className="text-[13.5px] text-muted">
            Auf <span className="font-medium text-ink">{data.bank.name ?? "dein Bankkonto"}</span> <span className="num">···· {data.bank.last4}</span> · Gutschrift meist nach 1–3 Bankarbeitstagen.
          </p>
        )}
        {automatic && (
          <Notice title="Auszahlungsplan wird umgestellt">
            Du hast automatische Auszahlungen eingestellt. Für eine Auszahlung auf Anfrage stellen wir deinen Plan auf „Auf Anfrage“ um – du kannst ihn jederzeit wieder ändern.
          </Notice>
        )}
        {error && <p className="text-[13.5px] text-danger">{error}</p>}
        <Button type="submit" size="lg" className="w-full" disabled={!valid || pending}>
          {pending && <Loader2 size={15} className="animate-spin" />}
          {valid ? `${automatic ? "Umstellen und " : ""}${formatMoney(minor!, c)} auszahlen` : "Auszahlen"}
        </Button>
      </form>
    </Dialog>
  );
}
