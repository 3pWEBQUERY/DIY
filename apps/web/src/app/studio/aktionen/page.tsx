import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { Currency } from "@werkraum/shared";
import { currentUser } from "@/server/auth/session";
import { getMyShop } from "@/server/commerce/shops";
import { listMySales } from "@/server/commerce/sales";
import { PageHeader } from "@/components/shell/page";
import { Notice } from "@/components/ui/misc";
import { LinkButton } from "@/components/ui/button";
import { SaleManager } from "@/components/commerce/sale-manager";
import { BRAND } from "@/config/brand";
import { proHref } from "@/lib/pro-features";

export const metadata: Metadata = { title: "Aktionen" };

/** Studio: zeitlich begrenzte Shop-Aktionen mit Countdown (Creator Pro). */
export default async function StudioSalesPage() {
  const user = await currentUser();
  if (!user) redirect("/anmelden?weiter=/studio/aktionen");
  const shop = await getMyShop(user.id);
  if (!shop) redirect("/studio/shop");
  const data = await listMySales(user);
  // Ohne Pro und ohne bisherige Aktionen: direkt zur Pro-Seite mit dieser Funktion
  if (!data.pro && !data.sales.length) redirect(proHref("aktionen"));

  return (
    <div>
      <PageHeader
        kicker={`${BRAND.name} Studio · Marktplatz`}
        title="Aktionen"
        description="Zeitlich begrenzte Rabatte mit Countdown – auf den ganzen Shop oder ausgewählte Arbeiten. Käufer:innen sehen den Aktionspreis und die Restzeit auf Karten, Produktseite und im Shop."
      />
      {!data.pro && (
        <Notice tone="neutral" className="mb-8" title="Aktionen gehören zu Creator Pro">
          Mit Creator Pro startest du Aktionen wie „−20 % bis Sonntag“ – mit Countdown, automatisch ein und aus.{" "}
          <Link href={proHref("aktionen")} className="font-semibold underline underline-offset-2">
            Creator Pro ansehen
          </Link>
        </Notice>
      )}
      {data.pro || data.sales.length ? (
        <SaleManager
          pro={data.pro}
          currency={shop.currency as Currency}
          maxDays={data.maxDays}
          now={Date.now()}
          products={data.products.map((p) => ({ id: p.id, title: p.title, priceMinor: p.priceMinor, status: p.status }))}
          sales={data.sales.map((s) => ({ id: s.id, title: s.title, percent: s.percent, startsAt: s.startsAt, endsAt: s.endsAt, productIds: s.productIds, active: s.active, status: s.status }))}
        />
      ) : (
        <LinkButton href={proHref("aktionen")}>Zu Creator Pro</LinkButton>
      )}
    </div>
  );
}
