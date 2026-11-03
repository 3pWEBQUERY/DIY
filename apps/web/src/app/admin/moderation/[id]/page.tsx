import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { MODERATION_ACTION_LABEL, type ModerationActionKind } from "@werkraum/shared";
import { AppError } from "@/server/errors";
import { adminPage, ACCOUNT_STATUS_LABEL, CASE_STATUS_LABEL, TARGET_TYPE_LABEL } from "@/server/admin/guard";
import { allowedActions, getCaseDetail, OPEN_STATUSES, reasonLabel } from "@/server/moderation/service";
import { RiskMeter } from "@/components/admin/ui";
import { ActionButton } from "@/components/admin/action-controls";
import { DecisionForm } from "@/components/admin/decision-form";
import { dateTime, shortDate } from "@/components/admin/format";
import { Avatar, Badge, Notice, SectionTitle } from "@/components/ui/misc";
import { relativeTime } from "@/lib/utils";
import { assignCaseAction, decideCaseAction } from "../actions";

export const metadata: Metadata = { title: "Fall" };

export default async function CasePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await adminPage("PLATFORM_MODERATOR", `/admin/moderation/${id}`);
  let detail;
  try {
    detail = await getCaseDetail(user, id);
  } catch (e) {
    if (e instanceof AppError && e.code === "NOT_FOUND") notFound();
    throw e;
  }
  const { case: c, preview, history, reporterStats } = detail;
  const snap = (c.snapshot ?? {}) as { title?: string; href?: string; applied?: { action?: string } };
  const isOpen = OPEN_STATUSES.includes(c.status);
  const mine = c.assigneeId === user.id;
  const allowed = allowedActions(c.targetType, !!c.subjectUserId);
  const changed = preview.exists && snap.title && preview.title !== snap.title;

  return (
    <div>
      <Link href="/admin/moderation" className="mb-5 inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink">
        <ArrowLeft size={14} aria-hidden /> Warteschlange
      </Link>

      <header className="mb-8 flex flex-wrap items-end justify-between gap-4 border-b border-ink pb-4">
        <div>
          <p className="spec mb-2">
            {TARGET_TYPE_LABEL[c.targetType]} · eingegangen {dateTime(c.createdAt)}
          </p>
          <h1 className="display text-[2.4rem]">Fall Nº {c.number}</h1>
          <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
            <Badge tone={c.status === "OPEN" ? "clay" : c.status === "IN_REVIEW" ? "ink" : c.status === "APPEALED" ? "warn" : "neutral"}>{CASE_STATUS_LABEL[c.status]}</Badge>
            <RiskMeter score={c.riskScore} />
            <span className="text-ink-2">{reasonLabel(c.primaryReason)}</span>
            <span className="text-muted">· {c.reportCount} {c.reportCount === 1 ? "Meldung" : "Meldungen"}</span>
          </div>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted">Zuständig: {c.assignee?.profile ? (mine ? "du" : `@${c.assignee.profile.handle}`) : "niemand"}</span>
          {isOpen && !mine && <ActionButton action={assignCaseAction.bind(null, c.id, true)} label={c.assigneeId ? "Übernehmen" : "Mir zuweisen"} variant="ink" />}
          {isOpen && mine && <ActionButton action={assignCaseAction.bind(null, c.id, false)} label="Freigeben" />}
        </div>
      </header>

      <div className="grid gap-10 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0 space-y-10">
          <section aria-labelledby="s1">
            <SectionTitle
              n="01"
              title={<span id="s1">Gemeldeter Inhalt</span>}
              action={
                preview.href && (
                  <Link href={preview.href} target="_blank" className="inline-flex items-center gap-1 text-xs text-muted hover:text-ink">
                    Im Kontext öffnen <ExternalLink size={12} aria-hidden />
                  </Link>
                )
              }
            />
            {!preview.exists ? (
              <Notice className="mt-4" tone="warn" title="Inhalt existiert nicht mehr">
                Der Inhalt wurde gelöscht. Zuletzt gespeicherter Titel: {snap.title || "–"}
              </Notice>
            ) : (
              <article className="mt-4 border border-line bg-card">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-2.5">
                  <span className="text-sm font-semibold">{preview.title}</span>
                  <span className="flex items-center gap-2">
                    <span className="spec">Zustand</span>
                    <Badge tone={preview.state === "PUBLISHED" || preview.state === "ACTIVE" ? "moss" : "danger"}>{preview.state}</Badge>
                  </span>
                </div>
                <div className="grid gap-4 p-4 sm:grid-cols-[minmax(0,1fr)_auto]">
                  <div className="min-w-0">
                    {preview.body ? (
                      <p className="whitespace-pre-wrap break-words font-serif text-[16px] leading-relaxed text-ink-2">{preview.body.slice(0, 2400)}</p>
                    ) : (
                      <p className="text-sm text-muted">Kein Textinhalt.</p>
                    )}
                    {preview.meta.length > 0 && (
                      <dl className="mt-4 flex flex-wrap gap-x-6 gap-y-2 border-t border-line pt-3">
                        {preview.meta.map((m) => (
                          <div key={m.label}>
                            <dt className="spec">{m.label}</dt>
                            <dd className="text-[13px]">{m.value}</dd>
                          </div>
                        ))}
                      </dl>
                    )}
                  </div>
                  {preview.imageUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={preview.imageUrl} alt="Vorschaubild des gemeldeten Inhalts" className="h-40 w-40 border border-line object-cover" />
                  )}
                </div>
              </article>
            )}
            {changed && <p className="mt-2 text-xs text-muted">Hinweis: Der Titel wurde seit der ersten Meldung geändert (ursprünglich „{snap.title}“).</p>}
          </section>

          <section aria-labelledby="s2">
            <SectionTitle n="02" title={<span id="s2">Meldungen ({c.reports.length})</span>} />
            <ol className="divide-y divide-line">
              {c.reports.map((r) => (
                <li key={r.id} className="grid gap-1 py-3 sm:grid-cols-[160px_minmax(0,1fr)]">
                  <div className="text-[13px]">
                    <p className="font-semibold">{reasonLabel(r.reason)}</p>
                    <p className="text-muted">{relativeTime(r.createdAt)}</p>
                  </div>
                  <div className="min-w-0 text-sm">
                    {r.details ? <p className="whitespace-pre-wrap break-words text-ink-2">{r.details}</p> : <p className="text-muted">Keine Details angegeben.</p>}
                    <p className="spec mt-1">
                      von @{r.reporter.profile?.handle ?? "unbekannt"} · {reporterStats[r.reporterId] ?? 1} Meldungen insgesamt
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </section>

          <section aria-labelledby="s3">
            <SectionTitle n="03" title={<span id="s3">Verlauf</span>} />
            {c.actions.length === 0 && c.appeals.length === 0 ? (
              <p className="py-4 text-sm text-muted">Noch keine Entscheidung.</p>
            ) : (
              <ol className="mt-2 border-l border-ink pl-5">
                {[
                  ...c.actions.map((a) => ({ at: a.createdAt, key: a.id, node: (
                    <>
                      <p className="text-sm font-semibold">{MODERATION_ACTION_LABEL[a.action as ModerationActionKind]}{a.until && <span className="font-normal text-muted"> · bis {shortDate(a.until)}</span>}</p>
                      <p className="mt-0.5 whitespace-pre-wrap text-sm text-ink-2">{a.reason}</p>
                      {a.publicNote && <p className="mt-1 border-l-2 border-line-strong pl-2 text-sm text-muted">An die Person: {a.publicNote}</p>}
                      <p className="spec mt-1">@{a.moderator.profile?.handle} · {dateTime(a.createdAt)}</p>
                    </>
                  ) })),
                  ...c.appeals.map((ap) => ({ at: ap.createdAt, key: ap.id, node: (
                    <>
                      <p className="text-sm font-semibold">Einspruch {ap.status === "OPEN" ? "eingereicht" : ap.status === "OVERTURNED" ? "– stattgegeben" : "– abgelehnt"}</p>
                      <p className="mt-0.5 whitespace-pre-wrap text-sm text-ink-2">{ap.statement}</p>
                      {ap.decision && <p className="mt-1 text-sm text-muted">Entscheid: {ap.decision}</p>}
                      <p className="spec mt-1">{dateTime(ap.createdAt)}{ap.status === "OPEN" && <> · <Link className="underline" href="/admin/einsprueche">zur Prüfung</Link></>}</p>
                    </>
                  ) })),
                ]
                  .sort((a, b) => a.at.getTime() - b.at.getTime())
                  .map((e) => (
                    <li key={e.key} className="relative pb-5 before:absolute before:-left-[24.5px] before:top-1.5 before:size-2 before:bg-ink">
                      {e.node}
                    </li>
                  ))}
              </ol>
            )}
          </section>
        </div>

        <aside className="space-y-10" aria-label="Entscheidung und Kontext">
          <section aria-labelledby="s4">
            <SectionTitle n="04" title={<span id="s4">Entscheidung</span>} />
            <div className="mt-4">
              {isOpen ? (
                <DecisionForm allowed={allowed} action={decideCaseAction.bind(null, c.id)} />
              ) : (
                <Notice tone={c.status === "APPEALED" ? "warn" : "neutral"} title={c.status === "APPEALED" ? "Einspruch läuft" : "Entschieden"}>
                  {snap.applied?.action ? `Massnahme: ${MODERATION_ACTION_LABEL[snap.applied.action as ModerationActionKind] ?? snap.applied.action}. ` : ""}
                  {c.resolvedAt && `Entschieden am ${dateTime(c.resolvedAt)}.`}
                </Notice>
              )}
            </div>
          </section>

          <section aria-labelledby="s5">
            <SectionTitle n="05" title={<span id="s5">Betroffene Person</span>} />
            {c.subjectUser?.profile ? (
              <div className="mt-4">
                <Link href={`/admin/nutzer/${c.subjectUser.id}`} className="flex items-center gap-3 hover:underline">
                  <Avatar src={c.subjectUser.profile.avatarUrl} name={c.subjectUser.profile.displayName} size={40} />
                  <span>
                    <span className="block text-sm font-semibold">{c.subjectUser.profile.displayName}</span>
                    <span className="block text-xs text-muted">@{c.subjectUser.profile.handle}</span>
                  </span>
                </Link>
                <dl className="mt-4 grid grid-cols-2 gap-3 border-y border-line py-3 text-[13px]">
                  <div><dt className="spec">Status</dt><dd>{ACCOUNT_STATUS_LABEL[c.subjectUser.status]}</dd></div>
                  <div><dt className="spec">Mitglied seit</dt><dd>{shortDate(c.subjectUser.createdAt)}</dd></div>
                  <div><dt className="spec">Follower</dt><dd className="num">{c.subjectUser.profile.followerCount}</dd></div>
                  <div><dt className="spec">Projekte</dt><dd className="num">{c.subjectUser.profile.projectCount}</dd></div>
                  {c.subjectUser.messagingRestrictedUntil && c.subjectUser.messagingRestrictedUntil > new Date() && (
                    <div className="col-span-2"><dt className="spec">Nachrichten eingeschränkt bis</dt><dd>{shortDate(c.subjectUser.messagingRestrictedUntil)}</dd></div>
                  )}
                </dl>
                <p className="spec mb-2 mt-4">Frühere Fälle ({history.length})</p>
                {history.length ? (
                  <ul className="divide-y divide-line text-[13px]">
                    {history.map((h) => (
                      <li key={h.id} className="flex items-baseline justify-between gap-3 py-2">
                        <Link href={`/admin/moderation/${h.id}`} className="font-mono hover:underline">Nº {h.number}</Link>
                        <span className="min-w-0 flex-1 truncate text-ink-2">{reasonLabel(h.primaryReason)} · {TARGET_TYPE_LABEL[h.targetType]}</span>
                        <span className="shrink-0 text-muted">{h.actions[0] ? MODERATION_ACTION_LABEL[h.actions[0].action as ModerationActionKind] : CASE_STATUS_LABEL[h.status]}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted">Keine früheren Fälle.</p>
                )}
              </div>
            ) : (
              <p className="mt-4 text-sm text-muted">Keine Person zugeordnet (z.B. gelöschtes Konto).</p>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}
