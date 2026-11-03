import Link from "next/link";
import type { Metadata } from "next";
import { LegalDoc, FactList } from "@/components/legal/legal-doc";
import { BRAND } from "@/config/brand";

export const metadata: Metadata = { title: "Impressum", alternates: { canonical: "/rechtliches/impressum" } };

export default function ImpressumPage() {
  return (
    <LegalDoc
      kicker="Rechtliches"
      title="Impressum"
      updated="3. November 2026"
      intro={<>Angaben gemäss Art. 3 Abs. 1 lit. s UWG (Schweiz) sowie – soweit anwendbar – § 5 DDG (Deutschland) und § 25 MedienG (Österreich).</>}
      sections={[
        {
          id: "anbieter",
          title: "Anbieterin",
          body: (
            <FactList
              items={[
                ["Plattform", `${BRAND.name} (Arbeitstitel)`],
                ["Betreiberin", "[Firma]"],
                ["Rechtsform", "[Rechtsform, z.B. GmbH]"],
                ["Adresse", "[Adresse], Schweiz"],
                ["Handelsregister", "[Handelsregisteramt des Kantons …], UID [CHE-xxx.xxx.xxx]"],
                ["MWST-Nummer", "[CHE-xxx.xxx.xxx MWST]"],
                ["Vertretungsberechtigt", "[Name der Geschäftsführung]"],
              ]}
            />
          ),
        },
        {
          id: "kontakt",
          title: "Kontakt",
          body: (
            <>
              <FactList
                items={[
                  ["E-Mail", <a key="m" href={`mailto:${BRAND.supportEmail}`}>{BRAND.supportEmail}</a>],
                  ["Telefon", "[+41 xx xxx xx xx]"],
                  ["Support", <Link key="s" href="/einstellungen/hilfe-support">Formular „Hilfe & Support“</Link>],
                ]}
              />
              <p>Für Meldungen zu Inhalten nutze bitte die Funktion „Melden“ direkt beim Inhalt. So erhält dein Anliegen eine Fallnummer und wird priorisiert bearbeitet.</p>
            </>
          ),
        },
        {
          id: "inhalte",
          title: "Verantwortung für Inhalte",
          body: (
            <>
              <p>
                {BRAND.name} ist eine Plattform, auf der Mitglieder eigene Inhalte veröffentlichen. Für diese Inhalte sind die jeweiligen Mitglieder verantwortlich. Wir prüfen Inhalte nicht vor der Veröffentlichung, gehen aber jedem
                Hinweis auf rechtswidrige Inhalte nach und entfernen sie, sobald wir davon Kenntnis erhalten (siehe <Link href="/richtlinien/community">Community-Richtlinien</Link> und{" "}
                <Link href="/richtlinien/urheberrecht">Urheberrecht</Link>).
              </p>
              <p>Für Angebote im Marktplatz sind die jeweiligen Verkäuferinnen und Verkäufer verantwortlich. Gewerbliche Verkäufer geben ihre Anbieterangaben auf ihrer Shopseite an.</p>
            </>
          ),
        },
        {
          id: "links",
          title: "Externe Links",
          body: <p>Für Inhalte externer Websites, auf die verlinkt wird, sind ausschliesslich deren Betreiber verantwortlich. Zum Zeitpunkt der Verlinkung waren keine Rechtsverstösse erkennbar.</p>,
        },
        {
          id: "streit",
          title: "Streitbeilegung",
          body: (
            <p>
              Wir sind nicht verpflichtet und nicht bereit, an Streitbeilegungsverfahren vor einer Verbraucherschlichtungsstelle teilzunehmen. Die Plattform der EU-Kommission zur Online-Streitbeilegung findest du unter
              {" "}<a href="https://ec.europa.eu/consumers/odr" rel="noopener noreferrer">ec.europa.eu/consumers/odr</a> [Anwendbarkeit vor Launch prüfen].
            </p>
          ),
        },
      ]}
    />
  );
}
