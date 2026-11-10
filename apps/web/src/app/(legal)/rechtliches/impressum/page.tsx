import Link from "next/link";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { LegalDoc, FactList } from "@/components/legal/legal-doc";
import { BRAND } from "@/config/brand";
import { LEGAL, LEGAL_BRAND, LEGAL_ROBOTS, LEGAL_UPDATED, legalValue } from "@/config/legal";

export const metadata: Metadata = {
  title: "Impressum",
  description: `Anbieterangaben und Kontakt von ${BRAND.name}.`,
  alternates: { canonical: "/rechtliches/impressum" },
  robots: LEGAL_ROBOTS,
};

/** Optionale Zeile – nur, wenn die Angabe vorhanden ist. */
const row = (label: string, value: string | null): [string, ReactNode][] => (value ? [[label, value]] : []);

export default function ImpressumPage() {
  return (
    <LegalDoc
      kicker="Rechtliches"
      title="Impressum"
      updated={LEGAL_UPDATED}
      intro={<>Angaben gemäss Art. 3 Abs. 1 lit. s des Bundesgesetzes gegen den unlauteren Wettbewerb (UWG) sowie – soweit anwendbar – § 5 Digitale-Dienste-Gesetz (Deutschland) und § 5 E-Commerce-Gesetz (Österreich).</>}
      sections={[
        {
          id: "anbieter",
          title: "Anbieter",
          body: (
            <>
              <FactList
                items={[
                  ["Plattform", `${LEGAL_BRAND} (werkuno.ch)`],
                  ["Betreiber", LEGAL.company],
                  ["Rechtsform", LEGAL.legalForm],
                  [
                    "Adresse",
                    <address key="a" className="not-italic">
                      {LEGAL.street}
                      <br />
                      {LEGAL.city}
                      <br />
                      {LEGAL.country}
                    </address>,
                  ],
                  ...row("Handelsregister", legalValue("register")),
                  ...row("UID", legalValue("uid")),
                  ...row("MWST-Nummer", legalValue("vat")),
                ]}
              />
              <p>Verantwortlich für den Inhalt dieser Website und die redaktionellen Inhalte von {BRAND.name} ist {LEGAL.company}, Anschrift wie oben.</p>
            </>
          ),
        },
        {
          id: "kontakt",
          title: "Kontakt",
          body: (
            <>
              <FactList
                items={[
                  ["E-Mail", <a key="m" href={`mailto:${LEGAL.email}`}>{LEGAL.email}</a>],
                  ["Telefon", <a key="t" href={LEGAL.phoneHref}>{LEGAL.phone}</a>],
                  ["Support", <Link key="s" href="/kontakt">Alle Kontaktwege (auch ohne Konto)</Link>],
                ]}
              />
              <p>
                Inhalte auf der Plattform meldest du am schnellsten mit der Funktion „Melden“ direkt beim Inhalt – deine Meldung erhält dann eine Fallnummer. Urheberrechtsverletzungen kannst du auch per E-Mail melden, siehe{" "}
                <Link href="/richtlinien/urheberrecht">Urheberrecht & Meldeverfahren</Link>.
              </p>
            </>
          ),
        },
        {
          id: "inhalte",
          title: "Inhalte der Mitglieder und Angebote im Marktplatz",
          body: (
            <>
              <p>
                {BRAND.name} ist eine Plattform, auf der Mitglieder eigene Inhalte veröffentlichen. Für diese Inhalte sind die jeweiligen Mitglieder verantwortlich. Wir prüfen Inhalte nicht vor der Veröffentlichung. Erhalten wir
                Kenntnis von rechtswidrigen Inhalten, prüfen wir sie und sperren oder entfernen sie, wenn sie rechtswidrig sind oder gegen unsere{" "}
                <Link href="/richtlinien/community">Community-Richtlinien</Link> verstossen.
              </p>
              <p>
                Kaufverträge im Marktplatz kommen zwischen Käufer:in und Verkäufer:in zustande. Für Angebote, Lieferung und Gewährleistung sind die jeweiligen Shops verantwortlich. Gewerbliche Shops nennen ihre Anbieterangaben auf
                ihrer Shopseite und bei ihren Produkten. Details stehen in den <Link href="/rechtliches/agb">Nutzungsbedingungen</Link>.
              </p>
            </>
          ),
        },
        {
          id: "links",
          title: "Externe Links",
          body: (
            <p>
              Für Inhalte externer Websites, auf die verlinkt wird, sind ausschliesslich deren Betreiber verantwortlich. Bezugsquellen im Bereich Materialien, für die wir bei einem Kauf eine Provision erhalten, sind als
              „Partnerlink“ gekennzeichnet.
            </p>
          ),
        },
        {
          id: "streit",
          title: "Streitbeilegung",
          body: <p>Wir sind nicht verpflichtet und nehmen nicht an Streitbeilegungsverfahren vor einer Verbraucherschlichtungsstelle teil. Bei Fragen oder Beschwerden wende dich bitte direkt an uns – wir suchen gerne eine Lösung.</p>,
        },
      ]}
    />
  );
}
