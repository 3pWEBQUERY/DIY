"use client";

import { confirmDialog } from "@/components/ui/confirm";
import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { LogOut, Pencil, ShieldCheck, UserMinus, UserPlus } from "lucide-react";
import { GROUP_MAX_MEMBERS } from "@werkraum/shared";
import type { ThreadData } from "@/server/messaging/service";
import { Dialog } from "@/components/ui/dialog";
import { Avatar, Badge } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { toast } from "@/components/ui/toast";
import { addGroupMembersAction, groupCandidatesAction, leaveGroupAction, removeGroupMemberAction, renameGroupAction, setGroupAdminAction } from "@/app/(app)/nachrichten/actions";
import { PeoplePicker, type Candidate } from "./people-picker";
import { callAction } from "@/lib/use-action";

type Group = NonNullable<ThreadData["group"]>;

/** Gruppeninfo: Mitglieder, Umbenennen, Hinzufügen/Entfernen (Admins), Verlassen. */
export function GroupInfo({ open, onClose, conversationId, group }: { open: boolean; onClose: () => void; conversationId: string; group: Group }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [title, setTitle] = useState(group.title);
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);
  const [candidates, setCandidates] = useState<Candidate[] | null>(null);
  const [handles, setHandles] = useState<string[]>([]);
  const members = [...group.members].sort((a, b) => Number(b.role === "ADMIN") - Number(a.role === "ADMIN") || Number(a.pending) - Number(b.pending) || a.displayName.localeCompare(b.displayName, "de"));
  const room = GROUP_MAX_MEMBERS - group.members.length;

  const exec = <T,>(fn: () => Promise<{ ok: true; data: T; message?: string } | { ok: false; error: string }>, after?: (d: T) => void) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) return toast(r.error, "error");
      if (r.message) toast(r.message);
      after?.(r.data);
      router.refresh();
    });

  return (
    <Dialog open={open} onClose={onClose} title="Gruppeninfo" description={`${group.members.length} von ${GROUP_MAX_MEMBERS} Personen`}>
      <section aria-label="Name">
        {editing ? (
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              exec(() => renameGroupAction(conversationId, title), () => setEditing(false));
            }}
          >
            <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={60} aria-label="Gruppenname" autoFocus className="h-10" />
            <Button type="submit" size="sm" disabled={pending || !title.trim()} className="h-10">Speichern</Button>
          </form>
        ) : (
          <div className="flex items-center justify-between gap-3">
            <p className="headline text-xl">{group.title}</p>
            {group.isAdmin && (
              <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>
                <Pencil size={14} aria-hidden /> Umbenennen
              </Button>
            )}
          </div>
        )}
      </section>

      <section aria-label="Mitglieder" className="mt-5">
        <div className="mb-2 flex items-center justify-between">
          <p className="spec">Mitglieder</p>
          {group.isAdmin && room > 0 && !adding && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setAdding(true);
                if (!candidates) start(async () => { const r = await callAction(() => groupCandidatesAction()); setCandidates(r.ok ? r.data : []); });
              }}
            >
              <UserPlus size={14} aria-hidden /> Hinzufügen
            </Button>
          )}
        </div>
        {adding && (
          <div className="mb-4 rounded-2xl border border-line bg-paper p-3">
            {candidates ? (
              <PeoplePicker candidates={candidates} value={handles} onChange={setHandles} exclude={group.members.map((m) => m.handle)} max={room} />
            ) : (
              <p className="py-4 text-center text-sm text-muted">Lädt …</p>
            )}
            <div className="mt-3 flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => (setAdding(false), setHandles([]))}>Abbrechen</Button>
              <Button
                size="sm"
                disabled={pending || !handles.length}
                onClick={() =>
                  exec(
                    () => addGroupMembersAction(conversationId, handles),
                    (d) => {
                      toast([d.added.length ? `${d.added.join(", ")} hinzugefügt.` : "", d.invited.length ? `${d.invited.join(", ")} eingeladen.` : ""].filter(Boolean).join(" "));
                      setAdding(false);
                      setHandles([]);
                    },
                  )
                }
              >
                Hinzufügen
              </Button>
            </div>
          </div>
        )}
        <ul className="divide-y divide-line">
          {members.map((m) => (
            <li key={m.id} className="flex items-center gap-3 py-2.5">
              <Link href={`/u/${m.handle}`} className="flex min-w-0 flex-1 items-center gap-3">
                <Avatar src={m.avatarUrl} name={m.displayName} size={36} />
                <span className="min-w-0">
                  <span className="flex items-center gap-1.5 text-sm font-semibold">
                    <span className="truncate">{m.me ? "Du" : m.displayName}</span>
                    {m.role === "ADMIN" && <Badge tone="moss">Admin</Badge>}
                    {m.pending && <Badge>Eingeladen</Badge>}
                  </span>
                  <span className="block truncate text-xs text-muted">@{m.handle}</span>
                </span>
              </Link>
              {group.isAdmin && !m.me && (
                <span className="flex shrink-0 gap-1">
                  {!m.pending && (
                    <button type="button" disabled={pending} onClick={() => exec(() => setGroupAdminAction(conversationId, m.id, m.role !== "ADMIN"))} className="grid size-8 place-items-center rounded-xl text-muted hover:bg-sunken hover:text-ink" aria-label={m.role === "ADMIN" ? `${m.displayName} als Admin entfernen` : `${m.displayName} zum Admin machen`} title={m.role === "ADMIN" ? "Admin-Rechte entziehen" : "Zum Admin machen"}>
                      <ShieldCheck size={15} />
                    </button>
                  )}
                  <button type="button" disabled={pending} onClick={async () => (await confirmDialog(`${m.displayName} aus der Gruppe entfernen?`)) && exec(() => removeGroupMemberAction(conversationId, m.id))} className="grid size-8 place-items-center rounded-xl text-muted hover:bg-sunken hover:text-danger" aria-label={`${m.displayName} entfernen`} title="Entfernen">
                    <UserMinus size={15} />
                  </button>
                </span>
              )}
            </li>
          ))}
        </ul>
      </section>

      <div className="mt-5 border-t border-line pt-4">
        <Button
          variant="ghost"
          className="text-danger"
          disabled={pending}
          onClick={async () =>
            (await confirmDialog("Gruppe verlassen? Du erhältst danach keine Nachrichten mehr aus dieser Gruppe.")) &&
            start(async () => {
              const r = await callAction(() => leaveGroupAction(conversationId));
              if (!r.ok) return toast(r.error, "error");
              toast(r.message ?? "");
              router.push("/nachrichten");
            })
          }
        >
          <LogOut size={15} aria-hidden /> Gruppe verlassen
        </Button>
      </div>
    </Dialog>
  );
}
