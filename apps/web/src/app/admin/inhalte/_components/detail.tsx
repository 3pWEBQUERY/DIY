import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { MODERATION_ACTION_LABEL, type ModerationActionKind } from "@werkraum/shared";
import { CASE_STATUS_LABEL, TARGET_TYPE_LABEL } from "@/server/admin/guard";
import { reasonLabel } from "@/server/moderation/service";
import type { DetailKind, TargetContext } from "@/server/admin/content-detail";
import { ActionButton, ReasonButton } from "@/components/admin/action-controls";
import { EmptyRow, RiskMeter, Table, Td, Th, Tr } from "@/components/admin/ui";
import { dateTime, num, shortDate } from "@/components/admin/format";
import { Avatar, Badge, SectionTitle } from "@/components/ui/misc";
import { cn, relativeTime } from "@/lib/utils";
import { moderateCommentAction, removeContentAction, restoreContentAction, setDetailFeaturedAction, setDetailHiddenAction } from "../actions";

/* ───────── Labels ───────── */

export const STATE_LABEL: Record<string, string> = { PUBLISHED: "Veröffentlicht", DRAFT: "Entwurf", SCHEDULED: "Geplant", HIDDEN: "Ausgeblendet", REMOVED: "Entfernt" };
export const stateTone = (s: string) => (s === "PUBLISHED" ? "moss" : s === "DRAFT" || s === "SCHEDULED" ? "neutral" : "danger") as "moss" | "neutral" | "danger";
export const POST_KIND_LABEL: Record<string, string> = {
  TEXT: "Text",
  MEDIA: "Medien",
  PROJECT_UPDATE: "Projekt-Update",
  PROJECT_SHOWCASE: "Projekt-Vorstellung",
  TUTORIAL: "Anleitung",
  ARTICLE: "Artikel",
  PRODUCT: "Produkt",
  REPOST: "Weitergeteilt",
};

export const VISIBILITY_SHORT: Record<string, string> = { PUBLIC: "Öffentlich", FOLLOWERS: "Nur Follower", PRIVATE: "Privat" };

const AUDIT_LABEL: Record<string, string> = {
  "admin.content_edited": "Angaben bearbeitet",
  "admin.content_featured": "Hervorgehoben",
  "admin.content_unfeatured": "Hervorhebung entfernt",
  "admin.content_hidden": "Ausgeblendet",
  "admin.content_restored": "Wieder angezeigt",
  "admin.content_removed": "Entfernt",
  "admin.content_reinstated": "Wiederhergestellt",
  "admin.comments_locked": "Kommentare gesperrt",
  "admin.comments_unlocked": "Kommentare geöffnet",
  "admin.comment_hidden": "Kommentar ausgeblendet",
  "admin.comment_removed": "Kommentar entfernt",
  "admin.comment_restored": "Kommentar wiederhergestellt",
  "project.remove": "Projekt entfernt",
  "tutorial.remove": "Anleitung entfernt",
  "moderation.case_assigned": "Fall zugewiesen",
  "moderation.case_released": "Fall freigegeben",
};

export const DETAIL_PATH: Record<DetailKind, string> = { PROJECT: "projekte", TUTORIAL: "anleitungen", POST: "beitraege", ARTICLE: "artikel" };

/* ───────── Kopf ───────── */

type Author = { id: string; status: string; profile: { handle: string; displayName: string; avatarUrl: string | null } | null };

export function DetailHeader({
  backHref,
  backLabel,
  spec,
  title,
  coverUrl,
  badges,
  publicHref,
  author,
  actions,
}: {
  backHref: string;
  backLabel: string;
  spec: string;
  title: string;
  coverUrl?: string | null;
  badges: ReactNode;
  publicHref?: string | null;
  author: Author;
  actions: ReactNode;
}) {
  return (
    <>
      <Link href={backHref} className="mb-5 inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink">
        <ArrowLeft size={14} aria-hidden /> {backLabel}
      </Link>
      <header className="mb-8 flex flex-wrap items-end justify-between gap-6 border-b border-rule pb-5">
        <div className="flex min-w-0 items-center gap-4">
          {coverUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={coverUrl} alt="" className="size-16 shrink-0 rounded-2xl border border-line object-cover" />
          ) : (
            <span aria-hidden className="grid size-16 shrink-0 place-items-center rounded-2xl border border-line bg-sunken font-mono text-[11px] text-muted">
              ohne Bild
            </span>
          )}
          <div className="min-w-0">
            <p className="spec mb-1 truncate">{spec}</p>
            <h1 className="display break-words text-[2.2rem]">{title}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
              <Link href={`/admin/nutzer/${author.id}`} className="inline-flex items-center gap-1.5 text-ink-2 hover:underline">
                <Avatar src={author.profile?.avatarUrl} name={author.profile?.displayName ?? "?"} size={20} />@{author.profile?.handle ?? "–"}
              </Link>
              {author.status !== "ACTIVE" && <Badge tone="danger">Konto {author.status === "DELETED" ? "gelöscht" : "gesperrt"}</Badge>}
              {badges}
              {publicHref && (
                <Link href={publicHref} target="_blank" className="inline-flex items-center gap-1 text-xs text-muted hover:text-ink">
                  Öffentlich ansehen <ExternalLink size={12} aria-hidden />
                </Link>
              )}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">{actions}</div>
      </header>
    </>
  );
}

/** Standard-Kopfaktionen: Hervorheben, Ausblenden/Anzeigen, Entfernen/Wiederherstellen (Admin). */
export function StateActions({
  kind,
  id,
  state,
  featured,
  canFeature,
  canRemove,
  isAdmin,
}: {
  kind: DetailKind;
  id: string;
  state: string;
  featured?: boolean;
  /** null = Inhaltsart kennt keine Hervorhebung */
  canFeature: boolean | null;
  canRemove: boolean;
  isAdmin: boolean;
}) {
  return (
    <>
      {canFeature !== null && (featured || (canFeature && state === "PUBLISHED")) && (
        <ActionButton action={setDetailFeaturedAction.bind(null, kind, id, !featured)} label={featured ? "Nicht mehr hervorheben" : "Hervorheben"} variant={featured ? "ghost" : "outline"} />
      )}
      {state === "PUBLISHED" && (
        <ReasonButton
          action={setDetailHiddenAction.bind(null, kind, id, true)}
          label="Ausblenden"
          variant="outline"
          title="Inhalt ausblenden"
          description="Der Inhalt ist danach nur noch für die Person selbst sichtbar. Für Regelverstösse besser einen Moderationsfall nutzen."
          reasonLabel="Begründung"
          reasonHint="Wird protokolliert und der Person in der Benachrichtigung angezeigt."
          confirmLabel="Ausblenden"
        />
      )}
      {state === "HIDDEN" && (
        <ReasonButton action={setDetailHiddenAction.bind(null, kind, id, false)} label="Wieder anzeigen" variant="outline" title="Inhalt wieder anzeigen" confirmLabel="Anzeigen" />
      )}
      {isAdmin && canRemove && state !== "REMOVED" && (
        <ReasonButton
          action={removeContentAction.bind(null, kind, id)}
          label="Entfernen"
          variant="danger"
          confirmVariant="danger"
          title="Inhalt entfernen"
          description="Der Inhalt wird für alle unsichtbar und bleibt für Einsprüche und das Audit-Protokoll erhalten. Bei gemeldeten Inhalten bitte den Moderationsfall nutzen."
          withPublicNote
          confirmLabel="Endgültig entfernen"
        />
      )}
      {isAdmin && canRemove && state === "REMOVED" && (
        <ReasonButton
          action={restoreContentAction.bind(null, kind, id)}
          label="Wiederherstellen"
          variant="outline"
          title="Inhalt wiederherstellen"
          description="Der Inhalt wird wieder veröffentlicht – oder als Entwurf hergestellt, falls er nie veröffentlicht war."
          confirmLabel="Wiederherstellen"
        />
      )}
    </>
  );
}

/* ───────── Kennzahlen & Daten ───────── */

export function StatGrid({ items }: { items: [string, number | null | undefined, string?][] }) {
  return (
    <dl className="mt-4 grid grid-cols-2 gap-y-4 sm:grid-cols-4">
      {items.map(([l, v, note]) => (
        <div key={l} className="border-l border-line pl-4">
          <dt className="spec">{l}</dt>
          <dd className="mt-1 text-xl font-semibold num">{num(v)}</dd>
          {note && <dd className="text-xs text-muted">{note}</dd>}
        </div>
      ))}
    </dl>
  );
}

export function MetaList({ items }: { items: [string, ReactNode][] }) {
  return (
    <dl className="mt-3 space-y-3 text-[13px]">
      {items.map(([l, v]) => (
        <div key={l}>
          <dt className="spec">{l}</dt>
          <dd className="break-words">{v ?? "–"}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Mono({ children }: { children: ReactNode }) {
  return <span className="font-mono text-[12px]">{children}</span>;
}

/** Textvorschau in weicher Karte. */
export function Preview({ text, empty = "Kein Textinhalt.", limit = 1600, footer }: { text?: string | null; empty?: string; limit?: number; footer?: ReactNode }) {
  const t = (text ?? "").trim();
  return (
    <article className="mt-4 rounded-2xl border border-line bg-card">
      <div className="p-4">
        {t ? (
          <p className="whitespace-pre-wrap break-words font-serif text-[16px] leading-relaxed text-ink-2">
            {t.slice(0, limit)}
            {t.length > limit && <span className="text-muted"> … ({num(t.length - limit)} weitere Zeichen)</span>}
          </p>
        ) : (
          <p className="text-sm text-muted">{empty}</p>
        )}
      </div>
      {footer && <div className="border-t border-line px-4 py-3">{footer}</div>}
    </article>
  );
}

export function Facts({ items }: { items: [string, ReactNode][] }) {
  return (
    <dl className="flex flex-wrap gap-x-6 gap-y-2">
      {items.map(([l, v]) => (
        <div key={l}>
          <dt className="spec">{l}</dt>
          <dd className="text-[13px]">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

/* ───────── Kommentare ───────── */

export function CommentsSection({ n, ctx, isAdmin, note }: { n: string; ctx: TargetContext; isAdmin: boolean; note?: ReactNode }) {
  const s = ctx.commentStats;
  return (
    <section aria-labelledby={`c${n}`}>
      <SectionTitle n={n} title={<span id={`c${n}`}>Kommentare ({num(s.total)})</span>} />
      <p className="mt-2 text-[13px] text-muted">
        {num(s.published)} sichtbar · {num(s.hidden)} ausgeblendet · {num(s.removed)} entfernt{s.total > ctx.comments.length ? ` · die neuesten ${ctx.comments.length} werden angezeigt` : ""}
      </p>
      {note}
      {ctx.comments.length === 0 ? (
        <p className="mt-3 text-sm text-muted">Noch keine Kommentare.</p>
      ) : (
        <ol className="mt-3 divide-y divide-line border-y border-line">
          {ctx.comments.map((c) => (
            <li key={c.id} className={cn("flex flex-wrap items-start gap-x-4 gap-y-2 py-3", c.parentId && "pl-6")}>
              <Avatar src={c.author.profile?.avatarUrl} name={c.author.profile?.displayName ?? "?"} size={28} />
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2 text-[13px]">
                  <Link href={`/admin/nutzer/${c.author.id}`} className="font-semibold hover:underline">
                    @{c.author.profile?.handle ?? "–"}
                  </Link>
                  <span className="text-muted" title={dateTime(c.createdAt)}>
                    {relativeTime(c.createdAt)}
                    {c.editedAt ? " · bearbeitet" : ""}
                  </span>
                  {c.parentId && <span className="spec">Antwort</span>}
                  {c.isAnswer && <Badge tone="moss">Antwort markiert</Badge>}
                  {c.state !== "PUBLISHED" && <Badge tone={stateTone(c.state)}>{STATE_LABEL[c.state]}</Badge>}
                  {c.likeCount > 0 && <span className="text-xs text-muted">♥ {num(c.likeCount)}</span>}
                </p>
                <p className={cn("mt-1 whitespace-pre-wrap break-words text-[14px] leading-relaxed", c.state === "PUBLISHED" ? "text-ink-2" : "text-muted line-through decoration-line-strong")}>
                  {c.body.length > 600 ? `${c.body.slice(0, 600)} …` : c.body}
                </p>
              </div>
              <div className="flex shrink-0 gap-1.5">
                {c.state === "PUBLISHED" && (
                  <ReasonButton
                    action={moderateCommentAction.bind(null, c.id, "HIDE")}
                    label="Ausblenden"
                    variant="ghost"
                    title="Kommentar ausblenden"
                    reasonLabel="Begründung"
                    reasonHint="Wird protokolliert und der Person in der Benachrichtigung angezeigt."
                    confirmLabel="Ausblenden"
                  />
                )}
                {c.state !== "REMOVED" && (
                  <ReasonButton
                    action={moderateCommentAction.bind(null, c.id, "REMOVE")}
                    label="Entfernen"
                    variant="ghost"
                    confirmVariant="danger"
                    title="Kommentar entfernen"
                    reasonLabel="Begründung"
                    reasonHint="Wird protokolliert und der Person in der Benachrichtigung angezeigt."
                    confirmLabel="Entfernen"
                  />
                )}
                {(c.state === "HIDDEN" || (c.state === "REMOVED" && isAdmin)) && (
                  <ReasonButton action={moderateCommentAction.bind(null, c.id, "RESTORE")} label="Wiederherstellen" variant="ghost" title="Kommentar wiederherstellen" confirmLabel="Wiederherstellen" />
                )}
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

/* ───────── Meldungen & Fälle ───────── */

export function CasesSection({ n, ctx }: { n: string; ctx: TargetContext }) {
  return (
    <section aria-labelledby={`m${n}`}>
      <SectionTitle n={n} title={<span id={`m${n}`}>Meldungen & Moderationsfälle</span>} />
      <p className="mt-2 text-[13px] text-muted">
        {num(ctx.reportCount)} {ctx.reportCount === 1 ? "Meldung" : "Meldungen"} zu diesem Inhalt · {num(ctx.cases.length)} {ctx.cases.length === 1 ? "Fall" : "Fälle"} (inkl. Kommentare und Teile)
      </p>
      <Table className="mt-3" caption="Moderationsfälle">
        <thead>
          <tr>
            <Th>Fall</Th>
            <Th>Risiko</Th>
            <Th>Grund</Th>
            <Th>Betrifft</Th>
            <Th align="right">Meldungen</Th>
            <Th>Massnahme</Th>
            <Th>Status</Th>
            <Th>Datum</Th>
          </tr>
        </thead>
        <tbody>
          {ctx.cases.length === 0 && <EmptyRow cols={8}>Keine Fälle.</EmptyRow>}
          {ctx.cases.map((h) => (
            <Tr key={h.id}>
              <Td mono>
                <Link className="font-semibold hover:underline" href={`/admin/moderation/${h.id}`}>
                  Nº {h.number}
                </Link>
              </Td>
              <Td>
                <RiskMeter score={h.riskScore} />
              </Td>
              <Td>{reasonLabel(h.primaryReason)}</Td>
              <Td>{TARGET_TYPE_LABEL[h.targetType]}</Td>
              <Td align="right">{num(h.reportCount)}</Td>
              <Td>{h.actions[0] ? MODERATION_ACTION_LABEL[h.actions[0].action as ModerationActionKind] : "–"}</Td>
              <Td>
                <Badge>{CASE_STATUS_LABEL[h.status]}</Badge>
              </Td>
              <Td className="whitespace-nowrap text-muted">{shortDate(h.createdAt)}</Td>
            </Tr>
          ))}
        </tbody>
      </Table>
      {ctx.reports.length > 0 && (
        <ol className="mt-4 divide-y divide-line text-[13px]">
          {ctx.reports.map((r) => (
            <li key={r.id} className="flex flex-wrap items-baseline gap-x-4 gap-y-1 py-2">
              <span className="font-semibold">{reasonLabel(r.reason)}</span>
              {r.details && <span className="min-w-0 flex-1 truncate text-ink-2">„{r.details}“</span>}
              <Link href={`/admin/nutzer/${r.reporter.id}`} className="text-muted hover:underline">
                @{r.reporter.profile?.handle ?? "–"}
              </Link>
              {r.case && (
                <Link href={`/admin/moderation/${r.case.id}`} className="font-mono text-muted hover:underline">
                  Nº {r.case.number}
                </Link>
              )}
              <span className="ml-auto text-muted">{shortDate(r.createdAt)}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

/* ───────── Audit ───────── */

export function AuditSection({ n, ctx }: { n: string; ctx: TargetContext }) {
  return (
    <section aria-labelledby={`a${n}`}>
      <SectionTitle n={n} title={<span id={`a${n}`}>Audit-Verlauf</span>} />
      {ctx.recentAudit.length ? (
        <ol className="mt-3 divide-y divide-line text-[13px]">
          {ctx.recentAudit.map((a) => (
            <li key={a.seq} className="flex flex-wrap items-baseline gap-x-4 gap-y-1 py-2">
              <span className="font-mono text-muted">#{a.seq}</span>
              <span className="font-semibold">{AUDIT_LABEL[a.action] ?? a.action}</span>
              {a.targetType && a.targetType !== "PROJECT" && a.targetType !== "TUTORIAL" && a.targetType !== "POST" && a.targetType !== "ARTICLE" && (
                <span className="spec">{a.targetType === "MODERATION_CASE" ? "Fall" : (TARGET_TYPE_LABEL[a.targetType] ?? a.targetType)}</span>
              )}
              {a.actor ? (
                <Link href={`/admin/nutzer/${a.actor.id}`} className="text-muted hover:underline">
                  @{a.actor.profile?.handle ?? "–"}
                </Link>
              ) : (
                <span className="text-muted">System</span>
              )}
              <span className="ml-auto text-muted">{dateTime(a.createdAt)}</span>
              {a.reason && <span className="w-full text-[12.5px] text-ink-2">{a.reason}</span>}
            </li>
          ))}
        </ol>
      ) : (
        <p className="mt-3 text-sm text-muted">Keine Einträge.</p>
      )}
    </section>
  );
}
