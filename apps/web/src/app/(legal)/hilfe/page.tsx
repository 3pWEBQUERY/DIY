import Link from "next/link";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Plus } from "lucide-react";
import { BRAND } from "@/config/brand";
import { formatMoney } from "@werkraum/shared";
import { FeePercent } from "@/components/legal/fee-percent";
import { getSetting } from "@/server/settings";
import { LEGAL } from "@/config/legal";

export const metadata: Metadata = {
  title: "Hilfe",
  description: `Antworten auf häufige Fragen zu Konto, Projekten, Anleitungen, Communities und dem Marktplatz von ${BRAND.name}.`,
  alternates: { canonical: "/hilfe" },
};

type Q = { q: string; a: ReactNode };
type Group = { id: string; title: string; items: Q[] };

// Akkusativ: „3 Tage nach dem Abschluss“
const tage = (n: number) => `${n} ${n === 1 ? "Tag" : "Tage"}`;

function groups(s: { minAge: number; holdDays: number; autoCompleteDays: number; priceMonth: number; priceYear: number }): Group[] {
  return [
    {
      id: "konto",
      title: "Konto & Anmeldung",
      items: [
        { q: "Ab welchem Alter kann ich mitmachen?", a: <>Ab {s.minAge} Jahren. Die Plattform enthält einen Marktplatz und Direktnachrichten und ist deshalb für Erwachsene gedacht.</> },
        { q: "Ich habe mein Passwort vergessen.", a: <>Unter <Link href="/passwort-vergessen">Passwort vergessen</Link> erhältst du einen Link, der 60 Minuten gültig ist. Nach dem Zurücksetzen werden aus Sicherheitsgründen alle Geräte abgemeldet.</> },
        { q: "Wie schütze ich mein Konto zusätzlich?", a: <>Aktiviere unter <Link href="/einstellungen/sicherheit">Einstellungen → Sicherheit</Link> die Zwei-Faktor-Anmeldung mit einer Authenticator-App und bewahre die Wiederherstellungscodes sicher auf. Bei einer Anmeldung von einem neuen Gerät erhältst du eine E-Mail.</> },
        { q: "Kann ich meinen Benutzernamen ändern?", a: <>Ja, unter <Link href="/einstellungen/profil">Einstellungen → Profil</Link>, höchstens dreimal in 30 Tagen. Alte Profillinks leiten automatisch auf den neuen Benutzernamen weiter.</> },
        { q: "Wie sehe ich, wo ich angemeldet bin?", a: <>Unter <Link href="/einstellungen/sicherheit">Einstellungen → Sicherheit</Link> siehst du alle aktiven Geräte und kannst einzelne oder alle anderen abmelden.</> },
        { q: "Wie lösche ich mein Konto?", a: <>Unter <Link href="/einstellungen/konto">Einstellungen → Konto & Daten</Link>. Dort siehst du, was gelöscht wird und was aus gesetzlichen Gründen erhalten bleibt (z. B. Bestellbelege). Hat dein Shop offene Bestellungen, versende oder storniere sie vorher. Lade vor dem Löschen deinen Datenexport herunter.</> },
      ],
    },
    {
      id: "projekte",
      title: "Projekte & Anleitungen",
      items: [
        { q: "Was ist der Unterschied zwischen Beitrag, Projekt und Anleitung?", a: <>Ein <strong>Beitrag</strong> ist ein kurzer Moment – ein Foto, eine Frage, eine Umfrage. Ein <strong>Projekt</strong> begleitet ein Werk von der Idee bis zum Ergebnis, mit Materialliste und Journal. Eine <strong>Anleitung</strong> erklärt Schritt für Schritt, wie andere es nachbauen können.</> },
        { q: "Was ist ein Nachbau?", a: <>Wenn du ein Projekt nach dem Vorbild eines anderen machst, verknüpfst du es als Nachbau. Die ursprüngliche Person sieht, was aus ihrer Idee entstanden ist – und du beschreibst, was du anders gemacht hast.</> },
        { q: "Kann ich Anleitungen verkaufen?", a: <>Ja, als digitales Produkt in deinem Shop – wenn die Anleitung von dir stammt. Mehr in den <Link href="/richtlinien/marktplatz">Marktplatz-Richtlinien</Link>.</> },
        { q: "Was passiert mit meinem Fortschritt, wenn eine Anleitung aktualisiert wird?", a: <>Abgehakte Schritte bleiben erhalten. Bei wichtigen Änderungen benachrichtigen wir dich, damit du nichts verpasst.</> },
        { q: `Wer sieht meine Zahlen im ${BRAND.name} Studio?`, a: <>Nur du. „Aufrufe“ zählen Seitenaufrufe, nicht eindeutige Personen; wiederholte Aufrufe derselben Person innerhalb von 30 Minuten zählen einmal, deine eigenen nie.</> },
      ],
    },
    {
      id: "community",
      title: "Community & Sicherheit",
      items: [
        { q: "Wie melde ich einen Inhalt?", a: <>Über das Menü „…“ bei einem Inhalt, Profil, Produkt oder einer Nachricht → „Melden“. Du erhältst eine Fallnummer und eine Rückmeldung, wenn der Fall abgeschlossen ist. Die gemeldete Person erfährt nicht, wer gemeldet hat. Ohne Konto erreichst du uns über die <Link href="/kontakt">Kontaktseite</Link>.</> },
        { q: "Was ist der Unterschied zwischen Stummschalten und Blockieren?", a: <><strong>Stummschalten</strong> entfernt Inhalte einer Person aus deinem Feed, ohne dass sie es merkt. <strong>Blockieren</strong> trennt euch: keine gegenseitigen Inhalte, kein Folgen, keine Nachrichten. Beides kannst du unter <Link href="/einstellungen/privatsphaere">Privatsphäre</Link> rückgängig machen.</> },
        { q: "Ein Inhalt von mir wurde entfernt. Was kann ich tun?", a: <>In der Benachrichtigung findest du die Begründung und einen Link zum Einspruch. Du hast 14 Tage Zeit; wenn möglich prüft eine andere Person als die, die entschieden hat.</> },
        { q: "Wer darf mir Nachrichten schreiben?", a: <>Das legst du unter <Link href="/einstellungen/privatsphaere">Privatsphäre</Link> fest: alle Mitglieder, nur Personen, denen du folgst, oder niemand (ausser bei Bestellungen). Wir fragen nie per Nachricht nach Passwörtern oder Zahlungen.</> },
        { q: "Sind Nachrichten verschlüsselt?", a: <>Sie werden verschlüsselt übertragen, sind aber nicht Ende-zu-Ende-verschlüsselt. Den Inhalt sieht unser Moderationsteam nur, wenn eine Nachricht gemeldet wird. Teile keine Passwörter oder Bankdaten per Nachricht.</> },
      ],
    },
    {
      id: "kaufen",
      title: "Kaufen",
      items: [
        { q: "Bei wem kaufe ich?", a: <>Beim jeweiligen Shop. {BRAND.name} stellt den Marktplatz bereit und wickelt die Zahlung über Stripe ab; der Kaufvertrag kommt zwischen dir und dem Shop zustande. Auf jeder Shopseite steht, ob privat oder gewerblich verkauft wird.</> },
        { q: "Wie sicher ist die Zahlung?", a: <>Bezahlt wird im Checkout von Stripe. Kartendaten erreichen uns nie. Zahle nie ausserhalb des Checkouts – etwa per Überweisung oder über einen Link aus einer Nachricht. Verdächtige Zahlungsaufforderungen in Nachrichten kennzeichnen wir mit einem Warnhinweis.</> },
        { q: "Kann ich eine Bestellung stornieren?", a: <>Schreib dem Shop über die Bestellung. Vor dem Versand kann der Shop stornieren; der Betrag wird dann vollständig auf dein Zahlungsmittel erstattet.</> },
        { q: "Meine Bestellung ist nicht angekommen oder beschädigt.", a: <>Nutze „Problem melden“ in der <Link href="/bestellungen">Bestellung</Link> und schreib dem Shop. Kommt keine Lösung zustande, kontaktiere uns über <Link href="/einstellungen/hilfe-support">Hilfe & Support</Link> mit deiner Bestellnummer. Bestätige den Erhalt erst, wenn alles in Ordnung ist – ohne Rückmeldung gilt eine versendete Bestellung {tage(s.autoCompleteDays)} nach dem Versand als abgeschlossen.</> },
        { q: "Kann ich ein Produkt zurückgeben?", a: <>Die Rückgaberegeln stehen auf jeder Shop- und Produktseite. Bei gewerblichen Shops gelten zusätzlich deine gesetzlichen Rechte, etwa ein Widerrufsrecht bei Käufen aus der EU. Auftragsarbeiten und personalisierte Stücke sind meist von der Rückgabe ausgeschlossen.</> },
        { q: "Wo finde ich gekaufte Downloads?", a: <>In deiner <Link href="/bestellungen">Bestellung</Link>, sobald die Zahlung bestätigt ist. Die Anzahl der Downloads kann je Produkt begrenzt sein.</> },
      ],
    },
    {
      id: "verkaufen",
      title: "Verkaufen",
      items: [
        { q: "Was kostet das Verkaufen?", a: <>Shop und Angebote sind kostenlos. Bei einem Verkauf fällt eine Provision von derzeit <FeePercent /> auf den Warenwert an (ohne Versand); sonst erhebt {BRAND.name} keine Gebühren. Details und Rechenbeispiel in den <Link href="/richtlinien/marktplatz#gebuehren">Marktplatz-Richtlinien</Link>.</> },
        { q: "Muss ich ein Gewerbe haben?", a: <>Nein. Du kannst privat oder gewerblich verkaufen und gibst das bei der Shop-Eröffnung an. Wer regelmässig mit Gewinnabsicht verkauft, gilt in der Regel als gewerblich – kläre im Zweifel deine Pflichten (z. B. MWST) mit einer Fachperson.</> },
        { q: "Wann wird mein Shop freigeschaltet?", a: <>Sobald du deine E-Mail-Adresse bestätigt, die Shop-Angaben eingereicht und die Verifizierung bei Stripe abgeschlossen hast. Den Stand siehst du im Studio unter Shop; fehlen bei Stripe noch Angaben, siehst du das dort.</> },
        { q: "Wann erhalte ich mein Geld?", a: <>{s.holdDays > 0 ? <>Der Erlös einer Bestellung wird {tage(s.holdDays)} nach ihrem Abschluss auszahlbar – abgeschlossen ist sie mit der Erhaltsbestätigung, spätestens automatisch {tage(s.autoCompleteDays)} nach dem Versand. Digitale Produkte: {tage(s.holdDays)} nach dem Kauf. </> : null}Freigegebenes Guthaben zahlen wir nach deinem Auszahlungsplan oder auf Anfrage auf dein Bankkonto aus. Den Stand siehst du im Studio unter Einnahmen.</> },
        { q: "Was bringt Creator Pro?", a: <>Schaufenster und Pro-Kennzeichen im Profil, Medienkit, Statistiken über 12 Monate, längere Videos und eine tiefere Provision – für {formatMoney(s.priceMonth, "CHF")} pro Monat oder {formatMoney(s.priceYear, "CHF")} pro Jahr. Jederzeit kündbar auf das Ende der Laufzeit unter <Link href="/studio/pro">Studio → Creator Pro</Link>.</> },
      ],
    },
    {
      id: "daten",
      title: "Datenschutz",
      items: [
        { q: "Kann ich meine Daten herunterladen?", a: <>Ja, jederzeit als JSON-Datei unter <Link href="/einstellungen/konto">Konto & Daten</Link>.</> },
        { q: "Werden meine Daten für Werbung genutzt?", a: <>Nein. Wir verkaufen keine Daten und setzen keine Werbe- oder Tracking-Dienste ein. Mehr in der <Link href="/rechtliches/datenschutz">Datenschutzerklärung</Link>.</> },
        { q: "Werden Standortdaten aus meinen Fotos entfernt?", a: <>Ja. Beim Hochladen entfernen wir Metadaten wie EXIF-Angaben und GPS-Koordinaten aus Fotos und Videos automatisch.</> },
      ],
    },
  ];
}

// Provision, Fristen und Preise aus den Systemeinstellungen: regelmässig neu rendern statt beim Build einfrieren
export const revalidate = 300;

export default async function HelpPage() {
  const [minAge, holdDays, autoCompleteDays, priceMonth, priceYear] = await Promise.all([
    getSetting("signup.minAge"),
    getSetting("commerce.payoutHoldDays"),
    getSetting("commerce.autoCompleteDays"),
    getSetting("pro.priceMonthMinor"),
    getSetting("pro.priceYearMinor"),
  ]);
  const GROUPS = groups({ minAge, holdDays, autoCompleteDays, priceMonth, priceYear });
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
            <p className="mt-2 text-[15px] text-ink-2">Schreib uns – ein Mensch liest deine Nachricht und antwortet so rasch wie möglich. Telefonisch erreichst du uns unter <a href={LEGAL.phoneHref} className="text-moss underline underline-offset-2">{LEGAL.phone}</a>.</p>
            <div className="mt-5 flex flex-wrap gap-3">
              <Link href="/kontakt" className="inline-flex h-10 items-center rounded-xl bg-moss px-4 text-sm font-semibold text-paper hover:bg-moss-ink">
                Support kontaktieren
              </Link>
              <a href={`mailto:${BRAND.supportEmail}`} className="inline-flex h-10 items-center border border-line-strong px-4 text-sm font-semibold hover:border-rule-strong rounded-xl">
                {BRAND.supportEmail}
              </a>
            </div>
            <p className="mt-4 text-xs text-muted">Bei akuter Gefahr: Polizei 117 · Sanität 144 · Feuerwehr 118 · Tox Info Suisse 145 · europaweit 112. Inhalte meldest du am schnellsten direkt über „Melden“.</p>
          </section>
        </div>
      </div>
    </div>
  );
}
