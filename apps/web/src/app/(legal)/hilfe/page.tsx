import Link from "next/link";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Plus } from "lucide-react";
import { BRAND } from "@/config/brand";
import { FeePercent } from "@/components/legal/fee-percent";

export const metadata: Metadata = {
  title: "Hilfe",
  description: `Antworten auf häufige Fragen zu Konto, Projekten, Anleitungen, Communities und dem Marktplatz von ${BRAND.name}.`,
  alternates: { canonical: "/hilfe" },
};

type Q = { q: string; a: ReactNode };

const GROUPS: { id: string; title: string; items: Q[] }[] = [
  {
    id: "konto",
    title: "Konto & Anmeldung",
    items: [
      { q: "Ab welchem Alter kann ich mitmachen?", a: <>Ab 18 Jahren. Die Plattform enthält Marktplatz und Direktnachrichten und ist deshalb für Erwachsene konzipiert.</> },
      { q: "Ich habe mein Passwort vergessen.", a: <>Unter <Link href="/passwort-vergessen">Passwort vergessen</Link> erhältst du einen Link, der 60 Minuten gültig ist. Danach werden aus Sicherheitsgründen alle Geräte abgemeldet.</> },
      { q: "Kann ich meinen Benutzernamen ändern?", a: <>Ja, unter <Link href="/einstellungen/profil">Einstellungen → Profil</Link>, höchstens dreimal in 30 Tagen. Alte Profillinks leiten automatisch auf den neuen Benutzernamen weiter.</> },
      { q: "Wie sehe ich, wo ich angemeldet bin?", a: <>Unter <Link href="/einstellungen/sicherheit">Einstellungen → Sicherheit</Link> siehst du alle aktiven Geräte und kannst einzelne oder alle anderen abmelden.</> },
      { q: "Wie lösche ich mein Konto?", a: <>Unter <Link href="/einstellungen/konto">Einstellungen → Konto & Daten</Link>. Dort siehst du genau, was gelöscht wird und was aus gesetzlichen Gründen erhalten bleibt (z. B. Bestellbelege). Lade vorher deinen Datenexport herunter.</> },
    ],
  },
  {
    id: "projekte",
    title: "Projekte & Anleitungen",
    items: [
      { q: "Was ist der Unterschied zwischen Beitrag, Projekt und Anleitung?", a: <>Ein <strong>Beitrag</strong> ist ein kurzer Moment – ein Foto, eine Frage. Ein <strong>Projekt</strong> begleitet ein Werk von der Idee bis zum Ergebnis, mit Materialliste und Journal. Eine <strong>Anleitung</strong> erklärt Schritt für Schritt, wie andere es nachbauen können. Alles bleibt über den Projektfaden verbunden.</> },
      { q: "Was ist ein Nachbau?", a: <>Wenn du ein Projekt nach dem Vorbild eines anderen machst, verknüpfst du es als Nachbau. Die ursprüngliche Person sieht, was aus ihrer Idee entstanden ist – und du beschreibst, was du anders gemacht hast.</> },
      { q: "Kann ich Anleitungen verkaufen?", a: <>Ja, als digitales Produkt in deinem Shop – wenn die Anleitung von dir stammt. Mehr in den <Link href="/richtlinien/marktplatz">Marktplatz-Richtlinien</Link>.</> },
      { q: "Was passiert mit meinem Fortschritt, wenn eine Anleitung aktualisiert wird?", a: <>Abgehakte Schritte bleiben erhalten. Bei wichtigen Änderungen benachrichtigen wir dich, damit du nichts verpasst.</> },
      { q: "Wer sieht meine Zahlen im Werkuno Studio?", a: <>Nur du. „Aufrufe“ zählen Seitenaufrufe, nicht eindeutige Personen; wiederholte Aufrufe innerhalb von 30 Minuten zählen einmal, deine eigenen nie.</> },
    ],
  },
  {
    id: "community",
    title: "Community & Sicherheit",
    items: [
      { q: "Wie melde ich einen Inhalt?", a: <>Über das Menü „…“ bei jedem Inhalt, Profil oder jeder Nachricht → „Melden“. Du erhältst eine Fallnummer und eine Rückmeldung, wenn der Fall abgeschlossen ist. Die gemeldete Person erfährt nicht, wer gemeldet hat.</> },
      { q: "Was ist der Unterschied zwischen Stummschalten und Blockieren?", a: <><strong>Stummschalten</strong> entfernt Inhalte einer Person aus deinem Feed, ohne dass sie es merkt. <strong>Blockieren</strong> trennt euch vollständig: keine gegenseitigen Inhalte, kein Folgen, keine Nachrichten. Beides kannst du in den Einstellungen rückgängig machen.</> },
      { q: "Ein Inhalt von mir wurde entfernt. Was kann ich tun?", a: <>In der Benachrichtigung findest du die Begründung und einen Link zum Einspruch. Du hast 14 Tage Zeit; eine andere Person aus dem Team prüft ihn.</> },
      { q: "Wer darf mir Nachrichten schreiben?", a: <>Das legst du unter <Link href="/einstellungen/privatsphaere">Privatsphäre</Link> fest: alle, nur Personen, denen du folgst, oder niemand. Wir fragen nie per Nachricht nach Passwörtern oder Zahlungen.</> },
    ],
  },
  {
    id: "kaufen",
    title: "Kaufen",
    items: [
      { q: "Wie sicher ist die Zahlung?", a: <>Bezahlt wird im Checkout über unseren Zahlungsdienstleister. Kartendaten erreichen uns nie. Zahle nie ausserhalb des Checkouts – etwa per Überweisung oder Link aus einer Nachricht.</> },
      { q: "Meine Bestellung ist nicht angekommen.", a: <>Schreib dem Shop über die Bestellnachrichten. Kommt keine Lösung zustande, kontaktiere uns über <Link href="/einstellungen/hilfe-support">Hilfe & Support</Link> mit deiner Bestellnummer.</> },
      { q: "Kann ich ein Produkt zurückgeben?", a: <>Die Rückgaberegeln stehen auf jeder Produktseite. Bei gewerblichen Shops gelten zusätzlich deine gesetzlichen Rechte. Auftragsarbeiten und personalisierte Stücke sind meist von der Rückgabe ausgeschlossen.</> },
    ],
  },
  {
    id: "verkaufen",
    title: "Verkaufen",
    items: [
      { q: "Was kostet das Verkaufen?", a: <>Shop und Angebote sind kostenlos. Bei einem Verkauf fällt eine transparente Provision von derzeit <FeePercent /> auf den Warenwert an (ohne Versand), dazu die Gebühren des Zahlungsdienstleisters. Details und Rechenbeispiel in den <Link href="/richtlinien/marktplatz#gebuehren">Marktplatz-Richtlinien</Link>.</> },
      { q: "Muss ich ein Gewerbe haben?", a: <>Nein. Du kannst privat oder gewerblich verkaufen und gibst das bei der Shop-Eröffnung an. Wer regelmässig mit Gewinnabsicht verkauft, gilt in der Regel als gewerblich – kläre im Zweifel deine Pflichten (z. B. MWST) mit einer Fachperson.</> },
      { q: "Wann erhalte ich mein Geld?", a: <>Nach erfolgreicher Verifizierung zahlt der Zahlungsdienstleister gemäss Auszahlungsplan auf dein Konto aus. Den Stand siehst du im Studio unter Einnahmen & Auszahlungen.</> },
      { q: "Warum wurde mein Shop noch nicht freigegeben?", a: <>Neue Shops prüfen wir manuell, damit der Marktplatz für echtes Handgemachtes bleibt. Das dauert in der Regel ein bis zwei Werktage.</> },
    ],
  },
  {
    id: "daten",
    title: "Datenschutz",
    items: [
      { q: "Kann ich meine Daten herunterladen?", a: <>Ja, jederzeit als JSON-Datei unter <Link href="/einstellungen/konto">Konto & Daten</Link>.</> },
      { q: "Werden meine Daten für Werbung genutzt?", a: <>Nein. Wir verkaufen keine Daten und setzen keine Werbe-Tracker ein. Mehr in der <Link href="/rechtliches/datenschutz">Datenschutzerklärung</Link>.</> },
      { q: "Werden Standortdaten aus meinen Fotos entfernt?", a: <>Ja. Beim Hochladen entfernen wir EXIF-Daten wie GPS-Koordinaten automatisch.</> },
    ],
  },
];


// Provision aus den Systemeinstellungen: regelmässig neu rendern statt beim Build einfrieren
export const revalidate = 300;

export default function HelpPage() {
  return (
    <div className="mx-auto max-w-[1120px] px-4 py-10 sm:px-6 md:py-14 lg:px-10">
      <header className="mb-12 max-w-3xl">
        <p className="spec mb-3 flex items-center gap-2">
          <span className="inline-block h-px w-6 bg-rule-strong" />
          Hilfe
        </p>
        <h1 className="display text-[2.6rem] sm:text-6xl">Wie können wir helfen?</h1>
        <p className="mt-5 text-[17px] leading-relaxed text-ink-2">Die häufigsten Fragen, kurz beantwortet. Findest du nichts Passendes, schreib uns – Menschen lesen jede Nachricht.</p>
      </header>

      <div className="grid gap-12 lg:grid-cols-[220px_minmax(0,1fr)]">
        <nav aria-label="Themen" className="h-fit lg:sticky lg:top-8">
          <p className="spec mb-3 text-ink">Themen</p>
          <ol className="space-y-1.5 border-l border-line text-[13.5px]">
            {GROUPS.map((g, i) => (
              <li key={g.id}>
                <a href={`#${g.id}`} className="-ml-px flex gap-2.5 border-l border-transparent pl-3 text-muted hover:border-rule-strong hover:text-ink">
                  <span className="font-mono text-[10px] leading-5">{String(i + 1).padStart(2, "0")}</span>
                  {g.title}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        <div className="max-w-[46rem]">
          {GROUPS.map((g, i) => (
            <section key={g.id} id={g.id} aria-labelledby={`${g.id}-t`} className="mb-12 scroll-mt-8">
              <h2 id={`${g.id}-t`} className="flex items-baseline gap-3 border-b border-rule pb-2.5 text-[17px] font-bold tracking-tight">
                <span className="spec text-ink">{String(i + 1).padStart(2, "0")}</span>
                {g.title}
              </h2>
              <div className="divide-y divide-line border-b border-line">
                {g.items.map((item) => (
                  <details key={item.q} className="group">
                    <summary className="flex cursor-pointer list-none items-start justify-between gap-4 py-4 text-[15.5px] font-semibold text-ink marker:hidden hover:text-moss-ink [&::-webkit-details-marker]:hidden">
                      {item.q}
                      <Plus size={16} aria-hidden className="mt-1 shrink-0 text-muted transition-transform group-open:rotate-45" />
                    </summary>
                    <div className="pb-5 pr-8 text-[15px] leading-relaxed text-ink-2 [&_a]:text-moss [&_a]:underline [&_a]:underline-offset-2 [&_strong]:text-ink">{item.a}</div>
                  </details>
                ))}
              </div>
            </section>
          ))}

          <section aria-labelledby="kontakt-t" className="crop border border-line bg-card p-6 sm:p-8 rounded-2xl">
            <h2 id="kontakt-t" className="headline text-2xl">Noch Fragen?</h2>
            <p className="mt-2 text-[15px] text-ink-2">Wir antworten in der Regel innerhalb von zwei Werktagen.</p>
            <div className="mt-5 flex flex-wrap gap-3">
              <Link href="/einstellungen/hilfe-support" className="inline-flex h-10 items-center rounded-xl bg-moss px-4 text-sm font-semibold text-paper hover:bg-moss-ink">
                Support kontaktieren
              </Link>
              <a href={`mailto:${BRAND.supportEmail}`} className="inline-flex h-10 items-center border border-line-strong px-4 text-sm font-semibold hover:border-rule-strong rounded-xl">
                {BRAND.supportEmail}
              </a>
            </div>
            <p className="mt-4 text-xs text-muted">Bei akuter Gefahr: Polizei 117 · Sanität 144 · Tox Info Suisse 145. Inhalte meldest du am schnellsten direkt über „Melden“.</p>
          </section>
        </div>
      </div>
    </div>
  );
}
