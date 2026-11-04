import Link from "next/link";
import type { Metadata } from "next";
import { ROLES } from "@werkraum/shared";
import { adminPage, ACCOUNT_STATUS_LABEL, maskEmail, ROLE_LABEL } from "@/server/admin/guard";
import { listUsers } from "@/server/admin/users";
import { AdminHeader, EmptyRow, FilterBar, FilterField, Pager, Table, Td, Th, Tr, filterInput } from "@/components/admin/ui";
import { Avatar, Badge } from "@/components/ui/misc";
import { num, shortDate } from "@/components/admin/format";
import { relativeTime } from "@/lib/utils";
import { Select } from "@/components/ui/select";

export const metadata: Metadata = { title: "Nutzer" };

type SP = { q?: string; status?: string; rolle?: string; seite?: string };

export default async function UsersPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await adminPage("PLATFORM_MODERATOR", "/admin/nutzer");
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.seite) || 1);
  const r = await listUsers(user, { q: sp.q, status: sp.status, role: sp.rolle, page });
  const qs = (p: number) => `/admin/nutzer?${new URLSearchParams(Object.entries({ ...sp, seite: String(p) }).filter(([, v]) => v) as [string, string][])}`;

  return (
    <div>
      <AdminHeader
        n="05"
        title="Nutzer"
        description={<>Suche nach @handle, Name oder exakter E-Mail-Adresse. E-Mail-Adressen sind in Listen maskiert (Datensparsamkeit). {num(r.total)} Treffer.</>}
      />
      <FilterBar>
        <FilterField label="Suche">
          <input name="q" defaultValue={sp.q ?? ""} placeholder="@handle, Name, E-Mail" className={`${filterInput} w-64`} />
        </FilterField>
        <FilterField label="Status">
          <Select name="status" defaultValue={sp.status ?? ""} className="h-9 w-auto min-w-[160px] text-[13.5px]">
            <option value="">Alle</option>
            {Object.entries(ACCOUNT_STATUS_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </Select>
        </FilterField>
        <FilterField label="Rolle">
          <Select name="rolle" defaultValue={sp.rolle ?? ""} className="h-9 w-auto min-w-[160px] text-[13.5px]">
            <option value="">Alle</option>
            {ROLES.map((k) => (
              <option key={k} value={k}>
                {ROLE_LABEL[k]}
              </option>
            ))}
          </Select>
        </FilterField>
      </FilterBar>

      <Table caption="Nutzerkonten">
        <thead>
          <tr>
            <Th>Mitglied</Th>
            <Th>E-Mail</Th>
            <Th>Rolle</Th>
            <Th>Status</Th>
            <Th align="right">Projekte</Th>
            <Th align="right">Follower</Th>
            <Th align="right">Fälle</Th>
            <Th>Zuletzt aktiv</Th>
            <Th>Seit</Th>
          </tr>
        </thead>
        <tbody>
          {r.rows.length === 0 && <EmptyRow cols={9}>Keine Konten gefunden.</EmptyRow>}
          {r.rows.map((u) => (
            <Tr key={u.id}>
              <Td>
                <Link href={`/admin/nutzer/${u.id}`} className="flex items-center gap-2.5 hover:underline">
                  <Avatar src={u.profile?.avatarUrl} name={u.profile?.displayName ?? "?"} size={26} />
                  <span className="min-w-0">
                    <span className="block truncate font-semibold">{u.profile?.displayName ?? "Ohne Profil"}</span>
                    <span className="block text-xs text-muted">@{u.profile?.handle ?? "–"}</span>
                  </span>
                </Link>
              </Td>
              <Td mono className="text-muted">
                {maskEmail(u.email)}
                {!u.emailVerifiedAt && <span className="ml-1.5 text-warn" title="Nicht bestätigt">●</span>}
              </Td>
              <Td>{u.role === "MEMBER" ? <span className="text-muted">Mitglied</span> : <Badge tone="ink">{ROLE_LABEL[u.role]}</Badge>}</Td>
              <Td>
                <Badge tone={u.status === "ACTIVE" ? "moss" : u.status === "DELETED" ? "neutral" : "danger"}>{ACCOUNT_STATUS_LABEL[u.status]}</Badge>
                {u.shop && <span className="spec ml-1.5">Shop</span>}
              </Td>
              <Td align="right">{num(u.profile?.projectCount ?? 0)}</Td>
              <Td align="right">{num(u.profile?.followerCount ?? 0)}</Td>
              <Td align="right" className={u._count.moderationSubject ? "text-clay-ink" : "text-muted"}>
                {u._count.moderationSubject}
              </Td>
              <Td className="whitespace-nowrap text-muted">{u.lastSeenAt ? relativeTime(u.lastSeenAt) : "–"}</Td>
              <Td className="whitespace-nowrap text-muted">{shortDate(u.createdAt)}</Td>
            </Tr>
          ))}
        </tbody>
      </Table>
      <Pager page={r.page} pages={r.pages} href={qs} />
    </div>
  );
}
