import Link from "next/link";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { currentUser } from "@/server/auth/session";
import { LinkButton } from "@/components/ui/button";
import { Badge, SectionTitle } from "@/components/ui/misc";
import { BRAND } from "@/config/brand";

export const metadata: Metadata = { title: "Einstellungen" };

const PRO = [
  ["Profilgestaltung", "Eigene Profilsektionen, hervorgehobene Projekte und eine Werkstatt-Seite."],
  ["Erweiterte Statistiken", "Herkunft der Aufrufe, Verläufe über 12 Monate, Export als CSV."],
  ["Medienkit", "Automatisch erstelltes Portfolio für Kooperationen – mit echten, erklärten Zahlen."],
  ["Planung", "Beiträge und Journal-Einträge vorbereiten und zeitgesteuert veröffentlichen."],
  ["Mehr Speicher", "Grössere Videos und mehr Platz in der Medienbibliothek."],
];

/** Studio-Einstellungen – Creator Pro (PRD §22.3) ist angekündigt, aber noch nicht buchbar. */
export default async function StudioSettingsPage() {
  const user = await currentUser();
  if (!user?.profile) redirect("/anmelden?weiter=/studio/einstellungen");
  return (
    <div className="max-w-[820px]">
      <header className="mb-10">
        <p className="spec mb-3 flex items-center gap-2"><span className="inline-block h-px w-6 bg-ink" />Studio</p>
        <h1 className="display text-[2.4rem] sm:text-5xl">Einstellungen</h1>
      </header>

      <section aria-labelledby="se1" className="mb-12">
        <SectionTitle n="01" title={<span id="se1">Profil & Konto</span>} />
        <p className="mt-3 text-sm leading-relaxed text-muted">Name, Handle, Bild, Bio, Links und kreative Schwerpunkte verwaltest du zentral in den Kontoeinstellungen – sie gelten für Community und Studio gleichermassen.</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <LinkButton href="/einstellungen/profil" variant="outline">Profil bearbeiten</LinkButton>
          <LinkButton href="/einstellungen/benachrichtigungen" variant="ghost">Benachrichtigungen</LinkButton>
          <LinkButton href="/studio/shop" variant="ghost">Shopverwaltung</LinkButton>
        </div>
      </section>

      <section aria-labelledby="se2" className="crop border border-line bg-card p-6 sm:p-8 rounded-2xl">
        <div className="flex flex-wrap items-center gap-3">
          <h2 id="se2" className="headline text-2xl">Creator Pro</h2>
          <Badge tone="clay">Bald verfügbar</Badge>
        </div>
        <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-ink-2">
          Für Menschen, die mit ihren Projekten wachsen wollen. Die Grundfunktionen von {BRAND.name} – Projekte, Anleitungen, Communities, Shop – bleiben dauerhaft kostenlos. Creator Pro ergänzt Werkzeuge für Profis, ohne die Reichweite anderer zu beschneiden: Bezahlen bringt keine bevorzugte Platzierung im Feed.
        </p>
        <ol className="mt-6 divide-y divide-line border-y border-line">
          {PRO.map(([t, d], i) => (
            <li key={t} className="flex gap-4 py-3">
              <span className="font-mono text-[11px] text-muted">{String(i + 1).padStart(2, "0")}</span>
              <span>
                <span className="block text-sm font-semibold">{t}</span>
                <span className="block text-[13px] text-muted">{d}</span>
              </span>
            </li>
          ))}
        </ol>
        <p className="mt-5 text-xs text-muted">
          Preise und Start geben wir rechtzeitig bekannt. Wünsche oder Ideen? <Link href="/einstellungen/hilfe-support" className="underline">Schreib uns</Link>.
        </p>
      </section>
    </div>
  );
}
