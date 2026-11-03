import Link from "next/link";
import type { Metadata } from "next";
import { SUPPORT_STATUS, SUPPORT_STATUS_LABEL, SUPPORT_TOPIC_LABEL, type SupportStatus, type SupportTopic } from "@werkraum/shared";
import { hasRole } from "@/server/authz";
import { adminPage, maskEmail } from "@/server/admin/guard";
import { listTickets } from "@/server/admin/catalog";
import { AdminHeader, Segments } from "@/components/admin/ui";
import { TicketStatusSelect } from "@/components/admin/system-controls";
import { Badge, Empty } from "@/components/ui/misc";
import { dateTime } from "@/components/admin/format";
import { relativeTime } from "@/lib/utils";
import { setTicketStatusAction } from "./actions";

export const metadata: Metadata = { title: "Support" };

export default async function SupportAdmin({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const user = await adminPage("PLATFORM_MODERATOR", "/admin/support");
  const sp = await searchParams;
  const status = (SUPPORT_STATUS as readonly string[]).includes(sp.status ?? "") ? (sp.status as SupportStatus) : null;
  const { rows, byStatus } = await listTickets(user, status);
  const isAdmin = hasRole(user, "ADMIN");
  const options = SUPPORT_STATUS.map((s) => ({ value: s, label: SUPPORT_STATUS_LABEL[s] }));

  return (
    <div>
      <AdminHeader
        n="12"
        title="Support"
        description="Anfragen aus „Hilfe & Support“. Antworten erfolgen per E-Mail an die angegebene Adresse; der Status hier dokumentiert den Bearbeitungsstand."
      />
      <Segments
        active={status ?? "ACTIVE"}
        items={[
          { key: "ACTIVE", label: "Nicht abgeschlossen", href: "/admin/support", count: (byStatus.OPEN ?? 0) + (byStatus.IN_PROGRESS ?? 0) + (byStatus.WAITING ?? 0) },
          ...SUPPORT_STATUS.map((s) => ({ key: s, label: SUPPORT_STATUS_LABEL[s], href: `/admin/support?status=${s}`, count: byStatus[s] ?? 0 })),
        ]}
      />
      {rows.length === 0 ? (
        <Empty title="Keine Anfragen" body="Hier ist gerade alles erledigt." />
      ) : (
        <ol className="divide-y divide-line border-y border-line">
          {rows.map((t) => (
            <li key={t.id} className="grid gap-3 py-4 md:grid-cols-[200px_minmax(0,1fr)_180px]">
              <div className="text-[13px]">
                <Badge tone={t.topic === "SAFETY" ? "danger" : t.topic === "PRIVACY" ? "warn" : "neutral"}>{SUPPORT_TOPIC_LABEL[t.topic as SupportTopic] ?? t.topic}</Badge>
                <p className="mt-2 text-muted" title={dateTime(t.createdAt)}>{relativeTime(t.createdAt)}</p>
                <p className="mt-0.5 font-mono text-[12px] text-muted">{isAdmin ? t.email : maskEmail(t.email)}</p>
                {t.user?.profile && (
                  <Link href={`/admin/nutzer/${t.user.id}`} className="text-[12px] hover:underline">
                    @{t.user.profile.handle}
                  </Link>
                )}
              </div>
              <div className="min-w-0">
                <p className="font-semibold">{t.subject}</p>
                <p className="mt-1 whitespace-pre-wrap break-words text-sm text-ink-2">{t.body}</p>
              </div>
              <div className="flex items-start justify-end gap-2">
                {isAdmin && (
                  <a href={`mailto:${t.email}?subject=${encodeURIComponent(`Re: ${t.subject} [${t.id.slice(-6)}]`)}`} className="h-8 border border-line-strong px-3 text-[13px] leading-8 hover:border-ink">
                    Antworten
                  </a>
                )}
                <TicketStatusSelect id={t.id} status={t.status} options={options} action={setTicketStatusAction} />
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
