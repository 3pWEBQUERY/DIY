import Link from "next/link";
import type { Metadata } from "next";
import { adminPage } from "@/server/admin/guard";
import { listErrorGroups, type ErrorFilter } from "@/server/admin/errors";
import { SOURCE_LABEL, type ErrorSource } from "@/server/monitoring";
import { AdminHeader, Segments, Table, Td, Th, Tr, EmptyRow } from "@/components/admin/ui";
import { dateTime, num } from "@/components/admin/format";
import { Badge } from "@/components/ui/misc";
import { relativeTime } from "@/lib/utils";

export const metadata: Metadata = { title: "Fehler" };
export const dynamic = "force-dynamic";

const FILTERS: { key: ErrorFilter; label: string }[] = [
  { key: "open", label: "Offen" },
  { key: "resolved", label: "Erledigt" },
  { key: "ignored", label: "Ignoriert" },
];

export default async function ErrorsAdmin({ searchParams }: { searchParams: Promise<{ status?: string; quelle?: string }> }) {
  const user = await adminPage("ADMIN", "/admin/fehler");
  const sp = await searchParams;
  const filter = (FILTERS.find((f) => f.key === sp.status)?.key ?? "open") as ErrorFilter;
  const source = ["SERVER", "CLIENT", "WORKER"].includes(sp.quelle ?? "") ? sp.quelle! : null;
  const { rows, counts } = await listErrorGroups(user, filter, source);
  const q = (s: ErrorFilter, src: string | null) => `/admin/fehler?status=${s}${src ? `&quelle=${src}` : ""}`;

  return (
    <div>
      <AdminHeader
        n="13"
        title="Fehler"
        description="Unerwartete Fehler aus Server, Browser und Hintergrunddienst – gleiche Fehler sind zusammengefasst. Neue Fehler und Rückfälle melden sich per Benachrichtigung bei der Administration."
      />
      <Segments active={filter} items={FILTERS.map((f) => ({ key: f.key, label: f.label, href: q(f.key, source), count: counts[f.key] }))} />
      <div className="mt-4 flex flex-wrap gap-2 text-[13px]">
        {[null, "SERVER", "CLIENT", "WORKER"].map((s) => (
          <Link
            key={s ?? "all"}
            href={q(filter, s)}
            className={`rounded-full border px-3 py-1 ${source === s ? "border-moss bg-moss text-paper" : "border-line-strong hover:border-rule-strong"}`}
          >
            {s ? SOURCE_LABEL[s as ErrorSource] : "Alle Quellen"}
          </Link>
        ))}
      </div>
      <Table className="mt-5" caption="Fehlergruppen">
        <thead>
          <tr>
            <Th>Fehler</Th>
            <Th>Quelle</Th>
            <Th align="right">24 h</Th>
            <Th align="right">Gesamt</Th>
            <Th align="right">Personen</Th>
            <Th>Zuletzt</Th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && <EmptyRow cols={6}>{filter === "open" ? "Keine offenen Fehler. 🎉" : "Keine Einträge."}</EmptyRow>}
          {rows.map((r) => (
            <Tr key={r.id}>
              <Td className="max-w-[520px]">
                <Link href={`/admin/fehler/${r.id}`} className="block hover:underline">
                  <span className="font-semibold">{r.name}</span>
                  <span className="mt-0.5 block truncate text-[13px] text-ink-2">{r.message}</span>
                </Link>
                {r.lastPath && <span className="mt-0.5 block truncate font-mono text-[11px] text-muted">{r.lastPath}</span>}
              </Td>
              <Td>
                <Badge tone={r.source === "SERVER" ? "danger" : r.source === "WORKER" ? "warn" : "neutral"}>{SOURCE_LABEL[r.source as ErrorSource] ?? r.source}</Badge>
              </Td>
              <Td align="right" className={r.last24h ? "font-semibold" : "text-muted"}>{num(r.last24h)}</Td>
              <Td align="right">{num(r.count)}</Td>
              <Td align="right">{num(r.usersHit)}</Td>
              <Td className="whitespace-nowrap text-muted" title={dateTime(r.lastSeenAt)}>
                {relativeTime(r.lastSeenAt)}
                <span className="block text-[11px]">seit {dateTime(r.firstSeenAt)}</span>
              </Td>
            </Tr>
          ))}
        </tbody>
      </Table>
    </div>
  );
}
