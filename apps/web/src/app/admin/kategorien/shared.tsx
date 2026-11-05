import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import { dateTime } from "@/components/admin/format";

/** Gemeinsame Bausteine für /admin/kategorien und die Detailseiten. */

export const STATE_LABEL: Record<string, string> = { PUBLISHED: "Veröffentlicht", DRAFT: "Entwurf", HIDDEN: "Ausgeblendet", REMOVED: "Entfernt" };
export const stateTone = (s: string) => (s === "PUBLISHED" ? "moss" : s === "DRAFT" ? "neutral" : "danger") as "moss" | "neutral" | "danger";

const ACTION_LABEL: Record<string, string> = {
  "admin.category_updated": "Bearbeitet",
  "admin.category_activated": "Aktiviert",
  "admin.category_deactivated": "Deaktiviert",
  "admin.category_reset": "Auf Standard zurückgesetzt",
  "admin.catalog_created": "Angelegt",
  "admin.catalog_updated": "Bearbeitet",
  "admin.catalog_deleted": "Gelöscht",
  "admin.catalog_merged": "In anderen Eintrag zusammengeführt",
  "admin.catalog_merged_into": "Dublette übernommen",
};

const FIELD_LABEL: Record<string, string> = { name: "Name", short: "Kurzname", description: "Beschreibung", sortOrder: "Reihenfolge", isFocus: "Startschwerpunkt" };

type AuditRow = { seq: number; action: string; meta: unknown; createdAt: Date; actor: { profile: { handle: string } | null } | null };

function fmt(v: unknown) {
  if (v === null || v === undefined || v === "") return "Standard";
  if (typeof v === "boolean") return v ? "Ja" : "Nein";
  return String(v);
}

function detail(a: AuditRow): ReactNode {
  const m = (a.meta ?? {}) as Record<string, unknown>;
  const parts: ReactNode[] = [];
  if (m.changes && typeof m.changes === "object") {
    const ch = m.changes as Record<string, { from: unknown; to: unknown }>;
    parts.push(
      Object.entries(ch)
        .map(([k, v]) => `${FIELD_LABEL[k] ?? k}: ${fmt(v.from)} → ${fmt(v.to)}`)
        .join(" · "),
    );
  }
  if (a.action === "admin.catalog_merged" && typeof m.targetName === "string") parts.push(`→ ${m.targetName}`);
  if (a.action === "admin.catalog_merged_into" && typeof m.sourceName === "string") parts.push(`aus „${m.sourceName}“`);
  if (typeof m.reason === "string") parts.push(`„${m.reason}“`);
  return parts.length ? parts.map((p, i) => <span key={i} className="block">{p}</span>) : null;
}

export function AuditHistory({ rows }: { rows: AuditRow[] }) {
  if (!rows.length) return <p className="mt-3 text-sm text-muted">Keine Einträge.</p>;
  return (
    <ol className="mt-3 divide-y divide-line text-[13px]">
      {rows.map((a) => (
        <li key={a.seq} className="grid gap-x-4 gap-y-1 py-2.5 sm:grid-cols-[auto_minmax(0,1fr)_auto]">
          <span className="font-mono text-muted">#{a.seq}</span>
          <span className="min-w-0">
            <span className="font-semibold">{ACTION_LABEL[a.action] ?? a.action}</span>
            <span className="ml-2 text-muted">{a.actor?.profile ? `@${a.actor.profile.handle}` : "System"}</span>
            {detail(a) && <span className="mt-0.5 block text-ink-2">{detail(a)}</span>}
          </span>
          <span className="whitespace-nowrap text-muted">{dateTime(a.createdAt)}</span>
        </li>
      ))}
    </ol>
  );
}

export function BackLink({ href = "/admin/kategorien", children = "Kategorien & Materialien" }: { href?: string; children?: ReactNode }) {
  return (
    <Link href={href} className="mb-5 inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink">
      <ArrowLeft size={14} aria-hidden /> {children}
    </Link>
  );
}
