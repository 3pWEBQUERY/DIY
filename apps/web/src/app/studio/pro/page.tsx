import Link from "next/link";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { BarChart3, FileText, Film, LayoutTemplate, Percent, ShieldCheck } from "lucide-react";
import { formatMoney } from "@werkraum/shared";
import { currentUser } from "@/server/auth/session";
import { db } from "@/server/db";
import { getSetting } from "@/server/settings";
import { flagEnabled } from "@/server/flags";
import { formatBps } from "@/server/commerce/rules";
import { confirmProCheckout, getProStatus, listProInvoices, proPrices, PRO_NAME } from "@/server/pro/service";
import { FEATURED_MAX } from "@/server/pro/profile";
import { paymentsMode } from "@/server/commerce/stripe";
import { FeaturedPicker, ManageSubscription, MediaKitToggle, PricingCard } from "@/components/pro/pro-controls";
import { ProMark } from "@/components/pro/pro-mark";
import { Notice, SectionTitle } from "@/components/ui/misc";
import { formatDate } from "@/lib/utils";
import { BRAND } from "@/config/brand";

export const metadata: Metadata = { title: "Creator Pro" };
export const dynamic = "force-dynamic";

const minutes = (sec: number) => (sec >= 60 ? `${Math.round(sec / 60)} Min.` : `${sec} Sek.`);

/** Creator Pro (§22.3): abschliessen, verwalten und die Pro-Werkzeuge an einem Ort. */
export default async function ProPage({ searchParams }: { searchParams: Promise<{ abo?: string; session_id?: string }> }) {
  const [user, sp] = await Promise.all([currentUser(), searchParams]);
  if (!user?.profile) redirect("/anmelden?weiter=/studio/pro");
  if (sp.abo === "erfolg" && sp.session_id) await confirmProCheckout(user.id, sp.session_id);

  const [status, prices, enabled, fee, proFee, sec, proSec, mb, proMb] = await Promise.all([
    getProStatus(user.id),
    proPrices(),
    flagEnabled("pro", user.id),
    getSetting("commerce.feeBps"),
    getSetting("pro.feeBps"),
    getSetting("media.maxVideoSeconds"),
    getSetting("pro.maxVideoSeconds"),
    getSetting("media.maxVideoMb"),
    getSetting("pro.maxVideoMb"),
  ]);
  const handle = user.profile.handle;

  const benefits = [
    { icon: LayoutTemplate, title: "Profil mit Schaufenster", text: `Bis zu ${FEATURED_MAX} Projekte ganz oben in deinem Profil hervorheben – und das Pro-Kennzeichen neben deinem Namen.` },
    { icon: FileText, title: "Medienkit für Kooperationen", text: "Eine Seite mit deinen besten Arbeiten und echten, erklärten Zahlen. Teilbar per Link, druckbar als PDF." },
    { icon: BarChart3, title: "Statistik über 12 Monate", text: "Verläufe über ein ganzes Jahr statt 12 Wochen – und alle Zahlen als CSV für Excel oder Numbers." },
    { icon: Film, title: "Längere Videos", text: `Videos bis ${minutes(Math.max(sec, proSec))} und ${Math.max(mb, proMb)} MB statt ${minutes(sec)} und ${mb} MB.` },
    { icon: Percent, title: "Tiefere Provision im Shop", text: `${formatBps(Math.min(fee, proFee))} statt ${formatBps(fee)} auf den Warenwert jedes Verkaufs.` },
  ];

  const fair = (
    <div className="flex gap-3 rounded-2xl bg-sunken p-4 text-[13.5px] leading-relaxed text-ink-2">
      <ShieldCheck size={18} className="mt-0.5 shrink-0 text-moss" aria-hidden />
      <p>
        <span className="font-semibold text-ink">Fair für alle:</span> Projekte, Anleitungen, Communities und der Shop bleiben kostenlos. Pro kauft keine Reichweite – bezahlte Profile werden im Feed nicht bevorzugt.
      </p>
    </div>
  );

  const header = (
    <header className="mb-10">
      <p className="spec mb-3 flex items-center gap-2">
        <span className="inline-block h-px w-6 bg-rule-strong" />
        {BRAND.name} Studio
      </p>
      <h1 className="display flex flex-wrap items-center gap-3 text-[2.4rem] sm:text-5xl">
        {PRO_NAME}
        {status.active && <ProMark size="md" label="Aktiv" />}
      </h1>
      <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-muted">Werkzeuge für Menschen, die mit ihren Projekten wachsen wollen – Schaufenster, Medienkit, Jahresstatistik, längere Videos und eine tiefere Shop-Provision.</p>
    </header>
  );

  if (!status.active) {
    return (
      <div className="max-w-[1100px]">
        {header}
        {sp.abo === "abgebrochen" && (
          <Notice className="mb-8" title="Abschluss abgebrochen">
            Es wurde nichts abgebucht. Du kannst Creator Pro jederzeit später starten.
          </Notice>
        )}
        {sp.abo === "erfolg" && (
          <Notice tone="moss" className="mb-8" title="Zahlung eingegangen">
            Dein Abo wird gerade aktiviert – das dauert meist nur ein paar Sekunden. Lade die Seite gleich neu.
          </Notice>
        )}
        <div className="grid gap-10 lg:grid-cols-[1fr_380px] lg:items-start">
          <div>
            <ul className="divide-y divide-line border-y border-line">
              {benefits.map((b) => (
                <li key={b.title} className="flex gap-4 py-5">
                  <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-moss-soft text-moss">
                    <b.icon size={19} strokeWidth={1.8} aria-hidden />
                  </span>
                  <span>
                    <span className="block text-[15px] font-semibold">{b.title}</span>
                    <span className="mt-0.5 block text-[14px] leading-relaxed text-muted">{b.text}</span>
                  </span>
                </li>
              ))}
            </ul>
            <div className="mt-6">{fair}</div>
          </div>
          <div className="lg:sticky lg:top-24">
            <PricingCard prices={prices} enabled={enabled && paymentsMode() !== "disabled"} />
            {paymentsMode() === "simulated" && <p className="mt-3 text-center text-[12px] text-muted">Testmodus: Es wird nichts abgebucht.</p>}
          </div>
        </div>
      </div>
    );
  }

  const [profile, ownProjects, invoices] = await Promise.all([
    db.userProfile.findUnique({ where: { userId: user.id }, select: { featuredProjectIds: true, mediaKitPublic: true } }),
    db.project.findMany({ where: { ownerId: user.id, state: "PUBLISHED", visibility: "PUBLIC" }, orderBy: [{ viewCount: "desc" }], take: 24, select: { id: true, title: true, coverUrl: true } }),
    listProInvoices(user.id),
  ]);
  const end = status.periodEnd ? formatDate(status.periodEnd, { day: "numeric", month: "long", year: "numeric" }) : null;
  const plan =
    status.provider === "comp"
      ? `Geschenkt von ${BRAND.name}${end ? ` · gültig bis ${end}` : " · unbefristet"}`
      : `${status.interval === "year" ? "Jährlich" : "Monatlich"}${status.priceMinor ? ` · ${formatMoney(status.priceMinor, "CHF")}` : ""}${end ? (status.cancelAtPeriodEnd ? ` · gekündigt, aktiv bis ${end}` : ` · nächste Abrechnung am ${end}`) : ""}`;

  return (
    <div className="max-w-[1000px]">
      {header}
      {sp.abo === "erfolg" && (
        <Notice tone="moss" className="mb-8" title="Willkommen bei Creator Pro!">
          Deine Pro-Werkzeuge sind freigeschaltet. Leg gleich los: Wähle deine Schaufenster-Projekte und gib dein Medienkit frei.
        </Notice>
      )}
      {status.pastDue && (
        <Notice tone="warn" className="mb-8" title="Zahlung fehlgeschlagen">
          Die letzte Zahlung konnte nicht eingezogen werden. Bitte aktualisiere dein Zahlungsmittel – Pro bleibt solange aktiv.
        </Notice>
      )}

      <section className="mb-12 rounded-3xl border border-line bg-card p-6 sm:p-7" aria-label="Dein Abo">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div>
            <p className="text-[13px] font-medium text-muted">Dein Abo</p>
            <p className="mt-1 text-[17px] font-semibold">{plan}</p>
            {status.provider === "simulated" && <p className="mt-1 text-[12.5px] text-muted">Testmodus – es wird nichts abgebucht.</p>}
          </div>
          <ManageSubscription provider={status.provider} cancelAtPeriodEnd={status.cancelAtPeriodEnd} periodEndLabel={end} />
        </div>
        {invoices.length > 0 && (
          <ul className="mt-6 divide-y divide-line border-t border-line text-[13.5px]">
            {invoices.map((i) => (
              <li key={i.id} className="flex items-center justify-between gap-3 py-2.5">
                <span className="text-muted">{formatDate(i.date, { day: "numeric", month: "short", year: "numeric" })}</span>
                <span className="num font-medium">{formatMoney(i.amountMinor, "CHF")}</span>
                <span className="text-muted">{i.status === "paid" ? "Bezahlt" : i.status === "open" ? "Offen" : i.status}</span>
                {i.url ? (
                  <a href={i.url} target="_blank" rel="noopener noreferrer" className="font-semibold text-moss hover:underline">
                    Beleg
                  </a>
                ) : (
                  <span />
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="pro1" className="mb-12">
        <SectionTitle n="01" title={<span id="pro1">Schaufenster im Profil</span>} />
        <p className="mb-4 mt-3 max-w-2xl text-[14px] text-muted">Wähle bis zu {FEATURED_MAX} Projekte, die ganz oben in deinem Profil erscheinen – deine besten Arbeiten zuerst.</p>
        <FeaturedPicker projects={ownProjects} initial={profile?.featuredProjectIds ?? []} max={FEATURED_MAX} />
      </section>

      <section aria-labelledby="pro2" className="mb-12">
        <SectionTitle n="02" title={<span id="pro2">Medienkit</span>} />
        <p className="mb-4 mt-3 max-w-2xl text-[14px] text-muted">Deine besten Arbeiten und echte Zahlen auf einer Seite – ideal für Anfragen von Marken, Läden oder Workshops. Teilbar per Link, druckbar als PDF.</p>
        <MediaKitToggle initial={!!profile?.mediaKitPublic} href={`/u/${handle}/medienkit`} />
      </section>

      <section aria-labelledby="pro3" className="mb-12">
        <SectionTitle n="03" title={<span id="pro3">Alles, was Pro freischaltet</span>} />
        <ul className="mt-2 grid gap-x-8 sm:grid-cols-2">
          {benefits.map((b) => (
            <li key={b.title} className="flex gap-3 border-b border-line py-4">
              <b.icon size={18} strokeWidth={1.8} className="mt-0.5 shrink-0 text-moss" aria-hidden />
              <span>
                <span className="block text-[14px] font-semibold">{b.title}</span>
                <span className="block text-[13px] leading-relaxed text-muted">{b.text}</span>
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-4 text-[13.5px]">
          <Link href="/studio/statistiken?zeitraum=jahr" className="font-semibold text-moss hover:underline">
            Zur Jahresstatistik →
          </Link>
        </p>
        <div className="mt-6">{fair}</div>
      </section>
    </div>
  );
}
