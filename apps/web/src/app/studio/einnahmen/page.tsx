import Link from "next/link";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ORDER_STATUS_LABEL, formatMoney, type Currency, type OrderStatus } from "@werkraum/shared";
import { currentUser } from "@/server/auth/session";
import { getMyShop } from "@/server/commerce/shops";
import { shopRevenue, type RevenueRange } from "@/server/commerce/revenue";
import { formatBps } from "@/server/commerce/rules";
import { paymentsMode } from "@/server/commerce/stripe";
import { getSetting } from "@/server/settings";
import { PageHeader, TabLinks } from "@/components/shell/page";
import { StripeDashboardButton } from "@/components/commerce/shop-controls";
import { Empty, Notice, SectionTitle, Stat } from "@/components/ui/misc";
import { formatDate } from "@/lib/utils";

export const metadata: Metadata = { title: "Einnahmen & Auszahlungen" };

const RANGES: { key: RevenueRange; label: string }[] = [
  { key: "30", label: "30 Tage" },
  { key: "90", label: "90 Tage" },
  { key: "365", label: "12 Monate" },
  { key: "alle", label: "Gesamt" },
];

const PAYOUT_LABEL: Record<string, string> = { paid: "Ausgezahlt", pending: "Unterwegs", in_transit: "Unterwegs", failed: "Fehlgeschlagen", canceled: "Storniert" };

/** Einnahmen mit ehrlichen Bezeichnungen (§20.4): was eingenommen, erstattet, an Gebühren abgezogen und ausgezahlt wurde. */
export default async function RevenuePage({ searchParams }: { searchParams: Promise<{ zeitraum?: string }> }) {
  const [sp, user] = await Promise.all([searchParams, currentUser()]);
  if (!user) redirect("/anmelden?weiter=/studio/einnahmen");
  const shop = await getMyShop(user.id);
  if (!shop) redirect("/studio/shop");
  const range = (RANGES.find((r) => r.key === sp.zeitraum)?.key ?? "30") as RevenueRange;
  const [r, feeBps] = await Promise.all([shopRevenue(shop.id, range), getSetting("commerce.feeBps")]);
  const c = r.currency as Currency;
  const m = (n: number) => formatMoney(n, c);
  const mode = paymentsMode();

  return (
    <div>
      <PageHeader kicker="Creator Studio · Marktplatz" title="Einnahmen & Auszahlungen" description="Alle Beträge in Rappen genau – so, wie sie verbucht wurden." />
      <TabLinks active={range} tabs={RANGES.map((x) => ({ key: x.key, label: x.label, href: `/studio/einnahmen?zeitraum=${x.key}` }))} />

      {mode === "simulated" && (
        <Notice tone="warn" className="mt-6" title="Testmodus">
          Zahlungen in dieser Umgebung sind simuliert. Es fliesst kein echtes Geld.
        </Notice>
      )}

      <dl className="mt-8 grid grid-cols-2 gap-x-6 gap-y-8 border-b border-line pb-8 md:grid-cols-4">
        <Stat label="Umsatz brutto" value={m(r.gross)} note={`${r.orderCount} bezahlte Bestellungen, inkl. Versand`} />
        <Stat label="Erstattet" value={r.refunds ? `− ${m(r.refunds)}` : m(0)} note={r.pendingRefunds ? `${m(r.pendingRefunds)} in Bearbeitung` : "bestätigte Rückzahlungen"} />
        <Stat label="Plattformgebühr" value={`− ${m(r.fees)}`} note={`${formatBps(feeBps)} auf den Warenwert, bei Erstattung anteilig zurück`} />
        <Stat label="Netto für dich" value={m(r.net)} note="vor Gebühren des Zahlungsanbieters" />
      </dl>
      <p className="mt-4 max-w-3xl text-[12.5px] leading-relaxed text-muted">
        „Netto“ ist Brutto minus Erstattungen minus Plattformgebühr. Stripe zieht seine eigenen Zahlungsgebühren separat ab; den genauen Auszahlungsbetrag siehst du unten bzw. im Stripe-Dashboard. Offene
        oder abgebrochene Zahlungen sind nicht enthalten.
      </p>

      <div className="mt-12 grid gap-12 xl:grid-cols-[1fr_380px]">
        <section aria-labelledby="buchungen" className="min-w-0">
          <SectionTitle n="01" title={<span id="buchungen">Bestellungen im Zeitraum</span>} />
          {r.rows.length === 0 ? (
            <Empty className="mt-6" title="Noch keine Einnahmen" body="Sobald eine Bestellung bezahlt ist, siehst du sie hier." />
          ) : (
            <div className="overflow-x-auto">
              <table className="mt-2 w-full min-w-[640px] text-[13.5px]">
                <thead>
                  <tr className="border-b border-ink text-left">
                    <th scope="col" className="spec py-2.5 font-normal">
                      Bestellung
                    </th>
                    <th scope="col" className="spec py-2.5 font-normal">
                      Status
                    </th>
                    <th scope="col" className="spec py-2.5 text-right font-normal">
                      Brutto
                    </th>
                    <th scope="col" className="spec py-2.5 text-right font-normal">
                      Erstattet
                    </th>
                    <th scope="col" className="spec py-2.5 text-right font-normal">
                      Gebühr
                    </th>
                    <th scope="col" className="spec py-2.5 text-right font-normal">
                      Netto
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {r.rows.map((o) => (
                    <tr key={o.id}>
                      <td className="py-2.5 pr-3">
                        <Link href={`/studio/bestellungen/${o.id}`} className="font-mono hover:underline">
                          {o.number}
                        </Link>
                        <span className="spec ml-2">{o.paidAt ? formatDate(o.paidAt, { day: "numeric", month: "short" }) : ""}</span>
                      </td>
                      <td className="py-2.5 pr-3 text-muted">{ORDER_STATUS_LABEL[o.status as OrderStatus]}</td>
                      <td className="num py-2.5 text-right">{m(o.totalMinor)}</td>
                      <td className="num py-2.5 text-right text-muted">{o.refunded ? `− ${m(o.refunded)}` : "–"}</td>
                      <td className="num py-2.5 text-right text-muted">− {m(o.fee)}</td>
                      <td className="num py-2.5 text-right font-semibold">{m(o.net)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {r.orderCount > r.rows.length && <p className="mt-3 text-[12px] text-muted">Es werden die letzten {r.rows.length} von {r.orderCount} Bestellungen angezeigt; die Summen oben umfassen alle.</p>}
            </div>
          )}
        </section>

        <aside className="space-y-8">
          <section aria-labelledby="auszahlungen">
            <SectionTitle n="02" title={<span id="auszahlungen">Auszahlungen</span>} />
            {!r.connected ? (
              <p className="mt-4 text-[13.5px] text-muted">
                Noch kein Auszahlungskonto verbunden. <Link href="/studio/shop" className="font-semibold text-ink underline">Jetzt verbinden</Link>
              </p>
            ) : r.payouts.length === 0 ? (
              <p className="mt-4 text-[13.5px] leading-relaxed text-muted">
                Noch keine Auszahlungen. Stripe zahlt verfügbare Guthaben automatisch nach dem Auszahlungsplan deines Kontos aus{!r.payoutsEnabled ? " – sobald Auszahlungen freigeschaltet sind" : ""}.
              </p>
            ) : (
              <ul className="mt-2 divide-y divide-line text-[14px]">
                {r.payouts.map((p) => (
                  <li key={p.id} className="flex items-baseline justify-between gap-3 py-2.5">
                    <span>
                      <span className="num font-semibold">{formatMoney(p.amountMinor, p.currency as Currency)}</span>
                      <span className="spec ml-2">{PAYOUT_LABEL[p.status] ?? p.status}</span>
                    </span>
                    <span className="spec">{formatDate(p.arrivalAt ?? p.createdAt, { day: "numeric", month: "short", year: "numeric" })}</span>
                  </li>
                ))}
              </ul>
            )}
            {r.paidOut > 0 && <p className="mt-3 text-[13px] text-muted">Insgesamt ausgezahlt: <span className="num font-semibold text-ink">{m(r.paidOut)}</span></p>}
            {r.connected && mode === "stripe" && (
              <div className="mt-5">
                <StripeDashboardButton />
              </div>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}
