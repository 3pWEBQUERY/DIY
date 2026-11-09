"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Check, ExternalLink, Loader2 } from "lucide-react";
import { formatMoney } from "@werkraum/shared";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { confirmDialog } from "@/components/ui/confirm";
import { cn } from "@/lib/utils";
import { callAction } from "@/lib/use-action";
import { proPaymentMethodAction, setFeaturedProjectsAction, setMediaKitPublicAction, setProCancelAction, startProCheckoutAction } from "@/app/studio/pro/actions";

/* ───────────── Abschliessen ───────────── */

export function PricingCard({ prices, enabled }: { prices: { month: number; year: number; yearSavingMinor: number }; enabled: boolean }) {
  const [interval, setIv] = useState<"month" | "year">("year");
  const [pending, start] = useTransition();
  const chf = (n: number) => formatMoney(n, "CHF");
  const perMonth = interval === "year" ? Math.round(prices.year / 12) : prices.month;
  const go = () =>
    start(async () => {
      const r = await callAction(() => startProCheckoutAction(interval));
      if (r.ok) location.assign(r.data.url);
      else toast(r.error, "error");
    });
  return (
    <div className="rounded-3xl border border-line bg-card p-6 sm:p-7">
      <div role="radiogroup" aria-label="Abrechnung" className="grid grid-cols-2 gap-1 rounded-xl bg-sunken p-1 text-[13.5px]">
        {(
          [
            ["month", "Monatlich"],
            ["year", "Jährlich"],
          ] as const
        ).map(([k, l]) => (
          <button key={k} type="button" role="radio" aria-checked={interval === k} onClick={() => setIv(k)} className={cn("h-9 rounded-lg font-medium text-muted transition-colors hover:text-ink", interval === k && "bg-card text-ink shadow-[0_1px_2px_rgb(0_0_0/0.06)]")}>
            {l}
            {k === "year" && prices.yearSavingMinor > 0 && <span className="ml-1.5 text-[11px] font-semibold text-moss">−{Math.round((prices.yearSavingMinor / (prices.month * 12)) * 100)} %</span>}
          </button>
        ))}
      </div>
      <p className="mt-6 flex items-baseline gap-1.5">
        <span className="num text-[2.6rem] font-bold leading-none tracking-tight">{chf(perMonth)}</span>
        <span className="text-[14px] text-muted">pro Monat</span>
      </p>
      <p className="mt-2 h-5 text-[13px] text-muted">{interval === "year" ? `${chf(prices.year)} jährlich abgerechnet${prices.yearSavingMinor > 0 ? ` – du sparst ${chf(prices.yearSavingMinor)}` : ""}` : "monatlich abgerechnet"}</p>
      <Button size="lg" className="mt-6 w-full" disabled={!enabled || pending} onClick={go}>
        {pending && <Loader2 size={16} className="animate-spin" />}
        {enabled ? "Creator Pro starten" : "Bald verfügbar"}
      </Button>
      <ul className="mt-5 space-y-2 text-[13px] text-muted">
        {["Jederzeit kündbar zum Ende der Laufzeit", "Sicher bezahlen über Stripe (Karte, TWINT, Apple Pay …)", "Deine Inhalte bleiben auch nach der Kündigung erhalten"].map((t) => (
          <li key={t} className="flex gap-2">
            <Check size={14} className="mt-0.5 shrink-0 text-moss" aria-hidden />
            {t}
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ───────────── Verwalten ───────────── */

export function ManageSubscription({ provider, cancelAtPeriodEnd, periodEndLabel }: { provider: "stripe" | "simulated" | "comp" | null; cancelAtPeriodEnd: boolean; periodEndLabel: string | null }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  if (provider === "comp") return null;
  const toggle = async () => {
    if (!cancelAtPeriodEnd) {
      const ok = await confirmDialog({
        title: "Creator Pro kündigen?",
        body: `Pro bleibt bis ${periodEndLabel ? `zum ${periodEndLabel}` : "zum Ende der Laufzeit"} aktiv. Danach werden hervorgehobene Projekte und das Medienkit ausgeblendet – deine Inhalte bleiben erhalten.`,
        confirmLabel: "Kündigen",
        cancelLabel: "Pro behalten",
        tone: "danger",
      });
      if (!ok) return;
    }
    start(async () => {
      const r = await callAction(() => setProCancelAction(!cancelAtPeriodEnd));
      if (r.ok) {
        toast(r.message ?? "Gespeichert.");
        router.refresh();
      } else toast(r.error, "error");
    });
  };
  const payment = () =>
    start(async () => {
      const r = await callAction(() => proPaymentMethodAction());
      if (r.ok) location.assign(r.data.url);
      else toast(r.error, "error");
    });
  return (
    <div className="flex flex-wrap gap-2">
      {provider === "stripe" && (
        <Button variant="outline" onClick={payment} disabled={pending}>
          <ExternalLink size={14} aria-hidden /> Zahlungsmittel & Belege
        </Button>
      )}
      <Button variant={cancelAtPeriodEnd ? "primary" : "ghost"} onClick={() => void toggle()} disabled={pending} className={cn(!cancelAtPeriodEnd && "text-muted hover:text-danger")}>
        {pending && <Loader2 size={14} className="animate-spin" />}
        {cancelAtPeriodEnd ? "Kündigung zurücknehmen" : "Abo kündigen"}
      </Button>
    </div>
  );
}

/* ───────────── Hervorgehobene Projekte ───────────── */

export function FeaturedPicker({ projects, initial, max }: { projects: { id: string; title: string; coverUrl: string | null }[]; initial: string[]; max: number }) {
  const router = useRouter();
  const [sel, setSel] = useState<string[]>(initial.filter((id) => projects.some((p) => p.id === id)));
  const [pending, start] = useTransition();
  const dirty = sel.join() !== initial.join();
  const toggle = (id: string) => setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : s.length >= max ? s : [...s, id]));
  if (!projects.length) return <p className="text-[14px] text-muted">Veröffentliche ein öffentliches Projekt, um es hier hervorzuheben.</p>;
  return (
    <div>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {projects.map((p) => {
          const i = sel.indexOf(p.id);
          const on = i >= 0;
          return (
            <li key={p.id}>
              <button
                type="button"
                role="checkbox"
                aria-checked={on}
                onClick={() => toggle(p.id)}
                disabled={!on && sel.length >= max}
                className={cn("group relative block w-full overflow-hidden rounded-2xl text-left ring-2 ring-transparent transition disabled:opacity-45", on && "ring-moss")}
              >
                <span className="block aspect-[4/3] bg-sunken">
                  {p.coverUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.coverUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
                  )}
                </span>
                <span className={cn("absolute right-2 top-2 grid size-6 place-items-center rounded-full text-[12px] font-bold shadow-[0_1px_2px_rgb(0_0_0/0.15)]", on ? "bg-moss text-paper" : "bg-card/90 text-transparent")}>{on ? i + 1 : "·"}</span>
                <span className="block truncate px-1 pt-2 text-[13px] font-medium">{p.title}</span>
              </button>
            </li>
          );
        })}
      </ul>
      <div className="mt-4 flex items-center gap-3">
        <Button
          disabled={!dirty || pending}
          onClick={() =>
            start(async () => {
              const r = await callAction(() => setFeaturedProjectsAction(sel));
              if (r.ok) {
                toast(r.message ?? "Gespeichert.");
                router.refresh();
              } else toast(r.error, "error");
            })
          }
        >
          {pending && <Loader2 size={14} className="animate-spin" />} Speichern
        </Button>
        <span className="text-[13px] text-muted">
          {sel.length} von {max} gewählt · Reihenfolge = Reihenfolge der Auswahl
        </span>
      </div>
    </div>
  );
}

/* ───────────── Medienkit ───────────── */

export function MediaKitToggle({ initial, href }: { initial: boolean; href: string }) {
  const router = useRouter();
  const [on, setOn] = useState(initial);
  const [pending, start] = useTransition();
  const flip = () =>
    start(async () => {
      const r = await callAction(() => setMediaKitPublicAction(!on));
      if (r.ok) {
        setOn(!on);
        toast(r.message ?? "Gespeichert.");
        router.refresh();
      } else toast(r.error, "error");
    });
  return (
    <div className="flex flex-wrap items-center gap-3">
      <button type="button" role="switch" aria-checked={on} onClick={flip} disabled={pending} className={cn("relative h-7 w-12 shrink-0 rounded-full transition-colors disabled:opacity-50", on ? "bg-moss" : "bg-field")} aria-label="Medienkit öffentlich">
        <span className={cn("absolute top-1 size-5 rounded-full bg-card shadow transition-[left]", on ? "left-6" : "left-1")} />
      </button>
      <span className="text-[14px]">{on ? "Öffentlich – jede Person mit dem Link kann es sehen" : "Privat – nur du siehst es"}</span>
      <Link href={href} className="ml-auto inline-flex items-center gap-1.5 text-[13.5px] font-semibold text-moss hover:underline" target="_blank">
        Medienkit ansehen <ExternalLink size={13} aria-hidden />
      </Link>
    </div>
  );
}
