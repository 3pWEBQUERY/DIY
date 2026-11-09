"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, X } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/misc";
import { toast } from "@/components/ui/toast";
import { PeoplePicker, type Candidate } from "@/components/messages/people-picker";
import { coauthorCandidatesAction, inviteCoauthorsAction, leaveCoauthorAction, listCoauthorsAction, removeCoauthorAction, respondCoauthorAction } from "@/app/(app)/social-actions";
import { confirmDialog } from "@/components/ui/confirm";
import { cn } from "@/lib/utils";

const MAX = 3;
type Row = { id: string; handle: string; displayName: string; avatarUrl: string | null; status: "PENDING" | "ACCEPTED" };

/** Koautor:innen eines eigenen Beitrags verwalten: einladen, Status sehen, entfernen. */
export function CoauthorDialog({ postId, open, onClose }: { postId: string; open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [handles, setHandles] = useState<string[]>([]);
  const [pending, start] = useTransition();

  const load = () =>
    void listCoauthorsAction(postId).then((r) => {
      if (r.ok) setRows(r.data);
      else toast(r.error, "error");
    });

  useEffect(() => {
    if (!open) return;
    setHandles([]);
    load();
    void coauthorCandidatesAction().then((r) => r.ok && setCandidates(r.data));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, postId]);

  const free = MAX - (rows?.length ?? 0);
  const invite = () =>
    start(async () => {
      const r = await inviteCoauthorsAction(postId, handles);
      if (r.ok) {
        toast(r.data.invited.length === 1 ? `${r.data.invited[0]} wurde eingeladen.` : `${r.data.invited.length} Personen wurden eingeladen.`);
        setHandles([]);
        load();
        router.refresh();
      } else toast(r.error, "error");
    });
  const remove = (row: Row) =>
    start(async () => {
      const r = await removeCoauthorAction(postId, row.id);
      if (r.ok) {
        load();
        router.refresh();
      } else toast(r.error, "error");
    });

  return (
    <Dialog open={open} onClose={onClose} title="Koautor:innen" description={`Bis zu ${MAX} Personen. Sie erscheinen am Beitrag, sobald sie bestätigt haben – bearbeiten kannst nur du.`}>
      {rows == null ? (
        <div className="h-16 animate-pulse rounded-xl bg-sunken" aria-busy />
      ) : (
        <>
          {rows.length > 0 && (
            <ul className="mb-5 divide-y divide-line rounded-2xl border border-line">
              {rows.map((r) => (
                <li key={r.id} className="flex items-center gap-3 px-3 py-2.5">
                  <Avatar src={r.avatarUrl} name={r.displayName} size={32} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{r.displayName}</span>
                    <span className="block truncate text-xs text-muted">@{r.handle}</span>
                  </span>
                  <span className={cn("rounded-full px-2.5 py-0.5 text-[11.5px] font-medium", r.status === "ACCEPTED" ? "bg-moss-soft text-moss-ink" : "bg-warn-soft text-warn")}>{r.status === "ACCEPTED" ? "Bestätigt" : "Eingeladen"}</span>
                  <button type="button" disabled={pending} onClick={() => remove(r)} className="grid size-8 place-items-center rounded-xl text-muted hover:bg-sunken hover:text-danger" aria-label={`${r.displayName} entfernen`} title="Entfernen">
                    <X size={15} />
                  </button>
                </li>
              ))}
            </ul>
          )}
          {free > 0 ? (
            <>
              <PeoplePicker candidates={candidates} value={handles} onChange={setHandles} max={free} exclude={rows.map((r) => r.handle)} />
              <Button className="mt-4 w-full" disabled={!handles.length || pending} onClick={invite}>
                {pending && <Loader2 size={15} className="animate-spin" />}
                {handles.length > 1 ? `${handles.length} Personen einladen` : "Einladen"}
              </Button>
            </>
          ) : (
            <p className="text-[13.5px] text-muted">Es sind bereits {MAX} Koautor:innen eingeladen. Entferne jemanden, um eine andere Person einzuladen.</p>
          )}
        </>
      )}
    </Dialog>
  );
}

/** Hinweis auf der Beitragsseite für eingeladene Personen. */
export function CoauthorInviteBanner({ postId, invitedBy }: { postId: string; invitedBy: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const answer = (accept: boolean) =>
    start(async () => {
      const r = await respondCoauthorAction(postId, accept);
      if (r.ok) {
        toast(r.message ?? "Gespeichert.");
        router.refresh();
      } else toast(r.error, "error");
    });
  return (
    <aside aria-label="Einladung" className="mb-6 flex flex-col gap-3 rounded-2xl border border-clay/30 bg-clay-soft px-5 py-4 sm:flex-row sm:items-center">
      <p className="flex-1 text-[14.5px]">
        <span className="font-semibold">{invitedBy}</span> möchte dich als Koautor:in dieses Beitrags nennen. Der Beitrag erscheint dann auch in deinem Profil.
      </p>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" disabled={pending} onClick={() => answer(false)}>
          Ablehnen
        </Button>
        <Button size="sm" disabled={pending} onClick={() => answer(true)}>
          <Check size={14} aria-hidden /> Bestätigen
        </Button>
      </div>
    </aside>
  );
}

/** Menüpunkt-Aktion für Koautor:innen: austreten. */
export async function leaveCoauthor(postId: string, onDone: () => void) {
  if (!(await confirmDialog({ title: "Als Koautor:in austreten?", body: "Du wirst nicht mehr am Beitrag genannt, und er verschwindet aus deinem Profil.", confirmLabel: "Austreten", tone: "danger" }))) return;
  const r = await leaveCoauthorAction(postId);
  if (r.ok) {
    toast(r.message ?? "Erledigt.");
    onDone();
  } else toast(r.error, "error");
}
