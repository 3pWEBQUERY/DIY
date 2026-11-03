import Link from "next/link";
import type { Metadata } from "next";
import { LegalDoc } from "@/components/legal/legal-doc";
import { BRAND } from "@/config/brand";

export const metadata: Metadata = { title: "Urheberrecht", alternates: { canonical: "/richtlinien/urheberrecht" } };

export default function CopyrightPage() {
  return (
    <LegalDoc
      kicker="Richtlinien"
      title="Urheberrecht & Meldeverfahren"
      updated="3. November 2026"
      intro={<>Kreative Arbeit verdient Schutz. Wer ein Schnittmuster entwirft, eine Anleitung schreibt oder ein Projekt fotografiert, entscheidet selbst, was damit geschieht. Hier erfährst du, was erlaubt ist und wie du eine Verletzung meldest.</>}
      sections={[
        {
          id: "grundsatz",
          title: "Was geschützt ist",
          body: (
            <>
              <p>Geschützt sind insbesondere Fotos, Texte, Anleitungen, Schnittmuster, Zeichnungen und Designs mit individuellem Charakter. Nicht geschützt sind blosse Ideen und Techniken – eine Häkelmasche gehört niemandem, die konkrete Anleitung schon.</p>
              <ul>
                <li><strong>Erlaubt:</strong> ein Projekt nach einer Anleitung nachbauen und dein Ergebnis zeigen – mit Verweis auf das Original.</li>
                <li><strong>Nicht erlaubt:</strong> fremde Fotos, Anleitungstexte oder Muster hochladen, abschreiben oder verkaufen.</li>
                <li><strong>Nur mit Erlaubnis:</strong> Produkte nach einer fremden Anleitung verkaufen. Viele Designer:innen erlauben das unter Bedingungen – prüfe die Lizenz.</li>
              </ul>
            </>
          ),
        },
        {
          id: "melden",
          title: "Eine Verletzung melden",
          body: (
            <>
              <p>Bist du Rechteinhaber:in (oder bevollmächtigt) und siehst dein Werk ohne Erlaubnis, melde es auf einem dieser Wege:</p>
              <ul>
                <li>Direkt beim Inhalt über „Melden“ → „Urheberrechtsverletzung“. Das ist der schnellste Weg.</li>
                <li>Per E-Mail an <a href={`mailto:${BRAND.supportEmail}?subject=Urheberrechtsmeldung`}>{BRAND.supportEmail}</a> mit dem Betreff „Urheberrechtsmeldung“.</li>
              </ul>
              <h3>Deine Meldung sollte enthalten</h3>
              <ul>
                <li>Name und Kontaktangaben (bei Vertretung: Nachweis der Vollmacht)</li>
                <li>Beschreibung des geschützten Werks, idealerweise mit Link zum Original oder Veröffentlichungsnachweis</li>
                <li>Link zum beanstandeten Inhalt auf {BRAND.name}</li>
                <li>Die Erklärung, dass du in gutem Glauben handelst und die Angaben zutreffen</li>
              </ul>
            </>
          ),
        },
        {
          id: "ablauf",
          title: "Wie wir vorgehen",
          body: (
            <ol className="space-y-3">
              {[
                ["Eingang", "Du erhältst eine Fallnummer. Wir prüfen die Meldung auf Vollständigkeit."],
                ["Prüfung", "Ist die Verletzung offensichtlich, blenden wir den Inhalt aus oder entfernen ihn, Produkte werden deaktiviert."],
                ["Information", "Die betroffene Person erhält eine Begründung und kann innerhalb von 14 Tagen Einspruch erheben oder eine Gegendarstellung einreichen."],
                ["Wiederholung", "Bei wiederholten Verletzungen sperren wir Konten zeitweise oder dauerhaft."],
              ].map(([t, d], i) => (
                <li key={t} className="!pl-0 before:!hidden">
                  <span className="mr-3 font-mono text-[11px] text-muted">{String(i + 1).padStart(2, "0")}</span>
                  <strong>{t}.</strong> {d}
                </li>
              ))}
            </ol>
          ),
        },
        {
          id: "gegendarstellung",
          title: "Gegendarstellung",
          body: <p>Wurde dein Inhalt entfernt und bist du überzeugt, dass du berechtigt bist (z.B. mit Lizenz oder als Urheber:in), nutze den Einspruchslink in der Benachrichtigung. Lege deine Belege bei. Bei widersprüchlichen Angaben können wir die Parteien auf den Rechtsweg verweisen.</p>,
        },
        {
          id: "missbrauch",
          title: "Missbrauch",
          body: <p>Wissentlich falsche Meldungen – etwa um Mitbewerber:innen zu schaden – verstossen gegen die <Link href="/richtlinien/community">Community-Richtlinien</Link> und können rechtliche Folgen haben.</p>,
        },
      ]}
    />
  );
}
