import Link from "next/link";
import type { Metadata } from "next";
import { formatMoney } from "@werkraum/shared";
import { LegalDoc } from "@/components/legal/legal-doc";
import { BRAND } from "@/config/brand";
import { LEGAL, LEGAL_ADDRESS, LEGAL_OPERATOR, LEGAL_ROBOTS, LEGAL_UPDATED } from "@/config/legal";
import { getSetting } from "@/server/settings";

export const metadata: Metadata = {
  title: "Nutzungsbedingungen",
  description: `Nutzungsbedingungen von ${BRAND.name}: Community, Marktplatz und Creator Pro.`,
  alternates: { canonical: "/rechtliches/agb" },
  robots: LEGAL_ROBOTS,
};

// Provision, Fristen und Preise aus den Systemeinstellungen: regelmässig neu rendern statt beim Build einfrieren
export const revalidate = 300;

const pct = (bps: number) => `${(bps / 100).toLocaleString("de-CH", { maximumFractionDigits: 2 })} %`;
// Akkusativ: „3 Tage nach dem Abschluss“
const tage = (n: number) => `${n} ${n === 1 ? "Tag" : "Tage"}`;

export default async function TermsPage() {
  const [feeBps, proFeeBps, holdDays, autoCompleteDays, reservationMinutes, minAge, priceMonth, priceYear] = await Promise.all([
    getSetting("commerce.feeBps"),
    getSetting("pro.feeBps"),
    getSetting("commerce.payoutHoldDays"),
    getSetting("commerce.autoCompleteDays"),
    getSetting("commerce.reservationMinutes"),
    getSetting("signup.minAge"),
    getSetting("pro.priceMonthMinor"),
    getSetting("pro.priceYearMinor"),
  ]);
  const proFee = Math.min(feeBps, proFeeBps);
  const withdrawMail = `mailto:${LEGAL.email}?subject=${encodeURIComponent("Widerruf Creator Pro")}`;

  return (
    <LegalDoc
      kicker="Rechtliches"
      title="Nutzungsbedingungen"
      updated={LEGAL_UPDATED}
      intro={
        <>
          Diese Bedingungen regeln die Nutzung von {BRAND.name} – dem Netzwerk und Marktplatz für Menschen, die mit den eigenen Händen erschaffen. Kurz gesagt: Deine Werke bleiben deine. Du teilst sie mit Respekt, und wir
          stellen einen sicheren, fairen Ort dafür bereit.
        </>
      }
      sections={[
        {
          id: "geltung",
          title: "Geltungsbereich und Vertragspartner",
          body: (
            <>
              <p>
                Diese Nutzungsbedingungen gelten für die Website werkuno.ch, die Apps und alle Funktionen von {BRAND.name}. Betreiber und dein Vertragspartner für die Nutzung der Plattform ist {LEGAL_OPERATOR} („{BRAND.name}“,
                „wir“).
              </p>
              <p>
                Ergänzend gelten die <Link href="/richtlinien/community">Community-Richtlinien</Link>, die <Link href="/richtlinien/marktplatz">Marktplatz-Richtlinien</Link>, die{" "}
                <Link href="/richtlinien/sicherheit">Sicherheitsrichtlinien</Link> und die Regeln zu <Link href="/richtlinien/urheberrecht">Urheberrecht & Meldeverfahren</Link>. Wie wir Personendaten bearbeiten, steht in der{" "}
                <Link href="/rechtliches/datenschutz">Datenschutzerklärung</Link>.
              </p>
              <p>Käufe im Marktplatz schliesst du nicht mit uns, sondern mit dem jeweiligen Shop ab (siehe „Marktplatz: Rolle von {BRAND.name}“).</p>
            </>
          ),
        },
        {
          id: "leistungen",
          title: "Was wir anbieten",
          body: (
            <ul>
              <li>Ein Konto mit Profil, Feed, Beiträgen, Projekten mit Journal, Anleitungen, Blogartikeln, Kommentaren, Direktnachrichten, Communities, Events, Wettbewerben, Umfragen und Materialübersichten.</li>
              <li>Einen Marktplatz, auf dem Mitglieder handgemachte Produkte, Materialsets und digitale Anleitungen anbieten und kaufen können.</li>
              <li>Das {BRAND.name} Studio mit Statistiken und Werkzeugen für Creator und Shops sowie das optionale, kostenpflichtige Abo Creator Pro.</li>
            </ul>
          ),
        },
        {
          id: "konto",
          title: "Konto und Mindestalter",
          body: (
            <ul>
              <li>Die Nutzung ist ab <strong>{minAge} Jahren</strong> möglich. Mit der Registrierung bestätigst du, dass du dieses Alter erreicht hast.</li>
              <li>Das Konto ist kostenlos. Ein Anspruch auf Eröffnung eines Kontos besteht nicht.</li>
              <li>Du machst wahrheitsgemässe Angaben, hältst sie aktuell, schützt deine Zugangsdaten und informierst uns bei Verdacht auf Missbrauch.</li>
              <li>Pro Person ein Konto. Konten dürfen nicht verkauft, übertragen oder mit anderen geteilt werden.</li>
              <li>Dein Benutzername darf keine Marken, Personen oder Organisationen imitieren und nicht irreführend sein.</li>
            </ul>
          ),
        },
        {
          id: "inhalte",
          title: "Deine Inhalte und Rechte",
          body: (
            <>
              <p>
                <strong>Du bleibst Urheber:in.</strong> Alle Rechte an Projekten, Fotos, Videos, Anleitungen, Schnittmustern, Texten und anderen Werken, die du veröffentlichst, bleiben bei dir.
              </p>
              <p>
                Damit wir die Plattform betreiben können, räumst du uns eine <strong>einfache, unentgeltliche, weltweite Lizenz</strong> ein, deine Inhalte im Rahmen von {BRAND.name} zu speichern, technisch anzupassen (z. B.
                Bildgrössen, Videoformate), anzuzeigen und innerhalb der Plattform – etwa in Entdecken, Sammlungen, redaktionellen Hervorhebungen oder Benachrichtigungen – mit Namensnennung zu zeigen. Die Lizenz gilt für die
                Sichtbarkeit, die du wählst, und endet, wenn du einen Inhalt oder dein Konto löschst; ausgenommen sind Kopien, die bis zu ihrer regulären Löschung technisch noch vorhanden sind, und Inhalte, die mit anderen
                verbunden sind, soweit das in der Datenschutzerklärung beschrieben ist.
              </p>
              <p>Wir nutzen deine Inhalte nicht ausserhalb der Plattform für Werbung und verkaufen sie nicht. Für jede darüber hinausgehende Nutzung fragen wir dich vorher.</p>
              <p>
                Du versicherst, dass du die nötigen Rechte an deinen Inhalten besitzt – auch an Fotos, Mustern und Musik –, und dass erkennbare Personen mit der Veröffentlichung einverstanden sind. Nachbauten kennzeichnest du mit
                einem Verweis auf das Original. Wirst du wegen deiner Inhalte von Dritten in Anspruch genommen, bist du dafür verantwortlich.
              </p>
            </>
          ),
        },
        {
          id: "nutzung",
          title: "Nutzung fremder Inhalte",
          body: (
            <p>
              Inhalte anderer Mitglieder darfst du auf {BRAND.name} ansehen, merken, teilen und für den privaten Gebrauch nachbauen. Kommerzielle Nutzung – etwa der Verkauf von Produkten nach einer fremden Anleitung oder die
              Weitergabe eines Schnittmusters – ist nur erlaubt, wenn die Urheber:in das ausdrücklich gestattet. Gekaufte digitale Anleitungen sind für den persönlichen Gebrauch lizenziert und dürfen nicht weitergegeben werden,
              sofern die Lizenz des Shops nichts anderes erlaubt.
            </p>
          ),
        },
        {
          id: "verhalten",
          title: "Verhaltensregeln",
          body: (
            <>
              <p>Es gelten die <Link href="/richtlinien/community">Community-Richtlinien</Link>. Insbesondere ist nicht erlaubt:</p>
              <ul>
                <li>rechtswidrige Inhalte sowie Belästigung, Hassrede, Drohungen oder die Veröffentlichung privater Daten anderer;</li>
                <li>Spam, Fake-Konten, gekaufte Interaktionen und das automatisierte Auslesen oder Belasten der Plattform ohne unsere Erlaubnis;</li>
                <li>Anleitungen, die bewusst zu gefährlichen oder illegalen Handlungen anleiten;</li>
                <li>Zahlungen für Marktplatz-Angebote ausserhalb des Checkouts zu verlangen oder anzubieten;</li>
                <li>Sicherheitsmassnahmen zu umgehen oder auf fremde Konten zuzugreifen.</li>
              </ul>
            </>
          ),
        },
        {
          id: "moderation",
          title: "Meldungen, Moderation und Einspruch",
          body: (
            <>
              <p>
                Inhalte, Profile, Nachrichten, Bewertungen und Angebote kannst du über „Melden“ anzeigen; ohne Konto erreichst du uns per E-Mail an <a href={`mailto:${LEGAL.email}`}>{LEGAL.email}</a>. Jede Meldung erhält eine
                Fallnummer. Wir prüfen Meldungen und entscheiden sorgfältig, objektiv und verhältnismässig.
              </p>
              <p>
                Bei Verstössen gegen diese Bedingungen, die Richtlinien oder das Gesetz können wir je nach Schwere und Wiederholung verwarnen, die Reichweite eines Inhalts beschränken, Inhalte ausblenden oder entfernen, Angebote
                deaktivieren, Nachrichten einschränken sowie Konten zeitweise oder dauerhaft sperren. Bei Verdacht auf Betrug oder schweren Verstössen dürfen wir Auszahlungen für die Dauer der Prüfung zurückhalten.
              </p>
              <p>
                Wer von einer Entscheidung betroffen ist, erhält eine Benachrichtigung mit Begründung und kann innerhalb von 14 Tagen Einspruch einlegen. Wenn möglich prüft eine andere Person als die, die ursprünglich entschieden
                hat. Wird dem Einspruch stattgegeben, heben wir die Massnahme auf. Gesetzliche Rechtsbehelfe bleiben vorbehalten.
              </p>
            </>
          ),
        },
        {
          id: "communities",
          title: "Communities, Events und Wettbewerbe",
          body: (
            <ul>
              <li>Communities werden von Mitgliedern gegründet und moderiert. Sie können zusätzliche Regeln festlegen; diese Bedingungen und die Richtlinien gelten immer.</li>
              <li>
                Events werden von Mitgliedern organisiert. Für Durchführung, Ort, Kosten und Sicherheit eines Events ist die organisierende Person verantwortlich; {BRAND.name} ist nicht Veranstalter.
              </li>
              <li>
                Wettbewerbe werden in Communities durchgeführt. Die Teilnahme ist kostenlos; eingereicht werden eigene, öffentliche Projekte. Über Platzierungen entscheiden je nach Wettbewerb die Stimmen der Mitglieder oder die
                Moderation der Community. Werden Preise ausgeschrieben, stellt sie die ausschreibende Community bzw. Person bereit, sofern nicht ausdrücklich etwas anderes angegeben ist. Manipulierte Stimmen führen zum Ausschluss.
              </li>
            </ul>
          ),
        },
        {
          id: "sicherheit",
          title: "Anleitungen und Sicherheit",
          body: (
            <p>
              Anleitungen werden von Mitgliedern erstellt; wir prüfen sie nicht fachlich. Das Nachbauen geschieht auf eigene Verantwortung. Beachte die <Link href="/richtlinien/sicherheit">Sicherheitsrichtlinien</Link> und die
              Hinweise der Hersteller von Werkzeugen und Materialien. Die Sicherheitskennzeichnungen der Autor:innen ersetzen keine fachkundige Sicherheitsbeurteilung.
            </p>
          ),
        },
        {
          id: "marktplatz",
          title: "Marktplatz: Rolle von " + BRAND.name,
          body: (
            <>
              <p>
                {BRAND.name} stellt den Marktplatz als technische Plattform bereit und vermittelt zwischen Käufer:innen und Shops. Der <strong>Kaufvertrag kommt ausschliesslich zwischen Käufer:in und Shop zustande</strong>.{" "}
                {BRAND.name} ist nicht Verkäufer und übernimmt keine Gewähr für Angebote, Beschaffenheit, Lieferung oder die Angaben der Shops.
              </p>
              <p>
                Shops können von Personen und Unternehmen mit Sitz in der Schweiz, in Liechtenstein, Deutschland oder Österreich eröffnet werden. Lieferungen sind derzeit an Adressen in diesen Ländern möglich. Preise werden in
                Schweizer Franken angezeigt.
              </p>
            </>
          ),
        },
        {
          id: "verkaeufer",
          title: "Pflichten der Shops",
          body: (
            <>
              <ul>
                <li>
                  Bei der Shop-Eröffnung gibst du an, ob du <strong>privat</strong> oder <strong>gewerblich</strong> verkaufst, und machst wahrheitsgemässe Anbieterangaben. Wer regelmässig und mit Gewinnabsicht verkauft, ist in
                  der Regel gewerblich tätig.
                </li>
                <li>
                  Gewerbliche Shops erfüllen die gesetzlichen Pflichten gegenüber Verbraucher:innen selbst – insbesondere Anbieterkennzeichnung, Preisangaben, Informationen zum Widerrufsrecht bei Käufen von Verbraucher:innen aus der
                  EU, Gewährleistung sowie steuerliche Pflichten (z. B. MWST). {BRAND.name} zeigt Firmenname, verantwortliche Person, Adresse und gegebenenfalls MWST-/USt-Nummer auf der Shopseite an; weitere Pflichtangaben machst
                  du in deiner Shopbeschreibung bzw. deinen Bedingungen.
                </li>
                <li>Auszahlungen setzen die erfolgreiche Verifizierung bei unserem Zahlungsdienstleister Stripe voraus. Dafür gelten ergänzend die Bedingungen von Stripe, denen du bei der Einrichtung zustimmst.</li>
                <li>
                  Du bietest nur erlaubte Waren an, beschreibst sie zutreffend, hältst dich an Produktsicherheits- und Kennzeichnungsvorschriften, versendest erst nach bestätigter Zahlung und hältst die angegebene
                  Bearbeitungszeit ein.
                </li>
                <li>Deine Versand- und Rückgabebedingungen stehen auf deiner Shop- bzw. Produktseite; gesetzliche Rechte der Käufer:innen gehen vor.</li>
              </ul>
            </>
          ),
        },
        {
          id: "kauf",
          title: "Kauf und Zahlung",
          body: (
            <ul>
              <li>
                Im Warenkorb entsteht je Shop eine eigene Bestellung. Beim Checkout reservieren wir die Artikel für {reservationMinutes} Minuten; wird in dieser Zeit nicht bezahlt, verfällt die Bestellung.
              </li>
              <li>
                Bezahlt wird über den Checkout von Stripe mit den dort angebotenen Zahlungsarten. {BRAND.name} nimmt die Zahlung über Stripe im Namen und für Rechnung des Shops entgegen; mit der erfolgreichen Zahlung im Checkout
                ist deine Zahlungspflicht gegenüber dem Shop erfüllt. Auf deiner Abrechnung kann {BRAND.name} als Empfänger erscheinen.
              </li>
              <li>Eine Bestellung gilt erst als bezahlt, wenn Stripe die Zahlung bestätigt hat. Zahle nie ausserhalb des Checkouts – etwa per Überweisung oder über einen Link aus einer Nachricht.</li>
              <li>Nach dem Versand bestätigst du den Erhalt in deiner Bestellung. Ohne Rückmeldung gilt eine versendete Bestellung {tage(autoCompleteDays)} nach dem Versand automatisch als abgeschlossen.</li>
              <li>Bewerten kannst du nur, was du gekauft hast – einmal je Bestellposition, sobald die Bestellung versendet oder abgeschlossen ist.</li>
            </ul>
          ),
        },
        {
          id: "gebuehren",
          title: "Gebühren und Auszahlungen für Shops",
          body: (
            <ul>
              <li>Ein Shop zu eröffnen und Angebote einzustellen ist kostenlos.</li>
              <li>
                Für jeden Verkauf erheben wir eine Provision von derzeit <strong>{pct(feeBps)} auf den Warenwert</strong> (ohne Versand); für Shops mit Creator Pro {pct(proFee)}. Die Provision wird bei der Zahlung automatisch
                einbehalten. Bei Erstattungen erstatten wir sie anteilig zurück.
              </li>
              <li>
                Ausser der Provision erhebt {BRAND.name} keine Gebühren. Ob Stripe für die Auszahlung oder eine Währungsumrechnung eigene Kosten berechnet, richtet sich nach den Bedingungen von Stripe und ist in deinem
                Stripe-Konto ersichtlich.
              </li>
              <li>
                Der Erlös einer Bestellung wird{" "}
                {holdDays > 0 ? (
                  <>
                    <strong>{tage(holdDays)} nach ihrem Abschluss</strong> auszahlbar (bei rein digitalen Bestellungen {tage(holdDays)} nach dem Kauf)
                  </>
                ) : (
                  <>nach ihrem Abschluss auszahlbar</>
                )}
                . Bis dahin bleibt er auf deinem Konto bei Stripe reserviert. Problemfälle und angefochtene Zahlungen werden erst nach ihrer Klärung freigegeben.
              </li>
              <li>
                Freigegebenes Guthaben zahlen wir nach deinem Auszahlungsplan (täglich, wöchentlich oder monatlich) oder auf deine Anfrage auf dein bei Stripe hinterlegtes Bankkonto aus.
              </li>
              <li>Änderungen der Provision kündigen wir mindestens 30 Tage im Voraus an. Bereits abgeschlossene Bestellungen sind davon nicht betroffen.</li>
            </ul>
          ),
        },
        {
          id: "erstattung",
          title: "Stornierung, Erstattung und Problemfälle",
          body: (
            <ul>
              <li>Vor dem Versand kann der Shop eine Bestellung mit Begründung stornieren; der bezahlte Betrag wird vollständig erstattet. Möchtest du als Käufer:in stornieren, wende dich über die Bestellung an den Shop.</li>
              <li>Der Shop kann Bestellungen ganz oder teilweise erstatten. Erstattungen laufen über Stripe auf das ursprüngliche Zahlungsmittel zurück und werden vom Guthaben des Shops abgezogen.</li>
              <li>
                Gibt es ein Problem – etwa eine fehlende oder mangelhafte Lieferung –, meldest du es über „Problem melden“ in der Bestellung. Der Shop wird benachrichtigt; der Erlös bleibt bis zur Klärung zurückgehalten. Findet ihr
                keine Lösung, vermitteln wir über <Link href="/einstellungen/hilfe-support">Hilfe & Support</Link>. Wir können eine Bestellung erstatten, wenn der Shop dies nicht mehr kann oder darf, etwa weil er gesperrt ist.
              </li>
              <li>
                Ficht jemand eine Zahlung bei der Bank oder dem Kartenherausgeber an, wird der Erlös bis zur Klärung zurückgehalten. Geht das Verfahren verloren, wird der angefochtene Betrag vom Guthaben des Shops zurückgeholt.
              </li>
              <li>Gesetzliche Rechte der Käufer:innen gegenüber dem Shop – etwa Gewährleistung oder ein Widerrufsrecht – bleiben unberührt.</li>
            </ul>
          ),
        },
        {
          id: "digital",
          title: "Digitale Produkte",
          body: (
            <ul>
              <li>Nach bestätigter Zahlung schalten wir den Download in deiner Bestellung frei. Die Anzahl der Downloads kann je Produkt begrenzt sein; die Grenze siehst du in der Bestellung.</li>
              <li>Der Shop legt die Lizenz fest. Ohne abweichende Angabe gilt: nur für den persönlichen Gebrauch, keine Weitergabe und kein Weiterverkauf der Datei.</li>
              <li>Wird eine Bestellung storniert oder vollständig erstattet, erlischt die Download-Berechtigung.</li>
              <li>Ein gesetzliches Widerrufsrecht für digitale Inhalte erlischt nur unter den gesetzlichen Voraussetzungen; dafür ist der jeweilige Shop verantwortlich.</li>
            </ul>
          ),
        },
        {
          id: "pro",
          title: "Creator Pro",
          body: (
            <>
              <p>
                Creator Pro ist ein freiwilliges Abo mit zusätzlichen Werkzeugen: Schaufenster und Pro-Kennzeichen im Profil, Medienkit, Statistiken über 12 Monate mit CSV-Export, längere Videos und eine tiefere Provision im
                Shop. Die Grundfunktionen von {BRAND.name} bleiben kostenlos; Pro verschafft keine bevorzugte Platzierung im Feed.
              </p>
              <ul>
                <li>
                  <strong>Preis:</strong> derzeit {formatMoney(priceMonth, "CHF")} pro Monat oder {formatMoney(priceYear, "CHF")} pro Jahr. Massgeblich ist der Preis, der dir vor dem Abschluss angezeigt wird.
                </li>
                <li>
                  <strong>Abrechnung:</strong> im Voraus für die gewählte Laufzeit über Stripe. Das Abo verlängert sich automatisch um dieselbe Laufzeit, wenn du es nicht vorher kündigst. Rechnungen findest du unter{" "}
                  <Link href="/studio/pro">Studio → Creator Pro</Link>, wo du auch dein Zahlungsmittel änderst.
                </li>
                <li>
                  <strong>Kündigung:</strong> jederzeit unter Studio → Creator Pro auf das Ende der laufenden Laufzeit. Bis dahin bleibt Pro aktiv; bereits bezahlte Zeiträume werden nicht anteilig erstattet, ausser bei einem
                  Widerruf (siehe unten). Deine Inhalte bleiben nach dem Ende von Pro erhalten. Löschst du dein Konto, endet das Abo sofort.
                </li>
                <li>
                  <strong>Preisänderungen</strong> für laufende Abos teilen wir mindestens 30 Tage vor Beginn der nächsten Laufzeit mit; du kannst bis dahin kündigen.
                </li>
                <li>Kann eine Zahlung nicht eingezogen werden, versucht Stripe es erneut. Bleibt die Zahlung aus, endet Pro.</li>
              </ul>
              <h3>Widerrufsrecht für Verbraucher:innen aus der EU bzw. dem EWR</h3>
              <p>
                Wohnst du als Verbraucher:in in der EU oder im EWR, kannst du den Vertrag über Creator Pro innerhalb von 14 Tagen ab Vertragsschluss ohne Angabe von Gründen widerrufen. Dafür genügt eine eindeutige Erklärung,
                etwa per E-Mail an <a href={withdrawMail}>{LEGAL.email}</a> oder per Post an {LEGAL.company}, {LEGAL_ADDRESS}. Zur Wahrung der Frist reicht es, die Erklärung vor Ablauf der 14 Tage abzusenden.
              </p>
              <p>
                Wir erstatten dir alle Zahlungen für das Abo unverzüglich, spätestens innerhalb von 14 Tagen nach Eingang des Widerrufs, über dasselbe Zahlungsmittel. Da Creator Pro auf deinen Wunsch sofort mit dem Abschluss
                beginnt, behalten wir für den Zeitraum bis zum Widerruf einen anteiligen Betrag ein.
              </p>
              <p>
                <strong>Muster für den Widerruf:</strong> „Hiermit widerrufe ich den von mir abgeschlossenen Vertrag über Creator Pro. Abgeschlossen am: … · Name: … · E-Mail-Adresse des Kontos: … · Datum: …“
              </p>
            </>
          ),
        },
        {
          id: "haftung",
          title: "Haftung",
          body: (
            <>
              <p>
                Wir haften für Schäden, die wir vorsätzlich oder grobfahrlässig verursachen, sowie nach zwingenden gesetzlichen Vorschriften, etwa für Personenschäden und nach dem Produktehaftpflichtgesetz. Im Übrigen ist unsere
                Haftung – soweit gesetzlich zulässig – ausgeschlossen, insbesondere für indirekte Schäden und entgangenen Gewinn.
              </p>
              <p>
                Für Inhalte der Mitglieder, für Angebote, Lieferungen und Leistungen der Shops, für Events von Mitgliedern und für Schäden aus dem Nachbau von Anleitungen sind die jeweiligen Mitglieder verantwortlich, nicht{" "}
                {BRAND.name}. Zwingende Verbraucherschutzvorschriften bleiben vorbehalten.
              </p>
            </>
          ),
        },
        {
          id: "verfuegbarkeit",
          title: "Verfügbarkeit und Weiterentwicklung",
          body: (
            <p>
              Wir bemühen uns um einen stabilen Betrieb, können aber keine ununterbrochene Verfügbarkeit garantieren – etwa bei Wartung, Störungen bei Dienstleistern oder höherer Gewalt. Wir entwickeln {BRAND.name} laufend weiter
              und dürfen Funktionen ändern, ergänzen oder einstellen, sofern das für dich zumutbar ist. Fallen kostenpflichtige Funktionen von Creator Pro wesentlich weg, kannst du das Abo mit sofortiger Wirkung kündigen und
              erhältst den Betrag für die verbleibende Laufzeit zurück.
            </p>
          ),
        },
        {
          id: "kuendigung",
          title: "Laufzeit, Kündigung und Sperrung",
          body: (
            <>
              <p>
                Der Nutzungsvertrag läuft auf unbestimmte Zeit. Du kannst ihn jederzeit beenden, indem du dein Konto unter <Link href="/einstellungen/konto">Konto & Daten</Link> löschst. Hat dein Shop offene Bestellungen, musst
                du diese zuvor versenden oder stornieren.
              </p>
              <p>
                Wir können den Vertrag mit einer Frist von 30 Tagen kündigen, aus wichtigem Grund – etwa bei schweren oder wiederholten Verstössen – auch fristlos. Offene Bestellungen werden ordnungsgemäss abgewickelt; freigegebenes
                Guthaben wird ausbezahlt, soweit keine Ansprüche entgegenstehen. Was beim Löschen eines Kontos mit deinen Daten geschieht, steht in der <Link href="/rechtliches/datenschutz#loeschung">Datenschutzerklärung</Link>.
              </p>
            </>
          ),
        },
        {
          id: "aenderungen",
          title: "Änderungen dieser Bedingungen",
          body: (
            <p>
              Wir können diese Bedingungen anpassen, etwa bei neuen Funktionen oder geänderter Rechtslage. Wesentliche Änderungen teilen wir angemeldeten Mitgliedern mindestens 30 Tage vor Inkrafttreten in der App oder per E-Mail
              mit. Bist du nicht einverstanden, kannst du dein Konto bis dahin löschen bzw. Creator Pro kündigen. Nutzt du {BRAND.name} nach dem Inkrafttreten weiter, gelten die geänderten Bedingungen.
            </p>
          ),
        },
        {
          id: "recht",
          title: "Anwendbares Recht und Gerichtsstand",
          body: (
            <>
              <p>
                Es gilt {LEGAL.law} unter Ausschluss des Übereinkommens der Vereinten Nationen über Verträge über den internationalen Warenkauf (UN-Kaufrecht). Gerichtsstand ist {LEGAL.venue}.
              </p>
              <p>
                Für Verbraucher:innen bleiben die zwingenden Verbraucherschutzvorschriften und Gerichtsstände ihres Wohnsitzstaates vorbehalten. Sollte eine Bestimmung dieser Bedingungen unwirksam sein, bleiben die übrigen
                Bestimmungen wirksam.
              </p>
            </>
          ),
        },
      ]}
    />
  );
}
