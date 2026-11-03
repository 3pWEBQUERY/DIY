import Link from "next/link";
import type { Metadata } from "next";
import { REPORT_REASONS, REPORT_REASON_LABEL } from "@werkraum/shared";
import type { TargetType } from "@/server/db";
import { adminPage, CASE_STATUS_LABEL, TARGET_TYPE_LABEL } from "@/server/admin/guard";
import { listReports } from "@/server/moderation/service";
import { AdminHeader, EmptyRow, FilterBar, FilterField, Pager, RiskMeter, Table, Td, Th, Tr, filterInput } from "@/components/admin/ui";
import { Badge } from "@/components/ui/misc";
import { dateTime, num } from "@/components/admin/format";

export const metadata: Metadata = { title: "Meldungen" };

type SP = { grund?: string; typ?: string; seite?: string };

export default async function ReportsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await adminPage("PLATFORM_MODERATOR", "/admin/meldungen");
  const sp = await searchParams;
  const reason = sp.grund && (REPORT_REASONS as readonly string[]).includes(sp.grund) ? sp.grund : null;
  const targetType = sp.typ && sp.typ in TARGET_TYPE_LABEL ? (sp.typ as TargetType) : null;
  const page = Math.max(1, Number(sp.seite) || 1);
  const r = await listReports(user, { reason, targetType, page });
  const total30 = Object.values(r.byReason).reduce((a, b) => a + b, 0);
  const qs = (p: number) => `/admin/meldungen?${new URLSearchParams({ ...(reason ? { grund: reason } : {}), ...(targetType ? { typ: targetType } : {}), seite: String(p) })}`;

  return (
    <div>
      <AdminHeader n="03" title="Meldungen" description="Alle eingegangenen Meldungen. Mehrere Meldungen zum selben Inhalt werden automatisch in einem Fall gebündelt." />

      <section aria-label="Meldungen der letzten 30 Tage nach Grund" className="mb-8">
        <p className="spec mb-2">Letzte 30 Tage · {num(total30)} Meldungen</p>
        <ul className="flex flex-wrap border-l border-line">
          {REPORT_REASONS.map((k) => {
            const n = r.byReason[k] ?? 0;
            return (
              <li key={k} className="border-r border-line px-4 py-2">
                <Link href={`/admin/meldungen?grund=${k}`} className="group block">
                  <span className="block text-[18px] font-semibold num">{num(n)}</span>
                  <span className="text-xs text-muted group-hover:text-ink">{REPORT_REASON_LABEL[k]}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </section>

      <FilterBar>
        <FilterField label="Grund">
          <select name="grund" defaultValue={reason ?? ""} className={filterInput}>
            <option value="">Alle</option>
            {REPORT_REASONS.map((k) => (
              <option key={k} value={k}>
                {REPORT_REASON_LABEL[k]}
              </option>
            ))}
          </select>
        </FilterField>
        <FilterField label="Inhaltstyp">
          <select name="typ" defaultValue={targetType ?? ""} className={filterInput}>
            <option value="">Alle</option>
            {Object.entries(TARGET_TYPE_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </FilterField>
      </FilterBar>

      <Table caption="Meldungen">
        <thead>
          <tr>
            <Th>Eingang</Th>
            <Th>Grund</Th>
            <Th>Inhalt</Th>
            <Th>Details</Th>
            <Th>Meldend</Th>
            <Th>Fall</Th>
          </tr>
        </thead>
        <tbody>
          {r.rows.length === 0 && <EmptyRow cols={6}>Keine Meldungen für diese Auswahl.</EmptyRow>}
          {r.rows.map((x) => (
            <Tr key={x.id}>
              <Td className="whitespace-nowrap text-muted">{dateTime(x.createdAt)}</Td>
              <Td className="whitespace-nowrap">{REPORT_REASON_LABEL[x.reason as keyof typeof REPORT_REASON_LABEL] ?? x.reason}</Td>
              <Td className="whitespace-nowrap">
                <span className="spec">{TARGET_TYPE_LABEL[x.targetType]}</span>
                <span className="ml-1.5 font-mono text-[11px] text-muted">{x.targetId.slice(-8)}</span>
              </Td>
              <Td className="max-w-[360px]">
                <span className="line-clamp-2 text-ink-2">{x.details || "–"}</span>
              </Td>
              <Td className="whitespace-nowrap text-muted">@{x.reporter.profile?.handle ?? "–"}</Td>
              <Td className="whitespace-nowrap">
                {x.case ? (
                  <span className="flex items-center gap-2">
                    <Link href={`/admin/moderation/${x.case.id}`} className="font-mono font-semibold hover:underline">
                      Nº {x.case.number}
                    </Link>
                    <RiskMeter score={x.case.riskScore} />
                    <Badge>{CASE_STATUS_LABEL[x.case.status]}</Badge>
                  </span>
                ) : (
                  "–"
                )}
              </Td>
            </Tr>
          ))}
        </tbody>
      </Table>
      <Pager page={r.page} pages={r.pages} href={qs} />
    </div>
  );
}
