import Link from "next/link";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { formatMoney, type Currency, type OrderStatus } from "@werkraum/shared";
import { currentUser } from "@/server/auth/session";
import { listBuyerOrders } from "@/server/commerce/orders";
import { OrderStatusBadge, PaymentStatusBadge } from "@/components/commerce/order-parts";
import { Plate } from "@/components/ui/media";
import { Empty } from "@/components/ui/misc";
import { LinkButton } from "@/components/ui/button";
import { formatDate } from "@/lib/utils";

export const metadata: Metadata = { title: "Meine Bestellungen", robots: { index: false } };

export default async function OrdersPage({ searchParams }: { searchParams: Promise<{ cursor?: string }> }) {
  const [sp, user] = await Promise.all([searchParams, currentUser()]);
  if (!user) redirect("/anmelden?weiter=/bestellungen");
  const { items, nextCursor } = await listBuyerOrders(user.id, sp.cursor ?? null);

  return (
    <div className="mx-auto w-full max-w-[860px] px-4 py-6 sm:px-6 md:py-10">
      <header className="mb-8 border-b border-rule pb-6">
        <p className="spec mb-3 flex items-center gap-2">
          <span className="inline-block h-px w-6 bg-rule-strong" />
          Marktplatz
        </p>
        <h1 className="display text-[2.4rem] sm:text-5xl">Meine Bestellungen</h1>
      </header>

      {items.length === 0 ? (
        <Empty title="Noch keine Bestellungen" body="Wenn du im Marktplatz etwas kaufst, findest du hier Status, Sendungsverfolgung und Downloads." action={<LinkButton href="/markt">Zum Marktplatz</LinkButton>} />
      ) : (
        <ul className="divide-y divide-line border-y border-line">
          {items.map((o) => {
            const first = o.items[0];
            const more = o.items.length - 1;
            return (
              <li key={o.id}>
                <Link href={`/bestellungen/${o.id}`} className="group grid grid-cols-[56px_1fr] items-center gap-4 py-4 sm:grid-cols-[64px_1fr_auto]">
                  <div className="relative aspect-[4/5] overflow-hidden border border-line bg-sunken rounded-2xl">
                    {first?.product.coverUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={first.product.coverUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
                    ) : (
                      <Plate seed={o.id} category={first?.product.category} number={false} />
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="spec">
                      <span className="font-mono">{o.number}</span> · {formatDate(o.createdAt, { day: "numeric", month: "short", year: "numeric" })}
                    </p>
                    <p className="mt-0.5 truncate text-[15px] font-semibold group-hover:underline">
                      {first?.title}
                      {more > 0 && <span className="font-normal text-muted"> und {more} weitere</span>}
                    </p>
                    <p className="text-[13px] text-muted">{o.shop.name}</p>
                    <div className="mt-2 flex flex-wrap gap-1.5 sm:hidden">
                      <OrderStatusBadge status={o.status as OrderStatus} />
                    </div>
                  </div>
                  <div className="hidden flex-col items-end gap-2 sm:flex">
                    <span className="num text-[15px] font-semibold">{formatMoney(o.totalMinor, o.currency as Currency)}</span>
                    <span className="flex gap-1.5">
                      <OrderStatusBadge status={o.status as OrderStatus} />
                      {o.payments[0] && o.payments[0].status !== "SUCCEEDED" && <PaymentStatusBadge status={o.payments[0].status} />}
                    </span>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      {nextCursor && (
        <div className="mt-6 text-right">
          <Link href={`/bestellungen?cursor=${nextCursor}`} className="text-[14px] font-semibold hover:underline">
            Ältere Bestellungen →
          </Link>
        </div>
      )}
    </div>
  );
}
