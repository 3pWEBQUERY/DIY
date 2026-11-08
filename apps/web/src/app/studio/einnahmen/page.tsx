import Link from "next/link";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ORDER_STATUS_LABEL, formatMoney, type Currency, type OrderStatus } from "@werkraum/shared";
import { currentUser } from "@/server/auth/session";
import { getMyShop } from "@/server/commerce/shops";
import { shopRevenue, type RevenueRange } from "@/server/commerce/revenue";
import { formatBps } from "@/server/commerce/rules";
import { paymentsMode } from "@/server/commerce/stripe";
import { feeForShop } from "@/server/commerce/fees";
import { PageHeader, TabLinks } from "@/components/shell/page";
import { PayoutPanel } from "@/components/commerce/payout-panel";
import { getPayoutOverview, PAYOUT_STATUS_LABEL } from "@/server/commerce/payouts";
import { Empty, Notice, SectionTitle, Stat } from "@/components/ui/misc";
import { formatDate } from "@/lib/utils";

export const metadata: Metadata = { title: "Einnahmen & Auszahlungen" };

const RANGES: { key: RevenueRange; label: string }[] = [
  { key: "30", label: "30 Tage" },
  { key: "90", label: "90 Tage" },
  { key: "365", label: "12 Monate" },
  { key: "alle", label: "Gesamt" },
];

const PAYOUT_TONE: Record<string, string> = { paid: "bg-moss-soft text-moss-ink", failed: "bg-danger-soft text-danger", canceled: "bg-sunken text-muted" };

/** Einnahmen mit ehrlichen Bezeichnungen (§20.4): was eingenommen, erstattet, an Gebühren abgezogen und ausgezahlt wurde. */
export default async function RevenuePage({ searchParams }: { searchParams: Promise<{ zeitraum?: string; stripe?: string }> }) {
  const [sp, user] = await Promise.all([searchParams, currentUser()]);
  if (!user) redirect("/anmelden?weiter=/studio/einnahmen");
  const shop = await getMyShop(user.id);
  if (!shop) redirect("/studio/shop");
  const range = (RANGES.find((r) => r.key === sp.zeitraum)?.key ?? "30") as RevenueRange;
  const [r, feeBps, payout] = await Promise.all([shopRevenue(shop.id, range), feeForShop(shop.id), getPayoutOverview(user)]);
  const c = r.currency as Currency;
  const m = (n: number) => formatMoney(n, c);
  const mode = paymentsMode();

  return (
    <div>
      <PageHeader kicker="Werkuno Studio · Marktplatz" title="Einnahmen & Auszahlungen" description="Alle Beträge in Rappen genau – so, wie sie verbucht wurden." />
      <TabLinks active={range} tabs={RANGES.map((x) => ({ key: x.key, label: x.label, href: `/studio/einnahmen?zeitraum=${x.key}` }))} />

      {mode === "simulated" && (
        <Notice tone="warn" className="mt-6" title="Testmodus">
          Zahlungen in dieser Umgebung sind simuliert. Es fliesst kein echtes Geld.
        </Notice>
      )}

      {sp.stripe === "bank" && (
        <Notice tone="moss" className="mt-6" title="Zurück von Stripe">
          Änderungen am Bankkonto werden von Stripe geprüft und erscheinen hier, sobald sie übernommen sind.
        </Notice>
      )}

      <div className="mt-8">
        <PayoutPanel data={payout} />
      </div>

      <dl className="mt-10 grid grid-cols-2 gap-x-6 gap-y-8 border-b border-line pb-8 md:grid-cols-4">
        <Stat label="Umsatz brutto" value={m(r.gross)} note={`${r.orderCount} bezahlte Bestellungen, inkl. Versand`} />
        <Stat label="Erstattet" value={r.refunds ? `− ${m(r.refunds)}` : m(0)} note={r.pendingRefunds ? `${m(r.pendingRefunds)} in Bearbeitung` : "bestätigte Rückzahlungen"} />
        <Stat label="Plattformgebühr" value={`− ${m(r.fees)}`} note={`${formatBps(feeBps)} auf den Warenwert, bei Erstattung anteilig zurück`} />
        <Stat label="Netto für dich" value={m(r.net)} note="vor Gebühren des Zahlungsanbieters" />
      </dl>
      <p className="mt-4 max-w-3xl text-[12.5px] leading-relaxed text-muted">
        „Netto“ ist Brutto minus Erstattungen minus Plattformgebühr. Stripe zieht seine eigenen Zahlungsgebühren separat ab; den genauen Auszahlungsbetrag siehst du bei den Auszahlungen. Offene
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
                  <tr className="border-b border-rule text-left">
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
          <section aria-labelledby="auszahlungsverlauf">
            <SectionTitle n="02" title={<span id="auszahlungsverlauf">Auszahlungen</span>} />
            {payout.payouts.length === 0 ? (
              <p className="mt-4 text-[13.5px] leading-relaxed text-muted">
                {!r.connected ? (
                  <>
                    Noch kein Auszahlungskonto verbunden.{" "}
                    <Link href="/studio/shop" className="font-semibold text-ink underline">
                      Jetzt verbinden
                    </Link>
                  </>
                ) : (
                  "Noch keine Auszahlungen. Du wirst über jede Auszahlung benachrichtigt – auch über automatische."
                )}
              </p>
            ) : (
              <ul className="mt-1 divide-y divide-line">
                {payout.payouts.map((p) => (
                  <li key={p.id} className="py-3">
                    <div className="flex items-center justify-between gap-3">
                      <span className="num text-[15px] font-semibold">{formatMoney(p.amountMinor, p.currency as Currency)}</span>
                      <span className={`rounded-full px-2.5 py-0.5 text-[11.5px] font-medium ${PAYOUT_TONE[p.status] ?? "bg-warn-soft text-warn"}`}>{PAYOUT_STATUS_LABEL[p.status] ?? p.status}</span>
                    </div>
                    <p className="mt-0.5 text-[12.5px] text-muted">
                      {p.automatic ? "Automatisch" : "Beantragt"} · {formatDate(p.createdAt, { day: "numeric", month: "short", year: "numeric" })}
                      {p.arrivalAt && p.status !== "failed" && p.status !== "canceled" && <> · {p.status === "paid" ? "gutgeschrieben am" : "Ankunft ca."} {formatDate(p.arrivalAt, { day: "numeric", month: "short" })}</>}
                    </p>
                    {p.failureMessage && <p className="mt-1 text-[12.5px] text-danger">{p.failureMessage}</p>}
                  </li>
                ))}
              </ul>
            )}
            {r.paidOut > 0 && (
              <p className="mt-3 border-t border-line pt-3 text-[13px] text-muted">
                Insgesamt ausgezahlt: <span className="num font-semibold text-ink">{m(r.paidOut)}</span>
              </p>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}
