import Link from "next/link";
import type { Metadata } from "next";
import { computeFees, formatMoney } from "@werkraum/shared";
import { DoDont, FactList, LegalDoc } from "@/components/legal/legal-doc";
import { getSetting } from "@/server/settings";
import { BRAND } from "@/config/brand";

export const metadata: Metadata = { title: "Marktplatz-Richtlinien", alternates: { canonical: "/richtlinien/marktplatz" } };

export default async function MarketplaceGuidelinesPage() {
  const feeBps = await getSetting("commerce.feeBps");
  const pct = (feeBps / 100).toLocaleString("de-CH", { maximumFractionDigits: 2 });
  const proPct = (Math.min(feeBps, await getSetting("pro.feeBps")) / 100).toLocaleString("de-CH", { maximumFractionDigits: 2 });
  const example = computeFees(4500, 900, feeBps);

  return (
    <LegalDoc
      kicker="Richtlinien"
      title="Marktplatz-Richtlinien"
      updated="3. November 2026"
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
                <li><strong>Gewerblich</strong> – regelmässige Verkäufe mit Gewinnabsicht. Du gibst deine Anbieterangaben (Firma, Adresse, ggf. UID/MWST) an und erfüllst die Pflichten gegenüber Verbraucher:innen, z. B. Widerrufsrecht bei Käufen aus der EU.</li>
              </ul>
              <p>Alle Verkäufer werden über unseren Zahlungsdienstleister verifiziert, bevor Auszahlungen möglich sind. Wir prüfen neue Shops zusätzlich manuell.</p>
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
                  ["Zahlungsabwicklung", "Gebühren des Zahlungsdienstleisters, separat ausgewiesen"],
                  ["Auszahlung", "auf dein hinterlegtes Konto, gemäss Auszahlungsplan des Zahlungsdienstleisters"],
                ]}
              />
              <p>
                <strong>Beispiel:</strong> Ein Produkt für {formatMoney(example.subtotal)} plus {formatMoney(example.shipping)} Versand. Käufer:innen zahlen {formatMoney(example.total)}. Die Provision beträgt{" "}
                {formatMoney(example.platformFee)}, dir bleiben {formatMoney(example.sellerNet)} vor Gebühren des Zahlungsdienstleisters.
              </p>
              <p>Änderungen der Provision kündigen wir mindestens 30 Tage im Voraus an. Es gibt keine versteckten Gebühren und keine bezahlte Bevorzugung im Feed.</p>
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
                <li>Deine Rückgaberegeln stehen auf der Produktseite. Gesetzliche Rechte von Käufer:innen bleiben unberührt.</li>
              </ul>
              <p>Gibt es ein Problem, kannst du die Bestellung als „Problemfall“ markieren. Wir vermitteln bei Bedarf über <Link href="/einstellungen/hilfe-support">Hilfe & Support</Link>.</p>
            </>
          ),
        },
        {
          id: "bewertungen",
          title: "Bewertungen",
          body: <p>Bewerten kann nur, wer gekauft hat – einmal pro Bestellposition. Gekaufte, getauschte oder erzwungene Bewertungen sind verboten. Verkäufer:innen können öffentlich antworten, Bewertungen aber nicht löschen.</p>,
        },
        {
          id: "massnahmen",
          title: "Durchsetzung",
          body: <p>Bei Verstössen können wir Angebote deaktivieren, Shops pausieren oder sperren und Auszahlungen für die Dauer einer Prüfung zurückhalten. Offene Bestellungen werden ordentlich abgewickelt. Gegen Entscheidungen kannst du Einspruch erheben.</p>,
        },
      ]}
    />
  );
}
