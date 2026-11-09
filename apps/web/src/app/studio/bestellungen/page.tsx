import Link from "next/link";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { formatMoney, type Currency } from "@werkraum/shared";
import { currentUser, requirePageUser } from "@/server/auth/session";
import { getMyShop } from "@/server/commerce/shops";
import { listShopOrders } from "@/server/commerce/orders";
import { SELLER_ORDER_TABS } from "@/server/commerce/rules";
import { PageHeader, TabLinks } from "@/components/shell/page";
import { PaymentStatusBadge } from "@/components/commerce/order-parts";
import { Empty } from "@/components/ui/misc";
import { formatDate, relativeTime } from "@/lib/utils";
import { orderBuyer } from "@/server/account/customer";

export const metadata: Metadata = { title: "Bestellungen" };

const EMPTY: Record<string, string> = {
  neu: "Keine neuen Bestellungen. Sobald jemand bezahlt, erscheint die Bestellung hier.",
  "in-bearbeitung": "Gerade ist nichts in Arbeit.",
  versandbereit: "Nichts wartet auf den Versand.",
  versendet: "Keine Sendungen unterwegs.",
  abgeschlossen: "Noch keine abgeschlossenen Bestellungen.",
  storniert: "Keine Stornierungen.",
  erstattet: "Keine Erstattungen.",
  problemfaelle: "Keine offenen Problemfälle – gut so.",
};

/** Bestellungen des Shops nach Arbeitsschritt (§13.6). Offene Zahlungen sind für Shops nicht sichtbar. */
export default async function StudioOrdersPage({ searchParams }: { searchParams: Promise<{ status?: string; cursor?: string }> }) {
  const [sp, user] = await Promise.all([searchParams, currentUser()]);
  if (!user?.profile) redirect("/anmelden?weiter=/studio/bestellungen");
  if (!(await getMyShop(user.id))) redirect("/studio/shop");
  const { tab, items, nextCursor, counts } = await listShopOrders(await requirePageUser("/studio/bestellungen", { allowSuspended: true }), sp.status, sp.cursor ?? null);
  const working = tab.status === "NEW" || tab.status === "IN_PROGRESS" || tab.status === "READY_TO_SHIP";

  return (
    <div>
      <PageHeader kicker="Werkuno Studio · Marktplatz" title="Bestellungen" description={working ? "Älteste zuerst – so bleibt nichts liegen." : undefined} />
      <TabLinks
        active={tab.key}
        tabs={SELLER_ORDER_TABS.map((t) => ({ key: t.key, label: t.label, count: counts[t.status] ?? 0, href: `/studio/bestellungen?status=${t.key}` }))}
      />
      {items.length === 0 ? (
        <Empty className="mt-8" title="Leer" body={EMPTY[tab.key]} />
      ) : (
        <div className="overflow-x-auto">
          <table className="mt-2 w-full min-w-[720px] text-[14px]">
            <thead>
              <tr className="border-b border-rule text-left">
                <th scope="col" className="spec py-3 font-normal">
                  Bestellung
                </th>
                <th scope="col" className="spec py-3 font-normal">
                  Artikel
                </th>
                <th scope="col" className="spec py-3 font-normal">
                  Käufer:in
                </th>
                <th scope="col" className="spec py-3 font-normal">
                  Zahlung
                </th>
                <th scope="col" className="spec py-3 text-right font-normal">
                  Betrag
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {items.map((o) => {
                const first = o.items[0];
                const waitingDays = o.paidAt ? Math.floor((Date.now() - o.paidAt.getTime()) / 86400_000) : 0;
                return (
                  <tr key={o.id} className="align-top hover:bg-sunken/60">
                    <td className="py-3 pr-4">
                      <Link href={`/studio/bestellungen/${o.id}`} className="font-mono text-[13px] font-semibold hover:underline">
                        {o.number}
                      </Link>
                      <p className="spec mt-0.5" title={formatDate(o.createdAt)}>
                        {relativeTime(o.paidAt ?? o.createdAt)}
                        {working && waitingDays >= 3 ? ` · seit ${waitingDays} Tagen` : ""}
                      </p>
                    </td>
                    <td className="py-3 pr-4">
                      <p className="max-w-[280px] truncate">
                        {first?.quantity} × {first?.title}
                        {first?.variantName ? ` (${first.variantName})` : ""}
                      </p>
                      {o.items.length > 1 && <p className="text-[12.5px] text-muted">und {o.items.length - 1} weitere</p>}
                      {o.items.every((i) => i.isDigital) && <p className="spec">Digital</p>}
                    </td>
                    <td className="py-3 pr-4 text-ink-2">
                      <span className="block">{orderBuyer(o).name ?? o.buyer.profile?.displayName ?? "Ehemaliges Mitglied"}</span>
                      {o.buyer.profile && <span className="block text-[12px] text-muted">@{o.buyer.profile.handle}</span>}
                    </td>
                    <td className="py-3 pr-4">{o.payments[0] && <PaymentStatusBadge status={o.payments[0].status} />}</td>
                    <td className="num py-3 text-right font-semibold">{formatMoney(o.totalMinor, o.currency as Currency)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {nextCursor && (
            <div className="mt-6 text-right">
              <Link href={`/studio/bestellungen?status=${tab.key}&cursor=${nextCursor}`} className="text-[14px] font-semibold hover:underline">
                Weitere →
              </Link>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
