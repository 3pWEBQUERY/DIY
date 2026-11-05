import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { COMMUNITY_ROLE_LABEL, COMMUNITY_VISIBILITY_LABEL, categoryBySlug } from "@werkraum/shared";
import { AppError } from "@/server/errors";
import { hasRole } from "@/server/authz";
import type { PlatformRole } from "@/server/db";
import { adminPage, ACCOUNT_STATUS_LABEL, CASE_STATUS_LABEL, ROLE_LABEL, TARGET_TYPE_LABEL } from "@/server/admin/guard";
import { getCommunityAdminDetail } from "@/server/admin/communities";
import { reasonLabel } from "@/server/moderation/service";
import { ActionButton, ReasonButton } from "@/components/admin/action-controls";
import { CommunityEditButton } from "@/components/admin/community-admin";
import { EmptyRow, FilterBar, FilterField, Pager, RiskMeter, Table, Td, Th, Tr, filterInput } from "@/components/admin/ui";
import { dateTime, num, shortDate } from "@/components/admin/format";
import { Cover } from "@/components/ui/media";
import { Avatar, Badge, Notice, SectionTitle } from "@/components/ui/misc";
import { Select } from "@/components/ui/select";
import { relativeTime } from "@/lib/utils";
import {
  banMemberAction,
  removeCommunityAction,
  removeMemberAction,
  restoreCommunityAction,
  setCommunityFeaturedAction,
  setCommunityHiddenAction,
  setMemberRoleAction,
  transferOwnershipAction,
  unbanMemberAction,
  updateCommunityMetaAction,
} from "../actions";

export const metadata: Metadata = { title: "Community" };

const RANK: Record<PlatformRole, number> = { MEMBER: 0, PLATFORM_MODERATOR: 1, ADMIN: 2, SUPERADMIN: 3 };
const STATE: Record<string, string> = { PUBLISHED: "Sichtbar", HIDDEN: "Ausgeblendet", REMOVED: "Archiviert", DRAFT: "Entwurf" };
const STATE_TONE = { PUBLISHED: "moss", HIDDEN: "warn", REMOVED: "danger", DRAFT: "neutral" } as const;
const MEMBER_STATE: Record<string, string> = { ACTIVE: "Aktiv", PENDING: "Anfrage", INVITED: "Eingeladen", BANNED: "Gesperrt" };
const MEMBER_STATE_TONE = { ACTIVE: "moss", PENDING: "warn", INVITED: "neutral", BANNED: "danger" } as const;
const AUDIT_LABEL: Record<string, string> = {
  "admin.community_updated": "Angaben geändert",
  "admin.community_removed": "Archiviert",
  "admin.community_restored": "Wiederhergestellt",
  "admin.community_owner_transferred": "Leitung übertragen",
  "admin.community_member_role": "Mitgliedsrolle geändert",
  "admin.community_member_removed": "Mitglied entfernt",
  "admin.community_member_banned": "Mitglied gesperrt",
  "admin.community_member_unbanned": "Sperre aufgehoben",
  "admin.content_featured": "Hervorgehoben",
  "admin.content_unfeatured": "Hervorhebung entfernt",
  "admin.content_hidden": "Ausgeblendet",
  "admin.content_restored": "Wieder angezeigt",
};
const ROLE_CHOICES = (["ADMIN", "MODERATOR", "MEMBER"] as const).map((r) => ({ value: r, label: COMMUNITY_ROLE_LABEL[r] }));

type SP = { q?: string; status?: string; seite?: string };

export default async function CommunityDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<SP> }) {
  const { id } = await params;
  const sp = await searchParams;
  const actor = await adminPage("PLATFORM_MODERATOR", `/admin/communities/${id}`);
  const page = Math.max(1, Number(sp.seite) || 1);
  let d;
  try {
    d = await getCommunityAdminDetail(actor, id, { q: sp.q, state: sp.status, page });
  } catch (e) {
    if (e instanceof AppError && e.code === "NOT_FOUND") notFound();
    throw e;
  }
  const { community: c, counts, members } = d;
  const isAdmin = hasRole(actor, "ADMIN");
  const isSuper = hasRole(actor, "SUPERADMIN");
  const removed = c.state === "REMOVED";
  const category = categoryBySlug(c.category);
  const ownerName = c.owner.profile?.displayName ?? "Ohne Profil";
  const qs = (p: number) => `/admin/communities/${id}?${new URLSearchParams(Object.entries({ q: sp.q ?? "", status: sp.status ?? "", seite: String(p) }).filter(([, v]) => v))}`;
  const transferChoices = d.transferCandidates.map((m) => ({ value: m.userId, label: `${m.displayName}${m.handle ? ` (@${m.handle})` : ""} · ${COMMUNITY_ROLE_LABEL[m.role]}` }));
  const filtered = !!(sp.q || sp.status);

  return (
    <div>
      <Link href="/admin/communities" className="mb-5 inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink">
        <ArrowLeft size={14} aria-hidden /> Alle Communities
      </Link>

      <header className="mb-8 flex flex-wrap items-end justify-between gap-6 border-b border-rule pb-5">
        <div className="flex items-center gap-4">
          <Cover url={c.coverUrl} alt="" seed={c.id} category={c.category} ratio="1/1" className="w-16 shrink-0 rounded-2xl border border-line" sizes="64px" />
          <div className="min-w-0">
            <p className="spec mb-1">Community · {c.id}</p>
            <h1 className="display text-[2.2rem]">{c.name}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
              <span className="text-muted">/c/{c.slug}</span>
              <Badge tone={STATE_TONE[c.state]}>{STATE[c.state]}</Badge>
              <Badge tone="outline">{COMMUNITY_VISIBILITY_LABEL[c.visibility]}</Badge>
              {c.isFeatured && <Badge tone="clay">Hervorgehoben</Badge>}
              {!removed && (
                <Link href={`/c/${c.slug}`} target="_blank" className="inline-flex items-center gap-1 text-xs text-muted hover:text-ink">
                  Community ansehen <ExternalLink size={12} aria-hidden />
                </Link>
              )}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {!removed && (
            <CommunityEditButton
              initial={{ id: c.id, name: c.name, description: c.description, category: c.category, visibility: c.visibility, region: c.region, rules: c.rules.map((r) => ({ title: r.title, body: r.body })) }}
              canChangeVisibility={isAdmin}
              action={updateCommunityMetaAction}
            />
          )}
          {c.state === "PUBLISHED" && (c.visibility !== "PRIVATE" || c.isFeatured) && (
            <ActionButton action={setCommunityFeaturedAction.bind(null, c.id, !c.isFeatured)} label={c.isFeatured ? "Nicht mehr hervorheben" : "Hervorheben"} variant="outline" />
          )}
          {c.state === "PUBLISHED" && (
            <ReasonButton
              action={setCommunityHiddenAction.bind(null, c.id, true)}
              label="Ausblenden"
              variant="outline"
              title="Community ausblenden"
              description="Die Community ist danach für Nicht-Moderierende nicht mehr erreichbar. Die Leitung wird informiert; die Begründung wird ihr angezeigt."
              confirmLabel="Ausblenden"
            />
          )}
          {c.state === "HIDDEN" && (
            <ReasonButton action={setCommunityHiddenAction.bind(null, c.id, false)} label="Wieder anzeigen" variant="outline" title="Community wieder anzeigen" confirmLabel="Anzeigen" />
          )}
          {isAdmin && !removed && transferChoices.length > 0 && (
            <ReasonButton
              action={transferOwnershipAction.bind(null, c.id)}
              label="Eigentum übertragen"
              variant="outline"
              title="Leitung übertragen"
              description={`Die neue Person wird Gründer:in. ${ownerName} bleibt als Admin in der Community. Beide werden benachrichtigt.`}
              choices={transferChoices}
              choiceLabel="Neue Leitung (aktive Mitglieder)"
              confirmLabel="Leitung übertragen"
            />
          )}
          {isAdmin && !removed && (
            <ReasonButton
              action={removeCommunityAction.bind(null, c.id)}
              label="Archivieren"
              variant="danger"
              confirmVariant="danger"
              title="Community archivieren"
              description="Die Community und ihre Beiträge sind danach nicht mehr erreichbar. Daten bleiben erhalten und können wiederhergestellt werden."
              withPublicNote
              confirmLabel="Archivieren"
            />
          )}
          {isAdmin && removed && (
            <ReasonButton
              action={restoreCommunityAction.bind(null, c.id)}
              label="Wiederherstellen"
              variant="ink"
              title="Community wiederherstellen"
              choices={[
                { value: "PUBLISHED", label: "Sichtbar" },
                { value: "HIDDEN", label: "Ausgeblendet (nur Moderation)" },
              ]}
              choiceLabel="Zustand nach Wiederherstellung"
              confirmLabel="Wiederherstellen"
            />
          )}
        </div>
      </header>

      {c.state === "HIDDEN" && (
        <Notice tone="warn" className="mb-8" title="Community ausgeblendet">
          Nur die Plattform-Moderation kann sie aufrufen. Mitglieder und Besucher sehen eine Fehlerseite.
        </Notice>
      )}
      {removed && (
        <Notice tone="danger" className="mb-8" title="Community archiviert">
          Die Community ist nicht mehr erreichbar. Bearbeiten und Mitgliederrollen sind gesperrt, bis sie wiederhergestellt wird.
        </Notice>
      )}

      <div className="grid gap-10 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-10">
          <section aria-labelledby="c1">
            <SectionTitle n="01" title={<span id="c1">Kennzahlen</span>} />
            <dl className="mt-4 grid grid-cols-2 gap-y-4 sm:grid-cols-4">
              {[
                ["Aktive Mitglieder", counts.members.ACTIVE],
                ["Offene Anfragen", counts.members.PENDING],
                ["Einladungen", counts.members.INVITED],
                ["Gesperrt", counts.members.BANNED],
                ["Beiträge", counts.posts],
                ["Ausgeblendete Beiträge", counts.postsHidden],
                ["Geteilte Projekte", counts.projects],
                ["Challenges", counts.challenges],
                ["Offene Fälle", counts.openCases],
                ["Fälle gesamt", counts.cases],
                ["Meldungen zur Community", counts.reports],
              ].map(([l, v]) => (
                <div key={l} className="border-l border-line pl-4">
                  <dt className="spec">{l}</dt>
                  <dd className={`mt-1 text-xl font-semibold num ${l === "Offene Fälle" && (v as number) > 0 ? "text-clay-ink" : ""}`}>{num(v as number)}</dd>
                </div>
              ))}
            </dl>
          </section>

          <section aria-labelledby="c2" id="mitglieder">
            <SectionTitle n="02" title={<span id="c2">Mitglieder ({num(members.total)}{filtered ? " Treffer" : ""})</span>} />
            <FilterBar action={`/admin/communities/${c.id}`} className="mt-4">
              <FilterField label="Suche">
                <input name="q" defaultValue={sp.q ?? ""} placeholder="@handle oder Name" className={`${filterInput} w-56`} />
              </FilterField>
              <FilterField label="Status">
                <Select name="status" defaultValue={sp.status ?? ""} className="h-9 w-auto min-w-[160px] text-[13.5px]">
                  <option value="">Alle</option>
                  {Object.entries(MEMBER_STATE).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </Select>
              </FilterField>
            </FilterBar>
            <Table caption="Mitglieder">
              <thead>
                <tr>
                  <Th>Mitglied</Th>
                  <Th>Rolle</Th>
                  <Th>Status</Th>
                  <Th>Konto</Th>
                  <Th>Seit</Th>
                  <Th align="right">Aktionen</Th>
                </tr>
              </thead>
              <tbody>
                {members.rows.length === 0 && <EmptyRow cols={6}>{filtered ? "Keine Mitglieder für diesen Filter." : "Keine Mitglieder."}</EmptyRow>}
                {members.rows.map((m) => {
                  const name = m.user.profile?.displayName ?? "Ohne Profil";
                  const owner = m.role === "OWNER";
                  const outranked = m.userId !== actor.id && RANK[m.user.role] >= RANK[actor.role] && !isSuper;
                  const canSanction = !owner && !outranked;
                  const muted = m.mutedUntil && m.mutedUntil > new Date();
                  return (
                    <Tr key={m.userId}>
                      <Td>
                        <Link href={`/admin/nutzer/${m.userId}`} className="flex items-center gap-2.5 hover:underline">
                          <Avatar src={m.user.profile?.avatarUrl} name={name} size={26} />
                          <span className="min-w-0">
                            <span className="block truncate font-semibold">{name}</span>
                            <span className="block text-xs text-muted">@{m.user.profile?.handle ?? "–"}</span>
                          </span>
                        </Link>
                      </Td>
                      <Td>{owner ? <Badge tone="clay">{COMMUNITY_ROLE_LABEL.OWNER}</Badge> : m.role === "MEMBER" ? <span className="text-muted">{COMMUNITY_ROLE_LABEL.MEMBER}</span> : <Badge tone="outline">{COMMUNITY_ROLE_LABEL[m.role]}</Badge>}</Td>
                      <Td>
                        <Badge tone={MEMBER_STATE_TONE[m.state]}>{MEMBER_STATE[m.state]}</Badge>
                        {muted && <span className="spec ml-1.5" title={`bis ${dateTime(m.mutedUntil)}`}>Stumm</span>}
                      </Td>
                      <Td className="whitespace-nowrap">
                        {m.user.status === "ACTIVE" ? <span className="text-muted">Aktiv</span> : <Badge tone="danger">{ACCOUNT_STATUS_LABEL[m.user.status]}</Badge>}
                        {m.user.role !== "MEMBER" && <span className="spec ml-1.5">{ROLE_LABEL[m.user.role]}</span>}
                      </Td>
                      <Td className="whitespace-nowrap text-muted">{shortDate(m.joinedAt)}</Td>
                      <Td>
                        <div className="flex flex-wrap justify-end gap-1.5">
                          {owner && <span className="text-xs text-muted">Leitung – über „Eigentum übertragen“ ändern</span>}
                          {isAdmin && !removed && !owner && m.state === "ACTIVE" && (
                            <ReasonButton
                              action={setMemberRoleAction.bind(null, c.id, m.userId)}
                              label="Rolle"
                              variant="ghost"
                              title={`Rolle von ${name} ändern`}
                              choices={ROLE_CHOICES.filter((r) => r.value !== m.role)}
                              choiceLabel="Neue Community-Rolle"
                              confirmLabel="Rolle speichern"
                            />
                          )}
                          {canSanction && m.state !== "BANNED" && (
                            <ReasonButton
                              action={removeMemberAction.bind(null, c.id, m.userId)}
                              label={m.state === "PENDING" ? "Ablehnen" : m.state === "INVITED" ? "Zurückziehen" : "Entfernen"}
                              variant="ghost"
                              title={m.state === "PENDING" ? `Anfrage von ${name} ablehnen` : m.state === "INVITED" ? `Einladung an ${name} zurückziehen` : `${name} entfernen`}
                              description={m.state === "ACTIVE" ? "Die Person kann der Community danach erneut beitreten. Für dauerhaften Ausschluss „Sperren“ verwenden." : undefined}
                              confirmLabel={m.state === "PENDING" ? "Ablehnen" : m.state === "INVITED" ? "Zurückziehen" : "Entfernen"}
                            />
                          )}
                          {canSanction && m.state !== "BANNED" && m.state !== "INVITED" && (
                            <ReasonButton
                              action={banMemberAction.bind(null, c.id, m.userId)}
                              label="Sperren"
                              variant="ghost"
                              confirmVariant="danger"
                              title={`${name} aus der Community sperren`}
                              description="Die Person wird entfernt und kann nicht erneut beitreten. Sie wird benachrichtigt."
                              withPublicNote
                              confirmLabel="Sperren"
                            />
                          )}
                          {canSanction && m.state === "BANNED" && (
                            <ReasonButton action={unbanMemberAction.bind(null, c.id, m.userId)} label="Entsperren" variant="ghost" title={`Sperre von ${name} aufheben`} description="Die Person kann der Community danach wieder beitreten." confirmLabel="Entsperren" />
                          )}
                        </div>
                      </Td>
                    </Tr>
                  );
                })}
              </tbody>
            </Table>
            <Pager page={members.page} pages={members.pages} href={qs} />
          </section>

          <section aria-labelledby="c3">
            <SectionTitle n="03" title={<span id="c3">Neueste Beiträge</span>} action={<span className="spec">{num(counts.posts)} gesamt</span>} />
            <Table className="mt-3" caption="Neueste Beiträge">
              <thead>
                <tr>
                  <Th>Beitrag</Th>
                  <Th>Autor:in</Th>
                  <Th>Zustand</Th>
                  <Th align="right">Likes</Th>
                  <Th align="right">Kommentare</Th>
                  <Th>Datum</Th>
                </tr>
              </thead>
              <tbody>
                {d.recentPosts.length === 0 && <EmptyRow cols={6}>Noch keine Beiträge.</EmptyRow>}
                {d.recentPosts.map((p) => {
                  const text = p.body.trim() || (p._count.media ? `Medienbeitrag (${p._count.media})` : "Ohne Text");
                  return (
                    <Tr key={p.id}>
                      <Td className="max-w-[340px]">
                        <Link href={`/beitrag/${p.id}`} target="_blank" className="line-clamp-2 hover:underline">
                          {text.length > 140 ? `${text.slice(0, 140)}…` : text}
                        </Link>
                        {(p.isPinned || p.isAnnouncement) && (
                          <span className="mt-1 flex gap-1.5">
                            {p.isPinned && <span className="spec">Angeheftet</span>}
                            {p.isAnnouncement && <span className="spec">Ankündigung</span>}
                          </span>
                        )}
                      </Td>
                      <Td className="whitespace-nowrap">
                        <Link href={`/admin/nutzer/${p.authorId}`} className="hover:underline">
                          @{p.author.profile?.handle ?? "–"}
                        </Link>
                      </Td>
                      <Td><Badge tone={STATE_TONE[p.state]}>{p.state === "REMOVED" ? "Entfernt" : STATE[p.state]}</Badge></Td>
                      <Td align="right">{num(p.likeCount)}</Td>
                      <Td align="right">{num(p.commentCount)}</Td>
                      <Td className="whitespace-nowrap text-muted">{relativeTime(p.createdAt)}</Td>
                    </Tr>
                  );
                })}
              </tbody>
            </Table>
          </section>

          <section aria-labelledby="c4">
            <SectionTitle n="04" title={<span id="c4">Meldungen & Moderationsfälle ({num(counts.cases)})</span>} />
            <p className="mt-2 text-[13px] text-muted">Fälle zur Community selbst, zu ihren Beiträgen und zu Kommentaren darunter.</p>
            <Table className="mt-3" caption="Moderationsfälle">
              <thead>
                <tr>
                  <Th>Fall</Th>
                  <Th>Risiko</Th>
                  <Th>Grund</Th>
                  <Th>Inhalt</Th>
                  <Th align="right">Meldungen</Th>
                  <Th>Status</Th>
                  <Th>Datum</Th>
                </tr>
              </thead>
              <tbody>
                {d.cases.length === 0 && <EmptyRow cols={7}>Keine Fälle.</EmptyRow>}
                {d.cases.map((h) => (
                  <Tr key={h.id} highlight={h.status === "OPEN" || h.status === "IN_REVIEW"}>
                    <Td mono>
                      <Link className="font-semibold hover:underline" href={`/admin/moderation/${h.id}`}>
                        Nº {h.number}
                      </Link>
                    </Td>
                    <Td><RiskMeter score={h.riskScore} /></Td>
                    <Td>{reasonLabel(h.primaryReason)}</Td>
                    <Td>{TARGET_TYPE_LABEL[h.targetType]}</Td>
                    <Td align="right">{num(h.reportCount)}</Td>
                    <Td><Badge>{CASE_STATUS_LABEL[h.status]}</Badge></Td>
                    <Td className="whitespace-nowrap text-muted">{shortDate(h.createdAt)}</Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          </section>

          <section aria-labelledby="c5">
            <SectionTitle n="05" title={<span id="c5">Moderationsprotokoll der Community</span>} />
            {d.log.length ? (
              <ol className="mt-3 divide-y divide-line text-[13px]">
                {d.log.map((l) => (
                  <li key={l.id} className="flex flex-wrap items-baseline gap-x-4 gap-y-1 py-2">
                    <span className="font-semibold">{l.label}</span>
                    <span className="min-w-0 truncate text-ink-2">{l.target}</span>
                    {l.reason && <span className="min-w-0 truncate text-muted">„{l.reason}“</span>}
                    <span className="text-muted">{l.moderator ? `@${l.moderator.handle}` : "–"}</span>
                    <span className="ml-auto text-muted">{dateTime(l.at)}</span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="mt-3 text-sm text-muted">Keine Einträge.</p>
            )}
          </section>

          <section aria-labelledby="c6">
            <SectionTitle n="06" title={<span id="c6">Plattform-Verlauf (Audit)</span>} />
            {d.recentAudit.length ? (
              <ol className="mt-3 divide-y divide-line text-[13px]">
                {d.recentAudit.map((a) => {
                  const meta = (a.meta ?? {}) as Record<string, unknown>;
                  const reason = typeof meta.reason === "string" ? meta.reason : null;
                  return (
                    <li key={a.seq} className="flex flex-wrap items-baseline gap-x-4 gap-y-1 py-2">
                      <span className="font-mono text-muted">#{a.seq}</span>
                      <span className="font-semibold" title={a.action}>{AUDIT_LABEL[a.action] ?? <span className="font-mono font-normal">{a.action}</span>}</span>
                      {reason && <span className="min-w-0 max-w-full truncate text-muted">„{reason}“</span>}
                      <span className="text-muted">{a.actor?.profile ? `@${a.actor.profile.handle}` : "System"}</span>
                      <span className="ml-auto text-muted">{dateTime(a.createdAt)}</span>
                    </li>
                  );
                })}
              </ol>
            ) : (
              <p className="mt-3 text-sm text-muted">Keine Einträge.</p>
            )}
          </section>
        </div>

        <aside className="space-y-8" aria-label="Stammdaten">
          <section>
            <SectionTitle n="07" title="Stammdaten" />
            <dl className="mt-3 space-y-3 text-[13px]">
              <div><dt className="spec">Adresse</dt><dd className="font-mono">/c/{c.slug}</dd></div>
              <div><dt className="spec">Kategorie</dt><dd>{category?.name ?? c.category}</dd></div>
              <div><dt className="spec">Zugang</dt><dd>{COMMUNITY_VISIBILITY_LABEL[c.visibility]}</dd></div>
              <div><dt className="spec">Region</dt><dd>{c.region || "–"}</dd></div>
              <div>
                <dt className="spec">Gründer:in</dt>
                <dd>
                  <Link href={`/admin/nutzer/${c.owner.id}`} className="inline-flex items-center gap-2 hover:underline">
                    <Avatar src={c.owner.profile?.avatarUrl} name={ownerName} size={20} />
                    <span className="font-semibold">{ownerName}</span>
                    <span className="text-muted">@{c.owner.profile?.handle ?? "–"}</span>
                  </Link>
                  {c.owner.status !== "ACTIVE" && <Badge tone="danger" className="ml-2">{ACCOUNT_STATUS_LABEL[c.owner.status]}</Badge>}
                </dd>
              </div>
              <div><dt className="spec">Mitgliederzähler</dt><dd className="num">{num(c.memberCount)}</dd></div>
              <div><dt className="spec">Gegründet</dt><dd>{dateTime(c.createdAt)}</dd></div>
              <div><dt className="spec">Zuletzt geändert</dt><dd>{relativeTime(c.updatedAt)}</dd></div>
            </dl>
          </section>

          <section>
            <SectionTitle n="08" title="Beschreibung" />
            {c.description ? <p className="mt-3 whitespace-pre-wrap text-[13px] leading-relaxed text-ink-2">{c.description}</p> : <p className="mt-3 text-[13px] text-muted">Keine Beschreibung.</p>}
          </section>

          <section>
            <SectionTitle n="09" title={`Regeln (${c.rules.length})`} />
            {c.rules.length ? (
              <ol className="mt-3 space-y-3 text-[13px]">
                {c.rules.map((r, i) => (
                  <li key={r.id} className="flex gap-3">
                    <span className="spec w-4 shrink-0 pt-0.5 text-right">{i + 1}</span>
                    <span className="min-w-0">
                      <span className="block font-semibold">{r.title}</span>
                      {r.body && <span className="block whitespace-pre-wrap text-muted">{r.body}</span>}
                    </span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="mt-3 text-[13px] text-muted">Keine Regeln hinterlegt.</p>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}
