import Link from "next/link";
import type { Metadata } from "next";
import { ORDER_STATUS_LABEL, formatMoney, type Currency } from "@werkraum/shared";
import { adminPage } from "@/server/admin/guard";
import { listDisputes, listOrders } from "@/server/admin/commerce";
import { AdminHeader, EmptyRow, FilterBar, FilterField, Pager, Segments, Table, Td, Th, Tr, filterInput } from "@/components/admin/ui";
import { Badge, Notice, SectionTitle } from "@/components/ui/misc";
import { dateTime, num } from "@/components/admin/format";
import { ReasonButton } from "@/components/admin/action-controls";
import { refundOrderAdminAction } from "./actions";

export const metadata: Metadata = { title: "Transaktionen & Streitfälle" };

const PAYMENT_LABEL: Record<string, string> = {
  REQUIRES_PAYMENT: "Offen",
  PROCESSING: "In Verarbeitung",
  SUCCEEDED: "Bezahlt",
  FAILED: "Fehlgeschlagen",
  CANCELLED: "Abgebrochen",
  REFUNDED: "Erstattet",
  PARTIALLY_REFUNDED: "Teilerstattet",
  DISPUTED: "Angefochten",
};
const payTone = (s?: string) => (s === "SUCCEEDED" ? "moss" : s === "DISPUTED" || s === "FAILED" ? "danger" : s === "REFUNDED" || s === "PARTIALLY_REFUNDED" ? "warn" : "neutral") as "moss" | "danger" | "warn" | "neutral";

const FILTERS = [
  { key: "ALL", label: "Alle" },
  { key: "OPEN", label: "In Abwicklung" },
  { key: "PAID", label: "Bezahlt" },
  { key: "PROBLEM", label: "Problemfall" },
  { key: "DISPUTED", label: "Angefochten" },
  { key: "REFUNDED", label: "Erstattet" },
  { key: "CANCELLED", label: "Storniert" },
];

/** Nur ADMIN (§24.3): Moderation hat keinen Zugriff auf Zahlungsbereiche. */
export default async function TransactionsPage({ searchParams }: { searchParams: Promise<{ filter?: string; q?: string; seite?: string }> }) {
  const user = await adminPage("ADMIN", "/admin/transaktionen");
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.seite) || 1);
  const [orders, disputes] = await Promise.all([listOrders(user, { filter: sp.filter, q: sp.q?.trim() || null, page }), listDisputes(user)]);
  const money = (n: number, c: string) => formatMoney(n, (c === "EUR" ? "EUR" : "CHF") as Currency);

  return (
    <div>
      <AdminHeader
        n="09"
        title="Transaktionen & Streitfälle"
        description="Bestellungen und Zahlungen. Bestellstatus und Zahlungsstatus sind getrennt; „Bezahlt“ gilt nur nach bestätigtem Provider-Ereignis. Erstatten durch die Plattform ist für Fälle gedacht, in denen der Shop nicht mehr handeln kann (gesperrt, Konto gebannt oder gelöscht) – vor dem Versand wird dabei storniert."
      />

      <section aria-labelledby="t1" className="mb-10">
        <SectionTitle n="01" title={<span id="t1">Streitfälle</span>} />
        <dl className="mt-4 grid grid-cols-2 gap-y-4 sm:grid-cols-4">
          {[
            ["Angefochtene Zahlungen", disputes.disputed.length],
            ["Problemfälle", disputes.problems.length],
            ["Erstattungen ausstehend", disputes.refundsPending],
            ["Fehlgeschlagene Auszahlungen", disputes.payoutsFailed],
          ].map(([l, v]) => (
            <div key={l as string} className="border-l border-line pl-4">
              <dt className="spec">{l}</dt>
              <dd className={`mt-1 text-2xl font-semibold num ${(v as number) > 0 ? "text-clay-ink" : ""}`}>{num(v as number)}</dd>
            </div>
          ))}
        </dl>
        {disputes.disputed.length + disputes.problems.length > 0 ? (
          <Table className="mt-5" caption="Streitfälle">
            <thead>
              <tr>
                <Th>Art</Th>
                <Th>Bestellung</Th>
                <Th>Shop</Th>
                <Th align="right">Betrag</Th>
                <Th>Hinweis</Th>
                <Th>Aktualisiert</Th>
              </tr>
            </thead>
            <tbody>
              {disputes.disputed.map((p) => (
                <Tr key={p.id} highlight>
                  <Td><Badge tone="danger">Angefochten</Badge></Td>
                  <Td mono>{p.order.number}</Td>
                  <Td>{p.order.shop.name}</Td>
                  <Td align="right">{money(p.amountMinor, p.currency)}</Td>
                  <Td className="font-mono text-[11px] text-muted">{p.providerRef ?? "–"}</Td>
                  <Td className="whitespace-nowrap text-muted">{dateTime(p.updatedAt)}</Td>
                </Tr>
              ))}
              {disputes.problems.map((o) => (
                <Tr key={o.id}>
                  <Td><Badge tone="warn">Problemfall</Badge></Td>
                  <Td mono>{o.number}</Td>
                  <Td>{o.shop.name}</Td>
                  <Td align="right">{money(o.totalMinor, o.currency)}</Td>
                  <Td className="max-w-[320px] text-[13px] text-ink-2"><span className="line-clamp-2">{o.events[0]?.note || "–"}</span></Td>
                  <Td className="whitespace-nowrap text-muted">{dateTime(o.updatedAt)}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        ) : (
          <Notice className="mt-5" tone="moss">Keine offenen Streitfälle.</Notice>
        )}
      </section>

      <section aria-labelledby="t2">
        <SectionTitle n="02" title={<span id="t2">Bestellungen</span>} />
        <Segments className="mt-4" active={orders.filter} items={FILTERS.map((f) => ({ key: f.key, label: f.label, href: `/admin/transaktionen?filter=${f.key}` }))} />
        <FilterBar>
          <input type="hidden" name="filter" value={orders.filter} />
          <FilterField label="Suche">
            <input name="q" defaultValue={sp.q ?? ""} placeholder="Bestellnummer oder Shop-Slug" className={`${filterInput} w-60`} />
          </FilterField>
        </FilterBar>
        <Table caption="Bestellungen">
          <thead>
            <tr>
              <Th>Nummer</Th>
              <Th>Shop</Th>
              <Th>Käufer</Th>
              <Th>Bestellstatus</Th>
              <Th>Zahlung</Th>
              <Th align="right">Positionen</Th>
              <Th align="right">Total</Th>
              <Th align="right">Provision</Th>
              <Th>Erstellt</Th>
              <Th>
                <span className="sr-only">Aktionen</span>
              </Th>
            </tr>
          </thead>
          <tbody>
            {orders.rows.length === 0 && <EmptyRow cols={10}>Keine Bestellungen.</EmptyRow>}
            {orders.rows.map((o) => {
              const pay = o.payments[0];
              return (
                <Tr key={o.id}>
                  <Td mono className="font-semibold">{o.number}</Td>
                  <Td><Link href={`/markt/${o.shop.slug}`} target="_blank" className="hover:underline">{o.shop.name}</Link></Td>
                  <Td className="text-muted">@{o.buyer.profile?.handle ?? "–"}</Td>
                  <Td><Badge tone={o.status === "PROBLEM" ? "warn" : o.status === "COMPLETED" ? "moss" : "neutral"}>{ORDER_STATUS_LABEL[o.status]}</Badge></Td>
                  <Td>
                    <Badge tone={payTone(pay?.status)}>{pay ? PAYMENT_LABEL[pay.status] : "–"}</Badge>
                    {pay?.failureReason && <span className="block text-xs text-danger">{pay.failureReason}</span>}
                  </Td>
                  <Td align="right">{o._count.items}{o._count.refunds ? <span className="ml-1 text-warn">· {o._count.refunds} Erst.</span> : null}</Td>
                  <Td align="right">{money(o.totalMinor, o.currency)}</Td>
                  <Td align="right" className="text-muted">{money(o.platformFeeMinor, o.currency)} <span className="font-mono text-[10px]">{(o.feeBps / 100).toFixed(1)} %</span></Td>
                  <Td className="whitespace-nowrap text-muted">{dateTime(o.createdAt)}</Td>
                  <Td>
                    {(pay?.status === "SUCCEEDED" || pay?.status === "PARTIALLY_REFUNDED") && (
                      <ReasonButton
                        action={refundOrderAdminAction.bind(null, o.id)}
                        label="Erstatten"
                        title={`Bestellung ${o.number} erstatten`}
                        description="Vor dem Versand wird die Bestellung storniert (Bestand zurück, Lizenzen widerrufen). Der gesamte noch erstattbare Betrag geht an die Käuferin bzw. den Käufer zurück, der Verkäuferanteil wird vom Shop-Konto zurückgeholt."
                        confirmLabel="Erstatten"
                        confirmVariant="danger"
                        success="Erstattung ausgelöst."
                      />
                    )}
                  </Td>
                </Tr>
              );
            })}
          </tbody>
        </Table>
        <Pager page={orders.page} pages={orders.pages} href={(p) => `/admin/transaktionen?${new URLSearchParams({ filter: orders.filter, ...(sp.q ? { q: sp.q } : {}), seite: String(p) })}`} />
      </section>
    </div>
  );
}
