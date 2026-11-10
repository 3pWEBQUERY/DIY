import Link from "next/link";
import type { Metadata } from "next";
import { computeFees, formatMoney } from "@werkraum/shared";
import { DoDont, FactList, LegalDoc } from "@/components/legal/legal-doc";
import { getSetting } from "@/server/settings";
import { BRAND } from "@/config/brand";
import { LEGAL_UPDATED } from "@/config/legal";

export const metadata: Metadata = { title: "Marktplatz-Richtlinien", alternates: { canonical: "/richtlinien/marktplatz" } };


// Provision aus den Systemeinstellungen: regelmässig neu rendern statt beim Build einfrieren
export const revalidate = 300;

export default async function MarketplaceGuidelinesPage() {
  const feeBps = await getSetting("commerce.feeBps");
  const pct = (feeBps / 100).toLocaleString("de-CH", { maximumFractionDigits: 2 });
  const proPct = (Math.min(feeBps, await getSetting("pro.feeBps")) / 100).toLocaleString("de-CH", { maximumFractionDigits: 2 });
  const example = computeFees(4500, 900, feeBps);
  const [holdDays, autoCompleteDays] = await Promise.all([getSetting("commerce.payoutHoldDays"), getSetting("commerce.autoCompleteDays")]);
  // Akkusativ: „3 Tage nach dem Abschluss“
  const tage = (n: number) => `${n} ${n === 1 ? "Tag" : "Tage"}`;

  return (
    <LegalDoc
      kicker="Richtlinien"
      title="Marktplatz-Richtlinien"
      updated={LEGAL_UPDATED}
      intro={
        <>
          Der Marktplatz von {BRAND.name} ist für Dinge, die Menschen mit eigenen Händen gemacht haben – und für alles, was anderen hilft, selbst etwas zu machen. Er ist kein Ort für Massenware. Diese Regeln gelten für alle,
          die verkaufen oder kaufen.
        </>
      }
      sections={[
        {
          id: "erlaubt",
          title: "Was verkauft werden darf",
          body: (
            <DoDont
              dos={[
                "Selbst hergestellte Einzelstücke und Kleinserien",
                "Auftragsarbeiten (auf Bestellung gefertigt)",
                "DIY-Materialsets, die du selbst zusammenstellst",
                "Eigene digitale Anleitungen und Schnittmuster",
                "Upcycling- und Restaurationsarbeiten",
                "Eigene Fotos und Dokumentationen zum Nachbauen",
              ]}
              donts={[
                "Dropshipping und weiterverkaufte Fertigware",
                "Massenproduzierte Artikel, auch umetikettiert",
                "Fälschungen und Markenimitate",
                "Fremde Schnittmuster oder Anleitungen ohne Lizenz",
                "Waffen, Wirkstoffe, Medizinprodukte, Lebensmittel ohne Bewilligung",
                "Elektrogeräte an Netzspannung ohne Konformitätsnachweis",
              ]}
            />
          ),
        },
        {
          id: "verkaeufer",
          title: "Private & gewerbliche Verkäufer",
          body: (
            <>
              <p>Du gibst bei der Shop-Eröffnung an, ob du privat oder gewerblich verkaufst. Diese Angabe ist für Käufer:innen sichtbar, weil sich daraus unterschiedliche Rechte ergeben.</p>
              <ul>
                <li><strong>Privat</strong> – gelegentliche Verkäufe von Hobbyarbeiten. Gesetzliche Gewährleistung kann eingeschränkt sein; das Widerrufsrecht für Verbraucher gilt in der Regel nicht.</li>
                <li><strong>Gewerblich</strong> – regelmässige Verkäufe mit Gewinnabsicht. Firmenname, verantwortliche Person, Adresse und gegebenenfalls MWST-/USt-Nummer erscheinen auf deiner Shopseite. Du erfüllst die Pflichten gegenüber Verbraucher:innen selbst, z. B. das Widerrufsrecht bei Käufen aus der EU.</li>
              </ul>
              <p>
                Shops können von Personen und Unternehmen mit Sitz in der Schweiz, in Liechtenstein, Deutschland oder Österreich eröffnet werden. Jeder Shop wird über unseren Zahlungsdienstleister Stripe verifiziert und erst danach
                freigeschaltet. Wir können Shops zusätzlich prüfen und eine Freischaltung ablehnen.
              </p>
            </>
          ),
        },
        {
          id: "gebuehren",
          title: "Gebühren – transparent",
          body: (
            <>
              <FactList
                items={[
                  ["Shop eröffnen", "kostenlos"],
                  ["Angebote einstellen", "kostenlos"],
                  ["Provision", `${pct} % auf den Warenwert eines abgeschlossenen Verkaufs (ohne Versand); mit Creator Pro ${proPct} %`],
                  ["Weitere Gebühren", `keine von ${BRAND.name}; allfällige Kosten von Stripe für Auszahlung oder Währungsumrechnung siehst du in deinem Stripe-Konto`],
                  ["Auszahlung", "auf dein bei Stripe hinterlegtes Bankkonto – nach deinem Auszahlungsplan (täglich, wöchentlich oder monatlich) oder jederzeit auf Anfrage"],
                  ["Haltefrist", holdDays > 0 ? `Der Erlös einer Bestellung wird ${tage(holdDays)} nach ihrem Abschluss auszahlbar – abgeschlossen ist sie mit der Erhaltsbestätigung, spätestens automatisch ${tage(autoCompleteDays)} nach dem Versand. Digitale Produkte: ${tage(holdDays)} nach dem Kauf.` : "keine – der Erlös ist nach Zahlungseingang auszahlbar"],
                ]}
              />
              <p>
                <strong>Beispiel:</strong> Ein Produkt für {formatMoney(example.subtotal)} plus {formatMoney(example.shipping)} Versand. Käufer:innen zahlen {formatMoney(example.total)}. Die Provision beträgt{" "}
                {formatMoney(example.platformFee)}, dir bleiben {formatMoney(example.sellerNet)} – vor allfälligen Kosten von Stripe für Auszahlung oder Währungsumrechnung.
              </p>
              <p id="auszahlungen">
                <strong>Warum eine Haltefrist?</strong> Bis eine Bestellung angekommen ist, bleibt der Erlös auf deinem Konto beim Zahlungsdienstleister reserviert. So lassen sich
                Reklamationen und Erstattungen direkt abwickeln, ohne dass du Geld zurücküberweisen musst. Problemfälle und angefochtene Zahlungen werden erst nach ihrer Klärung freigegeben.
              </p>
              <p>Bei einer Erstattung erstatten wir die Provision anteilig zurück. Änderungen der Provision kündigen wir mindestens 30 Tage im Voraus an. Es gibt keine bezahlte Bevorzugung im Feed.</p>
            </>
          ),
        },
        {
          id: "angebote",
          title: "Angebote richtig beschreiben",
          body: (
            <ul>
              <li>Eigene, aktuelle Fotos des tatsächlichen Produkts – keine Stockbilder.</li>
              <li>Ehrliche Angaben zu Material, Massen, Herstellungszeit, Versandkosten und Rückgabe.</li>
              <li>Sicherheitshinweise, wo nötig (z. B. Kerzen, Kinderprodukte, Kosmetik, Elektronik). Für Kinderspielzeug gelten besondere Anforderungen an Kleinteile, Materialien und Kennzeichnung.</li>
              <li>Preise inklusive aller Pflichtabgaben, in der Shopwährung.</li>
              <li>Verbinde Produkte mit dem zugehörigen Projekt – Käufer:innen sehen so, wie es entstanden ist.</li>
            </ul>
          ),
        },
        {
          id: "bestellungen",
          title: "Bestellungen, Versand & Rückgabe",
          body: (
            <>
              <ul>
                <li>„Bezahlt“ gilt eine Bestellung erst, wenn der Zahlungsdienstleister die Zahlung bestätigt hat. Versende nie vorher.</li>
                <li>Halte die angegebene Bearbeitungszeit ein und teile die Sendungsverfolgung, wo verfügbar.</li>
                <li>Kommuniziere über die Bestellnachrichten. Zahlungen ausserhalb des Checkouts sind nicht erlaubt – sie sind die häufigste Betrugsmasche.</li>
                <li>Deine Versand- und Rückgaberegeln stehen auf der Shop- und Produktseite. Gesetzliche Rechte von Käufer:innen bleiben unberührt.</li>
                <li>Vor dem Versand kannst du eine Bestellung mit Begründung stornieren – der Betrag wird vollständig erstattet. Teil- und Vollerstattungen löst du in der Bestellung aus.</li>
                <li>Ohne Erhaltsbestätigung gilt eine versendete Bestellung {tage(autoCompleteDays)} nach dem Versand automatisch als abgeschlossen.</li>
              </ul>
              <p>
                Gibt es ein Problem, melden Käufer:innen es über „Problem melden“ in der Bestellung; der Erlös bleibt bis zur Klärung zurückgehalten. Wir vermitteln bei Bedarf über{" "}
                <Link href="/einstellungen/hilfe-support">Hilfe & Support</Link>. Wird eine Zahlung bei der Bank angefochten und das Verfahren verloren, wird der Betrag von deinem Guthaben zurückgeholt.
              </p>
            </>
          ),
        },
        {
          id: "bewertungen",
          title: "Bewertungen",
          body: <p>Bewerten kann nur, wer gekauft hat – einmal pro Bestellposition, sobald die Bestellung versendet oder abgeschlossen ist. Gekaufte, getauschte oder erzwungene Bewertungen sind verboten. Shops können öffentlich antworten, Bewertungen aber nicht löschen. Unzulässige Bewertungen kannst du melden.</p>,
        },
        {
          id: "massnahmen",
          title: "Durchsetzung",
          body: <p>Bei Verstössen können wir Angebote deaktivieren, Shops sperren und Auszahlungen für die Dauer einer Prüfung zurückhalten. Zahlungen, die nach einer Sperre noch eingehen, werden automatisch erstattet. Gegen Entscheidungen kannst du innerhalb von 14 Tagen Einspruch erheben. Weitere Regeln stehen in den <Link href="/rechtliches/agb#verkaeufer">Nutzungsbedingungen</Link>.</p>,
        },
      ]}
    />
  );
}
