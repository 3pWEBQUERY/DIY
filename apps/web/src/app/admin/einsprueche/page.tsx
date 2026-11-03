import Link from "next/link";
import type { Metadata } from "next";
import { MODERATION_ACTION_LABEL, type ModerationActionKind } from "@werkraum/shared";
import { adminPage, TARGET_TYPE_LABEL } from "@/server/admin/guard";
import { listAppeals, reasonLabel } from "@/server/moderation/service";
import { AdminHeader, Segments } from "@/components/admin/ui";
import { ReasonButton } from "@/components/admin/action-controls";
import { dateTime } from "@/components/admin/format";
import { Badge, Empty } from "@/components/ui/misc";
import { decideAppealAction } from "./actions";

export const metadata: Metadata = { title: "Einsprüche" };

const TABS = [
  { key: "OPEN", label: "Offen" },
  { key: "OVERTURNED", label: "Stattgegeben" },
  { key: "UPHELD", label: "Abgelehnt" },
  { key: "ALL", label: "Alle" },
] as const;

export default async function AppealsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const user = await adminPage("PLATFORM_MODERATOR", "/admin/einsprueche");
  const sp = await searchParams;
  const status = TABS.find((t) => t.key === sp.status)?.key ?? "OPEN";
  const appeals = await listAppeals(user, status);

  return (
    <div>
      <AdminHeader
        n="04"
        title="Einsprüche"
        description="Betroffene können innerhalb von 14 Tagen Einspruch erheben. Geprüft wird nach dem Vier-Augen-Prinzip: nicht von der Person, die ursprünglich entschieden hat. Bei Stattgabe wird die Massnahme vollständig zurückgenommen."
      />
      <Segments active={status} items={TABS.map((t) => ({ key: t.key, label: t.label, href: `/admin/einsprueche?status=${t.key}` }))} />

      {appeals.length === 0 ? (
        <Empty title={status === "OPEN" ? "Keine offenen Einsprüche" : "Keine Einträge"} body="Neue Einsprüche erscheinen hier in der Reihenfolge ihres Eingangs." />
      ) : (
        <ol className="space-y-6">
          {appeals.map((a) => {
            const original = a.case.actions[0];
            const ownDecision = original?.moderatorId === user.id;
            const snap = (a.case.snapshot ?? {}) as { title?: string };
            return (
              <li key={a.id} className="border border-line bg-card">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-2.5">
                  <div className="flex flex-wrap items-center gap-3 text-sm">
                    <Link href={`/admin/moderation/${a.case.id}`} className="font-mono font-semibold hover:underline">
                      Fall Nº {a.case.number}
                    </Link>
                    <span className="text-muted">
                      {TARGET_TYPE_LABEL[a.case.targetType]} · {reasonLabel(a.case.primaryReason)}
                    </span>
                    {snap.title && <span className="max-w-[320px] truncate text-ink-2">„{snap.title}“</span>}
                  </div>
                  <Badge tone={a.status === "OPEN" ? "warn" : a.status === "OVERTURNED" ? "moss" : "neutral"}>{a.status === "OPEN" ? "Offen" : a.status === "OVERTURNED" ? "Stattgegeben" : "Abgelehnt"}</Badge>
                </div>
                <div className="grid gap-6 p-4 md:grid-cols-2">
                  <div>
                    <p className="spec mb-1">Ursprüngliche Entscheidung</p>
                    <p className="text-sm font-semibold">{original ? MODERATION_ACTION_LABEL[original.action as ModerationActionKind] : "–"}</p>
                    {original && <p className="mt-1 whitespace-pre-wrap text-sm text-ink-2">{original.reason}</p>}
                    {original?.publicNote && <p className="mt-1 border-l-2 border-line-strong pl-2 text-sm text-muted">An die Person: {original.publicNote}</p>}
                    <p className="spec mt-2">von @{original?.moderator.profile?.handle ?? "–"}</p>
                  </div>
                  <div>
                    <p className="spec mb-1">Einspruch von @{a.user.profile?.handle} · {dateTime(a.createdAt)}</p>
                    <p className="whitespace-pre-wrap font-serif text-[16px] leading-relaxed text-ink-2">{a.statement}</p>
                    {a.decision && (
                      <p className="mt-3 border-t border-line pt-2 text-sm">
                        <span className="spec mr-2">Entscheid</span>
                        {a.decision}
                      </p>
                    )}
                  </div>
                </div>
                {a.status === "OPEN" && (
                  <div className="flex flex-wrap items-center justify-end gap-3 border-t border-line px-4 py-3">
                    {ownDecision && <span className="mr-auto text-xs text-warn">Du hast ursprünglich entschieden – bitte eine andere Person prüfen lassen.</span>}
                    <ReasonButton
                      action={decideAppealAction.bind(null, a.id)}
                      label="Einspruch entscheiden"
                      variant="ink"
                      title={`Einspruch zu Fall Nº ${a.case.number}`}
                      description="Stattgabe hebt die Massnahme auf und stellt den vorherigen Zustand wieder her."
                      choices={[
                        { value: "UPHELD", label: "Entscheidung bestätigen (Einspruch ablehnen)" },
                        { value: "OVERTURNED", label: "Einspruch stattgeben (Massnahme aufheben)" },
                      ]}
                      choiceLabel="Ergebnis"
                      reasonLabel="Begründung an die Person"
                      reasonHint="Wird der Person angezeigt und im Fall protokolliert."
                      confirmLabel="Entscheid speichern"
                    />
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
