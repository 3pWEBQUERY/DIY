import Link from "next/link";
import type { Metadata } from "next";
import { MODERATION_ACTIONS, MODERATION_ACTION_LABEL } from "@werkraum/shared";
import { DoDont, LegalDoc } from "@/components/legal/legal-doc";
import { BRAND } from "@/config/brand";
import { LEGAL_UPDATED } from "@/config/legal";

export const metadata: Metadata = { title: "Community-Richtlinien", alternates: { canonical: "/richtlinien/community" } };

export default function CommunityGuidelinesPage() {
  return (
    <LegalDoc
      kicker="Richtlinien"
      title="Community-Richtlinien"
      updated={LEGAL_UPDATED}
      intro={
        <>
          {BRAND.name} lebt davon, dass Menschen ihre Projekte zeigen – auch die halbfertigen, die schiefen und die gescheiterten. Damit das so bleibt, braucht es einen Ort, an dem man sich sicher fühlt. Diese Richtlinien
          beschreiben, wie wir miteinander umgehen.
        </>
      }
      sections={[
        {
          id: "grundsatz",
          title: "Unser Grundsatz",
          body: (
            <>
              <p><strong>Konstruktiv, ehrlich, hilfsbereit.</strong> Kritik ist willkommen, wenn sie hilft: „Die Naht würde mit einem Steppstich halten“ statt „Sieht schlecht aus“. Anfänger:innen sind hier genauso richtig wie Profis.</p>
              <DoDont
                dos={["Fortschritte zeigen, auch unperfekte", "Fragen stellen und beantworten", "Nachbauten mit Verweis aufs Original teilen", "Sachliche, konkrete Kritik", "Fehler und Lösungen im Journal dokumentieren"]}
                donts={["Herabsetzende Kommentare über Können oder Aussehen", "Fremde Werke als eigene ausgeben", "Massenhaft gleiche Kommentare oder Werbung", "Andere unter Druck setzen oder bedrängen", "Diskussionen gezielt eskalieren"]}
              />
            </>
          ),
        },
        {
          id: "respekt",
          title: "Respekt & Sicherheit",
          body: (
            <ul>
              <li><strong>Keine Belästigung:</strong> keine Beleidigungen, Drohungen, Stalking oder unerwünschte Kontaktaufnahmen – auch nicht über Nachrichten.</li>
              <li><strong>Kein Hass:</strong> keine Abwertung von Menschen wegen Herkunft, Religion, Geschlecht, sexueller Orientierung, Behinderung, Alter oder anderer Merkmale.</li>
              <li><strong>Privatsphäre:</strong> keine Veröffentlichung privater Daten anderer (Adressen, Telefonnummern, Fotos ohne Einwilligung).</li>
              <li><strong>Kinder:</strong> Fotos von Kindern nur mit Einwilligung der Sorgeberechtigten und ohne erkennbare Gesichter oder Namen.</li>
              <li><strong>Keine unangemessenen Inhalte:</strong> keine sexualisierten oder gewaltverherrlichenden Darstellungen.</li>
            </ul>
          ),
        },
        {
          id: "echtheit",
          title: "Echtheit & Urheberschaft",
          body: (
            <>
              <ul>
                <li>Zeige, was du selbst gemacht hast. Inspiration ist willkommen – kennzeichne sie als „Nachbau“ oder „Inspiriert von“.</li>
                <li>Keine Fake-Konten, keine gekauften Follower, keine Interaktions-Ringe.</li>
                <li>KI-generierte Bilder sind als solche zu kennzeichnen und dürfen nicht als handgemachtes Ergebnis präsentiert werden.</li>
                <li>Werbung und bezahlte Kooperationen kennzeichnest du deutlich. Beiträge mit verknüpftem Produkt werden automatisch als Verkaufspost markiert.</li>
              </ul>
              <p>Zu Urheberrechten und dem Meldeverfahren: <Link href="/richtlinien/urheberrecht">Urheberrecht</Link>.</p>
            </>
          ),
        },
        {
          id: "gefahr",
          title: "Gefährliche Inhalte",
          body: (
            <p>
              Anleitungen mit erheblichem Verletzungsrisiko – etwa Arbeiten an Netzspannung, mit Chemikalien oder Hitze – brauchen klare Sicherheitshinweise. Anleitungen, die bewusst zu Gefährdungen anleiten (z. B. Waffen,
              Sprengstoffe, Umgehung von Sicherheitseinrichtungen), sind verboten. Details: <Link href="/richtlinien/sicherheit">Sicherheit beim Selbermachen</Link>.
            </p>
          ),
        },
        {
          id: "melden",
          title: "Melden",
          body: (
            <>
              <p>
                Über „Melden“ bei Inhalten, Profilen, Nachrichten, Bewertungen, Produkten und Communities kannst du Verstösse anzeigen. Jede Meldung erhält eine Fallnummer. Mehrere Meldungen zum selben Inhalt werden gebündelt und
                nach Risiko priorisiert. Ohne Konto erreichst du uns über die <Link href="/kontakt">Kontaktseite</Link>.
              </p>
              <p>Die gemeldete Person erfährt nicht, wer gemeldet hat. Du erhältst eine Rückmeldung, sobald der Fall abgeschlossen ist – ohne Details zur Massnahme, zum Schutz aller Beteiligten.</p>
              <p>Missbräuchliche Meldungen, etwa um Konkurrent:innen zu schaden, sind selbst ein Verstoss.</p>
            </>
          ),
        },
        {
          id: "massnahmen",
          title: "Massnahmen",
          body: (
            <>
              <p>Wir reagieren verhältnismässig. Je nach Schwere und Wiederholung sind möglich:</p>
              <ol className="grid gap-px border border-line bg-line sm:grid-cols-2 rounded-2xl overflow-hidden">
                {MODERATION_ACTIONS.filter((a) => a !== "NONE").map((a, i) => (
                  <li key={a} className="flex gap-3 bg-paper px-3 py-2 !pl-3 text-sm before:!hidden">
                    <span className="font-mono text-[11px] text-muted">{String(i + 1).padStart(2, "0")}</span>
                    {MODERATION_ACTION_LABEL[a]}
                  </li>
                ))}
              </ol>
              <p>Über Massnahmen entscheiden Menschen. Automatische Einstufungen helfen nur bei der Reihenfolge der Prüfung. Jede Entscheidung wird begründet und protokolliert.</p>
            </>
          ),
        },
        {
          id: "einspruch",
          title: "Einspruch",
          body: <p>Bist du von einer Entscheidung betroffen, erhältst du eine Benachrichtigung – in der App und per E-Mail – mit Begründung und einem Link zum Einspruch. Du hast 14 Tage Zeit. Wenn möglich prüft eine andere Person als die, die ursprünglich entschieden hat. Wird dem Einspruch stattgegeben, heben wir die Massnahme auf und stellen den vorherigen Zustand wieder her, soweit er nicht inzwischen durch eine andere Entscheidung geändert wurde.</p>,
        },
        {
          id: "communities",
          title: "Communities",
          body: <p>Communities können eigene, strengere Regeln festlegen und durch ihre Moderator:innen durchsetzen. Diese Richtlinien gelten immer zusätzlich. Bei schweren Verstössen greift die Plattform-Moderation auch in Communities ein.</p>,
        },
      ]}
    />
  );
}
