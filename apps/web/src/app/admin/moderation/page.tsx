import Link from "next/link";
import type { Metadata } from "next";
import type { ModerationCaseStatus, TargetType } from "@/server/db";
import { adminPage, CASE_STATUS_LABEL, TARGET_TYPE_LABEL } from "@/server/admin/guard";
import { listQueue, reasonLabel } from "@/server/moderation/service";
import { AdminHeader, EmptyRow, FilterBar, FilterField, Pager, RiskMeter, Segments, Table, Td, Th, Tr, filterInput } from "@/components/admin/ui";
import { Badge } from "@/components/ui/misc";
import { relativeTime } from "@/lib/utils";
import { Select } from "@/components/ui/select";

export const metadata: Metadata = { title: "Moderation" };

const STATUS_TABS: { key: string; label: string }[] = [
  { key: "ACTIVE", label: "Zu bearbeiten" },
  { key: "OPEN", label: "Offen" },
  { key: "IN_REVIEW", label: "In Prüfung" },
  { key: "APPEALED", label: "Einspruch" },
  { key: "RESOLVED", label: "Entschieden" },
  { key: "CLOSED", label: "Abgeschlossen" },
  { key: "ALL", label: "Alle" },
];

type SP = { status?: string; typ?: string; zugewiesen?: string; q?: string; seite?: string };

export default async function ModerationQueue({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await adminPage("PLATFORM_MODERATOR", "/admin/moderation");
  const sp = await searchParams;
  const status = (STATUS_TABS.some((s) => s.key === sp.status) ? sp.status : "ACTIVE") as ModerationCaseStatus | "ACTIVE" | "ALL";
  const targetType = sp.typ && sp.typ in TARGET_TYPE_LABEL ? (sp.typ as TargetType) : null;
  const assignee = sp.zugewiesen === "me" || sp.zugewiesen === "none" ? sp.zugewiesen : null;
  const page = Math.max(1, Number(sp.seite) || 1);
  const q = await listQueue(user, { status, targetType, assignee, q: sp.q }, page);

  const qs = (patch: Partial<SP>) => {
    const p = new URLSearchParams(Object.entries({ ...sp, ...patch }).filter(([, v]) => v) as [string, string][]);
    return `/admin/moderation${p.size ? `?${p}` : ""}`;
  };
  const activeCount = (q.byStatus.OPEN ?? 0) + (q.byStatus.IN_REVIEW ?? 0) + (q.byStatus.APPEALED ?? 0);

  return (
    <div>
      <AdminHeader
        n="02"
        title="Moderation"
        description="Fälle sind nach Risiko und Alter priorisiert. Die automatische Einstufung ersetzt keine menschliche Prüfung – jede Entscheidung braucht eine Begründung und ist anfechtbar."
      />

      <Segments
        active={status}
        items={STATUS_TABS.map((s) => ({
          key: s.key,
          label: s.label,
          href: qs({ status: s.key, seite: undefined }),
          count: s.key === "ACTIVE" ? activeCount : s.key === "ALL" ? undefined : (q.byStatus[s.key as ModerationCaseStatus] ?? 0),
        }))}
      />

      <FilterBar>
        <input type="hidden" name="status" value={status} />
        <FilterField label="Suche">
          <input name="q" defaultValue={sp.q ?? ""} placeholder="Fall-Nr., @handle oder ID" className={`${filterInput} w-56`} />
        </FilterField>
        <FilterField label="Inhaltstyp">
          <Select name="typ" defaultValue={targetType ?? ""} className="h-9 w-auto min-w-[160px] text-[13.5px]">
            <option value="">Alle</option>
            {Object.entries(TARGET_TYPE_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </Select>
        </FilterField>
        <FilterField label="Zuweisung">
          <Select name="zugewiesen" defaultValue={assignee ?? ""} className="h-9 w-auto min-w-[160px] text-[13.5px]">
            <option value="">Alle</option>
            <option value="me">Mir zugewiesen</option>
            <option value="none">Nicht zugewiesen</option>
          </Select>
        </FilterField>
      </FilterBar>

      <Table caption="Moderationsfälle">
        <thead>
          <tr>
            <Th>Fall</Th>
            <Th>Risiko</Th>
            <Th>Grund</Th>
            <Th>Inhalt</Th>
            <Th>Betroffen</Th>
            <Th align="right">Meld.</Th>
            <Th>Eingang</Th>
            <Th>Status</Th>
            <Th>Zuständig</Th>
          </tr>
        </thead>
        <tbody>
          {q.rows.length === 0 && <EmptyRow cols={9}>Keine Fälle in dieser Ansicht. Gute Arbeit.</EmptyRow>}
          {q.rows.map((c) => {
            const snap = (c.snapshot ?? {}) as { title?: string };
            return (
              <Tr key={c.id} highlight={c.riskScore >= 60 && (c.status === "OPEN" || c.status === "IN_REVIEW")}>
                <Td mono>
                  <Link href={`/admin/moderation/${c.id}`} className="font-semibold text-ink underline-offset-2 hover:underline">
                    Nº {c.number}
                  </Link>
                </Td>
                <Td>
                  <RiskMeter score={c.riskScore} />
                </Td>
                <Td className="whitespace-nowrap">{reasonLabel(c.primaryReason)}</Td>
                <Td className="max-w-[280px]">
                  <span className="spec mr-1.5">{TARGET_TYPE_LABEL[c.targetType]}</span>
                  <span className="line-clamp-1">{snap.title || "–"}</span>
                </Td>
                <Td className="whitespace-nowrap">
                  {c.subjectUser?.profile ? (
                    <Link href={`/admin/nutzer/${c.subjectUser.id}`} className="hover:underline">
                      @{c.subjectUser.profile.handle}
                    </Link>
                  ) : (
                    "–"
                  )}
                  {c.subjectUser && c.subjectUser.status !== "ACTIVE" && <Badge tone="danger" className="ml-1.5">{c.subjectUser.status === "BANNED" ? "Gebannt" : "Gesperrt"}</Badge>}
                </Td>
                <Td align="right">{c.reportCount}</Td>
                <Td className="whitespace-nowrap text-muted">{relativeTime(c.createdAt)}</Td>
                <Td>
                  <Badge tone={c.status === "OPEN" ? "clay" : c.status === "IN_REVIEW" ? "ink" : c.status === "APPEALED" ? "warn" : "neutral"}>{CASE_STATUS_LABEL[c.status]}</Badge>
                </Td>
                <Td className="whitespace-nowrap text-muted">{c.assignee?.profile ? (c.assignee.id === user.id ? "Du" : `@${c.assignee.profile.handle}`) : "–"}</Td>
              </Tr>
            );
          })}
        </tbody>
      </Table>
      <Pager page={q.page} pages={q.pages} href={(p) => qs({ seite: String(p) })} />
    </div>
  );
}
