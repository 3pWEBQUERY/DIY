import type { Metadata } from "next";
import { BRAND } from "@/config/brand";
import { HELP_CATEGORIES } from "@/lib/help/content";
import { helpIndex, helpVars } from "@/server/help";
import { HelpCenter } from "@/components/help/help-center";
import { HelpContact } from "@/components/help/help-contact";

export const metadata: Metadata = {
  title: "Hilfe-Center",
  description: `Antworten zu allen Bereichen von ${BRAND.name}: Konto, Projekte, Anleitungen, Stories, Communities, Nachrichten, Kaufen, Verkaufen im Studio, Creator Pro und mehr.`,
  alternates: { canonical: "/hilfe" },
};

// Provision, Fristen und Preise aus den Systemeinstellungen: regelmässig neu rendern statt beim Build einfrieren
export const revalidate = 300;

export default async function HelpPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  // In der iOS-App geöffnet: keine Web-Preise und kein Link zum Web-Checkout (App Store Guideline 3.1.1/3.1.3)
  const inApp = sp.app === "ios";
  const q = typeof sp.q === "string" ? sp.q.slice(0, 100) : "";
  const vars = await helpVars();
  const cards = HELP_CATEGORIES.map((c) => ({ id: c.id, title: c.title, icon: c.icon, summary: c.summary, count: c.articles.length }));
  return (
    <div className="mx-auto max-w-[1120px] px-4 py-10 sm:px-6 md:py-14 lg:px-10">
      <header className="mb-8 max-w-3xl">
        <p className="spec mb-3 flex items-center gap-2">
          <span className="inline-block h-px w-6 bg-rule-strong" />
          Hilfe-Center
        </p>
        <h1 className="display text-[2.6rem] sm:text-6xl">Wie können wir helfen?</h1>
        <p className="mt-5 text-[17px] leading-relaxed text-ink-2">
          Antworten zu allen Bereichen von {BRAND.name} – vom ersten Projekt bis zum eigenen Shop. Findest du nichts Passendes, schreib uns: Menschen lesen jede Nachricht.
        </p>
      </header>

      <HelpCenter categories={cards} index={helpIndex(vars, inApp)} initialQuery={q} suffix={inApp ? "?app=ios" : ""} />

      <div className="mt-14 max-w-[46rem]">
        <HelpContact />
      </div>
    </div>
  );
}
