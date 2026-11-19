import type { Metadata } from "next";
import { Page, PageHeader } from "@/components/shell/page";
import { CuttingCalculator } from "@/components/tools/cutting-calculator";

export const metadata: Metadata = {
  title: "Zuschnittrechner – Platten, Schnittplan und Kantenband",
  description: "Teile eingeben und sofort sehen, wie viele Platten du brauchst: Schnittplan, Verschnitt, Kantenband und Kosten – zum Ausdrucken für den Zuschnitt im Baumarkt.",
  alternates: { canonical: "/werkzeuge/zuschnitt" },
};

/** Werkzeug: Zuschnitt- und Materialrechner für Plattenmöbel (läuft im Browser, ohne Konto). */
export default function CuttingPage() {
  return (
    <Page width="full" className="mx-auto max-w-[1400px]">
      <PageHeader
        kicker="Werkzeuge"
        title="Zuschnittrechner"
        description="Teile eingeben – Werkuno rechnet Platten, Schnittplan, Verschnitt, Kantenband und Kosten. Zum Ausdrucken für den Zuschnitt im Baumarkt. Deine Liste bleibt in diesem Browser gespeichert."
        className="print:mb-4"
      />
      <CuttingCalculator />
    </Page>
  );
}
