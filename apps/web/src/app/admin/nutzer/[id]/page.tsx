import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { MODERATION_ACTION_LABEL, ROLES, categoryBySlug, type ModerationActionKind } from "@werkraum/shared";
import { AppError } from "@/server/errors";
import { hasRole } from "@/server/authz";
import { adminPage, ACCOUNT_STATUS_LABEL, CASE_STATUS_LABEL, maskEmail, ROLE_LABEL, TARGET_TYPE_LABEL } from "@/server/admin/guard";
import { getUserDetail } from "@/server/admin/users";
import { reasonLabel, userModerationHistory } from "@/server/moderation/service";
import { ActionButton, ReasonButton } from "@/components/admin/action-controls";
import { Table, Td, Th, Tr, EmptyRow, RiskMeter } from "@/components/admin/ui";
import { dateTime, num, shortDate } from "@/components/admin/format";
import { Avatar, Badge, Notice, SectionTitle } from "@/components/ui/misc";
import { relativeTime } from "@/lib/utils";
import { changeRoleAction, resetMfaAction, revokeSessionsAction, suspendUserAction, unsuspendUserAction, verifyEmailAction } from "../actions";

export const metadata: Metadata = { title: "Nutzer" };

const RANK = { MEMBER: 0, PLATFORM_MODERATOR: 1, ADMIN: 2, SUPERADMIN: 3 } as const;

export default async function UserDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await adminPage("PLATFORM_MODERATOR", `/admin/nutzer/${id}`);
  let d;
  try {
    d = await getUserDetail(actor, id);
  } catch (e) {
    if (e instanceof AppError && e.code === "NOT_FOUND") notFound();
    throw e;
  }
  const history = await userModerationHistory(id);
  const { user: u, counts } = d;
  const isAdmin = hasRole(actor, "ADMIN");
  const isSuper = hasRole(actor, "SUPERADMIN");
  const self = actor.id === u.id;
  const outranked = RANK[u.role] >= RANK[actor.role] && !isSuper;
  const canSanction = !self && !outranked && u.status !== "DELETED";
  const roleChoices = ROLES.filter((r) => r !== u.role && (isSuper || (RANK[r] < RANK.ADMIN && RANK[u.role] < RANK.ADMIN))).map((r) => ({ value: r, label: ROLE_LABEL[r] }));
  const links = (Array.isArray(u.profile?.links) ? u.profile.links : []) as { label?: string; url?: string }[];
  const suspendedActive = u.status === "SUSPENDED" && (!u.suspendedUntil || u.suspendedUntil > new Date());

  return (
    <div>
      <Link href="/admin/nutzer" className="mb-5 inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink">
        <ArrowLeft size={14} aria-hidden /> Alle Nutzer
      </Link>

      <header className="mb-8 flex flex-wrap items-end justify-between gap-6 border-b border-rule pb-5">
        <div className="flex items-center gap-4">
          <Avatar src={u.profile?.avatarUrl} name={u.profile?.displayName ?? "?"} size={64} />
          <div>
            <p className="spec mb-1">Konto · {u.id}</p>
            <h1 className="display text-[2.2rem]">{u.profile?.displayName ?? "Ohne Profil"}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
              <span className="text-muted">@{u.profile?.handle ?? "–"}</span>
              <Badge tone={u.status === "ACTIVE" ? "moss" : u.status === "DELETED" ? "neutral" : "danger"}>{ACCOUNT_STATUS_LABEL[u.status]}</Badge>
              {u.role !== "MEMBER" && <Badge tone="ink">{ROLE_LABEL[u.role]}</Badge>}
              {u.profile?.handle && u.status !== "DELETED" && (
                <Link href={`/u/${u.profile.handle}`} target="_blank" className="inline-flex items-center gap-1 text-xs text-muted hover:text-ink">
                  Profil ansehen <ExternalLink size={12} aria-hidden />
                </Link>
              )}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {canSanction && !suspendedActive && u.status !== "BANNED" && (
            <ReasonButton
              action={suspendUserAction.bind(null, u.id)}
              label="Sperren"
              variant="danger"
              confirmVariant="danger"
              title="Konto zeitweise sperren"
              description="Alle Sitzungen werden beendet. Für Sperren im Zusammenhang mit gemeldeten Inhalten bitte den Moderationsfall nutzen."
              withDays
              daysOptional
              withPublicNote
              confirmLabel="Konto sperren"
            />
          )}
          {canSanction && (suspendedActive || u.status === "BANNED") && (u.status !== "BANNED" || isAdmin) && (
            <ReasonButton action={unsuspendUserAction.bind(null, u.id)} label="Sperre aufheben" variant="outline" title="Sperre aufheben" confirmLabel="Aufheben" />
          )}
          {(canSanction || self) && counts.sessions > 0 && (
            <ActionButton action={revokeSessionsAction.bind(null, u.id)} label={`Sitzungen beenden (${counts.sessions})`} confirm="Alle aktiven Sitzungen dieses Kontos beenden?" />
          )}
          {isSuper && !self && u.totpEnabledAt && u.status !== "DELETED" && (
            <ReasonButton
              action={resetMfaAction.bind(null, u.id)}
              label="Zwei-Faktor zurücksetzen"
              variant="outline"
              title="Zwei-Faktor-Anmeldung zurücksetzen"
              description="Nur nach Identitätsprüfung, z. B. wenn Handy und Wiederherstellungscodes verloren sind. Alle Sitzungen werden beendet; die Person richtet den zweiten Faktor neu ein."
              confirmLabel="Zurücksetzen"
              confirmVariant="danger"
            />
          )}
          {isAdmin && !u.emailVerifiedAt && u.status !== "DELETED" && <ActionButton action={verifyEmailAction.bind(null, u.id)} label="E-Mail bestätigen" confirm="E-Mail-Adresse manuell als bestätigt markieren?" />}
          {isAdmin && !self && roleChoices.length > 0 && u.status !== "DELETED" && (
            <ReasonButton
              action={changeRoleAction.bind(null, u.id)}
              label="Rolle ändern"
              variant="ink"
              title="Plattformrolle ändern"
              description={isSuper ? "Administrationsrollen werden sofort wirksam." : "Administrationsrollen kann nur die Superadministration vergeben."}
              choices={roleChoices}
              choiceLabel="Neue Rolle"
              confirmLabel="Rolle speichern"
            />
          )}
        </div>
      </header>

      {u.status === "SUSPENDED" && (
        <Notice tone="danger" className="mb-8" title="Konto gesperrt">
          {u.suspendedUntil ? `Bis ${dateTime(u.suspendedUntil)}.` : "Bis auf Weiteres."}
        </Notice>
      )}

      <div className="grid gap-10 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-10">
          <section aria-labelledby="u1">
            <SectionTitle n="01" title={<span id="u1">Inhalte & Aktivität</span>} />
            <dl className="mt-4 grid grid-cols-2 gap-y-4 sm:grid-cols-4">
              {[
                ["Beiträge", counts.posts],
                ["Projekte", counts.projects],
                ["Anleitungen", counts.tutorials],
                ["Artikel", counts.articles],
                ["Kommentare", counts.comments],
                ["Produkte", counts.products],
                ["Eigene Meldungen", counts.reportsFiled],
                ["Aktive Sitzungen", counts.sessions],
              ].map(([l, v]) => (
                <div key={l} className="border-l border-line pl-4">
                  <dt className="spec">{l}</dt>
                  <dd className="mt-1 text-xl font-semibold num">{num(v as number)}</dd>
                </div>
              ))}
            </dl>
          </section>

          <section aria-labelledby="u2">
            <SectionTitle n="02" title={<span id="u2">Moderationsfälle ({history.length})</span>} />
            <Table className="mt-3" caption="Moderationsfälle">
              <thead>
                <tr>
                  <Th>Fall</Th>
                  <Th>Risiko</Th>
                  <Th>Grund</Th>
                  <Th>Inhalt</Th>
                  <Th>Massnahme</Th>
                  <Th>Status</Th>
                  <Th>Datum</Th>
                </tr>
              </thead>
              <tbody>
                {history.length === 0 && <EmptyRow cols={7}>Keine Fälle.</EmptyRow>}
                {history.map((h) => (
                  <Tr key={h.id}>
                    <Td mono><Link className="font-semibold hover:underline" href={`/admin/moderation/${h.id}`}>Nº {h.number}</Link></Td>
                    <Td><RiskMeter score={h.riskScore} /></Td>
                    <Td>{reasonLabel(h.primaryReason)}</Td>
                    <Td>{TARGET_TYPE_LABEL[h.targetType]}</Td>
                    <Td>{h.actions[0] ? MODERATION_ACTION_LABEL[h.actions[0].action as ModerationActionKind] : "–"}</Td>
                    <Td><Badge>{CASE_STATUS_LABEL[h.status]}</Badge></Td>
                    <Td className="whitespace-nowrap text-muted">{shortDate(h.createdAt)}</Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          </section>

          <section aria-labelledby="u3">
            <SectionTitle n="03" title={<span id="u3">Kontoverlauf (Audit)</span>} />
            {d.recentAudit.length ? (
              <ol className="mt-3 divide-y divide-line text-[13px]">
                {d.recentAudit.map((a) => (
                  <li key={a.seq} className="flex flex-wrap items-baseline gap-x-4 gap-y-1 py-2">
                    <span className="font-mono text-muted">#{a.seq}</span>
                    <span className="font-mono">{a.action}</span>
                    <span className="text-muted">{a.actor?.profile ? `@${a.actor.profile.handle}` : "System"}</span>
                    <span className="ml-auto text-muted">{dateTime(a.createdAt)}</span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="mt-3 text-sm text-muted">Keine Einträge.</p>
            )}
          </section>
        </div>

        <aside className="space-y-8" aria-label="Kontodaten">
          <section>
            <SectionTitle n="04" title="Konto" />
            <dl className="mt-3 space-y-3 text-[13px]">
              <div>
                <dt className="spec">E-Mail</dt>
                <dd className="font-mono">{isAdmin ? u.email : maskEmail(u.email)}</dd>
                <dd className="text-muted">{u.emailVerifiedAt ? `bestätigt ${shortDate(u.emailVerifiedAt)}` : "nicht bestätigt"}</dd>
              </div>
              <div><dt className="spec">Anmeldung</dt><dd>{[u.authAccounts.length ? u.authAccounts.map((a) => (a.provider === "apple" ? "Apple" : a.provider)).join(", ") : null, "E-Mail/Passwort"].filter(Boolean).join(" · ")}</dd></div>
              <div>
                <dt className="spec">Zwei-Faktor</dt>
                <dd className={u.totpEnabledAt ? "" : u.role !== "MEMBER" ? "font-semibold text-danger" : "text-muted"}>
                  {u.totpEnabledAt ? `aktiv seit ${shortDate(u.totpEnabledAt)}` : u.role !== "MEMBER" ? "fehlt – Pflicht für diese Rolle" : "nicht eingerichtet"}
                </dd>
              </div>
              <div><dt className="spec">Registriert</dt><dd>{dateTime(u.createdAt)}</dd></div>
              <div><dt className="spec">Zuletzt aktiv</dt><dd>{u.lastSeenAt ? relativeTime(u.lastSeenAt) : "–"}</dd></div>
              <div><dt className="spec">18+ bestätigt</dt><dd>{u.adultConfirmedAt ? shortDate(u.adultConfirmedAt) : "–"}</dd></div>
              {u.messagingRestrictedUntil && u.messagingRestrictedUntil > new Date() && (
                <div><dt className="spec">Nachrichten eingeschränkt bis</dt><dd>{dateTime(u.messagingRestrictedUntil)}</dd></div>
              )}
            </dl>
          </section>

          <section>
            <SectionTitle n="05" title="Rollen & Berechtigungen" />
            <ul className="mt-3 space-y-2 text-[13px]">
              <li className="flex justify-between"><span>Plattformrolle</span><span className="font-semibold">{ROLE_LABEL[u.role]}</span></li>
              {u.roleAssignments.map((r) => (
                <li key={r.id} className="flex justify-between gap-3">
                  <span className="font-mono text-[12px]">{r.role}</span>
                  <span className="text-muted">{r.scopeType ? `${r.scopeType} ${r.scopeId?.slice(-6)}` : "global"}</span>
                </li>
              ))}
            </ul>
            {u.shop && (
              <p className="mt-3 text-[13px]">
                Shop: <Link href={`/admin/marktplatz/${u.shop.id}`} className="font-semibold hover:underline">{u.shop.name}</Link> <Badge className="ml-1">{u.shop.status}</Badge>
              </p>
            )}
          </section>

          {u.profile && (
            <section>
              <SectionTitle n="06" title="Profil" />
              <div className="mt-3 space-y-2 text-[13px]">
                {u.profile.bio && <p className="whitespace-pre-wrap text-ink-2">{u.profile.bio}</p>}
                <p className="text-muted">{[u.profile.region, u.profile.country].filter(Boolean).join(", ") || "Ohne Ortsangabe"}</p>
                {u.profile.categories.length > 0 && <p>{u.profile.categories.map((c) => categoryBySlug(c)?.short ?? c).join(" · ")}</p>}
                {u.profile.website && <p className="truncate font-mono text-[12px]">{u.profile.website}</p>}
                {links.map((l, i) => (
                  <p key={i} className="truncate font-mono text-[12px]">{l.label}: {l.url}</p>
                ))}
              </div>
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}
