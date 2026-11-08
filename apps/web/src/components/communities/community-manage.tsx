"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Ban, Check, Crown, Trophy, UserMinus, VolumeX, X } from "lucide-react";
import { COMMUNITY_ROLE_LABEL } from "@werkraum/shared";
import { Avatar, Badge } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Checkbox, Field, Input, Label, Select, Textarea } from "@/components/ui/field";
import { toast } from "@/components/ui/toast";
import { useAction } from "@/lib/use-action";
import { cn, formatDate, relativeTime } from "@/lib/utils";
import {
  addCommunityProjectAction,
  createChallengeAction,
  decideRequestAction,
  deleteChallengeAction,
  inviteMemberAction,
  muteMemberAction,
  removeCommunityProjectAction,
  removeMemberAction,
  revokeInviteAction,
  setMemberRoleAction,
  transferOwnershipAction,
  unbanMemberAction,
} from "@/app/(app)/communities/actions";

type Result = { ok: boolean; error?: string; message?: string };
const RANK = { OWNER: 3, ADMIN: 2, MODERATOR: 1, MEMBER: 0 } as const;
type Role = keyof typeof RANK;

function useRun() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const run = (p: () => Promise<Result>, onOk?: () => void) =>
    start(async () => {
      const r = await p();
      if (r.ok) {
        if (r.message) toast(r.message);
        onOk?.();
        router.refresh();
      } else toast(r.error ?? "Fehler", "error");
    });
  return { pending, run };
}

type Person = { userId: string; handle: string; displayName: string; avatarUrl: string | null; bio?: string };

function PersonCell({ p, children }: { p: Person; children?: React.ReactNode }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <Link aria-label={`Profil von ${p.displayName}`} href={`/u/${p.handle}`} className="shrink-0"><Avatar src={p.avatarUrl} name={p.displayName} size={36} /></Link>
      <div className="min-w-0">
        <Link href={`/u/${p.handle}`} className="block truncate font-semibold hover:underline">{p.displayName}</Link>
        <p className="truncate text-xs text-muted">@{p.handle}{children}</p>
      </div>
    </div>
  );
}

/* ───────── Anfragen ───────── */

export function RequestsList({ communityId, requests }: { communityId: string; requests: (Person & { since: string })[] }) {
  const { pending, run } = useRun();
  if (!requests.length) return <p className="py-6 text-sm text-muted">Keine offenen Beitrittsanfragen.</p>;
  return (
    <ul className="divide-y divide-line">
      {requests.map((r) => (
        <li key={r.userId} className="flex flex-wrap items-center justify-between gap-3 py-3">
          <PersonCell p={r}> · angefragt {relativeTime(r.since)}</PersonCell>
          <div className="flex gap-2">
            <Button size="sm" disabled={pending} onClick={() => run(() => decideRequestAction(communityId, r.userId, true))}><Check size={14} /> Freigeben</Button>
            <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => decideRequestAction(communityId, r.userId, false))}><X size={14} /> Ablehnen</Button>
          </div>
        </li>
      ))}
    </ul>
  );
}

/* ───────── Einladungen ───────── */

export function InvitePanel({ communityId, invited }: { communityId: string; invited: (Person & { since: string })[] }) {
  const [handle, setHandle] = useState("");
  const invite = useAction(inviteMemberAction.bind(null, communityId), {
    success: (d) => (d.state === "ACTIVE" ? `${d.name} ist jetzt Mitglied.` : `${d.name} wurde eingeladen.`),
    onSuccess: () => setHandle(""),
  });
  const { pending, run } = useRun();
  return (
    <div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (handle.trim()) void invite.run(handle);
        }}
        className="flex items-end gap-2"
      >
        <div className="flex-1">
          <Label htmlFor="invite-handle">Profilname</Label>
          <div className="flex items-center border border-line-strong bg-card focus-within:border-moss rounded-2xl">
            <span className="pl-3 text-muted">@</span>
            <input id="invite-handle" value={handle} onChange={(e) => setHandle(e.target.value)} placeholder="handle" className="h-11 flex-1 bg-transparent px-2 outline-none" autoComplete="off" />
          </div>
        </div>
        <Button type="submit" disabled={invite.pending || !handle.trim()}>Einladen</Button>
      </form>
      {invited.length > 0 && (
        <>
          <p className="spec mt-6">Offene Einladungen</p>
          <ul className="divide-y divide-line">
            {invited.map((r) => (
              <li key={r.userId} className="flex items-center justify-between gap-3 py-3">
                <PersonCell p={r}> · eingeladen {relativeTime(r.since)}</PersonCell>
                <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => revokeInviteAction(communityId, r.userId))}>Zurückziehen</Button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

/* ───────── Mitglieder & Rollen ───────── */

type Member = Person & { role: Role; mutedUntil: string | null; joinedAt: string };

export function MembersManager({ communityId, members, viewer }: { communityId: string; members: Member[]; viewer: { id: string; rank: number; canManageRoles: boolean; isOwner: boolean } }) {
  const { pending, run } = useRun();
  const [muteFor, setMuteFor] = useState<Member | null>(null);
  const [removeFor, setRemoveFor] = useState<Member | null>(null);
  const [q, setQ] = useState("");
  const list = q ? members.filter((m) => `${m.displayName} ${m.handle}`.toLowerCase().includes(q.toLowerCase())) : members;
  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-3">
        <label htmlFor="member-filter" className="sr-only">Mitglieder filtern</label>
        <Input id="member-filter" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Mitglieder filtern …" className="h-10 max-w-xs" />
        <span className="spec">{members.length} angezeigt</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <caption className="sr-only">Mitglieder und Rollen</caption>
          <thead>
            <tr className="border-b border-rule text-left">
              <th scope="col" className="spec py-2.5 font-normal">Mitglied</th>
              <th scope="col" className="spec py-2.5 font-normal">Rolle</th>
              <th scope="col" className="spec py-2.5 font-normal">Dabei seit</th>
              <th scope="col" className="spec py-2.5 text-right font-normal">Moderation</th>
            </tr>
          </thead>
          <tbody>
            {list.map((m) => {
              const self = m.userId === viewer.id;
              const canModerate = !self && m.role !== "OWNER" && RANK[m.role] < viewer.rank;
              const muted = m.mutedUntil && new Date(m.mutedUntil) > new Date();
              return (
                <tr key={m.userId} className="border-b border-line align-middle">
                  <td className="py-2.5 pr-3">
                    <PersonCell p={m}>{muted ? ` · stumm bis ${formatDate(m.mutedUntil!, { day: "numeric", month: "short" })}` : ""}</PersonCell>
                  </td>
                  <td className="py-2.5 pr-3">
                    {viewer.canManageRoles && canModerate ? (
                      <label className="sr-only" htmlFor={`role-${m.userId}`}>Rolle von {m.displayName}</label>
                    ) : null}
                    {viewer.canManageRoles && canModerate ? (
                      <Select
                        id={`role-${m.userId}`}
                        value={m.role}
                        disabled={pending}
                        onChange={(e) => run(() => setMemberRoleAction(communityId, m.userId, e.target.value))}
                        className="h-9 w-auto min-w-[140px] text-[13px]"
                      >
                        {(["MEMBER", "MODERATOR", "ADMIN"] as const)
                          .filter((r) => viewer.rank >= 99 || RANK[r] < viewer.rank)
                          .map((r) => (
                            <option key={r} value={r}>{COMMUNITY_ROLE_LABEL[r]}</option>
                          ))}
                      </Select>
                    ) : (
                      <Badge tone={m.role === "OWNER" ? "ink" : m.role === "MEMBER" ? "outline" : "moss"}>{COMMUNITY_ROLE_LABEL[m.role]}</Badge>
                    )}
                  </td>
                  <td className="py-2.5 pr-3 text-muted num">{formatDate(m.joinedAt, { day: "numeric", month: "short", year: "numeric" })}</td>
                  <td className="py-2.5 text-right">
                    <span className="inline-flex gap-1">
                      {canModerate && (
                        <>
                          {muted ? (
                            <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => muteMemberAction(communityId, m.userId, null))}>Stumm aufheben</Button>
                          ) : (
                            <Button size="sm" variant="ghost" disabled={pending} onClick={() => setMuteFor(m)} aria-label={`${m.displayName} stummschalten`}><VolumeX size={14} /></Button>
                          )}
                          <Button size="sm" variant="ghost" disabled={pending} onClick={() => setRemoveFor(m)} aria-label={`${m.displayName} entfernen`}><UserMinus size={14} /></Button>
                        </>
                      )}
                      {viewer.isOwner && !self && (
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={pending}
                          aria-label={`Leitung an ${m.displayName} übertragen`}
                          title="Leitung übertragen"
                          onClick={() => confirm(`Leitung an ${m.displayName} übertragen? Du wirst Admin.`) && run(() => transferOwnershipAction(communityId, m.userId))}
                        >
                          <Crown size={14} />
                        </Button>
                      )}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <MuteDialog member={muteFor} onClose={() => setMuteFor(null)} onConfirm={(until, reason) => muteFor && run(() => muteMemberAction(communityId, muteFor.userId, until, reason), () => setMuteFor(null))} pending={pending} />
      <RemoveDialog member={removeFor} onClose={() => setRemoveFor(null)} onConfirm={(ban, reason) => removeFor && run(() => removeMemberAction(communityId, removeFor.userId, { ban, reason }), () => setRemoveFor(null))} pending={pending} />
    </div>
  );
}

function MuteDialog({ member, onClose, onConfirm, pending }: { member: Member | null; onClose: () => void; onConfirm: (until: string, reason: string) => void; pending: boolean }) {
  const [days, setDays] = useState("7");
  const [custom, setCustom] = useState("");
  const [reason, setReason] = useState("");
  const until = days === "custom" ? (custom ? new Date(`${custom}T23:59:00`).toISOString() : "") : new Date(Date.now() + Number(days) * 86400_000).toISOString();
  return (
    <Dialog open={!!member} onClose={onClose} title={`${member?.displayName ?? ""} stummschalten`} description="Stummgeschaltete Mitglieder können lesen, aber nichts veröffentlichen.">
      <Label htmlFor="mute-days">Dauer</Label>
      <Select id="mute-days" value={days} onChange={(e) => setDays(e.target.value)}>
        <option value="1">24 Stunden</option>
        <option value="3">3 Tage</option>
        <option value="7">7 Tage</option>
        <option value="30">30 Tage</option>
        <option value="custom">Bis Datum …</option>
      </Select>
      {days === "custom" && <Input type="date" className="mt-2" value={custom} min={new Date().toISOString().slice(0, 10)} onChange={(e) => setCustom(e.target.value)} aria-label="Stumm bis" />}
      <Label htmlFor="mute-reason" className="mt-4">Grund (für das Protokoll)</Label>
      <Textarea id="mute-reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} />
      <Button className="mt-4 w-full" disabled={pending || !until} onClick={() => onConfirm(until, reason)}>
        <VolumeX size={14} /> Stummschalten
      </Button>
    </Dialog>
  );
}

function RemoveDialog({ member, onClose, onConfirm, pending }: { member: Member | null; onClose: () => void; onConfirm: (ban: boolean, reason: string) => void; pending: boolean }) {
  const [ban, setBan] = useState(false);
  const [reason, setReason] = useState("");
  return (
    <Dialog open={!!member} onClose={onClose} title={`${member?.displayName ?? ""} entfernen`} description="Das Mitglied verliert den Zugang zu Mitgliederfunktionen.">
      <Checkbox label="Zusätzlich sperren – erneuter Beitritt nicht möglich" checked={ban} onChange={(e) => setBan(e.target.checked)} />
      <Label htmlFor="rm-reason" className="mt-4">Grund (für das Protokoll)</Label>
      <Textarea id="rm-reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} />
      <Button variant="danger" className="mt-4 w-full" disabled={pending} onClick={() => onConfirm(ban, reason)}>
        {ban ? <Ban size={14} /> : <UserMinus size={14} />} {ban ? "Entfernen und sperren" : "Entfernen"}
      </Button>
    </Dialog>
  );
}

export function BannedList({ communityId, banned }: { communityId: string; banned: (Person & { since: string })[] }) {
  const { pending, run } = useRun();
  if (!banned.length) return <p className="py-4 text-sm text-muted">Niemand ist gesperrt.</p>;
  return (
    <ul className="divide-y divide-line">
      {banned.map((b) => (
        <li key={b.userId} className="flex items-center justify-between gap-3 py-3">
          <PersonCell p={b} />
          <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => unbanMemberAction(communityId, b.userId))}>Sperre aufheben</Button>
        </li>
      ))}
    </ul>
  );
}

/* ───────── Challenges ───────── */

type Challenge = { id: string; title: string; description: string; startsAt: string; endsAt: string };

export function ChallengesManager({ communityId, challenges }: { communityId: string; challenges: Challenge[] }) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const today = new Date().toISOString().slice(0, 10);
  const [startsAt, setStartsAt] = useState(today);
  const [endsAt, setEndsAt] = useState("");
  const create = useAction(createChallengeAction.bind(null, communityId), {
    onSuccess: () => {
      setTitle("");
      setDescription("");
      setEndsAt("");
    },
  });
  const { pending, run } = useRun();
  const now = Date.now();
  return (
    <div className="grid gap-10 lg:grid-cols-2">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void create.run({ title, description, startsAt: new Date(`${startsAt}T00:00:00`).toISOString(), endsAt: endsAt ? new Date(`${endsAt}T23:59:59`).toISOString() : "" });
        }}
        className="space-y-4"
      >
        <Field label="Titel" error={create.fields.title}>
          {(p) => <Input {...p} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} placeholder="z.B. Herbst-Challenge: Ein Stuhl aus Restholz" />}
        </Field>
        <Field label="Beschreibung" optional error={create.fields.description}>
          {(p) => <Textarea {...p} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={2000} rows={3} />}
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Start" error={create.fields.startsAt}>
            {(p) => <Input {...p} type="date" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />}
          </Field>
          <Field label="Ende" error={create.fields.endsAt}>
            {(p) => <Input {...p} type="date" value={endsAt} min={startsAt} onChange={(e) => setEndsAt(e.target.value)} />}
          </Field>
        </div>
        <Button type="submit" disabled={create.pending || title.trim().length < 3 || !endsAt}><Trophy size={14} /> Challenge anlegen</Button>
      </form>
      <div>
        <p className="spec mb-2">Alle Challenges</p>
        {challenges.length === 0 ? (
          <p className="text-sm text-muted">Noch keine Challenges. Aktive Challenges erscheinen als Banner über den Beiträgen.</p>
        ) : (
          <ul className="divide-y divide-line">
            {challenges.map((c) => {
              const s = new Date(c.startsAt).getTime();
              const e = new Date(c.endsAt).getTime();
              const status = e < now ? "Beendet" : s > now ? "Geplant" : "Läuft";
              return (
                <li key={c.id} className="flex items-start justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="font-semibold">{c.title}</p>
                    <p className="text-xs text-muted num">
                      <span className={cn("spec mr-2", status === "Läuft" ? "text-moss" : "")}>{status}</span>
                      {formatDate(c.startsAt, { day: "numeric", month: "short" })} – {formatDate(c.endsAt, { day: "numeric", month: "short", year: "numeric" })}
                    </p>
                  </div>
                  <Button size="sm" variant="ghost" disabled={pending} onClick={() => confirm("Challenge löschen?") && run(() => deleteChallengeAction(communityId, c.id))} aria-label={`${c.title} löschen`}>
                    <X size={14} />
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

/* ───────── Projekte teilen ───────── */

export function ShareProject({ communityId, options }: { communityId: string; options: { id: string; title: string }[] }) {
  const [projectId, setProjectId] = useState("");
  const { pending, run } = useRun();
  if (!options.length) return <p className="text-sm text-muted">Du hast kein weiteres öffentliches Projekt zum Teilen. <Link href="/erstellen?typ=projekt" className="font-semibold text-ink underline underline-offset-2">Projekt anlegen</Link></p>;
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (projectId) run(() => addCommunityProjectAction(communityId, projectId), () => setProjectId(""));
      }}
      className="flex flex-wrap items-end gap-2"
    >
      <div className="min-w-56 flex-1">
        <Label htmlFor="share-project">Eigenes Projekt teilen</Label>
        <Select id="share-project" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
          <option value="">Projekt wählen …</option>
          {options.map((o) => (
            <option key={o.id} value={o.id}>{o.title}</option>
          ))}
        </Select>
      </div>
      <Button type="submit" disabled={!projectId || pending}>Teilen</Button>
    </form>
  );
}

export function RemoveProjectButton({ communityId, projectId, label }: { communityId: string; projectId: string; label: string }) {
  const { pending, run } = useRun();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => confirm(`„${label}“ aus der Community entfernen?`) && run(() => removeCommunityProjectAction(communityId, projectId))}
      className="text-xs text-muted hover:text-danger"
    >
      Entfernen
    </button>
  );
}
