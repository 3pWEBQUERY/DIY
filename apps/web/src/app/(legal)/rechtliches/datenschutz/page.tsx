import Link from "next/link";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { LegalDoc, FactList } from "@/components/legal/legal-doc";
import { BRAND } from "@/config/brand";
import { LEGAL, LEGAL_ADDRESS, LEGAL_ROBOTS, LEGAL_UPDATED, legalValue } from "@/config/legal";
import { getSetting } from "@/server/settings";

export const metadata: Metadata = {
  title: "Datenschutzerklärung",
  description: `Wie ${BRAND.name} Personendaten bearbeitet – nach Schweizer Datenschutzgesetz und, soweit anwendbar, DSGVO.`,
  alternates: { canonical: "/rechtliches/datenschutz" },
  robots: LEGAL_ROBOTS,
};

// Mindestalter aus den Systemeinstellungen: regelmässig neu rendern statt beim Build einfrieren
export const revalidate = 300;

const privacyMail = `mailto:${LEGAL.email}?subject=${encodeURIComponent("Datenschutz & Auskunft")}`;

/** Tabelle „Dienstleister“: Name, Aufgabe, Sitz/Ort der Bearbeitung. */
function Processors({ rows }: { rows: [string, ReactNode, ReactNode][] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-y border-line text-left text-[14px] leading-relaxed">
        <thead>
          <tr className="border-b border-line">
            <th scope="col" className="spec py-2 pr-4 font-normal">Dienstleister</th>
            <th scope="col" className="spec py-2 pr-4 font-normal">Aufgabe</th>
            <th scope="col" className="spec py-2 font-normal">Sitz / Ort der Bearbeitung</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line align-top">
          {rows.map(([name, task, where]) => (
            <tr key={name}>
              <th scope="row" className="py-2.5 pr-4 font-semibold text-ink">{name}</th>
              <td className="py-2.5 pr-4">{task}</td>
              <td className="py-2.5">{where}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default async function PrivacyPage() {
  const minAge = await getSetting("signup.minAge");
  const euRep = legalValue("euRepresentative");

  return (
    <LegalDoc
      kicker="Rechtliches"
      title="Datenschutzerklärung"
      updated={LEGAL_UPDATED}
      intro={
        <>
          Wir bearbeiten Personendaten sorgfältig, sparsam und nur für die Zwecke, die hier beschrieben sind. Diese Erklärung richtet sich nach dem Schweizer Bundesgesetz über den Datenschutz (DSG) und – soweit sie
          anwendbar ist, etwa für Mitglieder in der EU – nach der Datenschutz-Grundverordnung (DSGVO). Sie gilt für die Website werkuno.ch, die Apps und alle Funktionen von {BRAND.name}.
        </>
      }
      sections={[
        {
          id: "verantwortlich",
          title: "Verantwortlicher und Kontakt",
          body: (
            <>
              <FactList
                items={[
                  ["Verantwortlich", `${LEGAL.company}, ${LEGAL.legalForm}, ${LEGAL_ADDRESS}`],
                  ["E-Mail", <a key="m" href={privacyMail}>{LEGAL.email}</a>],
                  ["Telefon", <a key="t" href={LEGAL.phoneHref}>{LEGAL.phone}</a>],
                  ...(euRep ? [["EU-Vertretung (Art. 27 DSGVO)", euRep] as [string, ReactNode]] : []),
                ]}
              />
              <p>
                Für Fragen zum Datenschutz und zur Ausübung deiner Rechte erreichst du uns per E-Mail an <a href={privacyMail}>{LEGAL.email}</a>, per Post an die obige Adresse oder – mit Konto – über{" "}
                <Link href="/einstellungen/hilfe-support">Hilfe & Support</Link> mit dem Thema „Datenschutz & Auskunft“. Alle Wege findest du unter <Link href="/kontakt">Kontakt</Link>.
              </p>
            </>
          ),
        },
        {
          id: "grundsaetze",
          title: "Das Wichtigste in Kürze",
          body: (
            <ul>
              <li>Wir verkaufen keine Personendaten und nutzen sie nicht für Werbung Dritter.</li>
              <li>Es gibt keine Werbe- oder Tracking-Cookies und keine Analyse- oder Werbedienste von Dritten. Statistiken erstellen wir selbst und pseudonym.</li>
              <li>Schriften und Symbole werden von unseren eigenen Servern geladen, nicht von Drittanbietern.</li>
              <li>Server, Datenbank und Mediendateien betreiben wir bei unserem Hosting-Anbieter in der Region Amsterdam (Niederlande).</li>
              <li>Zahlungsdaten wie Kartennummern gibst du direkt bei unserem Zahlungsdienstleister Stripe ein; sie erreichen unsere Server nicht.</li>
              <li>Direktnachrichten sind auf dem Transportweg verschlüsselt, aber nicht Ende-zu-Ende-verschlüsselt.</li>
              <li>Du kannst deine Daten jederzeit selbst herunterladen und dein Konto selbst löschen.</li>
            </ul>
          ),
        },
        {
          id: "besuch",
          title: "Beim Besuch der Website",
          body: (
            <>
              <p>
                Wenn du werkuno.ch aufrufst, verarbeitet unser Hosting-Anbieter technisch notwendig deine IP-Adresse, die aufgerufene Adresse, Zeitpunkt, Browser-Kennung (User-Agent) und ähnliche Verbindungsdaten, um die Seite
                auszuliefern und den Betrieb zu sichern.
              </p>
              <p>
                In unserer eigenen Datenbank speichern wir IP-Adressen nicht im Klartext. Wo wir sie für die Sicherheit brauchen – etwa zur Begrenzung von Anmeldeversuchen, zum Erkennen bekannter Geräte oder für Zählungen –,
                verwenden wir einen gekürzten, mit einem geheimen Schlüssel gebildeten Hashwert.
              </p>
              <p>
                <strong>Aufrufzahlen:</strong> Aufrufe von Projekten, Anleitungen, Artikeln und Produkten zählen wir serverseitig, ohne Cookies. Damit derselbe Aufruf nicht mehrfach zählt, bilden wir bei Besuchen ohne Anmeldung
                einen täglich wechselnden Hashwert aus IP-Adresse und Browser-Kennung; wiederholte Aufrufe innerhalb von 30 Minuten zählen nur einmal. Erkennbare Bots zählen nicht.
              </p>
              <p>
                <strong>Partnerlinks:</strong> Bei Bezugsquellen im Bereich Materialien zählen wir Klicks auf die Weiterleitung anonym (mehrfache Klicks innerhalb einer Stunde nur einmal). An den Zielshop geben wir keine
                Personendaten weiter; beim Öffnen der Zielseite gelten die Datenschutzhinweise des jeweiligen Anbieters. Links mit Provision sind als „Partnerlink“ gekennzeichnet.
              </p>
            </>
          ),
        },
        {
          id: "konto",
          title: "Konto, Anmeldung und Sicherheit",
          body: (
            <>
              <ul>
                <li>
                  <strong>Registrierung:</strong> E-Mail-Adresse, Passwort (nur als scrypt-Hash, nie im Klartext), Anzeige- und Benutzername sowie der Zeitpunkt, zu dem du bestätigt hast, mindestens {minAge} Jahre alt zu sein
                  und die Nutzungsbedingungen akzeptiert zu haben.
                </li>
                <li>
                  <strong>Mit Apple anmelden:</strong> Nutzt du diese Option, erhalten wir von Apple eine pseudonyme Kennung und die E-Mail-Adresse, die du freigibst (ggf. eine von Apple weitergeleitete Adresse). Ein von Apple
                  ausgestelltes Token speichern wir verschlüsselt, damit wir die Verknüpfung bei der Kontolöschung bei Apple widerrufen können.
                </li>
                <li>
                  <strong>Mit Pinterest anmelden:</strong> Nutzt du diese Option, erhalten wir von Pinterest nur die Kennung und den Benutzernamen deines Pinterest-Kontos (Berechtigung „Konto lesen“). Pinterest gibt keine
                  E-Mail-Adresse weiter – du gibst sie bei der Registrierung selbst an. Zugriffstokens von Pinterest speichern wir nicht; wir lesen und veröffentlichen keine Pins oder Pinnwände. Die Verknüpfung kannst du in
                  den Einstellungen unter „Konto“ jederzeit trennen.
                </li>
                <li>
                  <strong>Lesebestätigungen:</strong> Für Nachrichten speichern wir, wann sie auf deinem Gerät angekommen sind und wann du sie gelesen hast. Daraus zeigen wir den Absender:innen ✓ (gesendet), ✓✓ (zugestellt) und
                  ✓✓ blau (gelesen). „Gelesen“ kannst du für Einzelchats in den Einstellungen unter „Privatsphäre“ ausschalten; dann siehst du es bei anderen auch nicht. In Gruppen wird es immer angezeigt.
                </li>
                <li>
                  <strong>Online-Status:</strong> Solange {BRAND.name} im Browser sichtbar bzw. die App im Vordergrund geöffnet ist, speichern wir etwa jede Minute, dass du online bist, und den Zeitpunkt, zu dem du
                  zuletzt online warst. Personen, mit denen du ein angenommenes Einzelgespräch führst, sehen „Online“ bzw. „Zuletzt online …“. Unter „Privatsphäre“ kannst du das ausschalten (dann siehst du es bei
                  anderen auch nicht). Das Moderationsteam sieht den Status zur Sicherheit der Plattform immer.
                </li>
                <li>
                  <strong>Sitzungen:</strong> Für jede Anmeldung speichern wir eine Sitzung mit Gerätebezeichnung (z. B. „Safari auf macOS“), Browser-Kennung, Zeitpunkt der Anmeldung und letzten Nutzung sowie einem Hashwert der
                  IP-Adresse. Unter <Link href="/einstellungen/sicherheit">Einstellungen → Sicherheit</Link> siehst du alle Sitzungen und kannst sie beenden. Bei einer Anmeldung von einem unbekannten Gerät informieren wir dich per
                  E-Mail.
                </li>
                <li>
                  <strong>Zwei-Faktor-Anmeldung:</strong> Aktivierst du sie, speichern wir den Schlüssel für deine Authenticator-App verschlüsselt und deine Wiederherstellungscodes nur als Hash.
                </li>
                <li>
                  <strong>Missbrauchsschutz:</strong> Zur Abwehr von automatisierten Angriffen und Spam zählen wir Anfragen je Konto bzw. je IP-Hashwert in kurzlebigen Zählern.
                </li>
              </ul>
              <p>Rechtsgrundlage: Erfüllung des Nutzungsvertrags (Art. 6 Abs. 1 lit. b DSGVO) und unser berechtigtes Interesse an einem sicheren Betrieb (lit. f).</p>
            </>
          ),
        },
        {
          id: "inhalte",
          title: "Profil, Inhalte und Community",
          body: (
            <>
              <ul>
                <li><strong>Profil:</strong> Anzeigename, Benutzername, Bio, Pronomen, Region, Land, Website und Links, kreative Schwerpunkte, Profil- und Titelbild – so, wie du sie angibst. Dein Profil ist öffentlich.</li>
                <li>
                  <strong>Inhalte:</strong> Beiträge, Projekte mit Journal, Material- und Werkzeuglisten, Anleitungen, Blogartikel, Kommentare, Umfragen, Bewertungen, Fotos und Videos. Öffentliche Inhalte sind für alle sichtbar und
                  können von Suchmaschinen erfasst werden; Inhalte in privaten Communities oder mit eingeschränkter Sichtbarkeit sehen nur Berechtigte.
                </li>
                <li>
                  <strong>Interaktionen:</strong> Gefällt-mir, Merken, Sammlungen, Folgen, Stummschalten und Blockieren, Mitgliedschaften in Communities, Teilnahme an Events, Einreichungen und Stimmen in Wettbewerben, Stimmen in
                  Umfragen, Lernfortschritt in Anleitungen, Einkaufslisten und Materialbestand. Wer in einer Umfrage oder einem Wettbewerb wie abgestimmt hat, zeigen wir anderen nicht an.
                </li>
                <li>
                  <strong>Fotos und Videos:</strong> Beim Hochladen verarbeiten wir Bilder und Videos neu und entfernen dabei eingebettete Metadaten wie EXIF-Angaben und GPS-Koordinaten. Die hochgeladene Originaldatei löschen wir
                  nach der Verarbeitung.
                </li>
              </ul>
              <p>
                <strong>Feed und Empfehlungen:</strong> Der Feed „Für dich“ ordnet Inhalte nach Aktualität, deinen gewählten Interessen, deinen bisherigen Interaktionen auf {BRAND.name} (z. B. gemerkte oder gelikte Inhalte), der
                Qualität eines Inhalts und Vielfalt. Er beruht weder auf sensiblen Daten noch auf Daten von ausserhalb der Plattform. Bezahlte Profile werden nicht bevorzugt. Der Feed „Folge ich“ ist chronologisch. Deine
                Interessen änderst du unter <Link href="/einstellungen/feed">Feed & Interessen</Link>.
              </p>
              <p>Rechtsgrundlage: Erfüllung des Nutzungsvertrags (Art. 6 Abs. 1 lit. b DSGVO).</p>
            </>
          ),
        },
        {
          id: "nachrichten",
          title: "Direktnachrichten",
          body: (
            <>
              <p>
                Wir speichern Nachrichten, damit Absender:in und Empfänger:in sie lesen können. Sie werden verschlüsselt übertragen, sind auf unseren Servern aber nicht Ende-zu-Ende-verschlüsselt. Wer dir schreiben darf, legst
                du unter <Link href="/einstellungen/privatsphaere">Privatsphäre</Link> fest.
              </p>
              <p>
                Zum Schutz vor Betrug prüfen wir neue Nachrichten automatisch auf typische Hinweise auf Zahlungen ausserhalb der Plattform (z. B. IBAN, Vorkasse, Kurzlinks). Trifft das zu, sieht die Empfänger:in einen
                Warnhinweis; die Nachricht wird weder blockiert noch von einem Menschen gelesen. Den Inhalt einer Nachricht sieht unser Moderationsteam nur, wenn sie gemeldet wurde.
              </p>
              <p>Rechtsgrundlage: Erfüllung des Nutzungsvertrags (Art. 6 Abs. 1 lit. b DSGVO) und unser berechtigtes Interesse am Schutz der Mitglieder vor Betrug (lit. f).</p>
            </>
          ),
        },
        {
          id: "marktplatz",
          title: "Marktplatz: Kaufen und Verkaufen",
          body: (
            <>
              <h3>Als Käufer:in</h3>
              <ul>
                <li>Vor- und Nachname, Rechnungs- bzw. Lieferadresse und optional Telefonnummer. Du erfasst sie einmal in deinem Konto; sie werden für deine Bestellungen verwendet.</li>
                <li>Bestellungen mit Positionen, Beträgen, Status, Versand- und Sendungsangaben, Nachrichten zur Bestellung, Erstattungen und Bewertungen sowie Download-Berechtigungen für digitale Produkte (inkl. Anzahl der Downloads).</li>
                <li>
                  Der Shop, bei dem du bestellst, erhält Name, Adresse, gegebenenfalls Telefonnummer und die Bestellangaben, um die Bestellung abzuwickeln. Er ist für deren weitere Verwendung selbst verantwortlich.
                </li>
                <li>
                  Bezahlt wird im Checkout von Stripe. Stripe erhält deine E-Mail-Adresse, den Betrag, die Bestellnummer und die Zahlungsangaben, die du dort eingibst. Wir erhalten von Stripe nur den Zahlungsstatus und
                  technische Referenzen – keine vollständigen Kartendaten.
                </li>
              </ul>
              <h3>Als Verkäufer:in</h3>
              <ul>
                <li>Shopangaben, Angebote und die Anbieterangaben aus der Shop-Eröffnung: Vor- und Nachname, bei gewerblichen Shops Firmenname und gegebenenfalls MWST-/USt-Nummer, Adresse und Land.</li>
                <li>
                  Bei gewerblichen Shops zeigen wir Firmenname, verantwortliche Person, Adresse und gegebenenfalls MWST-/USt-Nummer öffentlich als Anbieterkennzeichnung an. Bei privaten Shops zeigen wir die Adresse nicht an.
                </li>
                <li>
                  Die Identitätsprüfung (z. B. Ausweis, Geburtsdatum, Bankverbindung) führt Stripe im eigenen Formular durch; diese Angaben speichern wir nicht. Wir erhalten von Stripe den Prüf- und Auszahlungsstatus, Guthaben und
                  Auszahlungen.
                </li>
              </ul>
              <p>
                Rechtsgrundlage: Erfüllung der Verträge über die Plattformnutzung und die Bestellung (Art. 6 Abs. 1 lit. b DSGVO), gesetzliche Aufbewahrungs- und Prüfpflichten (lit. c) sowie unser berechtigtes Interesse an der
                Betrugsabwehr (lit. f).
              </p>
            </>
          ),
        },
        {
          id: "pro",
          title: "Creator Pro",
          body: (
            <p>
              Schliesst du Creator Pro ab, speichern wir Abo-Art (monatlich oder jährlich), Preis, Status, Laufzeitende und eine Kündigung. Zahlung, Zahlungsmittel und Rechnungen verwaltet Stripe; deine Rechnungen siehst du in{" "}
              <Link href="/studio/pro">Studio → Creator Pro</Link>. Rechtsgrundlage: Vertragserfüllung (Art. 6 Abs. 1 lit. b DSGVO) und gesetzliche Aufbewahrungspflichten (lit. c).
            </p>
          ),
        },
        {
          id: "benachrichtigungen",
          title: "Benachrichtigungen, E-Mails und Push",
          body: (
            <>
              <ul>
                <li><strong>In der App:</strong> Benachrichtigungen über Aktivitäten, Bestellungen, Sicherheit und Moderation.</li>
                <li>
                  <strong>E-Mail:</strong> Für Konto und Sicherheit (z. B. Bestätigung der E-Mail-Adresse, Passwort zurücksetzen, neue Anmeldung) sowie zu Bestellungen und Moderationsentscheidungen senden wir E-Mails, die für die Nutzung nötig sind. Weitere
                  Benachrichtigungen per E-Mail erhältst du nach deinen Einstellungen; jede solche E-Mail enthält einen Abmeldelink. Newsletter zu Werbezwecken versenden wir nicht ohne deine Einwilligung.
                </li>
                <li>
                  <strong>Push im Browser:</strong> Erlaubst du Push-Benachrichtigungen, speichern wir die Push-Adresse deines Browsers. Die Zustellung läuft über den Push-Dienst deines Browser-Herstellers (z. B. Google für
                  Chrome, Mozilla für Firefox, Apple für Safari, Microsoft für Edge); der Inhalt wird dabei verschlüsselt übertragen.
                </li>
                <li>
                  <strong>Push in der iOS-App:</strong> Erlaubst du Mitteilungen, speichern wir das Geräte-Token. Die Zustellung läuft über den Apple Push Notification Service; Apple erhält dabei das Token und den Text der
                  Mitteilung.
                </li>
              </ul>
              <p>
                Was du wie erhältst, stellst du je Ereignis und Kanal unter <Link href="/einstellungen/benachrichtigungen">Benachrichtigungen</Link> ein; Push kannst du auch in deinem Browser bzw. in den Einstellungen deines
                Geräts abschalten. Rechtsgrundlage: Vertragserfüllung (Art. 6 Abs. 1 lit. b DSGVO) bzw. deine Einwilligung (lit. a), die du jederzeit widerrufen kannst.
              </p>
            </>
          ),
        },
        {
          id: "moderation",
          title: "Support, Meldungen und Moderation",
          body: (
            <>
              <p>
                Wenn du uns kontaktierst, bearbeiten wir deine Angaben, um dein Anliegen zu beantworten. Bei Meldungen speichern wir Grund, Beschreibung, den gemeldeten Inhalt (als Momentaufnahme) und wer gemeldet hat; die
                gemeldete Person erfährt nicht, wer gemeldet hat. Zu Moderationsentscheidungen und Einsprüchen speichern wir Fallnummer, Begründung, Massnahme und Verlauf.
              </p>
              <p>
                Meldungen werden automatisch nach Grund und Anzahl priorisiert; über Massnahmen entscheiden Menschen. Kritische Aktionen der Administration und Moderation halten wir in einem gegen nachträgliche Änderungen
                gesicherten Protokoll fest.
              </p>
              <p>
                Rechtsgrundlage: unser berechtigtes Interesse an einer sicheren Plattform und an der Nachvollziehbarkeit von Entscheidungen (Art. 6 Abs. 1 lit. f DSGVO) sowie gegebenenfalls rechtliche Pflichten (lit. c).
              </p>
            </>
          ),
        },
        {
          id: "statistik",
          title: "Statistik und Fehlerüberwachung",
          body: (
            <>
              <p>
                <strong>Statistik:</strong> Wir erfassen Nutzungsereignisse wie „Projekt veröffentlicht“, „Anleitung abgeschlossen“ oder Seitenaufrufe in unserer eigenen Datenbank – mit Konto-Kennung bzw. bei Besuchen ohne Konto
                ohne Personenbezug, aber ohne E-Mail-Adressen, Namen oder IP-Adressen. Daraus entstehen aggregierte Auswertungen zur Verbesserung der Plattform und die Statistiken im {BRAND.name} Studio. Im Studio sehen
                Creator nur zusammengefasste Zahlen zu ihren Inhalten, nicht, wer etwas angesehen hat.
              </p>
              <p>
                <strong>Fehlerüberwachung:</strong> Technische Fehler aus Website, App und Hintergrunddiensten speichern wir in unserer eigenen Datenbank, gegebenenfalls mit Seitenadresse, Browser-Kennung und Konto-Kennung, um
                sie beheben zu können. Ein externer Dienst wird dafür nicht eingesetzt.
              </p>
              <p>Rechtsgrundlage: unser berechtigtes Interesse an einer funktionierenden und stetig verbesserten Plattform (Art. 6 Abs. 1 lit. f DSGVO).</p>
            </>
          ),
        },
        {
          id: "empfaenger",
          title: "Empfänger und Dienstleister",
          body: (
            <>
              <p>Wir setzen folgende Dienstleister ein. Soweit sie in unserem Auftrag handeln, bearbeiten sie Daten nur nach unseren Weisungen:</p>
              <Processors
                rows={[
                  ["Railway", "Hosting von Website, Hintergrunddiensten, Datenbank und Mediendateien", <>Railway Corporation, USA; Server, Datenbank und Speicher in der Region Amsterdam (Niederlande)</>],
                  [
                    "Stripe",
                    "Zahlungsabwicklung im Checkout, Verifizierung und Auszahlungen für Shops, Abrechnung von Creator Pro",
                    <>Stripe Payments Europe Ltd., Irland, mit verbundenen Unternehmen u. a. in den USA</>,
                  ],
                  ["Resend", "Versand von E-Mails", <>Resend, Inc., USA</>],
                  ["Apple", <>„Mit Apple anmelden“ und Push-Mitteilungen in der iOS-App (nur wenn du diese nutzt)</>, <>Apple Inc., USA, bzw. Apple Distribution International Ltd., Irland</>],
                  ["Pinterest", <>„Mit Pinterest anmelden“ (nur wenn du diese Option nutzt)</>, <>Pinterest Europe Ltd., Irland, bzw. Pinterest, Inc., USA</>],
                  ["Push-Dienste der Browser", "Zustellung von Browser-Push (nur wenn du sie erlaubst)", <>je nach Browser Google, Mozilla, Apple oder Microsoft</>],
                ]}
              />
              <p>
                Stripe bearbeitet bestimmte Daten zusätzlich in eigener Verantwortung, etwa zur Identitätsprüfung von Verkäufer:innen, zur Betrugsprävention und zur Erfüllung eigener gesetzlicher Pflichten. Dafür gelten die
                Datenschutzhinweise von Stripe.
              </p>
              <p>
                Weitere Empfänger: andere Mitglieder und die Öffentlichkeit, soweit du Inhalte öffentlich teilst; der jeweilige Shop bei einer Bestellung; Behörden und Gerichte, wenn wir rechtlich dazu verpflichtet sind oder es
                zur Wahrung unserer Rechte nötig ist.
              </p>
            </>
          ),
        },
        {
          id: "ausland",
          title: "Bekanntgabe ins Ausland",
          body: (
            <p>
              Unsere Server stehen in der EU (Niederlande), für die der Bundesrat einen angemessenen Datenschutz festgestellt hat. Einige Dienstleister haben ihren Sitz in den USA oder greifen von dort auf Daten zu (z. B. für
              Wartung und Support). Wir geben Personendaten nur in Staaten ohne angemessenen Datenschutz bekannt, wenn geeignete Garantien bestehen – etwa eine Zertifizierung des Empfängers nach dem Swiss-U.S. bzw. EU-U.S. Data
              Privacy Framework oder Standardvertragsklauseln der Europäischen Kommission mit den für die Schweiz nötigen Anpassungen – oder wenn eine gesetzliche Ausnahme gilt, etwa weil die Bekanntgabe für die Abwicklung eines
              Vertrags mit dir nötig ist.
            </p>
          ),
        },
        {
          id: "cookies",
          title: "Cookies und lokale Speicherung",
          body: (
            <>
              <p>Wir verwenden nur Cookies und Speicher im Browser, die für Funktionen von {BRAND.name} nötig sind. Es gibt keine Werbe-, Analyse- oder Tracking-Cookies und keine Cookies von Dritten.</p>
              <FactList
                items={[
                  ["wr_session", "Cookie, hält dich angemeldet. Höchstens 30 Tage, endet mit der Abmeldung."],
                  ["wr_apple_state, wr_apple_next", "Cookies, nur bei „Mit Apple anmelden“: schützen den Anmeldevorgang und merken die Zielseite. 10 Minuten."],
                  ["wr_pinterest_state, wr_pinterest_next, wr_pinterest_link", "Cookies, nur bei „Mit Pinterest anmelden“ bzw. „Pinterest verbinden“: schützen den Anmeldevorgang und merken die Zielseite. 10 Minuten."],
                  ["wr_pinterest_signup", "Cookie, nur bei der Registrierung mit Pinterest: merkt die Pinterest-Kennung (signiert), bis du deine E-Mail-Adresse angegeben hast. 30 Minuten."],
                  ["wr_nav", "Cookie, merkt, ob die Seitenleiste eingeklappt ist. 1 Jahr."],
                  ["wr_single_key_shortcuts", "Lokaler Speicher, merkt, ob Tastenkürzel mit einer Taste ausgeschaltet sind."],
                  ["wr_push_prompt", "Lokaler Speicher, merkt, dass du den Hinweis auf Push-Benachrichtigungen geschlossen hast."],
                  ["wr_verify_hidden", "Sitzungsspeicher, blendet den Hinweis zur E-Mail-Bestätigung bis zum Schliessen des Browsers aus."],
                ]}
              />
              <p>Für Push-Benachrichtigungen registriert dein Browser einen Service Worker; er dient nur der Anzeige von Mitteilungen und speichert keine Seiteninhalte. Du kannst Cookies und lokalen Speicher jederzeit in deinem Browser löschen.</p>
            </>
          ),
        },
        {
          id: "speicherdauer",
          title: "Speicherdauer",
          body: (
            <>
              <p>Wir speichern Personendaten nur so lange, wie es für die genannten Zwecke nötig ist oder das Gesetz es verlangt. Konkret:</p>
              <ul>
                <li>Konto, Profil und Inhalte: solange dein Konto besteht bzw. bis du einen Inhalt löschst</li>
                <li>Sitzungen: bis zum Ablauf (höchstens 30 Tage); beendete Sitzungen werden 30 Tage danach gelöscht</li>
                <li>Links zur Bestätigung der E-Mail-Adresse und zum Zurücksetzen des Passworts: bis zum Ablauf, danach spätestens nach 7 Tagen gelöscht</li>
                <li>Zähler zum Missbrauchsschutz: bis zum Ende ihres Zeitfensters (Minuten bis Tage)</li>
                <li>Gelesene Benachrichtigungen: 180 Tage</li>
                <li>Fehlerberichte: 30 Tage; behobene Fehlergruppen: 90 Tage nach dem letzten Auftreten</li>
                <li>Technische Ereignisse unseres Zahlungsdienstleisters (Webhooks): 30 Tage nach der Verarbeitung</li>
                <li>Hochgeladene Medien, die keinem Inhalt zugeordnet sind (auch nach dem Löschen eines Inhalts): 14 Tage, nicht verarbeitbare Uploads 1 Tag</li>
                <li>Bestellungen, Zahlungen, Erstattungen und Belege: so lange, wie es gesetzliche Aufbewahrungspflichten verlangen – in der Regel zehn Jahre (Art. 958f OR)</li>
                <li>Moderationsfälle, Einsprüche, Support-Anfragen und das Protokoll kritischer Aktionen: so lange, wie es zur Nachvollziehbarkeit, zur Missbrauchsabwehr und zur Abwehr von Ansprüchen nötig ist</li>
                <li>Pseudonyme Nutzungsereignisse: für Statistiken; nach einer Kontolöschung ohne Verbindung zu deinen Kontaktdaten</li>
              </ul>
            </>
          ),
        },
        {
          id: "loeschung",
          title: "Datenexport und Kontolöschung",
          body: (
            <>
              <p>
                Unter <Link href="/einstellungen/konto">Einstellungen → Konto & Daten</Link> kannst du jederzeit alle Daten deines Kontos als JSON-Datei herunterladen – Profil, Inhalte, Interaktionen, Bestellungen,
                Einstellungen, eigene Nachrichten, Meldungen und Support-Anfragen. Geheimnisse wie Passwort-Hash oder Zwei-Faktor-Schlüssel und Daten anderer Personen sind nicht enthalten.
              </p>
              <p>Dort kannst du dein Konto auch löschen. Beim Löschen:</p>
              <ul>
                <li>beenden wir alle Sitzungen, ersetzen E-Mail-Adresse und Benutzername durch einen Platzhalter, leeren dein Profil und nehmen deine Beiträge, Projekte, Anleitungen, Artikel und Kommentare von der Plattform;</li>
                <li>löschen wir unter anderem deine Fotos und Videos, Bestelladressen, Warenkorb, Merklisten, Sammlungen, Reaktionen, Benachrichtigungen, Geräte für Push und Wiederherstellungscodes;</li>
                <li>beenden wir ein laufendes Creator-Pro-Abo und widerrufen eine Verknüpfung mit Apple;</li>
                <li>deaktivieren wir einen Shop und seine Angebote. Offene Bestellungen müssen vorher versendet oder storniert sein; freigegebenes Guthaben wird noch ausbezahlt.</li>
              </ul>
              <p>
                Erhalten bleiben – ohne Verbindung zu deinem Profil – Bestellungen, Zahlungen und Belege (Aufbewahrungspflicht), Bewertungen als Teil der Shop-Historie, Nachrichten in Unterhaltungen mit anderen (Absender
                erscheint als „Gelöschtes Konto“), Moderationsfälle und das Protokoll kritischer Aktionen.
              </p>
            </>
          ),
        },
        {
          id: "rechte",
          title: "Deine Rechte",
          body: (
            <>
              <p>Du hast im Rahmen des anwendbaren Rechts insbesondere das Recht,</p>
              <ul>
                <li>Auskunft darüber zu erhalten, welche Personendaten wir über dich bearbeiten;</li>
                <li>unrichtige Daten berichtigen zu lassen – vieles kannst du direkt in den Einstellungen ändern;</li>
                <li>die Löschung deiner Daten oder die Einschränkung der Bearbeitung zu verlangen, soweit keine Aufbewahrungspflicht entgegensteht;</li>
                <li>deine Daten in einem gängigen elektronischen Format herauszuverlangen oder übertragen zu lassen (Datenherausgabe bzw. Datenübertragbarkeit);</li>
                <li>einer Bearbeitung zu widersprechen, die auf unserem berechtigten Interesse beruht;</li>
                <li>eine Einwilligung jederzeit mit Wirkung für die Zukunft zu widerrufen.</li>
              </ul>
              <p>
                Schreib uns dafür an <a href={privacyMail}>{LEGAL.email}</a>. Damit wir keine Daten an Unberechtigte herausgeben, können wir einen Nachweis verlangen, dass das Konto dir gehört – etwa eine Anfrage von der
                hinterlegten E-Mail-Adresse.
              </p>
              <p>
                Du kannst dich ausserdem bei der zuständigen Aufsichtsbehörde beschweren: in der Schweiz beim Eidgenössischen Datenschutz- und Öffentlichkeitsbeauftragten (EDÖB, edoeb.admin.ch), in der EU bei der
                Datenschutzaufsichtsbehörde deines Wohnsitz- oder Arbeitsorts oder des Orts des mutmasslichen Verstosses.
              </p>
            </>
          ),
        },
        {
          id: "sicherheit",
          title: "Datensicherheit",
          body: (
            <>
              <p>Wir treffen angemessene technische und organisatorische Massnahmen, um deine Daten zu schützen, unter anderem:</p>
              <ul>
                <li>verschlüsselte Übertragung (HTTPS mit HSTS) und eine restriktive Content-Security-Policy;</li>
                <li>Passwörter nur als scrypt-Hash, Sitzungen nur als Hash gespeichert und jederzeit widerrufbar, optionale Zwei-Faktor-Anmeldung;</li>
                <li>ein nicht öffentlicher Speicher für Dateien; gekaufte digitale Produkte sind nur über kurzlebige, signierte Links abrufbar;</li>
                <li>Begrenzung von Anmeldeversuchen und anderen Anfragen;</li>
                <li>ein gegen nachträgliche Änderungen gesichertes Protokoll für kritische Aktionen der Administration und Moderation.</li>
              </ul>
              <p>Eine vollständige Sicherheit kann bei der Übertragung und Speicherung von Daten im Internet niemand garantieren. Bitte wähle ein starkes Passwort und aktiviere die Zwei-Faktor-Anmeldung.</p>
            </>
          ),
        },
        {
          id: "alter",
          title: "Mindestalter",
          body: (
            <p>
              {BRAND.name} richtet sich an Erwachsene ab {minAge} Jahren. Wir bearbeiten nicht wissentlich Daten von jüngeren Personen; erfahren wir davon, löschen wir das Konto. Fotos von Kindern teilst du nur mit
              Einwilligung der Sorgeberechtigten und ohne erkennbare Gesichter oder Namen.
            </p>
          ),
        },
        {
          id: "aenderungen",
          title: "Änderungen",
          body: <p>Wir passen diese Erklärung an, wenn sich die Plattform oder das Recht ändert. Es gilt die jeweils hier veröffentlichte Fassung. Über wesentliche Änderungen informieren wir angemeldete Mitglieder vorab in der App oder per E-Mail.</p>,
        },
      ]}
    />
  );
}
