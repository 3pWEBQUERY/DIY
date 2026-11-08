import Link from "next/link";
import type { Metadata } from "next";
import { adminPage } from "@/server/admin/guard";
import { listAudit } from "@/server/admin/system";
import { AdminHeader, EmptyRow, FilterBar, FilterField, Pager, Table, Td, Th, Tr, filterInput } from "@/components/admin/ui";
import { AuditVerifyButton } from "@/components/admin/system-controls";
import { dateTime, num } from "@/components/admin/format";
import { verifyAuditAction } from "./actions";

export const metadata: Metadata = { title: "Audit-Protokoll" };

type SP = { aktion?: string; akteur?: string; typ?: string; ziel?: string; von?: string; bis?: string; seite?: string };

function metaSummary(meta: unknown) {
  if (!meta || typeof meta !== "object") return "";
  return Object.entries(meta as Record<string, unknown>)
    .filter(([, v]) => v !== null && v !== undefined && v !== "")
    .map(([k, v]) => `${k}=${typeof v === "object" ? JSON.stringify(v) : String(v)}`)
    .join(" · ");
}

export default async function AuditPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await adminPage("ADMIN", "/admin/audit");
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.seite) || 1);
  const r = await listAudit(user, { action: sp.aktion?.trim() || null, actor: sp.akteur?.trim() || null, targetType: sp.typ?.trim() || null, targetId: sp.ziel?.trim() || null, from: sp.von || null, to: sp.bis || null, page });
  const qs = (p: number) => `/admin/audit?${new URLSearchParams(Object.entries({ ...sp, seite: String(p) }).filter(([, v]) => v) as [string, string][])}`;

  return (
    <div>
      <AdminHeader
        n="15"
        title="Audit-Protokoll"
        description="Unveränderliches Protokoll aller kritischen Aktionen. Jeder Eintrag enthält den Hash seines Vorgängers – eine nachträgliche Änderung bricht die Kette und wird bei der Prüfung erkannt."
        actions={<AuditVerifyButton action={verifyAuditAction} />}
      />

      <div className="mb-5 flex flex-wrap gap-1.5">
        {r.prefixes.map((p) => (
          <Link key={p.prefix} href={`/admin/audit?aktion=${encodeURIComponent(p.prefix + ".")}`} className="border border-line-strong px-2 py-1 font-mono text-[11px] hover:border-rule-strong rounded-2xl">
            {p.prefix} <span className="text-muted">{num(p.n)}</span>
          </Link>
        ))}
      </div>

      <FilterBar>
        <FilterField label="Aktion (Präfix)">
          <input name="aktion" defaultValue={sp.aktion ?? ""} placeholder="moderation." className={`${filterInput} w-44 font-mono`} />
        </FilterField>
        <FilterField label="Akteur">
          <input name="akteur" defaultValue={sp.akteur ?? ""} placeholder="@handle" className={`${filterInput} w-36`} />
        </FilterField>
        <FilterField label="Zieltyp">
          <input name="typ" defaultValue={sp.typ ?? ""} placeholder="USER" className={`${filterInput} w-32 font-mono`} />
        </FilterField>
        <FilterField label="Ziel-ID">
          <input name="ziel" defaultValue={sp.ziel ?? ""} className={`${filterInput} w-48 font-mono`} />
        </FilterField>
        <FilterField label="Von">
          <input type="date" name="von" defaultValue={sp.von ?? ""} className={filterInput} />
        </FilterField>
        <FilterField label="Bis">
          <input type="date" name="bis" defaultValue={sp.bis ?? ""} className={filterInput} />
        </FilterField>
      </FilterBar>

      <p className="spec mb-2">{num(r.total)} Einträge</p>
      <Table caption="Audit-Einträge">
        <thead>
          <tr>
            <Th align="right">Seq.</Th>
            <Th>Zeitpunkt</Th>
            <Th>Aktion</Th>
            <Th>Akteur</Th>
            <Th>Ziel</Th>
            <Th>Details</Th>
            <Th>Hash</Th>
          </tr>
        </thead>
        <tbody>
          {r.rows.length === 0 && <EmptyRow cols={7}>Keine Einträge für diese Filter.</EmptyRow>}
          {r.rows.map((e) => (
            <Tr key={e.id}>
              <Td align="right" mono>{e.seq}</Td>
              <Td className="whitespace-nowrap text-muted">{dateTime(e.createdAt)}</Td>
              <Td mono className="whitespace-nowrap font-semibold">{e.action}</Td>
              <Td className="whitespace-nowrap">{e.actor?.profile ? <Link className="hover:underline" href={`/admin/nutzer/${e.actor.id}`}>@{e.actor.profile.handle}</Link> : <span className="text-muted">System</span>}</Td>
              <Td mono className="whitespace-nowrap">
                {e.targetType ? (
                  e.targetType === "USER" && e.targetId ? <Link href={`/admin/nutzer/${e.targetId}`} className="hover:underline">USER {e.targetId.slice(-8)}</Link>
                  : e.targetType === "MODERATION_CASE" && e.targetId ? <Link href={`/admin/moderation/${e.targetId}`} className="hover:underline">FALL {e.targetId.slice(-8)}</Link>
                  : `${e.targetType} ${e.targetId?.slice(-8) ?? ""}`
                ) : "–"}
              </Td>
              <Td className="max-w-[360px] font-mono text-[11px] text-ink-2"><span className="line-clamp-2 break-all">{metaSummary(e.meta) || "–"}</span></Td>
              <Td mono className="text-[11px] text-muted" title={e.hash}>{e.hash.slice(0, 10)}…</Td>
            </Tr>
          ))}
        </tbody>
      </Table>
      <Pager page={r.page} pages={r.pages} href={qs} />
    </div>
  );
}
