import Link from "next/link";
import type { Metadata } from "next";
import { BRAND } from "@/config/brand";
import { LEGAL } from "@/config/legal";

export const metadata: Metadata = {
  title: "Kontakt",
  description: `So erreichst du das ${BRAND.name}-Team – per E-Mail, Telefon, Post oder Support-Formular, mit oder ohne Konto.`,
  alternates: { canonical: "/kontakt" },
};

const mail = (subject: string) => `mailto:${LEGAL.email}?subject=${encodeURIComponent(subject)}`;

type Way = {
  title: string;
  body: string;
  action: { href: string; label: string; external: boolean };
  more?: { href: string; label: string };
};

const WAYS: Way[] = [
  {
    title: "Mit Konto: Support-Formular",
    body: "Angemeldet geht es am schnellsten über das Formular in den Einstellungen. Du wählst ein Thema (z. B. Konto, Bestellung, Verkaufen, Datenschutz) und siehst den Status deiner Anfrage.",
    action: { href: "/einstellungen/hilfe-support", label: "Zum Support-Formular", external: false },
  },
  {
    title: "Ohne Konto: E-Mail",
    body: "Du hast kein Konto oder kommst nicht mehr hinein? Schreib uns eine E-Mail. Beschreibe kurz dein Anliegen und – falls vorhanden – die E-Mail-Adresse deines Kontos. Bei Bestellungen hilft uns die Bestellnummer.",
    action: { href: mail("Anfrage"), label: LEGAL.email, external: true },
  },
  {
    title: "Inhalte melden",
    body: "Verstösse gegen die Richtlinien meldest du am schnellsten direkt beim Inhalt, Profil, Produkt oder bei einer Nachricht über „…“ → „Melden“. Deine Meldung erhält eine Fallnummer; die gemeldete Person erfährt nicht, wer gemeldet hat.",
    action: { href: "/richtlinien/community#melden", label: "So funktioniert Melden", external: false },
  },
  {
    title: "Rechteinhaber:innen & Behörden",
    body: "Urheberrechtsverletzungen und rechtswidrige Inhalte kannst du auch ohne Konto per E-Mail melden. Was die Meldung enthalten sollte, steht unter „Urheberrecht & Meldeverfahren“.",
    action: { href: mail("Urheberrechtsmeldung"), label: "Meldung per E-Mail", external: true },
    more: { href: "/richtlinien/urheberrecht", label: "Meldeverfahren ansehen" },
  },
  {
    title: "Datenschutz & Auskunft",
    body: "Fragen zu deinen Daten, Auskunfts-, Berichtigungs- oder Löschbegehren beantworten wir auch, wenn du kein Konto (mehr) hast. Deine Daten kannst du ausserdem jederzeit selbst unter Konto & Daten herunterladen.",
    action: { href: mail("Datenschutz & Auskunft"), label: "Datenschutz-Anfrage per E-Mail", external: true },
    more: { href: "/rechtliches/datenschutz", label: "Datenschutzerklärung" },
  },
  {
    title: "Telefon",
    body: "Für dringende Anliegen erreichst du uns telefonisch. Ist niemand erreichbar, schreib uns bitte eine E-Mail – so geht nichts verloren.",
    action: { href: LEGAL.phoneHref, label: LEGAL.phone, external: true },
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
          Ein Mensch liest deine Nachricht – kein Bot – und antwortet so rasch wie möglich. Viele Antworten findest du schon in den{" "}
          <Link href="/hilfe" className="text-moss underline underline-offset-2">häufigen Fragen</Link>.
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

      <section aria-labelledby="post-t" className="mt-6 max-w-3xl rounded-2xl border border-line bg-card p-6">
        <h2 id="post-t" className="headline text-xl">Postadresse</h2>
        <address className="mt-2 text-[15px] not-italic leading-relaxed text-ink-2">
          {BRAND.name} · {LEGAL.company}
          <br />
          {LEGAL.street}
          <br />
          {LEGAL.city}
          <br />
          {LEGAL.country}
        </address>
        <p className="mt-3 text-[13.5px] text-muted">
          Weitere Anbieterangaben im <Link href="/rechtliches/impressum" className="text-moss underline underline-offset-2">Impressum</Link>.
        </p>
      </section>

      <p className="mt-6 max-w-3xl text-xs text-muted">
        Bei akuter Gefahr: Polizei 117 · Sanität 144 · Feuerwehr 118 · Tox Info Suisse 145 · europaweit 112. Wir fragen nie per Nachricht oder E-Mail nach deinem Passwort.
      </p>
    </div>
  );
}
