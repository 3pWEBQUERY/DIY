import Link from "next/link";
import type { Metadata } from "next";
import { LegalDoc } from "@/components/legal/legal-doc";
import { BRAND } from "@/config/brand";
import { LEGAL_BRAND, LEGAL_ROBOTS, legalValue } from "@/config/legal";

export const metadata: Metadata = { title: "Nutzungsbedingungen", alternates: { canonical: "/rechtliches/agb" }, robots: LEGAL_ROBOTS };

export default function TermsPage() {
  return (
    <LegalDoc
      kicker="Rechtliches"
      title="Nutzungsbedingungen"
      updated="3. November 2026"
      intro={
        <>
          Diese Bedingungen regeln die Nutzung von {BRAND.name} – dem Netzwerk für Menschen, die mit den eigenen Händen erschaffen. Kurz gesagt: Deine Werke bleiben deine. Du teilst sie mit Respekt, und wir stellen
          einen sicheren, fairen Ort dafür bereit.
        </>
      }
      sections={[
        {
          id: "geltung",
          title: "Geltungsbereich & Vertragspartner",
          body: (
            <>
              <p>Vertragspartnerin ist {LEGAL_BRAND}, {legalValue("company", "Firma")}, {legalValue("address", "Adresse")}, Schweiz („wir“). Die Bedingungen gelten für Website, Apps und Schnittstellen.</p>
              <p>Für Käufe im Marktplatz gelten ergänzend die <Link href="/richtlinien/marktplatz">Marktplatz-Richtlinien</Link>. Der Kaufvertrag kommt dabei zwischen Käufer:in und Verkäufer:in zustande – nicht mit uns.</p>
            </>
          ),
        },
        {
          id: "konto",
          title: "Konto & Mindestalter",
          body: (
            <>
              <ul>
                <li>Die Nutzung ist ab <strong>18 Jahren</strong> möglich. Mit der Registrierung bestätigst du, volljährig zu sein.</li>
                <li>Du machst wahrheitsgemässe Angaben, hältst dein Passwort geheim und informierst uns bei Verdacht auf Missbrauch.</li>
                <li>Pro Person ein persönliches Konto. Konten dürfen nicht verkauft oder übertragen werden.</li>
                <li>Dein Benutzername darf keine Marken, Personen oder Organisationen imitieren.</li>
              </ul>
            </>
          ),
        },
        {
          id: "inhalte",
          title: "Deine Inhalte & Rechte",
          body: (
            <>
              <p>
                <strong>Du bleibst Urheber:in.</strong> Alle Rechte an Projekten, Fotos, Anleitungen, Schnittmustern, Texten und anderen Werken, die du veröffentlichst, bleiben bei dir.
              </p>
              <p>
                Damit wir die Plattform betreiben können, räumst du uns eine <strong>einfache, unentgeltliche, weltweite Lizenz</strong> ein, deine Inhalte im Rahmen von {BRAND.name} zu speichern, technisch anzupassen (z. B.
                Bildgrössen), anzuzeigen, zu verbreiten und innerhalb der Plattform – etwa in Entdecken, redaktionellen Kollektionen oder Newslettern der Plattform – mit Namensnennung hervorzuheben. Die Lizenz endet, wenn du einen
                Inhalt oder dein Konto löschst; ausgenommen sind Kopien, die andere bereits rechtmässig geteilt haben (z. B. ein Repost mit Einordnung), sowie Sicherungskopien bis zu ihrer regulären Löschung.
              </p>
              <p>Wir nutzen deine Inhalte nicht ausserhalb der Plattform für Werbung und verkaufen sie nicht. Für jede darüber hinausgehende Nutzung fragen wir dich vorher.</p>
              <p>
                Du versicherst, dass du die nötigen Rechte an deinen Inhalten besitzt – auch an Fotos, Mustern und Musik –, und dass erkennbare Personen mit der Veröffentlichung einverstanden sind. Nachbauten (Remixe) kennzeichnest
                du mit einem Verweis auf das Original.
              </p>
            </>
          ),
        },
        {
          id: "nutzung",
          title: "Nutzung fremder Inhalte",
          body: (
            <p>
              Inhalte anderer Mitglieder darfst du ansehen, speichern und für den privaten Gebrauch nachbauen. Kommerzielle Nutzung – etwa der Verkauf von Produkten nach einer fremden Anleitung oder die Weitergabe eines Schnittmusters –
              ist nur erlaubt, wenn die Urheber:in das ausdrücklich gestattet. Kostenpflichtige Anleitungen sind für den persönlichen Gebrauch lizenziert und dürfen nicht weitergegeben werden.
            </p>
          ),
        },
        {
          id: "verhalten",
          title: "Verhalten & Moderation",
          body: (
            <>
              <p>Es gelten die <Link href="/richtlinien/community">Community-Richtlinien</Link>. Bei Verstössen können wir je nach Schwere Inhalte in der Reichweite beschränken, ausblenden oder entfernen, Angebote deaktivieren, Funktionen einschränken oder Konten zeitweise bzw. dauerhaft sperren.</p>
              <p>Jede Entscheidung wird begründet. Du kannst innerhalb von 14 Tagen Einspruch erheben; eine andere Person aus dem Team prüft ihn. Gesetzliche Rechtsbehelfe bleiben unberührt.</p>
            </>
          ),
        },
        {
          id: "sicherheit",
          title: "Anleitungen & Sicherheit",
          body: (
            <p>
              Anleitungen werden von Mitgliedern erstellt. Wir prüfen sie nicht fachlich. Das Nachbauen geschieht auf eigene Verantwortung; beachte die <Link href="/richtlinien/sicherheit">Sicherheitsrichtlinien</Link> und die
              Hinweise der Hersteller von Werkzeugen und Materialien. Automatische Hinweise oder KI-gestützte Funktionen ersetzen keine fachkundige Sicherheitsbeurteilung.
            </p>
          ),
        },
        {
          id: "marktplatz",
          title: "Marktplatz & Gebühren",
          body: (
            <ul>
              <li>Das Mitmachen in der Community ist kostenlos.</li>
              <li>Für Verkäufe erheben wir eine Provision von derzeit <strong>6 % auf den Warenwert</strong> (ohne Versand), die vor dem Kauf transparent ausgewiesen wird. Gebühren des Zahlungsdienstleisters werden separat abgerechnet.</li>
              <li>Änderungen der Provision kündigen wir mindestens 30 Tage im Voraus an.</li>
              <li>Zahlungen und Auszahlungen laufen über einen Zahlungsdienstleister; dessen Bedingungen gelten ergänzend.</li>
            </ul>
          ),
        },
        {
          id: "verfuegbarkeit",
          title: "Verfügbarkeit & Änderungen",
          body: <p>Wir entwickeln {BRAND.name} laufend weiter und bemühen uns um hohe Verfügbarkeit, können aber keinen unterbrechungsfreien Betrieb garantieren. Wesentliche Änderungen dieser Bedingungen kündigen wir vorab an; widersprichst du nicht innerhalb von 30 Tagen, gelten sie als angenommen. Du kannst dein Konto jederzeit löschen.</p>,
        },
        {
          id: "haftung",
          title: "Haftung",
          body: <p>Wir haften unbeschränkt für Vorsatz und grobe Fahrlässigkeit. Im Übrigen ist die Haftung – soweit gesetzlich zulässig – ausgeschlossen, insbesondere für Inhalte von Mitgliedern und für Schäden aus dem Nachbau von Anleitungen. Zwingende Verbraucherschutzvorschriften bleiben vorbehalten. [Formulierung juristisch prüfen]</p>,
        },
        {
          id: "kuendigung",
          title: "Kündigung",
          body: <p>Du kannst den Vertrag jederzeit durch Löschen deines Kontos beenden. Wir können ihn mit 30 Tagen Frist kündigen, bei schweren Verstössen fristlos. Offene Bestellungen werden ordnungsgemäss abgewickelt.</p>,
        },
        {
          id: "recht",
          title: "Anwendbares Recht & Gerichtsstand",
          body: <p>Es gilt Schweizer Recht unter Ausschluss des UN-Kaufrechts. Gerichtsstand ist {legalValue("venue", "Ort")}, Schweiz. Für Verbraucher:innen gelten zusätzlich die zwingenden Gerichtsstände und Schutzvorschriften ihres Wohnsitzstaates.</p>,
        },
      ]}
    />
  );
}
