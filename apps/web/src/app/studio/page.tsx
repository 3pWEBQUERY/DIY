import Link from "next/link";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { BookOpen, Layers, PenLine, Package, FileText } from "lucide-react";
import { formatMoney, type Currency } from "@werkraum/shared";
import { currentUser } from "@/server/auth/session";
import { studioOverview } from "@/server/analytics/studio";
import { Kpi, KpiGrid } from "@/components/admin/ui";
import { Sparkline } from "@/components/admin/sparkline";
import { delta, num, weekLabel } from "@/components/admin/format";
import { HeatLegend, HeatStrip } from "@/components/creator/heat-strip";
import { SectionTitle, Notice } from "@/components/ui/misc";

export const metadata: Metadata = { title: "Übersicht" };
export const dynamic = "force-dynamic";

/** Studio-Übersicht (PRD §20) – ehrliche Kennzahlen statt Eitelkeitsmetriken (§20.4). */
export default async function StudioOverview() {
  const user = await currentUser();
  if (!user?.profile) redirect("/anmelden?weiter=/studio");
  const o = await studioOverview(user.id);
  const labels = o.followers.weeks.map(weekLabel);
  const gained12 = o.followers.gainedSeries.reduce((a, b) => a + b, 0);

  const actions = [
    { href: "/erstellen?typ=projekt", label: "Projekt starten", icon: Layers, note: "Idee, Material, Journal" },
    { href: "/erstellen?typ=anleitung", label: "Anleitung schreiben", icon: BookOpen, note: "Schritt für Schritt" },
    { href: "/erstellen", label: "Beitrag teilen", icon: PenLine, note: "Fortschritt zeigen" },
    { href: "/studio/blog", label: "Artikel verfassen", icon: FileText, note: "Hintergründe & Wissen" },
    ...(o.shop ? [{ href: "/studio/produkte", label: "Produkt anlegen", icon: Package, note: o.shop.name }] : [{ href: "/studio/shop", label: "Shop eröffnen", icon: Package, note: "Handgemachtes verkaufen" }]),
  ];

  return (
    <div className="max-w-[1100px]">
      <header className="mb-10">
        <p className="spec mb-3 flex items-center gap-2">
          <span className="inline-block h-px w-6 bg-rule-strong" />
          Letzte {o.periodDays} Tage · im Vergleich zu den {o.periodDays} Tagen davor
        </p>
        <h1 className="display text-[2.4rem] sm:text-5xl">Deine Werkstatt in Zahlen</h1>
      </header>

      <nav aria-label="Schnellaktionen" className="mb-12 grid grid-cols-2 gap-px border border-line bg-line sm:grid-cols-3 lg:grid-cols-5 rounded-2xl overflow-hidden">
        {actions.map((a) => (
          <Link key={a.href} href={a.href} className="group flex flex-col gap-3 bg-paper p-4 hover:bg-card">
            <a.icon size={18} strokeWidth={1.6} aria-hidden className="text-ink" />
            <span>
              <span className="block text-sm font-semibold group-hover:underline">{a.label}</span>
              <span className="block text-xs text-muted">{a.note}</span>
            </span>
          </Link>
        ))}
      </nav>

      <section aria-labelledby="o1" className="mb-12">
        <SectionTitle n="01" title={<span id="o1">Reichweite & Resonanz</span>} action={<Link href="/studio/statistiken" className="text-xs text-muted hover:text-ink">Je Inhalt →</Link>} />
        <KpiGrid className="mt-4">
          <Kpi label="Profilaufrufe" value={num(o.profileViews.cur)} delta={delta(o.profileViews.cur, o.profileViews.prev)} note="Aufrufe (nicht eindeutige Besucher)" />
          <Kpi label="Projektaufrufe" value={num(o.projectViews.cur)} delta={delta(o.projectViews.cur, o.projectViews.prev)} note="Aufrufe (nicht eindeutige Besucher)" />
          <Kpi label="Anleitungsaufrufe" value={num(o.tutorialViews.cur)} delta={delta(o.tutorialViews.cur, o.tutorialViews.prev)} note="Aufrufe (nicht eindeutige Besucher)" />
          <Kpi
            label="Interaktionen"
            value={num(o.interactions.cur.total)}
            delta={delta(o.interactions.cur.total, o.interactions.prev.total)}
            note={`${num(o.interactions.cur.likes)} Gefällt-mir · ${num(o.interactions.cur.comments)} Kommentare · ${num(o.interactions.cur.saves)} gemerkt`}
          />
        </KpiGrid>
      </section>

      <div className="mb-12 grid gap-12 lg:grid-cols-2">
        <section aria-labelledby="o2">
          <SectionTitle n="02" title={<span id="o2">Follower</span>} />
          <div className="mt-4 flex items-end justify-between gap-6">
            <div>
              <p className="text-[2rem] font-semibold leading-none num">{num(o.followers.total)}</p>
              <p className="mt-1.5 text-xs text-muted">aktuell · +{num(gained12)} neue in 12 Wochen</p>
            </div>
            <Sparkline values={o.followers.gainedSeries} labels={labels} label="Neue Follower pro Woche" variant="bars" width={220} height={56} />
          </div>
          <p className="mt-3 text-xs text-muted">Neue Follower pro Woche. Entfolgungen sind nicht abgezogen.</p>
        </section>

        <section aria-labelledby="o3">
          <SectionTitle n="03" title={<span id="o3">Veröffentlichungen</span>} action={<HeatLegend />} />
          <div className="mt-4">
            <HeatStrip days={o.heat.days} today={o.heat.today} />
          </div>
          <p className="mt-3 text-xs text-muted">
            {num(o.heat.total)} Veröffentlichungen an {num(o.heat.activeDays)} Tagen – Beiträge, Journal-Einträge, Projekte, Anleitungen und Artikel. {o.meaningful > 0 && `${num(o.meaningful)} davon zählen als bedeutsame kreative Aktivität.`}
          </p>
        </section>
      </div>

      {o.revenue && o.shop && (
        <section aria-labelledby="o4" className="mb-12">
          <SectionTitle n="04" title={<span id="o4">Shop · {o.shop.name}</span>} action={<Link href="/studio/einnahmen" className="text-xs text-muted hover:text-ink">Einnahmen & Auszahlungen →</Link>} />
          <KpiGrid className="mt-4">
            <Kpi
              label="Umsatz"
              value={formatMoney(o.revenue.gross, o.revenue.currency as Currency)}
              delta={delta(o.revenue.gross, o.revenue.grossPrev)}
              note="Bezahlte Bestellungen inkl. Versand, ohne Stornos und Erstattungen"
              chart={<Sparkline values={o.revenue.series.map((v) => Math.round(v / 100))} labels={labels} label="Umsatz pro Woche" />}
            />
            <Kpi label="Bestellungen" value={num(o.revenue.orders)} note="bezahlt" />
            <Kpi label="Plattformprovision" value={formatMoney(o.revenue.fees, o.revenue.currency as Currency)} note="auf Warenwert, transparent je Bestellung" />
            <Kpi label="Umsatz gesamt" value={formatMoney(o.revenue.allTime, o.revenue.currency as Currency)} note="seit Shop-Eröffnung" />
          </KpiGrid>
          {o.shop.status !== "ACTIVE" && (
            <Notice tone="warn" className="mt-4">
              Dein Shop ist derzeit nicht aktiv. <Link href="/studio/shop" className="font-semibold underline">Zur Shopverwaltung</Link>
            </Notice>
          )}
        </section>
      )}

      <aside className="border-t border-line pt-5 text-xs leading-relaxed text-muted" aria-label="So zählen wir">
        <p className="spec mb-1.5 text-ink">So zählen wir</p>
        <p>
          Aufrufe sind Seitenaufrufe, keine eindeutigen Personen. Wiederholte Aufrufe derselben Person innerhalb von 30 Minuten zählen einmal, eigene Aufrufe nie. Interaktionen
          umfassen Gefällt-mir, Kommentare und Merken anderer Personen auf deinen Beiträgen, Projekten, Anleitungen und Artikeln. Umsätze sind Bruttowerte vor Gebühren des
          Zahlungsdienstleisters; massgeblich ist die Abrechnung unter Einnahmen.
        </p>
      </aside>
    </div>
  );
}
