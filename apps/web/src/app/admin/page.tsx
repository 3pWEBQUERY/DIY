import Link from "next/link";
import type { Metadata } from "next";
import { formatMoney } from "@werkraum/shared";
import { hasRole } from "@/server/authz";
import { adminPage } from "@/server/admin/guard";
import { dashboardKpis } from "@/server/admin/kpis";
import { AdminHeader, Kpi, KpiGrid } from "@/components/admin/ui";
import { Sparkline } from "@/components/admin/sparkline";
import { SectionTitle } from "@/components/ui/misc";
import { dec, delta, duration, num, pct, weekLabel } from "@/components/admin/format";
import { onlineNow } from "@/server/presence";
import { Avatar } from "@/components/ui/misc";
import { OnlineDot } from "@/components/ui/online-dot";
import { SignupMethodIcon } from "@/components/admin/signup-method";

export const metadata: Metadata = { title: "Dashboard" };
export const dynamic = "force-dynamic";

/** Dashboard nach PRD §30 – wenige, erklärbare Kennzahlen statt überladener Diagramme (§28.1). */
export default async function AdminDashboard() {
  const user = await adminPage("PLATFORM_MODERATOR");
  const isAdmin = hasRole(user, "ADMIN");
  const [k, online] = await Promise.all([dashboardKpis({ includeMoney: isAdmin }), onlineNow(24)]);
  const labels = k.weeks.map(weekLabel);
  const spark = (values: number[], label: string, variant: "line" | "bars" = "line") => <Sparkline values={values} labels={labels} label={label} variant={variant} />;

  return (
    <div>
      <AdminHeader
        title="Dashboard"
        description={
          <>
            Stand {new Date().toLocaleString("de-CH", { dateStyle: "long", timeStyle: "short", timeZone: "Europe/Zurich" })}. Verläufe zeigen die letzten 12 Wochen (Montag bis Sonntag, UTC). Die
            North-Star-Metrik ist die Zahl der Menschen mit bedeutsamer kreativer Aktivität – nicht die Verweildauer.
          </>
        }
      />

      <section aria-labelledby="k1" className="mb-10">
        <SectionTitle n="01" title={<span id="k1">Aktivität</span>} />
        <KpiGrid className="mt-4">
          <Kpi label="Jetzt online" value={num(online.count)} note="Web oder App in den letzten 2½ Minuten aktiv" />
          <Kpi
            label="Kreative mit bedeutsamer Aktivität · 7 T."
            value={num(k.activity.meaningfulCreators7)}
            note="Projekt veröffentlicht, Update, Anleitung abgeschlossen, Nachbau oder qualifizierter Kommentar"
            chart={spark(k.activity.seriesMeaningful, "Kreative pro Woche")}
          />
          <Kpi label="Wöchentlich aktiv (WAU)" value={num(k.activity.wau)} note={`Monatlich aktiv (MAU): ${num(k.activity.mau)}`} />
          <Kpi label="WAU / MAU" value={pct(k.activity.stickiness)} note="Anteil der Monatsaktiven, die wöchentlich zurückkehren" />
          <Kpi label="Neue Konten · 7 T." value={num(k.activity.newUsers7)} note={`${num(k.activity.users)} Konten gesamt`} chart={spark(k.activity.seriesUsers, "Neue Konten pro Woche", "bars")} />
        </KpiGrid>
        <div className="mt-4 rounded-2xl border border-line bg-card p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="flex items-center gap-2 text-[13px] font-semibold">
              <span className="size-2.5 rounded-full bg-online" aria-hidden /> Gerade online ({num(online.count)})
            </p>
            <Link href="/admin/nutzer?online=1" className="text-xs text-muted hover:text-ink">Alle anzeigen →</Link>
          </div>
          {online.users.length ? (
            <ul className="mt-3 flex flex-wrap gap-2">
              {online.users.map((u) => (
                <li key={u.id}>
                  <Link href={`/admin/nutzer/${u.id}`} className="flex items-center gap-2 rounded-full border border-line py-1 pl-1 pr-3 text-[13px] hover:border-rule-strong">
                    <span className="relative inline-block">
                      <Avatar src={u.profile?.avatarUrl} name={u.profile?.displayName ?? "?"} size={24} />
                      <OnlineDot size={8} decorative />
                    </span>
                    <span className="font-medium">{u.profile?.displayName ?? "Ohne Profil"}</span>
                    <SignupMethodIcon method={u.signupMethod} size={12} />
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-muted">Gerade ist niemand online.</p>
          )}
        </div>
      </section>

      <section aria-labelledby="k2" className="mb-10">
        <SectionTitle n="02" title={<span id="k2">Projekte – der Produktkern</span>} action={<Link href="/admin/inhalte" className="text-xs text-muted hover:text-ink">Inhalte verwalten →</Link>} />
        <KpiGrid className="mt-4">
          <Kpi label="Neue Projekte · 7 T." value={num(k.projects.new7)} delta={delta(k.projects.new7, k.projects.newPrev7)} note="ggü. Vorwoche" chart={spark(k.projects.seriesProjects, "Neue Projekte pro Woche", "bars")} />
          <Kpi label="Abgeschlossene Projekte" value={num(k.projects.completed)} note={`${num(k.projects.completed7)} in den letzten 7 Tagen`} />
          <Kpi label="Mit Materialliste" value={pct(k.projects.shareWithMaterials)} note={`von ${num(k.projects.published)} veröffentlichten Projekten`} />
          <Kpi label="Mit Anleitung" value={pct(k.projects.shareWithTutorial)} note="Projekt ist mit mindestens einer Anleitung verknüpft" />
          <Kpi label="Nachbau-Quote" value={pct(k.projects.remixRate)} note="Anteil der Projekte, die ein anderes nachbauen" />
          <Kpi label="Kommentare pro Projekt" value={dec(k.projects.commentsPerProject)} note="Durchschnitt über veröffentlichte Projekte" />
          <Kpi label="Beiträge · 7 T." value={num(k.community.posts7)} delta={delta(k.community.posts7, k.community.postsPrev7)} note="ggü. Vorwoche" chart={spark(k.community.seriesPosts, "Beiträge pro Woche")} />
        </KpiGrid>
      </section>

      <section aria-labelledby="k3" className="mb-10">
        <SectionTitle n="03" title={<span id="k3">Moderation</span>} action={<Link href="/admin/moderation" className="text-xs text-muted hover:text-ink">Zur Warteschlange →</Link>} />
        <KpiGrid className="mt-4">
          <Kpi label="Offene Fälle" value={num(k.moderation.openCases)} note={k.moderation.appealsOpen ? `${num(k.moderation.appealsOpen)} offene Einsprüche` : "Keine offenen Einsprüche"} />
          <Kpi label="Median Bearbeitungszeit" value={duration(k.moderation.medianHandlingSeconds)} note={`Meldung bis Entscheidung · ${num(k.moderation.resolved30)} Fälle in 30 T.`} />
          <Kpi label="Entschiedene Fälle pro Woche" value={num(k.moderation.seriesCasesResolved.at(-1) ?? 0)} note="aktuelle Woche" chart={spark(k.moderation.seriesCasesResolved, "Entschiedene Fälle pro Woche", "bars")} />
        </KpiGrid>
      </section>

      <section aria-labelledby="k4">
        <SectionTitle n="04" title={<span id="k4">Marktplatz</span>} action={<Link href="/admin/marktplatz" className="text-xs text-muted hover:text-ink">Verkäufer →</Link>} />
        <KpiGrid className="mt-4">
          <Kpi label="Aktive Verkäufer" value={num(k.market.activeSellers)} note={k.market.pendingSellers ? `${num(k.market.pendingSellers)} warten auf Prüfung` : "Keine offenen Prüfungen"} />
          <Kpi label="Aktive Produkte" value={num(k.market.activeProducts)} />
          <Kpi label="Bestellungen · 30 T." value={num(k.market.orders30)} note="bezahlt" chart={spark(k.market.seriesOrders, "Bezahlte Bestellungen pro Woche", "bars")} />
          <Kpi label="Erstattungsquote · 30 T." value={pct(k.market.refundRate)} note="Bestellungen mit Erstattung / bezahlte Bestellungen" />
          {k.money && (
            <>
              <Kpi restricted label="GMV · 30 T." value={formatMoney(k.money.gmv30)} delta={delta(k.money.gmv30, k.money.gmvPrev30)} note="Bruttowarenwert inkl. Versand, ggü. Vorperiode" chart={spark(k.money.seriesGmv.map((v) => Math.round(v / 100)), "GMV pro Woche in CHF")} />
              <Kpi restricted label="Provision · 30 T." value={formatMoney(k.money.commission30)} note="Plattformgebühr auf Warenwert" />
              <Kpi restricted label="Ø Bestellwert" value={k.money.aov != null ? formatMoney(k.money.aov) : "–"} />
            </>
          )}
        </KpiGrid>
        {!isAdmin && <p className="mt-3 text-xs text-muted">Umsatz- und Provisionskennzahlen sind der Administration vorbehalten.</p>}
      </section>
    </div>
  );
}
