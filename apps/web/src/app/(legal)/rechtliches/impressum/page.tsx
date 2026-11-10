import Link from "next/link";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { LegalDoc, FactList } from "@/components/legal/legal-doc";
import { BRAND } from "@/config/brand";
import { LEGAL, LEGAL_BRAND, LEGAL_ROBOTS, legalValue } from "@/config/legal";

export const metadata: Metadata = { title: "Impressum", alternates: { canonical: "/rechtliches/impressum" }, robots: LEGAL_ROBOTS };

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
                ["Plattform", LEGAL_BRAND],
                ["Betreiberin", legalValue("company", "Firma")],
                ["Rechtsform", legalValue("legalForm", "Rechtsform, z. B. GmbH")],
                ["Adresse", `${legalValue("address", "Adresse")}, Schweiz`],
                ["Handelsregister", `${legalValue("register", "Handelsregisteramt des Kantons …")}, UID ${legalValue("uid", "CHE-xxx.xxx.xxx")}`],
                ...(LEGAL.vat ? [["MWST-Nummer", LEGAL.vat] as [string, string]] : []),
                ["Vertretungsberechtigt", legalValue("representative", "Name der Geschäftsführung")],
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
                  ...(LEGAL.phone ? [["Telefon", <a key="t" href={`tel:${LEGAL.phone.replace(/\s/g, "")}`}>{LEGAL.phone}</a>] as [string, ReactNode]] : []),
                  ["Support", <Link key="s" href="/kontakt">Kontaktseite (auch ohne Konto)</Link>],
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
