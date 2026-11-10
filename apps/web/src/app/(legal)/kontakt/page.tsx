import Link from "next/link";
import type { Metadata } from "next";
import { BRAND } from "@/config/brand";

export const metadata: Metadata = {
  title: "Kontakt",
  description: `So erreichst du das ${BRAND.name}-Team – mit oder ohne Konto.`,
  alternates: { canonical: "/kontakt" },
};

const mail = (subject: string) => `mailto:${BRAND.supportEmail}?subject=${encodeURIComponent(subject)}`;

const WAYS = [
  {
    title: "Ohne Konto",
    body: "Du hast kein Konto oder kommst nicht mehr hinein? Schreib uns eine E-Mail. Beschreibe kurz dein Anliegen und – falls vorhanden – die E-Mail-Adresse deines Kontos.",
    action: { href: mail("Anfrage"), label: BRAND.supportEmail, external: true },
  },
  {
    title: "Mit Konto",
    body: "Angemeldet geht es am schnellsten über das Formular: Deine Anfrage erhält eine Referenznummer und du siehst ihren Status.",
    action: { href: "/einstellungen/hilfe-support", label: "Zum Support-Formular", external: false },
  },
  {
    title: "Rechteinhaber:innen & Behörden",
    body: "Urheberrechtsverletzungen und rechtswidrige Inhalte kannst du auch ohne Konto melden. Was die Meldung enthalten sollte, steht unter „Urheberrecht & Meldeverfahren“.",
    action: { href: mail("Urheberrechtsmeldung"), label: "Meldung per E-Mail", external: true },
    more: { href: "/richtlinien/urheberrecht", label: "Meldeverfahren ansehen" },
  },
  {
    title: "Datenschutz & Auskunft",
    body: "Fragen zu deinen Daten, Auskunfts- oder Löschbegehren beantworten wir auch, wenn du kein Konto (mehr) hast.",
    action: { href: mail("Datenschutz & Auskunft"), label: "Datenschutz-Anfrage per E-Mail", external: true },
    more: { href: "/rechtliches/datenschutz", label: "Datenschutzerklärung" },
  },
];

/** Öffentliche Kontaktseite – erreichbar ohne Anmeldung (z. B. für Rechteinhaber:innen). */
export default function ContactPage() {
  return (
    <div className="mx-auto max-w-[1120px] px-4 py-10 sm:px-6 md:py-14 lg:px-10">
      <header className="mb-10 max-w-3xl">
        <p className="spec mb-3 flex items-center gap-2">
          <span className="inline-block h-px w-6 bg-rule-strong" />
          Hilfe
        </p>
        <h1 className="display text-[2.6rem] text-balance sm:text-6xl">Kontakt</h1>
        <p className="mt-5 text-[17px] leading-relaxed text-ink-2 text-pretty">
          Menschen lesen deine Nachricht – kein Bot. Wir antworten in der Regel innerhalb von zwei Werktagen. Viele Antworten findest du schon in den <Link href="/hilfe" className="text-moss underline underline-offset-2">häufigen Fragen</Link>.
        </p>
      </header>

      <ul className="grid gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-2">
        {WAYS.map((w) => (
          <li key={w.title} className="flex flex-col bg-card p-6">
            <h2 className="headline text-xl">{w.title}</h2>
            <p className="mt-2 flex-1 text-[15px] leading-relaxed text-ink-2">{w.body}</p>
            <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2">
              {w.action.external ? (
                <a href={w.action.href} className="inline-flex h-10 items-center rounded-xl border border-line-strong px-4 text-sm font-semibold hover:border-rule-strong">
                  {w.action.label}
                </a>
              ) : (
                <Link href={w.action.href} className="inline-flex h-10 items-center rounded-xl bg-moss px-4 text-sm font-semibold text-paper hover:bg-moss-ink">
                  {w.action.label}
                </Link>
              )}
              {w.more && (
                <Link href={w.more.href} className="text-sm font-semibold text-moss underline-offset-2 hover:underline">
                  {w.more.label}
                </Link>
              )}
            </div>
          </li>
        ))}
      </ul>

      <p className="mt-6 max-w-3xl text-xs text-muted">
        Inhalte meldest du am schnellsten direkt über „Melden“ beim Inhalt. Bei akuter Gefahr: Polizei 117 · Sanität 144 · Tox Info Suisse 145.
      </p>
    </div>
  );
}
