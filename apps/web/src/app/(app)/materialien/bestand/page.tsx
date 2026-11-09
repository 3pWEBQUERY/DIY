import Link from "next/link";
import type { Metadata } from "next";
import { requirePageUser } from "@/server/auth/session";
import { listStock } from "@/server/materials/stock";
import { Page, PageHeader, TabLinks } from "@/components/shell/page";
import { StockManager } from "@/components/materials/stock";

export const metadata: Metadata = { title: "Mein Bestand", robots: { index: false } };

export default async function StockPage() {
  const user = await requirePageUser("/materialien/bestand");
  const entries = await listStock(user.id);
  return (
    <Page width="wide">
      <PageHeader
        kicker="Materialkunde"
        title="Mein Bestand"
        description={
          <>
            Was du schon zu Hause hast. In Materiallisten von Projekten siehst du dadurch sofort, was dir noch fehlt, und beim Übernehmen in eine{" "}
            <Link href="/einkaufslisten" className="font-semibold text-ink underline underline-offset-2">Einkaufsliste</Link> ist Vorhandenes schon abgehakt. Nur du siehst deinen Bestand.
          </>
        }
      />
      <TabLinks
        active="bestand"
        className="mb-8"
        tabs={[
          { key: "alle", label: "Alle Materialien", href: "/materialien" },
          { key: "bestand", label: "Mein Bestand", href: "/materialien/bestand", count: entries.length },
          { key: "listen", label: "Einkaufslisten", href: "/einkaufslisten" },
        ]}
      />
      <StockManager initial={entries} />
    </Page>
  );
}
