import Link from "next/link";
import type { Metadata } from "next";
import { LegalDoc, FactList } from "@/components/legal/legal-doc";
import { BRAND } from "@/config/brand";

export const metadata: Metadata = { title: "Datenschutzerklärung", alternates: { canonical: "/rechtliches/datenschutz" } };

export default function PrivacyPage() {
  return (
    <LegalDoc
      kicker="Rechtliches"
      title="Datenschutzerklärung"
      updated="3. November 2026"
      intro={
        <>
          Wir behandeln deine Daten so, wie wir mit einem gut gepflegten Werkzeug umgehen: sorgfältig, sparsam und nur für den Zweck, für den es gedacht ist. Diese Erklärung richtet sich nach dem Schweizer
          Datenschutzgesetz (revDSG) und – soweit anwendbar, etwa für Mitglieder in der EU – nach der Datenschutz-Grundverordnung (DSGVO).
        </>
      }
      sections={[
        {
          id: "verantwortlich",
          title: "Verantwortliche Stelle",
          body: (
            <>
              <FactList
                items={[
                  ["Verantwortlich", `${BRAND.name} (Arbeitstitel), [Firma], [Adresse], Schweiz`],
                  ["Datenschutzkontakt", <a key="m" href={`mailto:${BRAND.supportEmail}`}>{BRAND.supportEmail}</a>],
                  ["EU-Vertretung (Art. 27 DSGVO)", "[Name, Adresse in der EU – vor Launch benennen]"],
                ]}
              />
              <p>Bei Fragen zum Datenschutz kannst du uns jederzeit schreiben – auch über <Link href="/einstellungen/hilfe-support">Hilfe & Support</Link> mit dem Thema „Datenschutz & Auskunft“.</p>
            </>
          ),
        },
        {
          id: "daten",
          title: "Welche Daten wir bearbeiten",
          body: (
            <>
              <h3>Konto</h3>
              <ul>
                <li>E-Mail-Adresse, Passwort (nur als sicherer Hash), Bestätigung der Volljährigkeit und der Nutzungsbedingungen</li>
                <li>Bei „Mit Apple anmelden“: eine pseudonyme Kennung von Apple, ggf. eine weitergeleitete E-Mail-Adresse</li>
              </ul>
              <h3>Profil & Inhalte</h3>
              <ul>
                <li>Anzeigename, Handle, Bio, Region, Profilbild, Links und kreative Schwerpunkte – so, wie du sie angibst</li>
                <li>Beiträge, Projekte, Journal, Anleitungen, Artikel, Kommentare, Bewertungen, Medien</li>
                <li>Interaktionen wie Gefällt-mir, Merken, Folgen, Mitgliedschaften in Communities</li>
              </ul>
              <h3>Nachrichten</h3>
              <ul>
                <li>Direktnachrichten zwischen Mitgliedern. Sie sind transportverschlüsselt, aber nicht Ende-zu-Ende-verschlüsselt. Wir sehen sie nur, wenn eine Nachricht gemeldet wird oder es zur Abwehr von Betrug zwingend nötig ist.</li>
              </ul>
              <h3>Marktplatz</h3>
              <ul>
                <li>Bestellungen, Lieferadresse, Bestellstatus, Bewertungen</li>
                <li>Zahlungen wickelt unser Zahlungsdienstleister ab. Kartendaten erreichen unsere Server nie.</li>
                <li>Für Verkäufer: Angaben zur Verifizierung (Name, ggf. Firma, Adresse, UID/MWST) und Auszahlungsstatus</li>
              </ul>
              <h3>Technische Daten</h3>
              <ul>
                <li>Sitzungsdaten (Gerätebezeichnung wie „Safari auf macOS“, Zeitpunkt der letzten Nutzung, ein gekürzter Hash der IP-Adresse) – zur Sicherheit deines Kontos</li>
                <li>Pseudonyme Nutzungsereignisse (z.B. „Projekt veröffentlicht“, Seitenaufrufe) ohne Klartext-Personendaten – für Statistiken im Creator Studio und zur Verbesserung der Plattform</li>
              </ul>
            </>
          ),
        },
        {
          id: "zwecke",
          title: "Zwecke und Rechtsgrundlagen",
          body: (
            <>
              <ul>
                <li><strong>Bereitstellung der Plattform</strong> – Konto, Profil, Veröffentlichen, Interagieren, Nachrichten (Vertragserfüllung; Art. 6 Abs. 1 lit. b DSGVO)</li>
                <li><strong>Marktplatz</strong> – Abwicklung von Bestellungen, Zahlungen, Auszahlungen und Gewährleistung (Vertragserfüllung; rechtliche Pflichten nach lit. c)</li>
                <li><strong>Sicherheit & Moderation</strong> – Schutz vor Missbrauch, Betrug und Spam, Bearbeitung von Meldungen und Einsprüchen (berechtigtes Interesse; lit. f)</li>
                <li><strong>Benachrichtigungen</strong> – In-App und per E-Mail nach deinen Einstellungen (Vertragserfüllung bzw. Einwilligung)</li>
                <li><strong>Statistik & Verbesserung</strong> – aggregierte, pseudonyme Auswertungen (berechtigtes Interesse)</li>
              </ul>
              <p>Nach Schweizer Recht bearbeiten wir Personendaten nach den Grundsätzen von Art. 6 revDSG: rechtmässig, nach Treu und Glauben, verhältnismässig und zweckgebunden.</p>
              <p>Wir verkaufen keine Personendaten und nutzen sie nicht für personalisierte Werbung Dritter.</p>
            </>
          ),
        },
        {
          id: "feed",
          title: "Feed und Empfehlungen",
          body: (
            <p>
              Der Feed „Für dich“ ordnet Inhalte nach Aktualität, deinen gewählten Interessen, der Qualität eines Inhalts und Vielfalt. Er beruht nicht auf sensiblen Daten und nicht auf einem Profil ausserhalb der Plattform. Der Feed „Folge
              ich“ ist rein chronologisch. Deine Interessen änderst du jederzeit unter <Link href="/einstellungen/feed">Feed & Interessen</Link>.
            </p>
          ),
        },
        {
          id: "empfaenger",
          title: "Empfänger und Auftragsbearbeiter",
          body: (
            <>
              <p>Wir setzen sorgfältig ausgewählte Dienstleister ein, die Daten nur nach unseren Weisungen bearbeiten:</p>
              <ul>
                <li>Hosting, Datenbank und Speicher: [Anbieter, Region – z.B. Railway, EU/US]</li>
                <li>Zahlungsabwicklung und Verkäufer-Verifizierung: [Stripe Payments Europe Ltd., Irland]</li>
                <li>E-Mail-Versand: [Anbieter]</li>
                <li>Anmeldung mit Apple: Apple Distribution International Ltd., Irland (nur wenn du diese Option nutzt)</li>
              </ul>
              <p>
                Bei einer Bekanntgabe ins Ausland stellen wir einen angemessenen Schutz sicher – durch Länder mit Angemessenheitsentscheid (Anhang 1 DSV bzw. Art. 45 DSGVO) oder durch Standardvertragsklauseln mit den nötigen
                Anpassungen für die Schweiz.
              </p>
              <p>Öffentliche Inhalte (Profil, öffentliche Projekte, Beiträge) sind für alle sichtbar und können von Suchmaschinen erfasst werden. Bei einer Bestellung erhält der Shop die zur Lieferung nötigen Angaben.</p>
            </>
          ),
        },
        {
          id: "speicherdauer",
          title: "Speicherdauer",
          body: (
            <ul>
              <li>Konto- und Profildaten: solange dein Konto besteht</li>
              <li>Gelöschte Inhalte: werden sofort unsichtbar und spätestens nach 30 Tagen aus Sicherungen entfernt [Frist prüfen]</li>
              <li>Bestellungen und Buchhaltungsbelege: 10 Jahre (Art. 958f OR), danach gelöscht</li>
              <li>Sitzungen: bis zur Abmeldung bzw. 30 Tage ohne Aktivität</li>
              <li>Moderationsfälle und Audit-Protokoll: so lange, wie es zur Nachvollziehbarkeit und Abwehr von Ansprüchen nötig ist, in pseudonymisierter Form</li>
            </ul>
          ),
        },
        {
          id: "rechte",
          title: "Deine Rechte",
          body: (
            <>
              <p>Du hast das Recht auf Auskunft, Berichtigung, Löschung, Einschränkung der Bearbeitung, Widerspruch und Datenübertragbarkeit sowie das Recht, eine Einwilligung jederzeit zu widerrufen.</p>
              <ul>
                <li><strong>Datenexport:</strong> unter <Link href="/einstellungen/konto">Konto & Daten</Link> kannst du alle deine Daten als JSON-Datei herunterladen.</li>
                <li><strong>Konto löschen:</strong> ebenfalls unter Konto & Daten – mit klarer Übersicht, was gelöscht wird und was aus gesetzlichen Gründen erhalten bleibt.</li>
                <li><strong>Benachrichtigungen:</strong> je Ereignis und Kanal unter <Link href="/einstellungen/benachrichtigungen">Benachrichtigungen</Link>.</li>
              </ul>
              <p>
                Du kannst dich beim Eidgenössischen Datenschutz- und Öffentlichkeitsbeauftragten (EDÖB) beschweren; in der EU bei der Aufsichtsbehörde deines Wohnsitzlandes.
              </p>
            </>
          ),
        },
        {
          id: "sicherheit",
          title: "Datensicherheit",
          body: (
            <ul>
              <li>Passwörter werden mit scrypt gehasht, Sitzungen nur als Hash gespeichert und können jederzeit widerrufen werden.</li>
              <li>Standortdaten (EXIF) werden beim Hochladen aus Fotos entfernt.</li>
              <li>Private Dateien (z.B. gekaufte digitale Anleitungen) sind nur über kurzlebige, signierte Links abrufbar.</li>
              <li>Kritische Admin- und Moderationsaktionen werden in einem manipulationssicheren Protokoll festgehalten.</li>
            </ul>
          ),
        },
        {
          id: "cookies",
          title: "Cookies",
          body: (
            <p>
              Wir verwenden nur technisch notwendige Cookies – insbesondere ein Sitzungs-Cookie, damit du angemeldet bleibst. Es gibt keine Werbe- oder Tracking-Cookies von Dritten. Aufrufzahlen erfassen wir serverseitig und
              pseudonym, ohne Cookies.
            </p>
          ),
        },
        {
          id: "alter",
          title: "Mindestalter",
          body: <p>{BRAND.name} richtet sich an Erwachsene ab 18 Jahren. Wir bearbeiten wissentlich keine Daten von Kindern. Fotos von Kindern in Projekten teilst du nur mit Einwilligung der Sorgeberechtigten und ohne erkennbare Gesichter.</p>,
        },
        {
          id: "aenderungen",
          title: "Änderungen",
          body: <p>Wir passen diese Erklärung an, wenn sich die Plattform oder das Recht ändert. Über wesentliche Änderungen informieren wir dich vorab in der App bzw. per E-Mail.</p>,
        },
      ]}
    />
  );
}
