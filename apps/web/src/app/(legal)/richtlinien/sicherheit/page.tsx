import Link from "next/link";
import type { Metadata } from "next";
import { LegalDoc } from "@/components/legal/legal-doc";
import { Notice } from "@/components/ui/misc";

export const metadata: Metadata = { title: "Sicherheit beim Selbermachen", alternates: { canonical: "/richtlinien/sicherheit" } };

export default function SafetyGuidelinesPage() {
  return (
    <LegalDoc
      kicker="Richtlinien"
      title="Sicherheit beim Selbermachen"
      updated="3. November 2026"
      intro={<>Gute Projekte beginnen mit sicherem Arbeiten. Diese Richtlinie gilt für alle, die Anleitungen schreiben, und für alle, die sie nachbauen. Wer eine Anleitung veröffentlicht, kennzeichnet Risiken in den betroffenen Schritten mit den passenden Sicherheitskategorien.</>}
      sections={[
        {
          id: "grundsatz",
          title: "Grundsätze",
          body: (
            <>
              <ul>
                <li>Arbeite nur mit Werkzeugen und Materialien, die du sicher beherrschst. Lies die Herstellerhinweise.</li>
                <li>Trage die passende Schutzausrüstung: Schutzbrille, Gehörschutz, Handschuhe, Atemschutz.</li>
                <li>Halte den Arbeitsplatz aufgeräumt, gut beleuchtet und belüftet. Kinder und Haustiere fern halten.</li>
                <li>Hab einen Erste-Hilfe-Kasten griffbereit und kenne die Notrufnummern (144 Sanität, 118 Feuerwehr, 145 Tox Info Suisse).</li>
              </ul>
              <Notice tone="warn" title="Wichtig">
                Anleitungen auf dieser Plattform stammen von Mitgliedern und werden nicht fachlich geprüft. Automatische Sicherheitshinweise und KI-gestützte Funktionen helfen beim Erkennen von Risiken, ersetzen aber keine
                professionelle Sicherheitsbeurteilung durch Fachpersonen.
              </Notice>
            </>
          ),
        },
        {
          id: "strom",
          title: "Strom",
          body: (
            <>
              <p>Arbeiten an der Hausinstallation (230 V / 400 V) dürfen in der Schweiz nur von Personen mit entsprechender Bewilligung ausgeführt werden (Niederspannungs-Installationsverordnung, NIV). Anleitungen dazu richten sich ausdrücklich an Fachpersonen.</p>
              <ul>
                <li>Elektronikprojekte bevorzugt mit Kleinspannung (bis 50 V AC / 120 V DC) und geprüften Netzteilen.</li>
                <li>Akkus (insbesondere Lithium) nie kurzschliessen, beschädigen oder unbeaufsichtigt laden.</li>
                <li>Netzbetriebene Eigenbauten nicht verkaufen, ohne die Konformitätsanforderungen zu erfüllen.</li>
              </ul>
            </>
          ),
        },
        {
          id: "hitze",
          title: "Hitze & Feuer",
          body: (
            <ul>
              <li>Löten, Wachs, Harz, Glas, Metall und Brennöfen erzeugen hohe Temperaturen. Nicht brennbare Unterlage und Löschmittel bereithalten.</li>
              <li>Kerzen mit passenden Dochten und Behältern herstellen; Brenntests unter Aufsicht durchführen.</li>
              <li>Heissklebepistolen und Bügeleisen nach Gebrauch ausschalten und sicher abstellen.</li>
            </ul>
          ),
        },
        {
          id: "chemie",
          title: "Chemikalien, Staub & Dämpfe",
          body: (
            <ul>
              <li>Sicherheitsdatenblätter und Gefahrensymbole (GHS) beachten – bei Harzen, Lacken, Lösungsmitteln, Beizen, Färbemitteln, Seifenlauge.</li>
              <li>Nur gut belüftet arbeiten, bei Bedarf mit Atemschutz (z.B. FFP2/FFP3 bei Schleifstaub, A2-Filter bei Lösemitteldämpfen).</li>
              <li>Nie unbekannte Stoffe mischen. Reste fachgerecht entsorgen, nicht in den Abfluss.</li>
              <li>Holzstaub (v.a. Hartholz) kann gesundheitsschädlich sein – Absaugung nutzen.</li>
            </ul>
          ),
        },
        {
          id: "werkzeuge",
          title: "Scharfe Werkzeuge & Elektrowerkzeuge",
          body: (
            <ul>
              <li>Schneide immer vom Körper weg und nutze Schneidunterlagen und Schutzhandschuhe.</li>
              <li>Schutzvorrichtungen an Sägen und Fräsen nie entfernen. Werkstücke sicher einspannen.</li>
              <li>Keine weite Kleidung, Schmuck oder offenen langen Haare an rotierenden Maschinen.</li>
              <li>Vor dem Werkzeugwechsel immer vom Strom trennen.</li>
            </ul>
          ),
        },
        {
          id: "kinder",
          title: "Kinderprodukte",
          body: (
            <>
              <p>Für Spielzeug und Produkte für Kinder gelten strenge Anforderungen (u.a. Spielzeugverordnung, EN 71).</p>
              <ul>
                <li>Keine verschluckbaren Kleinteile für Kinder unter 3 Jahren. Knöpfe, Augen und Perlen sicher befestigen.</li>
                <li>Nur speichelfeste, schadstoffarme Farben und Materialien verwenden.</li>
                <li>Keine Kordeln oder Bänder, die zur Strangulation führen können.</li>
                <li>Wer Kinderprodukte verkauft, kennzeichnet sie korrekt und dokumentiert die verwendeten Materialien.</li>
              </ul>
            </>
          ),
        },
        {
          id: "autoren",
          title: "Für Autor:innen von Anleitungen",
          body: (
            <>
              <ul>
                <li>Markiere riskante Schritte mit der passenden Kategorie (Strom, Hitze, Chemikalien, scharfe Werkzeuge, Elektrowerkzeuge, Kinderprodukt, Staub & Dämpfe) und schreibe einen konkreten Hinweis dazu.</li>
                <li>Nenne die nötige Schutzausrüstung in der Material- und Werkzeugliste.</li>
                <li>Beschreibe, was schiefgehen kann – und wie man es vermeidet.</li>
                <li>Aktualisiere die Anleitung, wenn dich jemand auf einen fehlerhaften Schritt hinweist. Gemeldete fehlerhafte Schritte prüfen wir vorrangig.</li>
              </ul>
              <p>Anleitungen, die zu illegalen oder bewusst gefährlichen Handlungen anleiten, entfernen wir (siehe <Link href="/richtlinien/community">Community-Richtlinien</Link>).</p>
            </>
          ),
        },
      ]}
    />
  );
}
