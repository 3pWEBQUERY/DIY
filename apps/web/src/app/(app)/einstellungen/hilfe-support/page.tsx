import Link from "next/link";
import type { Metadata } from "next";
import { SUPPORT_STATUS_LABEL, SUPPORT_TOPIC_LABEL, type SupportStatus, type SupportTopic } from "@werkraum/shared";
import { requireUser } from "@/server/auth/session";
import { listOwnTickets } from "@/server/account/service";
import { SettingsSection } from "@/components/settings/section";
import { SupportForm } from "@/components/settings/support-form";
import { Badge } from "@/components/ui/misc";
import { formatDate } from "@/lib/utils";

export const metadata: Metadata = { title: "Hilfe & Support" };

const QUICK = [
  { href: "/hilfe", label: "Häufige Fragen", note: "Konto, Projekte, Shop, Sicherheit" },
  { href: "/richtlinien/community", label: "Community-Richtlinien", note: "Was erlaubt ist – und was nicht" },
  { href: "/richtlinien/marktplatz", label: "Marktplatz-Richtlinien", note: "Verkaufen, Gebühren, Rückgaben" },
  { href: "/richtlinien/sicherheit", label: "Sicherheit beim Selbermachen", note: "Strom, Hitze, Chemie, Werkzeuge" },
];

export default async function SupportSettingsPage() {
  const user = await requireUser({ allowSuspended: true });
  const tickets = await listOwnTickets(user.id);
  return (
    <div>
      <SettingsSection n="01" title="Schnelle Antworten">
        <ul className="grid gap-px border border-line bg-line sm:grid-cols-2">
          {QUICK.map((q) => (
            <li key={q.href} className="bg-paper">
              <Link href={q.href} className="block px-4 py-3 hover:bg-sunken">
                <span className="block text-sm font-semibold">{q.label} →</span>
                <span className="block text-xs text-muted">{q.note}</span>
              </Link>
            </li>
          ))}
        </ul>
      </SettingsSection>

      <SettingsSection n="02" title="Schreib uns" description="Menschen lesen deine Nachricht – kein Bot. Du erhältst sofort eine Eingangsbestätigung per E-Mail.">
        <SupportForm email={user.email} />
      </SettingsSection>

      {tickets.length > 0 && (
        <SettingsSection n="03" title="Deine Anfragen">
          <ul className="divide-y divide-line border-y border-line">
            {tickets.map((t) => (
              <li key={t.id} className="flex flex-wrap items-center gap-3 py-2.5 text-sm">
                <span className="font-mono text-[12px] text-muted">#{t.id.slice(-6).toUpperCase()}</span>
                <span className="min-w-0 flex-1 truncate font-medium">{t.subject}</span>
                <span className="text-xs text-muted">{SUPPORT_TOPIC_LABEL[t.topic as SupportTopic] ?? t.topic} · {formatDate(t.createdAt, { day: "numeric", month: "short" })}</span>
                <Badge tone={t.status === "CLOSED" ? "neutral" : t.status === "WAITING" ? "warn" : "moss"}>{SUPPORT_STATUS_LABEL[t.status as SupportStatus] ?? t.status}</Badge>
              </li>
            ))}
          </ul>
        </SettingsSection>
      )}
    </div>
  );
}
